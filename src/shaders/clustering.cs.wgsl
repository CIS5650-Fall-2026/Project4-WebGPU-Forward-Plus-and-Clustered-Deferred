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
@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

fn viewPosAtDepth(ndc: vec2f, depth: f32) -> vec3f {
    let h = cameraUniforms.invProjMat * vec4f(ndc, 0.0, 1.0);
    let onNear = h.xyz / h.w;
    return onNear * (depth / cameraUniforms.nearPlane);
}

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= ${clusterCountX} * ${clusterCountY} * ${clusterCountZ}) { return; }

    let x = clusterIdx % ${clusterCountX};
    let y = clusterIdx / ${clusterCountX} % ${clusterCountY};
    let z = clusterIdx / (${clusterCountX} * ${clusterCountY});

    let ndcMin = vec2f(-1.0) + 2.0 * vec2f(f32(x), f32(y)) / vec2f(${clusterCountX}, ${clusterCountY});
    let ndcMax = vec2f(-1.0) + 2.0 * vec2f(f32(x + 1), f32(y + 1)) / vec2f(${clusterCountX}, ${clusterCountY});

    let near = cameraUniforms.nearPlane;
    let far = cameraUniforms.farPlane;
    let sliceNear = near * pow(far / near, f32(z) / f32(${clusterCountZ}));
    let sliceFar = near * pow(far / near, f32(z + 1) / f32(${clusterCountZ}));

    var aabbMin = viewPosAtDepth(ndcMin, sliceNear);
    var aabbMax = aabbMin;
    var p = viewPosAtDepth(vec2f(ndcMax.x, ndcMin.y), sliceNear);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);
    p = viewPosAtDepth(vec2f(ndcMin.x, ndcMax.y), sliceNear);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);
    p = viewPosAtDepth(ndcMax, sliceNear);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);
    p = viewPosAtDepth(ndcMin, sliceFar);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);
    p = viewPosAtDepth(vec2f(ndcMax.x, ndcMin.y), sliceFar);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);
    p = viewPosAtDepth(vec2f(ndcMin.x, ndcMax.y), sliceFar);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);
    p = viewPosAtDepth(ndcMax, sliceFar);
    aabbMin = min(aabbMin, p);
    aabbMax = max(aabbMax, p);

    var count = 0u;
    for (var i = 0u; i < lightSet.numLights; i++) {
        let lightView = (cameraUniforms.viewMat * vec4f(lightSet.lights[i].pos, 1.0)).xyz;
        let closest = clamp(lightView, aabbMin, aabbMax);
        let d = lightView - closest;
        if (dot(d, d) < ${lightRadius} * ${lightRadius}) {
            clusterSet.clusters[clusterIdx].lightIndices[count] = i;
            count++;
            if (count == ${maxLightsPerCluster}) {
                break;
            }
        }
    }
    clusterSet.clusters[clusterIdx].numLights = count;
}