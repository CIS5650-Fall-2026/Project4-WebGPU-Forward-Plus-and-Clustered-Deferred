// TODO-2: implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// u for unsigned
const numClusters = ${clusterCountX}u * ${clusterCountY}u * ${clusterCountZ}u;

struct AABB {
    minPos: vec3f,
    maxPos: vec3f
}

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
fn ndcToView(ndc: vec2f, depth: f32) -> vec3f {
    // unproject onto the near plane
    let p = cameraUniforms.invProjMat * vec4f(ndc, 0.f, 1.f);
    let ray = p.xyz / p.w;
    return ray * (depth / -ray.z);  // slide along the ray to z = -depth
}

fn clusterAABB(clusterIdx: vec3u) -> AABB {
    // For each cluster (X, Y, Z):
    // Calculate the screen-space bounds for this cluster in 2D (XY).
    let clusterCounts = vec3f(f32(${clusterCountX}), f32(${clusterCountY}), f32(${clusterCountZ}));
    let ndcMin = vec2f(clusterIdx.xy) / clusterCounts.xy * 2.f - 1.f;
    let ndcMax = vec2f(clusterIdx.xy + 1u) / clusterCounts.xy * 2.f - 1.f;

    // Calculate the depth bounds for this cluster in Z (near and far planes).
    let near = cameraUniforms.nearPlane;
    let far = cameraUniforms.farPlane;
    // exponential spacing of cluster, inverse of log() used in the frag shader
    let zNear = near * pow(far / near, f32(clusterIdx.z) / clusterCounts.z);
    let zFar = near * pow(far / near, f32(clusterIdx.z + 1u) / clusterCounts.z);

    // Convert these screen and depth bounds into view-space coordinates (only need the corners of the AABB).
    let minNear = ndcToView(ndcMin, zNear);
    let minFar = ndcToView(ndcMin, zFar);
    let maxNear = ndcToView(ndcMax, zNear);
    let maxFar = ndcToView(ndcMax, zFar);

    // Store the computed bounding box (AABB) for the cluster.
    return AABB(
        min(min(minNear, minFar), min(maxNear, maxFar)),
        max(max(minNear, minFar), max(maxNear, maxFar))
    );
}

fn sphereIntersectsAABB(center: vec3f, radius: f32, aabb: AABB) -> bool {
    let d = clamp(center, aabb.minPos, aabb.maxPos) - center;
    return dot(d, d) <= radius * radius;
}

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let idx = globalIdx.x;
    if (idx < numClusters) {
        let clusterIdx = vec3u(
            idx % ${clusterCountX}u,
            (idx / ${clusterCountX}u) % ${clusterCountY}u,
            idx / (${clusterCountX}u * ${clusterCountY}u)
        );

        let aabb = clusterAABB(clusterIdx);

        // For each cluster:
        // Initialize a counter for the number of lights in this cluster.
        let cluster = &clusterSet.clusters[idx];
        var count = 0u;

        // For each light:
        for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
            let lightPosView = (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.f)).xyz;
            // Check if the light intersects with the cluster’s bounding box (AABB).
            if (sphereIntersectsAABB(lightPosView, ${lightRadius}, aabb)) {
                // If it does, add the light to the cluster's light list.
                (*cluster).lightIndices[count] = lightIdx;
                count++;
                // Stop adding lights if the maximum number of lights is reached.
                if (count == ${maxLightsPerCluster}u) {
                    break;
                }
            }
        }

        // Store the number of lights assigned to this cluster.
        (*cluster).numLights = count;
    }
}
