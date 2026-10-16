// Puts light indices into cluster buffer

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// Projects an ndc point + depth into view space
fn viewPointAtDepth(ndc: vec2f, depth: f32) -> vec3f {
    let h = cameraUniforms.invProjMat * vec4f(ndc, 1.0, 1.0);
    let onRay = h.xyz / h.w; // Get homogenous coordinates
    return onRay * (-depth / onRay.z); // Scale point so depth is -depth
}

@compute @workgroup_size(${clusterWorkgroupSize}, ${clusterWorkgroupSize}, ${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u) {
    if(id.x >= ${clusterCountX} || id.y >= ${clusterCountY} || id.z >= ${clusterCountZ}){
        return;
    }

    let clusterIdx = id.x + id.y * ${clusterCountX} + id.z * ${clusterCountX} * ${clusterCountY};

    // Compute the NDC coordinates given x and y 
    let ndcLeft = f32(id.x) / f32(${clusterCountX}) * 2.0 - 1.0;
    let ndcRight = f32(id.x + 1) / f32(${clusterCountX}) * 2.0 - 1.0;
    let ndcTop = 1.0 - f32(id.y) / f32(${clusterCountY}) * 2.0;
    let ndcBottom = 1.0 - f32(id.y + 1) / f32(${clusterCountY}) * 2.0;

    // Create ndc space box
    var corners = array<vec2f, 4>(
        vec2f(ndcLeft, ndcBottom), // bottom left
        vec2f(ndcRight, ndcBottom), // bottom right
        vec2f(ndcLeft, ndcTop), // top left
        vec2f(ndcRight, ndcTop) // top right
    );

    // Compute this cluster's Z bounds. From https://www.aortiz.me/2018/12/21/CG.html#part-2
    let farOverNear = cameraUniforms.far / cameraUniforms.near;
    let depthNear = cameraUniforms.near * pow(farOverNear, f32(id.z) / f32(${clusterCountZ}));
    let depthFar = cameraUniforms.near * pow(farOverNear, f32(id.z + 1) / f32(${clusterCountZ}));

    var aabbMin = vec3f(1e30); // set to some large value to start
    var aabbMax = vec3f(-1e30); // set to some large negative value to start
    for (var i = 0u; i < 4u; i++){
        // Get this corner at the near face of the cluster
        let viewNear = viewPointAtDepth(corners[i], depthNear);
        // Get this corner at the far face of this cluster
        let viewFar = viewPointAtDepth(corners[i], depthFar);

        // Expand the AABB based on these corners
        aabbMin = min(aabbMin, min(viewNear, viewFar));
        aabbMax = max(aabbMax, max(viewNear, viewFar));
    }

    // Put lights into this cluster if they are in the AABB
    var clusterNumLights = 0u;
    for (var i = 0u; i < lightSet.numLights && clusterNumLights < ${maxLightsPerCluster}; i++){
        let light = lightSet.lights[i];
        let lightViewPos = cameraUniforms.viewMat * vec4(light.pos, 1);
        
        let closestPoint = clamp(lightViewPos.xyz, aabbMin, aabbMax);
        let d = closestPoint - lightViewPos.xyz;
        if(dot(d, d) > ${lightRadius} * ${lightRadius}){
            continue;
        }

        clusterSet.clusters[clusterIdx].lightIndices[clusterNumLights] = i;
        clusterNumLights++;
    }
    clusterSet.clusters[clusterIdx].numLights = clusterNumLights;
}