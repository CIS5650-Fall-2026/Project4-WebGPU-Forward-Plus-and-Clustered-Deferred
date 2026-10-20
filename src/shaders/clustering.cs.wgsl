// TODO-2: implement the light clustering compute shader

@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<uniform> camera: CameraUniforms;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

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


// Takes point in NDC at z=0 and projects to view space
fn ndcToView(ndc: vec2f) -> vec3f {
    let view = camera.invProjMat * vec4f(ndc.xy, 0.f, 1.f);
    return (view / view.w).xyz;
}

// Returns point on a ray from eye->p, at dist along forward in viewspace
fn atDepth(p: vec3f, depth: f32) -> vec3f {
    return p * (-depth / p.z);
}


@compute
@workgroup_size(${clusterLightsWorkgroupSizeX}, ${clusterLightsWorkgroupSizeY}, ${clusterLightsWorkgroupSizeZ})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    if (globalIdx.x >= ${xClusterCnt} || 
        globalIdx.y >= ${yClusterCnt} ||
        globalIdx.z >= ${zClusterCnt}) {
        return;
    }

    // --- GET CLUSTER AABB --- 

    // Get 1D index into clusters array
    let clustersIdx = globalIdx.z * ${xClusterCnt} * ${yClusterCnt} + globalIdx.y * ${xClusterCnt} + globalIdx.x; 

    // Get NDC XY bbox
    let clusterCnt = vec2f(${xClusterCnt}, ${yClusterCnt});
    let tile = vec2f(globalIdx.xy);
    let tileNdcMin =  tile        / clusterCnt * 2.f - 1.f; // [-1, 1]
    let tileNdcMax = (tile + 1.f) / clusterCnt * 2.f - 1.f; // [-1, 1]

    // Min/max corners of the near depth plane
    // These rays project through the entire XY cluster
    let rayMin = ndcToView(tileNdcMin);
    let rayMax = ndcToView(tileNdcMax);
    
    // Get min/max viewspace depths
    let sliceT = vec2f(f32(globalIdx.z), f32(globalIdx.z + 1)) / ${zClusterCnt}; // [0, 1]
    var sliceDepth = mix(vec2f(camera.nearClip), vec2f(${cluster_far_clip}), sliceT); // [near, far]
    if (${logSlicing} == 1) {
        // Each slice has the same far/near ratio
        sliceDepth = camera.nearClip * pow(vec2f(${cluster_far_clip} / camera.nearClip), sliceT);
    }

    // Slide ray pts to near/far depths
    let p0 = atDepth(rayMin, sliceDepth.x);
    let p1 = atDepth(rayMin, sliceDepth.y);
    let p2 = atDepth(rayMax, sliceDepth.x);
    let p3 = atDepth(rayMax, sliceDepth.y);

    let aabbMin: vec3f = min(min(p0, p1), min(p2, p3));
    let aabbMax: vec3f = max(max(p0, p1), max(p2, p3));


    // --- ASSIGN LIGHTS TO CLUSTER --- 
    var lightCnt = 0u;

    // Convert lights from world->view space
    for (var i = 0u; i < lightSet.numLights; i++) {
        let worldPos: vec3f = lightSet.lights[i].pos;
        let viewPos: vec3f = (camera.viewMat * vec4f(worldPos, 1.f)).xyz;

        // Check if in bounds
        let closest = clamp(viewPos, aabbMin, aabbMax);
        let d = viewPos - closest;
        if (dot(d, d) <= f32(${lightRadius} * ${lightRadius})) {
            clusterSet.clusters[clustersIdx].lightsIdx[lightCnt] = i;
            lightCnt++;
        } 

        // Stop once we hit max lights
        if (lightCnt >= ${maxLightsPerCluster}) {
            break;
        }
    }
    clusterSet.clusters[clustersIdx].numLights = lightCnt;
    
}

