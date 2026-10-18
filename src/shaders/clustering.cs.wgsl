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

@group(0) @binding(0) var<uniform> camUniform: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn ndcToView(ndc: vec2f, depth: f32) -> vec3f {
    let p = camUniform.invProjMat * vec4f(ndc, 1.0, 1.0);
    let v = p.xyz / p.w;
    return v * (depth / -v.z);
}

fn sphereIntersectAABB(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    // center inside the box
    if (all(center >= aabbMin) && all(center <= aabbMax)) {
        return true;
    }

    //center outside the box
    let closestPoint = clamp(center, aabbMin, aabbMax);
    let distanceSquared = dot(closestPoint - center, closestPoint - center);
    return distanceSquared <= radius * radius; 
}


@compute @workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) gid:vec3u){
    let idx = gid.x;
    if (idx >= ${clusterX} * ${clusterY} * ${clusterZ}) {
        return;
    }

    let X = u32(${clusterX});
    let Y = u32(${clusterY});
    let Z = u32(${clusterZ});

    let x = idx % X;
    let y = (idx / X) % Y;
    let z = idx / (X * Y);

    //Calculate NDC bounds
    let ndcMinX = f32(x) / f32(X) * 2.0 - 1.0;
    let ndcMaxX = f32(x + 1) / f32(X) * 2.0 - 1.0;
    let ndcMinY = f32(y) / f32(Y) * 2.0 - 1.0;
    let ndcMaxY = f32(y + 1) / f32(Y) * 2.0 - 1.0;

    let near = camUniform.screenDim.z;
    let far = camUniform.screenDim.w;
    let zNear = near * pow(far / near, f32(z) / f32(Z));
    let zFar = near * pow(far / near, f32(z + 1) / f32(Z));

    //Convert NDC bounds to view space
    let vNearlb = ndcToView(vec2f(ndcMinX, ndcMinY), zNear);
    let vNearlt = ndcToView(vec2f(ndcMinX, ndcMaxY), zNear);
    let vNearrb = ndcToView(vec2f(ndcMaxX, ndcMinY), zNear);
    let vNearrt = ndcToView(vec2f(ndcMaxX, ndcMaxY), zNear); 
    let vFarlb = ndcToView(vec2f(ndcMinX, ndcMinY), zFar);
    let vFarlt = ndcToView(vec2f(ndcMinX, ndcMaxY), zFar);
    let vFarrb = ndcToView(vec2f(ndcMaxX, ndcMinY), zFar);
    let vFarrt = ndcToView(vec2f(ndcMaxX, ndcMaxY), zFar);

    let aabbMin = min(min(min(vNearlb, vNearlt), min(vNearrb, vNearrt)), min(min(vFarlb, vFarlt), min(vFarrb, vFarrt)));
    let aabbMax = max(max(max(vNearlb, vNearlt), max(vNearrb, vNearrt)), max(max(vFarlb, vFarlt), max(vFarrb, vFarrt)));

    var cnt = 0u;
    for (var i = 0u; i < lightSet.numLights; i = i + 1u) {
        let light = lightSet.lights[i];
        let lightView = (camUniform.viewMat * vec4f(light.pos, 1.0)).xyz;
        if (sphereIntersectAABB(lightView, ${lightRadius}, aabbMin, aabbMax)){
            if (cnt < ${maxLightsPerCluster}) {
                clusterSet.clusters[idx].lightsIndexes[cnt] = i;
                cnt = cnt + 1u;
            }
        }
        
    }
    clusterSet.clusters[idx].numLights = cnt;
}


