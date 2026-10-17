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

//TODO: define bindGroup_cluster
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSets : array<ClusterSet>;

fn sphereIntersectsAABB(o: vec3f, r: f32, min: vec3f, max: vec3f) -> bool {
    return (length(clamp(o, min, max) - o) <= r);
}

fn toScreenSpace(p: vec2u, dims: vec2f) -> vec2f {
    let x = f32(p.x * ${clusterPixelSize}) / dims.x * 2.0 - 1.0;
    let y = 1.0 - 2.0 * f32(p.y * ${clusterPixelSize}) / dims.y;
    return vec2f(x, y);
}

var<workgroup> lightCounter: atomic<u32>;

@compute @workgroup_size(${workgroup_size})
fn computeClusterMain(
    @builtin(workgroup_id) blockIdx: vec3u,
    @builtin(local_invocation_index) threadIdx: u32,
    @builtin(num_workgroups) numWorkgroups: vec3u
    ) {
    
    let clusterIdx: u32 = blockIdx.x + 
        blockIdx.y * numWorkgroups.x + 
        blockIdx.z * numWorkgroups.x * numWorkgroups.y;

    //Compute screen space cluster bounds
    let screenMin: vec2f = toScreenSpace(blockIdx.xy, cameraUniforms.dims);
    let screenMax: vec2f = toScreenSpace(blockIdx.xy + vec2u(1), cameraUniforms.dims);

    //Log slices
    let minZ: f32 = cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, f32(blockIdx.z) / f32(numWorkgroups.z));
    let maxZ: f32 = cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, f32(blockIdx.z + 1) / f32(numWorkgroups.z));

    //Turn the screen space coords into view space bounds
    let nearMin: vec3f = vec3f(screenMin * vec2f(cameraUniforms.invProj[0][0], cameraUniforms.invProj[1][1]), -1) * minZ;
    let nearMax: vec3f = vec3f(screenMax * vec2f(cameraUniforms.invProj[0][0], cameraUniforms.invProj[1][1]), -1) * minZ;
    let farMin: vec3f = vec3f(screenMin * vec2f(cameraUniforms.invProj[0][0], cameraUniforms.invProj[1][1]), -1) * maxZ;
    let farMax: vec3f = vec3f(screenMax * vec2f(cameraUniforms.invProj[0][0], cameraUniforms.invProj[1][1]), -1) * maxZ;

    //Compute the AABB
    let minimum = min(min(nearMin, nearMax), min(farMin, farMax));
    let maximum = max(max(nearMin, nearMax), max(farMin, farMax));

    //Start adding them lights
    for (var i: u32 = threadIdx; i < lightSet.numLights; i += ${workgroup_size}) {
        //If the cluster is full, break

        if (sphereIntersectsAABB((cameraUniforms.view * vec4f(lightSet.lights[i].pos, 1)).xyz, ${lightRadius}, minimum, maximum)) {
            //Update number of lights
            let nextIdx: u32 = atomicAdd(&lightCounter, 1); //Get the index to write this light to
            if (nextIdx >= ${maxClusterLights}) {
                break; //Max lights reached
            } 
            clusterSets[clusterIdx].lights[nextIdx] = i;
        }
    }

    //Write out the number of lights in the cluster
    workgroupBarrier();
    if (threadIdx == 0) {
        clusterSets[clusterIdx].lightCounter = min(${maxClusterLights}, atomicLoad(&lightCounter));
    }
}