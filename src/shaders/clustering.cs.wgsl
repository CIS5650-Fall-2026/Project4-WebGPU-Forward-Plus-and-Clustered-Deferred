@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn viewPoint(pixel: vec2f, depth: f32) -> vec3f {
    let ndc = vec2f(pixel.x / camera.screenSize.x * 2 - 1,
                    1 - pixel.y / camera.screenSize.y * 2);
    let point = camera.invProjMat * vec4f(ndc, 1, 1);
    return point.xyz * (-depth / point.z);
}

@compute @workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u) {
    let index = id.x;
    if (index >= ${clusterCountX}u * ${clusterCountY}u * ${clusterCountZ}u) { return; }
    let x = index % ${clusterCountX}u;
    let y = (index / ${clusterCountX}u) % ${clusterCountY}u;
    let z = index / (${clusterCountX}u * ${clusterCountY}u);
    let pixelMin = vec2f(f32(x), f32(y)) / vec2f(${clusterCountX}, ${clusterCountY}) * camera.screenSize;
    let pixelMax = vec2f(f32(x + 1u), f32(y + 1u)) / vec2f(${clusterCountX}, ${clusterCountY}) * camera.screenSize;
    let nearDepth = camera.nearPlane * pow(camera.farPlane / camera.nearPlane, f32(z) / f32(${clusterCountZ}));
    let farDepth = camera.nearPlane * pow(camera.farPlane / camera.nearPlane, f32(z + 1u) / f32(${clusterCountZ}));
    let a = viewPoint(pixelMin, nearDepth);
    let b = viewPoint(pixelMax, nearDepth);
    let c = viewPoint(pixelMin, farDepth);
    let d = viewPoint(pixelMax, farDepth);
    let boundsMin = min(min(a, b), min(c, d));
    let boundsMax = max(max(a, b), max(c, d));
    clusterSet.clusters[index].minBounds = boundsMin;
    clusterSet.clusters[index].maxBounds = boundsMax;
    var count = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let center = (camera.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1)).xyz;
        let delta = center - clamp(center, boundsMin, boundsMax);
        if (dot(delta, delta) <= f32(${lightRadius} * ${lightRadius})) {
            clusterSet.clusters[index].lightIndices[count] = lightIdx;
            count++;
            if (count == ${maxLightsPerCluster}u) { break; }
        }
    }
    clusterSet.clusters[index].numLights = count;
}
