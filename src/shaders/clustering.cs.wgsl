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

@compute
@workgroup_size(${clusteringWorkgroupX}, ${clusteringWorkgroupY}, ${clusteringWorkgroupZ})
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= ${clusterX} || id.y >= ${clusterY} || id.z >= ${clusterZ}) {
        return;
    }
    let clusterIdx = id.x + id.y * ${clusterX} + id.z * ${clusterX} * ${clusterY};

    // find 2d rec top and bottom binding box
    let tSize = 2.0 / vec2f(${clusterX}, ${clusterY});
    let ndcMin = vec2f(-1.0) + vec2f(id.xy) * tSize; 
    let ndcMax = ndcMin + tSize;

    // find the z beginning and end of the slice
    let zBeg = camera.near * pow(camera.far / camera.near, f32(id.z) / ${clusterZ});
    let zEnd = camera.near * pow(camera.far / camera.near, f32(id.z + 1) / ${clusterZ});

    var crnrs = array<vec2f, 4>(
        vec2f(ndcMin.x, ndcMin.y),
        vec2f(ndcMax.x, ndcMin.y),
        vec2f(ndcMin.x, ndcMax.y),
        vec2f(ndcMax.x, ndcMax.y)
    );

    // find bounding box of x, y, z coords
    var bbMin = vec3f(1e30);
    var bbMax = vec3f(-1e30);
    for (var i = 0u; i < 4u; i++) {
        let p = camera.invProjMat * vec4f(crnrs[i], 1.0, 1.0);
        let ray = p.xyz / p.w;
        let begPt = ray * (zBeg / -ray.z);
        let endPt = ray * (zEnd / -ray.z);
        bbMin = min(bbMin, min(begPt, endPt));
        bbMax = max(bbMax, max(begPt, endPt));
    }

    // loop over all lights and add to light set if valid
    var count = 0u;
    for (var li = 0u; li < lightSet.numLights; li++) {
        let lightPos = (camera.viewMat * vec4f(lightSet.lights[li].pos, 1.0)).xyz;
        let closest = clamp(lightPos, bbMin, bbMax);
        let d = lightPos - closest;
        if (dot(d, d) <= ${lightRadius} * ${lightRadius}) {
            clusterSet.clusters[clusterIdx].lightIdxs[count] = li;
            count++;
            if (count >= ${maxLightsPerCluster}) {
                break;
            }
        }
    }
    clusterSet.clusters[clusterIdx].numLights = count;

}