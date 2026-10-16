// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// Find the view-space point along the given vector that intersects
// a Z-aligned plane at a given input z coordinate
fn intersectZPlane(v: vec3f, z: f32) -> vec3f {
    return v * (z / v.z);
}

fn convertClipToView(pClip: vec4f) -> vec4f {
    let pView: vec4f = camera.invProjMat * pClip;
    return (pView / pView.w);
}

fn convertScreenToView(pScreen: vec4f) -> vec4f {
    let pUV: vec2f = pScreen.xy / camera.screenResolution;
    return convertClipToView(
        vec4f((vec2f(pUV.x, 1.0 - pUV.y) * 2.0) - 1.0,
        pScreen.z,
        pScreen.w));
}

fn doesSphereIntersectBoundingBox(lightPos: vec3f, clusterBounds: ClusterBounds) -> bool {
    let lightPosView: vec3f = vec4f(camera.viewMat * vec4f(lightPos, 1.0)).xyz;
    let closestPointOnBox: vec3f = clamp(lightPosView, clusterBounds.minValues, clusterBounds.maxValues);
    let lightToBox: vec3f = lightPosView - closestPointOnBox;
    let distSquared: f32 = dot(lightToBox, lightToBox);
    let radius: f32 = f32(${lightRadius});
    return distSquared <= (radius * radius);
}

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.
fn computeClusterBounds(clusterId: vec3u) -> ClusterBounds {
    var bounds: ClusterBounds;
    let tilePixelDims: vec2f = camera.screenResolution / vec2f(clusterSet.gridDims.xy);

    let minPointScreen: vec4f = vec4f(
        vec2f(clusterId.xy) * tilePixelDims,
        0.0,
        1.0);
    let maxPointScreen: vec4f = vec4f(
        (vec2f(clusterId.xy) + 1.0) * tilePixelDims,
        0.0,
        1.0);

    let minPointView: vec3f = convertScreenToView(minPointScreen).xyz;
    let maxPointView: vec3f = convertScreenToView(maxPointScreen).xyz;

    let tileNearViewZ: f32 = -camera.zNear
        * pow(camera.zFar / camera.zNear,
            f32(clusterId.z) / f32(clusterSet.gridDims.z));
    let tileFarViewZ: f32 = -camera.zNear
        * pow(camera.zFar / camera.zNear,
            f32(clusterId.z + 1) / f32(clusterSet.gridDims.z));

    let minPointNearView: vec3f = intersectZPlane(minPointView, tileNearViewZ);
    let maxPointNearView: vec3f = intersectZPlane(maxPointView, tileNearViewZ);
    let minPointFarView: vec3f = intersectZPlane(minPointView, tileFarViewZ);
    let maxPointFarView: vec3f = intersectZPlane(maxPointView, tileFarViewZ);

    bounds.minValues = min(min(minPointNearView, minPointFarView), min(maxPointNearView, maxPointFarView));
    bounds.maxValues = max(max(minPointNearView, minPointFarView), max(maxPointNearView, maxPointFarView));
    return bounds;
}

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.
@compute
@workgroup_size(${clusteringWorkgroupSizeX}, ${clusteringWorkgroupSizeY}, ${clusteringWorkgroupSizeZ})
fn assignLightsToClusters(@builtin(global_invocation_id) global_id: vec3u) {
    if (any(global_id >= clusterSet.gridDims)) {
        return;
    }

    let bounds: ClusterBounds = computeClusterBounds(global_id);

    // Assign lights to the cluster
    let flatClusterIdx: u32 = global_id.x
        + global_id.y * clusterSet.gridDims.x
        + global_id.z * clusterSet.gridDims.x * clusterSet.gridDims.y;

    var lightCount: u32 = 0;

    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (lightCount == u32(${maxLightsPerCluster})) {
            break;
        }

        if (doesSphereIntersectBoundingBox(lightSet.lights[lightIdx].pos, bounds)) {
            clusterSet.clusters[flatClusterIdx].lightIndices[lightCount] = lightIdx;
            lightCount++;
        }
    }

    clusterSet.clusters[flatClusterIdx].numLights = lightCount;
}