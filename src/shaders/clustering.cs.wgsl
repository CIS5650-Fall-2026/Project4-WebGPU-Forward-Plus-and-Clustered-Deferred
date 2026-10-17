@group(0) @binding(0) var<storage, read> lights: LightSet;
@group(0) @binding(1) var<storage, read_write> clusters: ClusterSet;
@group(0) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

fn normalizedRay(ndc: vec2f, depth: f32) -> vec3f {
    let inverseProj = cameraUniforms.inverseProjMat * vec4f(ndc, 1.0, 1.0);
    let ray = inverseProj.xyz / inverseProj.w;
    let multiplier = (depth / -ray.z);
    return ray * multiplier;
}

@compute
@workgroup_size(${clusterGroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    //first calculate num of clusters
    let numClusters = u32(${clusterX} * ${clusterY} * ${clusterZ});
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= numClusters) {
        return;
    }
    //calculate bounds for the cluster
    let min_x = clusterIdx % ${clusterX}u;
    let min_y = (clusterIdx / ${clusterX}u) % ${clusterY}u;
    let max_x = clusterIdx % ${clusterX}u + 1u;
    let max_y = (clusterIdx / ${clusterX}u) % ${clusterY}u + 1u;
    let sliceZ = clusterIdx / (${clusterX}u * ${clusterY}u);
    let min = 2.f * vec2f(f32(min_x), f32(min_y)) / vec2f(${clusterX}, ${clusterY}) - 1.f;
    let max = 2.f * vec2f(f32(max_x), f32(max_y)) / vec2f(${clusterX}, ${clusterY}) - 1.f;
    let front = cameraUniforms.front;
    let back = cameraUniforms.back;
    let front_Z = front * pow(back / front, f32(sliceZ) / ${clusterZ}.f);
    let back_Z = front * pow(back / front, f32(sliceZ + 1u) / ${clusterZ}.f);

    //set to some arbitrary starting values
    var minBounds = vec3f(1e10f);
    var maxBounds = vec3f(-1e10f);

    //update the bounds
    for (var i = 0u; i < 8u; i++) {
        let ndc = vec2f(select(min.x, max.x, (i & 1u) != 0u), select(min.y, max.y, (i & 2u) != 0u));
        let depth_z = select(front_Z, back_Z, (i & 4u) != 0u);
        let norm = normalizedRay(ndc, depth_z);
        minBounds = select(minBounds, norm, norm < minBounds);
        maxBounds = select(maxBounds, norm, norm > maxBounds);
    }

    //assign lights based on bounding boxes
    let rad = f32(${lightRadius});
    var count = 0u;
    for (var i = 0u; i < lights.numLights; i++) {
        if (count >= ${lightsPerCluster}u) {
            break;
        }
        let lightpos = (cameraUniforms.viewMat * vec4f(lights.lights[i].pos, 1.f)).xyz;
        //determine the closest bounding box for this light
        let closestBox = clamp(lightpos, minBounds, maxBounds);
        let dist = lightpos - closestBox;
        if (pow(rad,2) >= dot(dist, dist)) {
            clusters.clusters[clusterIdx].lightsIndicesInCluster[count] = i;
            count++;
        }
    }

    clusters.clusters[clusterIdx].numLights = count;
}
