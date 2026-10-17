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

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= ${numClustersX} * ${numClustersY} * ${numClustersZ}) {
        return;
    }

    let x = clusterIdx % ${numClustersX};
    let y = (clusterIdx / ${numClustersX}) % ${numClustersY};
    let z = clusterIdx / (${numClustersX} * ${numClustersY});

    let ndcMin = vec2f(f32(x) / ${numClustersX} * 2 - 1, 1 - f32(y + 1) / ${numClustersY} * 2);
    let ndcMax = vec2f(f32(x + 1) / ${numClustersX} * 2 - 1, 1 - f32(y) / ${numClustersY} * 2);
    let zNear = select(${clusterNear} * pow(${clusterFar} / ${clusterNear}, f32(z) / ${numClustersZ}), ${nearPlane}, z == 0);
    let zFar = select(${clusterNear} * pow(${clusterFar} / ${clusterNear}, f32(z + 1) / ${numClustersZ}), ${farPlane}, z == ${numClustersZ} - 1);

    let proj = vec2f(cameraUniforms.projMat[0][0], cameraUniforms.projMat[1][1]);
    let minBounds = vec3f(min(ndcMin * zNear, ndcMin * zFar) / proj, -zFar);
    let maxBounds = vec3f(max(ndcMax * zNear, ndcMax * zFar) / proj, -zNear);

    var numLights = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights && numLights < ${maxLightsPerCluster}; lightIdx++) {
        let lightPos = (cameraUniforms.viewMat * vec4(lightSet.lights[lightIdx].pos, 1)).xyz;
        let delta = clamp(lightPos, minBounds, maxBounds) - lightPos;
        if (dot(delta, delta) <= ${lightRadius} * ${lightRadius}) {
            clusterSet.clusters[clusterIdx].lightIndices[numLights] = lightIdx;
            numLights++;
        }
    }
    clusterSet.clusters[clusterIdx].numLights = numLights;
}
