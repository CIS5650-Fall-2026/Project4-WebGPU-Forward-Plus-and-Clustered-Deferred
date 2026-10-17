@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(3) var<storage, read_write> clusterLightIDs: ClusterLightIDs;
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

@compute
@workgroup_size(${clusterWorkGroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    let numClusters = clusterSet.clusterDim.x * clusterSet.clusterDim.y * clusterSet.clusterDim.z;
    if (clusterIdx >= numClusters) {
        return;
    }
    let clusterId3 = getClusterId3(clusterIdx, clusterSet.clusterDim);

    //
    var bbxMin = vec3f(10000.0);
    var bbxMax = vec3f(-10000.0);
    for(var x=0u; x<=1u; x++) {
        for(var y=0u; y<=1u; y++) {
            for(var z=0u; z<=1u; z++) {
                let currNormId = vec3f(clusterId3+vec3u(x,y,z)) / vec3f(clusterSet.clusterDim);


                let ndc = vec4f(currNormId.xy*2.0-1.0, 0.0, 1.0);
                var worldPos = camera.inverseViewProj * ndc;
                worldPos /= worldPos.w;
                let rd = normalize(worldPos.xyz-camera.position);

                var fo = camera.inverseViewProj * vec4f(0.0,0.0,0.0,1.0);
                fo /= fo.w;
                let forward = normalize(fo.xyz-camera.position);
                
                let depth = getClusterDepth(currNormId.z);
                let pos = camera.position + rd*depth/dot(rd, forward);

                bbxMin = min(bbxMin, pos);
                bbxMax = max(bbxMax, pos);

                //bbxMin = currNormId;
            }
        }
    }

    clusterSet.clusters[clusterIdx].bbxMin = bbxMin;
    clusterSet.clusters[clusterIdx].bbxMax = bbxMax;

    // What lights are within the cluster?
    var localLightArray : array<u32, 1000>;
    var lightsFound = 0u;

    let bbxDim = bbxMax-bbxMin;
    let bbxPos = 0.5*(bbxMax+bbxMin);

    // Find lights
    for(var i=0u; i<lightSet.numLights; i++) {
        let lightPos = lightSet.lights[i].pos;

        let p = abs(lightPos-bbxPos)-bbxDim*0.5;
        if(max(p.x, max(p.y, p.z)) <= ${lightRadius}) {
            // Light i is within bbx
            localLightArray[lightsFound] = i;// lightsFOund++
            lightsFound++;
        }
    }

    // Put lights into array
    let lightStart = atomicAdd(&clusterLightIDs.count, lightsFound);
    for(var i=0u; i<lightsFound; i++) {
        clusterLightIDs.indices[lightStart + i] = localLightArray[i];
    }

    clusterSet.clusters[clusterIdx].lightStart = lightStart;
    clusterSet.clusters[clusterIdx].lightCount = lightsFound;
}
