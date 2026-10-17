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

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn viewPositionAtDepth(pixel: vec2f, depth: f32) -> vec3f {
    let ndc = vec2f(2.f * pixel.x / camera.viewportAndClip.x - 1.f,
                   1.f - 2.f * pixel.y / camera.viewportAndClip.y);
    let point = camera.inverseProjMat * vec4f(ndc, 1.f, 1.f);
    let ray = point.xyz / point.w;
    return ray * (depth / -ray.z);
}

@compute
@workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let grid = clusterGridSize(camera.viewportAndClip.xy);
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= grid.x * grid.y * grid.z) {
        return;
    }

    let x = clusterIdx % grid.x;
    let y = (clusterIdx / grid.x) % grid.y;
    let z = clusterIdx / (grid.x * grid.y);
    let tileSize = vec2f(${clusterTileWidth}, ${clusterTileHeight});
    let pixelMin = vec2f(f32(x), f32(y)) * tileSize;
    let pixelMax = min(pixelMin + tileSize, camera.viewportAndClip.xy);

    let nearPlane = camera.viewportAndClip.z;
    let farPlane = camera.viewportAndClip.w;
    let depthMin = nearPlane * pow(farPlane / nearPlane, f32(z) / f32(grid.z));
    let depthMax = nearPlane * pow(farPlane / nearPlane, f32(z + 1u) / f32(grid.z));

    var aabbMin = vec3f(1e30);
    var aabbMax = vec3f(-1e30);
    for (var cornerY = 0u; cornerY < 2u; cornerY++) {
        for (var cornerX = 0u; cornerX < 2u; cornerX++) {
            let pixel = mix(pixelMin, pixelMax, vec2f(f32(cornerX), f32(cornerY)));
            let nearCorner = viewPositionAtDepth(pixel, depthMin);
            let farCorner = viewPositionAtDepth(pixel, depthMax);
            aabbMin = min(aabbMin, min(nearCorner, farCorner));
            aabbMax = max(aabbMax, max(nearCorner, farCorner));
        }
    }

    var count = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let center = (camera.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.f)).xyz;
        let closest = clamp(center, aabbMin, aabbMax);
        let delta = center - closest;
        if (dot(delta, delta) <= f32(${lightRadius} * ${lightRadius})) {
            if (count < ${maxLightsPerCluster}u) {
                clusterSet.clusters[clusterIdx].indices[count] = lightIdx;
            }
            count++;
        }
    }

    clusterSet.clusters[clusterIdx].count = count;
}
