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
@group(${bindGroup_scene}) @binding(1) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn ndcToView(p: vec2f) -> vec3f {
    let v = camera.invProjMat * vec4f(p, 1, 1);
    return v.xyz / (-v.z);
}

@compute @workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    if (globalIdx.x >= clusterSet.numClusters) { return; }

    let x = globalIdx.x % ${clustersX};
    let y = (globalIdx.x / ${clustersX}) % ${clustersY};
    let z = globalIdx.x / (${clustersX} * ${clustersY});

    // Calculate the screen-space bounds for this cluster in 2D (XY).
    let minX = 2 * f32(x) / ${clustersX} - 1;
    let maxX = 2 * f32(x + 1) / ${clustersX} - 1;
    let minY = 1 - 2 * f32(y + 1) / ${clustersY};
    let maxY = 1 - 2 * f32(y) / ${clustersY};

    // Calculate the depth bounds for this cluster in Z (near and far planes).
    let sliceDepth = (${farPlane} - ${nearPlane}) /${clustersZ};
    let minZ = ${nearPlane} + f32(z) * sliceDepth;
    let maxZ = minZ + sliceDepth;

    let bounds = array<vec2f, 3>(
        vec2f(minX, maxX),
        vec2f(minY, maxY),
        vec2f(minZ, maxZ)
    );

    var aabb = array<vec3f, 2>(vec3f(1e30), vec3f(-1e30));
    for (var i = 0u; i < 2; i++) {
        for (var j = 0u; j < 2; j++) {
            // Convert these screen and depth bounds into view-space coordinates.
            let ray = ndcToView(vec2f(bounds[0][i], bounds[1][j]));
            let nearPlaneIntersect = ray * bounds[2][0];
            let farPlaneIntersect = ray * bounds[2][1];

            // Convert these screen and depth bounds into view-space coordinates.
            aabb[0] = min(aabb[0], min(nearPlaneIntersect, farPlaneIntersect));
            aabb[1] = max(aabb[1], max(nearPlaneIntersect, farPlaneIntersect));
        }
    }
    aabb[0].z = -maxZ;
    aabb[1].z = -minZ;

    // for each light
    var numLights = 0u;
    for (var i = 0u; i < lightSet.numLights; i++) {
        // Check if the light intersects with the cluster’s bounding box (AABB).
        let lightPos = (camera.viewMat * vec4f(lightSet.lights[i].pos, 1)).xyz;
        let closestPos = clamp(lightPos, aabb[0], aabb[1]);
        let dist = lightPos - closestPos;
        if (dot(dist, dist) <= ${lightRadius} * ${lightRadius}) {
            if (numLights >= ${lightsClusterCapacity}) { break; }
            clusterSet.clusters[globalIdx.x].lights[numLights] = i;
            numLights++;
        }
    }
    clusterSet.clusters[globalIdx.x].numLights = numLights;
}
