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







 // Implement the light clustering compute shader

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;


const nearPlane: f32 = 0.1;
const farPlane: f32 = 1000.0;



// Convert NDC coordinates and positive view-space depth to view space
fn ndcToView(ndcXY: vec2f, depth: f32) -> vec3f {
    let farPoint = camera.inverseProjMat * vec4f(ndcXY, 1.0, 1.0);
    let viewPoint = farPoint.xyz / farPoint.w;

    return viewPoint * (depth / -viewPoint.z);
}



// Check whether a light sphere intersects a cluster AABB
fn sphereIntersectsAABB(
    center: vec3f,
    radius: f32,
    boxMin: vec3f,
    boxMax: vec3f
) -> bool {
    let closestPoint = clamp(center, boxMin, boxMax);
    let difference = center - closestPoint;



    return dot(difference, difference) <= radius * radius;
}





@compute @workgroup_size(${clusteringWorkgroupSize})

fn main(@builtin(global_invocation_id) globalID: vec3u) {
    let clusterIndex = globalID.x;



    let totalClusters =
        ${clusterCountX}u * ${clusterCountY}u * ${clusterCountZ}u;



    if (clusterIndex >= totalClusters) {
        return;
    }

   
    // Calculating cluster bounds here...
   


    // Convert linear cluster index to (X, Y, Z)
    let clusterX = clusterIndex % ${clusterCountX}u;
    let clusterY = (clusterIndex / ${clusterCountX}u) % ${clusterCountY}u;
    let clusterZ = clusterIndex / (${clusterCountX}u * ${clusterCountY}u);

    // Calculate screen-space bounds in NDC
    let xMin = f32(clusterX) / f32(${clusterCountX}) * 2.0 - 1.0;
    let xMax = f32(clusterX + 1u) / f32(${clusterCountX}) * 2.0 - 1.0;

    let yMax = 1.0 - f32(clusterY) / f32(${clusterCountY}) * 2.0;
    let yMin = 1.0 - f32(clusterY + 1u) / f32(${clusterCountY}) * 2.0;

    // Calculate logarithmic depth bounds
    let depthRatio = farPlane / nearPlane;

    let depthNear = nearPlane * pow(depthRatio, f32(clusterZ) / f32(${clusterCountZ}));

    let depthFar = nearPlane * pow(depthRatio, f32(clusterZ + 1u) / f32(${clusterCountZ}));

    // Convert the eight corners to view space and compute the AABB
    var boxMin = vec3f(1e30, 1e30, 1e30);
    var boxMax = vec3f(-1e30, -1e30, -1e30);

    for (var z = 0u; z < 2u; z++) {
        let depth = select(depthNear, depthFar, z == 1u);

        for (var y = 0u; y < 2u; y++) {
            let ndcY = select(yMin, yMax, y == 1u);

            for (var x = 0u; x < 2u; x++) {
                let ndcX = select(xMin, xMax, x == 1u);

                let corner = ndcToView(vec2f(ndcX, ndcY), depth);

                boxMin = min(boxMin, corner);
                boxMax = max(boxMax, corner);
            }
        }
    }





   
    // Assigning lights to clusters
   

    // Initialize the number of lights in this cluster
    var lightCount = 0u;


    // Check every active light against the cluster AABB
    for (var lightIndex = 0u; lightIndex < lightSet.numLights; lightIndex++) {
        let light = lightSet.lights[lightIndex];

        // Transform the light position from world space to view space
        let lightView = camera.viewMat * vec4f(light.pos, 1.0);

        // Check whether the light intersects the cluster
        if (sphereIntersectsAABB(
            lightView.xyz,
            ${lightRadius},
            boxMin,
            boxMax
        )) {
            // Stop adding lights when the maximum capacity is reached
            if (lightCount >= ${maxLightsPerCluster}u) {
                break;
            }

            clusterSet.clusters[clusterIndex].lightIndices[lightCount] = lightIndex;
            lightCount++;
        }
    }

    

    // Store the number of lights assigned to this cluster
    clusterSet.clusters[clusterIndex].numLights = lightCount;
}
