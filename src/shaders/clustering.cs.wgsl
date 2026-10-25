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
@group(${bindGroup_scene}) @binding(2) var<uniform> camera: CameraUniforms;

// exponentially larger slices
fn sliceDepth(slice: u32) -> f32 {
    return camera.nearPlane * pow(camera.farPlane / camera.nearPlane, f32(slice) / f32(${clusterCountZ}));
}

// go from normalized device coordinates to view coordinates
fn ndcToView(ndc: vec2f) -> vec3f {
    let v: vec4f = camera.invProjMat * vec4f(ndc, 0.0, 1.0);
    return v.xyz / v.w;
}

// true if sphere intersects AABB
fn sphereIntersectsAABB(center: vec3f, radius: f32, bmin: vec3f, bmax: vec3f) -> bool {
    let d: vec3f = center - clamp(center, bmin, bmax);
    return dot(d, d) <= radius * radius;
}

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx: u32 = globalIdx.x;
    if (clusterIdx >= ${clusterCountX}u * ${clusterCountY}u * ${clusterCountZ}u) {
        return;
    }

    let x: u32 = clusterIdx % ${clusterCountX}u;
    let y: u32 = (clusterIdx / ${clusterCountX}u) % ${clusterCountY}u;
    let z: u32 = clusterIdx / (${clusterCountX}u * ${clusterCountY}u);

    let tileSize = vec2f(2.0 / f32(${clusterCountX}), 2.0 / f32(${clusterCountY}));
    let ndcMin = vec2f(-1.0) + vec2f(f32(x), f32(y)) * tileSize;
    let ndcMax = ndcMin + tileSize;

    let zNear: f32 = sliceDepth(z);
    let zFar: f32 = sliceDepth(z + 1u);

    var corners = array<vec2f, 4>(ndcMin, vec2f(ndcMax.x, ndcMin.y), vec2f(ndcMin.x, ndcMax.y), ndcMax);
    var bmin = vec3f(1e30);
    var bmax = vec3f(-1e30);
    for (var i = 0u; i < 4u; i++) {
        let p = ndcToView(corners[i]);
        let pNear = p * (zNear / -p.z);
        let pFar = p * (zFar / -p.z);
        bmin = min(bmin, min(pNear, pFar));
        bmax = max(bmax, max(pNear, pFar));
    }

    let cluster = &clusterSet.clusters[clusterIdx];
    var count = 0u;
    for (var i = 0u; i < lightSet.numLights; i++) {
        let lightPosView = (camera.viewMat * vec4f(lightSet.lights[i].pos, 1.0)).xyz;
        if (sphereIntersectsAABB(lightPosView, ${lightRadius}, bmin, bmax)) {
            (*cluster).lightIndices[count] = i;
            count++;
            if (count == ${maxLightsPerCluster}u) {
                break;
            }
        }
    }
    (*cluster).numLights = count;
}