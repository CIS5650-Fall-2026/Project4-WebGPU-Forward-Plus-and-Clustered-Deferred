// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

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


@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn screenToViewAtDepth(fx: f32, fy: f32, depth: f32) -> vec3f {
    let halfHeight = depth * tan(radians(${fovYDegrees}) / 2.0);
    let halfWidth = halfHeight * camera.resolution.x / camera.resolution.y;

    return vec3f((fx * 2.0 - 1.0) * halfWidth, (1.0 - fy * 2.0) * halfHeight, -depth);
}

fn sphereIntersectsAabb(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    let closest = clamp(center, aabbMin, aabbMax);
    let d = closest - center;
    return dot(d, d) <= radius * radius;
}

@compute
@workgroup_size(${clusteringWorkgroupSizeX}, ${clusteringWorkgroupSizeY}, ${clusteringWorkgroupSizeZ})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    if (globalIdx.x >= ${clusterSizeX} || globalIdx.y >= ${clusterSizeY} || globalIdx.z >= ${clusterSizeZ}) {
        return;
    }

    let fxMin = f32(globalIdx.x) / f32(${clusterSizeX});
    let fxMax = f32(globalIdx.x + 1) / f32(${clusterSizeX});
    let fyMin = f32(globalIdx.y) / f32(${clusterSizeY});
    let fyMax = f32(globalIdx.y + 1) / f32(${clusterSizeY});

    let depthNear = clusterSliceDepth(f32(globalIdx.z), camera.nearPlane, camera.farPlane);
    let nearA = screenToViewAtDepth(fxMin, fyMin, depthNear);
    let nearB = screenToViewAtDepth(fxMax, fyMax, depthNear);

    let depthFar = clusterSliceDepth(f32(globalIdx.z + 1), camera.nearPlane, camera.farPlane);
    let farA = screenToViewAtDepth(fxMin, fyMin, depthFar);
    let farB = screenToViewAtDepth(fxMax, fyMax, depthFar);

    let aabbMin = min(min(nearA, nearB), min(farA, farB));
    let aabbMax = max(max(nearA, nearB), max(farA, farB));

    let cluster = &clusterSet.clusters[clusterIndex(globalIdx.x, globalIdx.y, globalIdx.z)];

    var numLights = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightPosView = (camera.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1)).xyz;
        if (sphereIntersectsAabb(lightPosView, ${lightRadius}, aabbMin, aabbMax)) {
            (*cluster).lightIndices[numLights] = lightIdx;
            numLights++;
            if (numLights >= ${maxLightsPerCluster}) {
                break;
            }
        }
    }
    (*cluster).numLights = numLights;
}
