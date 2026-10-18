// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var <uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var <storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var <storage, read_write> clusterSet: ClusterSet;

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

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalID: vec3u) {
    let clusterIndex = globalID.x;

    // Same as CUDA checking thread idx
    if (clusterIndex >= TOTAL_CLUSTERS) {
        return;
    }

    let clusterX = clusterIndex % NUM_CLUSTERS_X;
    let clusterY = (clusterIndex / NUM_CLUSTERS_X) % NUM_CLUSTERS_Y;
    let clusterZ = (clusterIndex / (NUM_CLUSTERS_X * NUM_CLUSTERS_Y));

    // Screen (normalized)
    let screenMin = vec2f(
        f32(clusterX) / f32(NUM_CLUSTERS_X),
        f32(clusterY) / f32(NUM_CLUSTERS_Y)
    );
    let screenMax = vec2f(
        f32(clusterX + 1u) / f32(NUM_CLUSTERS_X),
        f32(clusterY + 1u) / f32(NUM_CLUSTERS_Y)
    );

    let ndcLeft = screenMin.x * 2.0 - 1.0;
    let ndcRight = screenMax.x * 2.0 - 1.0;
    let ndcTop = 1.0 - screenMin.y * 2.0;
    let ndcBottom = 1.0 - screenMax.y * 2.0;

    let ndcCorners = array<vec2f, 4>(
        vec2f(ndcLeft, ndcTop),
        vec2f(ndcRight, ndcTop),
        vec2f(ndcLeft, ndcBottom),
        vec2f(ndcRight, ndcBottom)
    );

    // Cluster depth boundary
    let clusterNear = clusterDepthBoundary(clusterZ);
    let clusterFar = clusterDepthBoundary(clusterZ + 1u);

    // Unproject coorners to build AABB
    var boxMin = vec3f(1e24);
    var boxMax = vec3f(-1e24);

    // Each of the screen's corners...
    for (var cornerIndex = 0u; cornerIndex < 4u; cornerIndex ++) {
        let ndcCorner = ndcCorners[cornerIndex];

        let unprojected = cameraUniforms.inverseProjMat * vec4f(ndcCorner, 1.0, 1.0);

        let viewRay = unprojected.xyz / unprojected.w;

        // Have to negate since clusterNear/Far come out positive
        // typically -z is in front of camera
        let nearPoint = viewRay * (-clusterNear / viewRay.z);
        let farPoint = viewRay * (-clusterFar / viewRay.z);

        boxMin = min(boxMin, nearPoint);
        boxMin = min(boxMin, farPoint);
        boxMax = max(boxMax, nearPoint);
        boxMax = max(boxMax, farPoint);
    }

    clusterSet.clusters[clusterIndex].minAABB = vec4f(boxMin, 0.0);
    clusterSet.clusters[clusterIndex].maxAABB = vec4f(boxMax, 0.0);

    // Test every light
    var clusterLightCount = 0u;

    for (var lightIndex = 0u; lightIndex < lightSet.numLights; lightIndex++) {
        if (clusterLightCount >= MAX_LIGHTS_PER_CLUSTER) {
            break;
        }

        let lightPosWorld = lightSet.lights[lightIndex].pos;
        let lightPosView = (cameraUniforms.viewMat * vec4f(lightPosWorld, 1.0)).xyz;

        if (sphereIntersectsAABB(lightPosView, f32(${lightRadius}), boxMin, boxMax)) {
            clusterSet.clusters[clusterIndex].lightIndices[clusterLightCount] = lightIndex;

            // Keeping seperate track of cluster light count because most of the time only a subset of lights will hit cluster
            clusterLightCount++;
        }
    }

    // Ignore any "garbage" value beyond lights we've checked membership
    clusterSet.clusters[clusterIndex].numLights = clusterLightCount;
}