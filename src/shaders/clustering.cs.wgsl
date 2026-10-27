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

@group(${bindGroup_scene}) @binding(0) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> camUniforms: CameraUniforms;

struct AABB {
    min: vec3<f32>,
    max: vec3<f32>,
};

fn calculate_cluster_bounds(clusterIdx: u32) -> AABB {
    let clusters_per_z_slice = clusterCountX * clusterCountY;
    let cluster_z = clusterIdx / clusters_per_z_slice;
    let cluster_remainder = clusterIdx - cluster_z * clusters_per_z_slice;
    let cluster_y = cluster_remainder / clusterCountX;
    let cluster_x = cluster_remainder - cluster_y * clusterCountX;

    let x_granularity = 2.0 / f32(clusterCountX);
    let y_granularity = 2.0 / f32(clusterCountY);
    let z_granularity = 1.0 / f32(clusterCountZ);

    var bounding_box = AABB(vec3f(1e30), vec3f(-1e30));

    for (var x = 0u; x <= 1u; x++) {
        for (var y = 0u; y <= 1u; y++) {
            for (var z = 0u; z <= 1u; z++) {
                let n_x = (x_granularity * f32(cluster_x + x)) - 1.0;
                let n_y = (y_granularity * f32(cluster_y + y)) - 1.0;
                let n_z = z_granularity * f32(cluster_z + z);
                
                let ndc_pos = vec4f(n_x, n_y, n_z, 1.0);
                let view_space = camUniforms.invProjMat * ndc_pos;

                if (view_space.w != 0.0) {
                    let view_pos = view_space.xyz / view_space.w;
                    bounding_box.min = min(bounding_box.min, view_pos);
                    bounding_box.max = max(bounding_box.max, view_pos);
                }
            }
        }
    }

    return bounding_box;
}

fn in_cluster(lightIdx: u32, aabb: AABB) -> bool {
    let center = (camUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;
    let radius = f32(${lightRadius});

    let closest_point = clamp(center, aabb.min, aabb.max);
    let vector_to_center = closest_point - center;
    let distance_squared = dot(vector_to_center, vector_to_center);

    return distance_squared <= radius * radius;
}

@compute
@workgroup_size(${clusterLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= clusterCountX * clusterCountY * clusterCountZ) {
        return;
    }

    let aabb: AABB = calculate_cluster_bounds(clusterIdx);
    
    clusterSet.clusters[clusterIdx].numLights = 0;
    var curr_num_lights = 0u;

    for (var lightIdx = 0u; curr_num_lights < maxLightsPerCluster && lightIdx < lightSet.numLights; lightIdx++) {
        if (in_cluster(lightIdx, aabb)) {
            clusterSet.clusters[clusterIdx].lights[curr_num_lights] = lightIdx;
            curr_num_lights++;
            clusterSet.clusters[clusterIdx].numLights = curr_num_lights;
        }
    }
}

// check cluster of center
// check all surrounding clusters (considering size)
