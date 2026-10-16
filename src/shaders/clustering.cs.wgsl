@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

struct AABB { 
    min: vec3f, 
    max: vec3f 
}

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster. 
fn ndcToView(ndc: vec2f) -> vec3f {
    // let z = 0 to get point on the near plane 
    let p = cameraUniforms.invProj * vec4f(ndc, 0.0, 1.0);
    return p.xyz / p.w;                      
}

fn clusterBounds(clusterIdx: vec3u) -> AABB {
    
    let grid = vec3f(${clusterX}, ${clusterY}, ${clusterZ});
    let x = f32(clusterIdx.x);
    let y = f32(clusterIdx.y);
    let z = f32(clusterIdx.z);

    // ndc [-1, 1]
    let ndcMin = vec2f(x, y) / grid.xy * 2.0 - 1.0;
    let ndcMax = vec2f(x + 1.0, y + 1.0) / grid.xy * 2.0 - 1.0;

    // inverse projection 
    let viewMin = ndcToView(ndcMin);
    let viewMax = ndcToView(ndcMax);

    let nearD = cameraUniforms.near + f32(z) / grid.z * (cameraUniforms.far - cameraUniforms.near);
    let farD = cameraUniforms.near + f32(z + 1) / grid.z * (cameraUniforms.far - cameraUniforms.near);

    let nearMin = viewMin * (nearD / -viewMin.z);
    let farMin = viewMin * (farD / -viewMin.z);
    let nearMax = viewMax * (nearD / -viewMax.z);
    let farMax = viewMax * (farD / -viewMax.z);
    

    let AABBMin = min(min(nearMin, farMin), min(nearMax, farMax));
    let AABBMax = max(max(nearMin, farMin), max(nearMax, farMax));

    return AABB(AABBMin, AABBMax);
}

fn checkLightIntersection(AABBMin: vec3f, AABBMax: vec3f, lightPos: vec3f, lightR: f32) -> bool {
    let closestPoint = clamp(lightPos, AABBMin, AABBMax);
    let dist = length(closestPoint - lightPos);
    return dist < lightR;
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
@compute
@workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;

    if (clusterIdx >= ${clusterX} * ${clusterY} * ${clusterZ}) {
        return;
    }

    // go from 1D clusterIdx to 3D (x, y, z) coords
    let x = clusterIdx % ${clusterX};
    let y = (clusterIdx / ${clusterX}) % ${clusterY};
    let z = clusterIdx / (${clusterX} * ${clusterY});
    
    // get cluster bounds 
    let bounds = clusterBounds(vec3u(x, y, z));

    var lightCount: u32 = 0;

    // populate lights inside cluster   
    for (var lightIdx: u32 = 0; lightIdx < lightSet.numLights; lightIdx++) {

        let lightViewPos = (cameraUniforms.view * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;
        if (checkLightIntersection(bounds.min, bounds.max, lightViewPos, ${lightRadius})) {
            if (lightCount < ${maxLightsPerCluster}) {
                clusterSet.clusters[clusterIdx].lightIndices[lightCount] = lightIdx;
                lightCount++;
            } else {
                break;
            }
        }
    }
    clusterSet.clusters[clusterIdx].numLights = lightCount;
}