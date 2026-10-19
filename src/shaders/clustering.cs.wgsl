@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(0) @binding(2) var<uniform> camera: CameraUniforms;

struct ClusterBounds {
    minPoint: vec3f,
    maxPoint: vec3f,
}

fn screenToViewAtDepth(ndc: vec2f, depth: f32) -> vec3f {
    let H = camera.invProj*vec4f(ndc, 1.0, 1.0);
    let p = H.xyz/H.w;

    return p*(depth / -p.z);
}

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

fn calculateClusterBounds(clusterId: vec3<u32>) -> ClusterBounds {
    let x = clusterId.x;
    let y = clusterId.y;
    let z = clusterId.z;

    //calc the screen space bounds in xy
    let left = f32(x)/f32(${clusterCountX});
    let right = f32(x + 1u)/f32(${clusterCountX});
    let top = f32(y)/f32(${clusterCountY});
    let bottom = f32(y + 1u)/f32(${clusterCountY});

    //near and far depths
    let near = f32(${cameraNear});
    let far = f32(${cameraFar});
    let sliceCount = f32(${clusterCountZ});

    let sliceDepth = (far - near)/sliceCount;

    let depthNear = near * pow(far/near, f32(z)/sliceCount);

    let depthFar = near * pow(far/near,f32(z + 1u)/sliceCount);

    //to NDC
    let ndcLeft   = 2.0*left - 1.0;
    let ndcRight  = 2.0*right - 1.0;
    let ndcTop    = 1.0-2.0 * top;
    let ndcBottom = 1.0-2.0 * bottom;

    let corners = array<vec2f, 4>(vec2f(ndcLeft, ndcTop), vec2f(ndcRight, ndcTop), vec2f(ndcLeft, ndcBottom), vec2f(ndcRight, ndcBottom));

    //AABB
    let first = screenToViewAtDepth(corners[0], depthNear);
    var boundsMin = first;
    var boundsMax = first;

    //convert corners to view space and expand the bounding box
    for (var i = 0u; i < 4u; i++) {
        let nearCorner = screenToViewAtDepth(corners[i], depthNear);
        let farCorner = screenToViewAtDepth(corners[i], depthFar);

        boundsMin = min(boundsMin, min(nearCorner, farCorner));
        boundsMax = max(boundsMax, max(nearCorner, farCorner));
    }

    return ClusterBounds(boundsMin, boundsMax);
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

fn assignLightsToCluster(clusterId: vec3<u32>, bounds: ClusterBounds) {
    let x = clusterId.x;
    let y = clusterId.y;
    let z = clusterId.z;

    let clusterIndex = x + y*u32(${clusterCountX}) + z*u32(${clusterCountX})*u32(${clusterCountY});

    var overflowed = false;

    var count = 0u;
    let radius = f32(${lightRadius});
    let capacity = u32(${maxNumLights});

    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightPos = (camera.view * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;

        let closest = clamp(lightPos, bounds.minPoint, bounds.maxPoint);
        let difference = lightPos - closest;

        if (dot(difference, difference) <= radius * radius) {
            if (count >= capacity) {
                overflowed = true;
                break;
            }

            clusterSet.clusters[clusterIndex].lightIndices[count] = lightIdx;
            count++;
        }
    }

    clusterSet.clusters[clusterIndex].numLights = count;

    //used for debugging overflow
    //clusterSet.clusters[clusterIndex].numLights = select(count, capacity + 1u, overflowed);
}

@compute @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) clusterId: vec3<u32>) {
    if (clusterId.x >= u32(${clusterCountX}) ||
        clusterId.y >= u32(${clusterCountY}) ||
        clusterId.z >= u32(${clusterCountZ})) {
        return;
    }

    let bounds = calculateClusterBounds(clusterId);
    assignLightsToCluster(clusterId, bounds);
}
