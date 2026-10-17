// TODO-2: implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterData: ClusterData;

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;

fn getPointViewSpace(uv: vec2f, viewZ: f32) -> vec3f {
    let ndc = vec4f(uv.x * 2.0 - 1.0, (1.0 - uv.y) * 2.0 - 1.0, 1.0, 1.0);
    var v = camera.invProjMat * ndc;
    v = v / v.w;
    return v.xyz * (viewZ / v.z);
}

fn sphereIntersectsAABB(center: vec3f, radius: f32, bMin: vec3f, bMax: vec3f) -> bool {
    let closest = clamp(center, bMin, bMax); 
    let d = center - closest;
    return dot(d, d) <= radius * radius;
}

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

@compute
@workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {

    let dim = clusterData.dim;

    if (globalIdx.x >= dim.x || globalIdx.y >= dim.y || globalIdx.z >= dim.z) {
        return;
    }

    let x = globalIdx.x;
    let y = globalIdx.y;
    let z = globalIdx.z;

    let clusterIndex = x + y * dim.x + z * dim.x * dim.y;

    let uvmin = vec2f(f32(x) / f32(dim.x), f32(y) / f32(dim.y));
    let uvmax = vec2f(f32(x + 1u) / f32(dim.x), f32(y + 1u) / f32(dim.y));
    let dmin = camera.near * pow(camera.far / camera.near, f32(z) / f32(dim.z));
    let dmax = camera.near * pow(camera.far / camera.near, f32(z + 1u) / f32(dim.z));

    // get four points 
    let p0 = getPointViewSpace(uvmin, -dmin);
    let p1 = getPointViewSpace(uvmax, -dmin);
    let p2 = getPointViewSpace(uvmin, -dmax);
    let p3 = getPointViewSpace(uvmax, -dmax);

    let bbmin = min(min(p0, p1), min(p2, p3));
    let bbmax = max(max(p0, p1), max(p2, p3));

    // clusterData.clusters[clusterIndex].BBoxMin = bbmin;
    // clusterData.clusters[clusterIndex].BBoxMax = bbmax;

    // store lights
    var numLightsHere = 0u;
    let numLights = lightSet.numLights;

    for (var i = 0u; i < numLights; i = i + 1u) {
        let light = lightSet.lights[i];
        let lightPosView = (camera.viewMat * vec4f(light.pos, 1.0)).xyz;
        if (sphereIntersectsAABB(lightPosView, f32(${lightRadius}), bbmin, bbmax)) {
            if (numLightsHere < clusterData.maxNumLightPerCluster) {
                clusterData.clusters[clusterIndex].lights[numLightsHere] = i;
                numLightsHere = numLightsHere + 1u;
            }
        }
    }

    // store num light
    clusterData.clusters[clusterIndex].numLights = numLightsHere;

}