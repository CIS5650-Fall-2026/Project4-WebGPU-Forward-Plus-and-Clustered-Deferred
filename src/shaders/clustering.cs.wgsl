@group(${bindGroup_scene}) @binding(0) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> screenHeight: f32;
@group(${bindGroup_scene}) @binding(2) var<uniform> screenWidth: f32;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterRowLength: f32;
@group(${bindGroup_scene}) @binding(4) var<uniform> nearplane: f32;
@group(${bindGroup_scene}) @binding(5) var<uniform> farplane: f32;
@group(${bindGroup_scene}) @binding(6) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(7) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(8) var<uniform> clusterRadius: f32;

// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// CHECKITOUT: this is an example of a compute shader entry point function
@compute
@workgroup_size(${createClustersWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterCubeZNum = u32(1);
    let clusterCubeZLength = u32(25);

    let clusterIdx = u32(globalIdx.x);
    let intClusterRowLength = u32(clusterRowLength);

    let totalNumClusterCells = u32(intClusterRowLength * intClusterRowLength); // how many 2d cells
    let totalNumClusters = intClusterRowLength * intClusterRowLength * clusterCubeZNum;
    if (clusterIdx >= totalNumClusters) {
        return;
    }
    clusterSet.numClusters = u32(totalNumClusters);

    let clusterHeight = u32(screenHeight);
    let clusterWidth = u32(screenWidth);

    let clusterIndexX = clusterIdx % intClusterRowLength;
    let clusterIndexY = (clusterIdx%totalNumClusterCells) / intClusterRowLength;
    let clusterIndexZ = clusterIdx / totalNumClusterCells;


    clusterSet.clusters[clusterIdx].minCornerXY = vec2f(f32(clusterIndexX*clusterHeight), f32(clusterIndexY*clusterWidth));
    clusterSet.clusters[clusterIdx].maxCornerXY = vec2f(f32((clusterIndexX+1)*clusterHeight), f32((clusterIndexY+1)*clusterWidth));
    // calculate depth based on z index

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
    clusterSet.clusters[clusterIdx].numLights = 0;
    var currNumLights = 0;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights && currNumLights < 1001; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        let clusterCenter = (clusterSet.clusters[clusterIdx].maxCornerXY + clusterSet.clusters[clusterIdx].minCornerXY) / 2.f;
        // if light intersects with 2d cluster
        if(distance(clusterCenter, light.screenPos) < (2*light.screenRadius+clusterRadius*2)) {
                // put light into cluster based on depth
                // if(u32(light.depthFromCam) /u32(clusterCubeZLength) ==  clusterIndexZ) {
                //     clusterSet.clusters[clusterIdx].lightIndices[currNumLights] = lightIdx;
                //     currNumLights++;
                //     continue;
                // }
                if(abs(u32(light.depthFromCam) - clusterIndexZ*clusterCubeZLength) < 10*clusterCubeZLength) {
                    clusterSet.clusters[clusterIdx].lightIndices[currNumLights] = lightIdx;
                    currNumLights++;
                    continue;
                }
                // if(abs(u32(light.depthFromCam) /u32(clusterCubeZLength) - clusterIndexZ) < 6) {
                //     clusterSet.clusters[clusterIdx].lightIndices[currNumLights] = lightIdx;
                //     currNumLights++;
                //     continue;
                // }
        }
    }
    clusterSet.clusters[clusterIdx].numLights = u32(currNumLights);
}
