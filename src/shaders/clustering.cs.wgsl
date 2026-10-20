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
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusters: ClusterSet;

@compute @workgroup_size(${cluster_workgroup_size})
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= ${cluster_dim1} * ${cluster_dim2} * ${cluster_dim3}) {
        return;
    }
    // id.x = a*(dim1*dim2) + b*(dim1) + c
    let x = id.x % ${cluster_dim1};
    let y = (id.x / ${cluster_dim1}) % ${cluster_dim2};
    let z = id.x / (${cluster_dim1} * ${cluster_dim2});

    let boundX_1 = 2 * (f32(x) / ${cluster_dim1}) - 1;
    let boundX_2 = 2 * ((f32(x) + 1) / ${cluster_dim1}) - 1;
    let boundY_1 = 2 * (f32(y) / ${cluster_dim2}) - 1;
    let boundY_2 = 2 * ((f32(y) + 1) / ${cluster_dim2}) - 1;
    let boundZ_1 = ${nearPlane} + (f32(z) / ${cluster_dim3}) * (${farPlane} - ${nearPlane});
    let boundZ_2 = ${nearPlane} + ((f32(z) + 1) / ${cluster_dim3}) * (${farPlane} - ${nearPlane});

    // bottom left
    var pointBL = camera.inverseProjMat * vec4f(boundX_1, boundY_1, 1, 1);
    pointBL /= pointBL.w;
    pointBL /= -pointBL.z;
    let BL_close = pointBL.xyz * boundZ_1;
    let BL_far = pointBL.xyz * boundZ_2;

    // bottom right
    var pointBR = camera.inverseProjMat * vec4f(boundX_2, boundY_1, 1, 1);
    pointBR /= pointBR.w;
    pointBR /= -pointBR.z;
    let BR_close = pointBR.xyz * boundZ_1;
    let BR_far = pointBR.xyz * boundZ_2;

    // top left
    var pointTL = camera.inverseProjMat * vec4f(boundX_1, boundY_2, 1, 1);
    pointTL /= pointTL.w;
    pointTL /= -pointTL.z;
    let TL_close = pointTL.xyz * boundZ_1;
    let TL_far = pointTL.xyz * boundZ_2;

    // top right
    var pointTR = camera.inverseProjMat * vec4f(boundX_2, boundY_2, 1, 1);
    pointTR /= pointTR.w;
    pointTR /= -pointTR.z;
    let TR_close = pointTR.xyz * boundZ_1;
    let TR_far = pointTR.xyz * boundZ_2;

    // AABB
    let boundingMin = min(min(min(BL_close, BL_far), min(BR_close, BR_far)), min(min(TL_close, TL_far), min(TR_close, TR_far)));
    let boundingMax = max(max(max(BL_close, BL_far), max(BR_close, BR_far)), max(max(TL_close, TL_far), max(TR_close, TR_far)));

    var count = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        let temp = (camera.viewMat * vec4(light.pos, 1)).xyz;
        let closestPoint = clamp(temp, boundingMin, boundingMax);
        let closestDistance = distance(closestPoint, temp);
        if (closestDistance <= ${lightRadius} && count < ${cluster_max}) {
            clusters.clusters[id.x].lightIndices[count] = lightIdx;
            count++;
        }
    }
    clusters.clusters[id.x].numLights = count;
}