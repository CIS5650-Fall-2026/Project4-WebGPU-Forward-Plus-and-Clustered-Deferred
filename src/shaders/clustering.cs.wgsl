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
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

// These helper functions are taken from https://www.aortiz.me/2018/12/21/CG.html#part-2

// Creates a line segment from the eye to the screen point, then finds its intersection with a z oriented plane located at the given distance to the origin
fn lineIntersectionToZPlane(A: vec3f , B: vec3f ,  zDistance: f32) -> vec3f  {
    let normal = vec3f(0.f, 0.f, 1.f);
    let ab =  B - A;
    let t = (zDistance - dot(normal, A)) / dot(normal, ab);
    return A + t * ab;
}

// screen to view space
fn screenToView(screen: vec2f) -> vec3f {
    let clip = vec4f(screen.x / cameraUniforms.screenX * 2.0 - 1.0,
                    1.0 - screen.y / cameraUniforms.screenY * 2.0,
                    0.0,
                    1.0);
    let v = cameraUniforms.invProjMat * clip;
    return v.xyz / v.w;  // perspective divide
}

// Checking for intersection given a cluster AABB and a light volume
fn testSphereAABB(lightIdx: u32 , bboxmin_vs: vec3f, bboxmax_vs: vec3f) -> bool {
    // put in view space
    let center = (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;
    let closest = clamp(center, bboxmin_vs, bboxmax_vs);   // nearest point on/in the box
    let d = center - closest;
    let squaredDistance = dot(d,d);

    return squaredDistance <= (${lightRadius} * ${lightRadius});
}

@compute
@workgroup_size(4,4,4)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    // assign globalidx to clusterindices see if theyre in bounds

    let clusterIdx = globalIdx;
    if (clusterIdx.x >= ${clusterDimX} || clusterIdx.y >= ${clusterDimY} || clusterIdx.z >= ${clusterDimZ}) {
        return;
    } // out of bounds
    
    let dims = vec3f(${clusterDimX}, ${clusterDimY}, ${clusterDimZ});

//  Calculating cluster bounds:

    let tileSize = vec2f(cameraUniforms.screenX / dims.x, cameraUniforms.screenY / dims.y);
    
    // Calculate the screen-space bounds for this cluster in 2D (XY).
    let max_ss = vec2f(clusterIdx.xy + vec2u(1u, 1u)) * tileSize ;
    let min_ss = vec2f(clusterIdx.xy) * tileSize;
    
    // Calculate the depth bounds for this cluster in Z (near and far planes).
    // in view space                      
    let max_vs = screenToView(max_ss);
    let min_vs = screenToView(min_ss);

    // near and far values in view space
    let tileNear = -cameraUniforms.nClip * pow(cameraUniforms.fClip /cameraUniforms.nClip, f32(clusterIdx.z) / dims.z);
    
    let tileFar = -cameraUniforms.nClip * pow(cameraUniforms.fClip /cameraUniforms.nClip, (f32(clusterIdx.z) + 1.0) / dims.z);

    // Convert these screen and depth bounds into view-space coordinates.
    // 4 intersection points
    let eyePos = vec3(0.0); // it is 0 in view space

    let minPointNear = lineIntersectionToZPlane(eyePos, min_vs, tileNear);
    let minPointFar  = lineIntersectionToZPlane(eyePos, min_vs, tileFar);
    let maxPointNear = lineIntersectionToZPlane(eyePos, max_vs, tileNear);
    let maxPointFar  = lineIntersectionToZPlane(eyePos, max_vs, tileFar);

    // Store the computed bounding box (AABB) for the cluster.
    let minAABB = min(min(minPointNear, minPointFar), min(maxPointNear, maxPointFar));
    let maxAABB = max(max(minPointNear, minPointFar), max(maxPointNear, maxPointFar));

// Assigning lights to clusters:
    var count = 0u;
    let flattenedIdx = clusterIdx.x + clusterIdx.y * u32(dims.x) + clusterIdx.z * u32(dims.x) * u32(dims.y);

    for (var i = 0; u32(i) < lightSet.numLights; i++) {
        if (count >= ${maxLightsPerCluster}) {
            break;
        }
        if (testSphereAABB(u32(i), minAABB, maxAABB)) {
            clusterSet.clusters[flattenedIdx].lightIndices[count] = u32(i);
            count++;
        }
    }

    clusterSet.clusters[flattenedIdx].numLightsInCluster = count;

}
