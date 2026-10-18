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
@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(0) @binding(2) var<uniform> camera: CameraUniforms;
fn screenToView(pixel: vec2f, positiveDepth: f32) -> vec3f {
    let ndc = vec2f(
        pixel.x / camera.screenSize.x * 2.0 - 1.0,
        (1.0 - pixel.y / camera.screenSize.y) * 2.0 - 1.0
    );
    var view = camera.invProjMat * vec4f(ndc, 0.5, 1.0);
    view = view / view.w;
    return view.xyz * (-positiveDepth / view.z);
}
@compute
@workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= ${numClustersX} || id.y >= ${numClustersY} || id.z >= ${numClustersZ}) {
        return;
    }
    let tileSize = vec2f(
        camera.screenSize.x / f32(${numClustersX}),
        camera.screenSize.y / f32(${numClustersY})
    );
    let minPixel = vec2f(f32(id.x), f32(id.y)) * tileSize;
    let maxPixel = vec2f(f32(id.x + 1u), f32(id.y + 1u)) * tileSize;
    let zNear = camera.nearPlane * pow(camera.farPlane / camera.nearPlane, f32(id.z) / f32(${numClustersZ}));
    let zFar = camera.nearPlane * pow(camera.farPlane / camera.nearPlane, f32(id.z + 1u) / f32(${numClustersZ}));
    var boxMin = vec3f(1e30, 1e30, 1e30);
    var boxMax = vec3f(-1e30, -1e30, -1e30);
    for (var zi = 0u; zi < 2u; zi++) {
        let depth = select(zNear, zFar, zi == 1u);
        for (var yi = 0u; yi < 2u; yi++) {
            for (var xi = 0u; xi < 2u; xi++) {
                let px = select(minPixel.x, maxPixel.x, xi == 1u);
                let py = select(minPixel.y, maxPixel.y, yi == 1u);
                let corner = screenToView(vec2f(px, py), depth);
                boxMin = min(boxMin, corner);
                boxMax = max(boxMax, corner);
            }
        }
    }
    let clusterIdx = id.x + id.y * ${numClustersX} + id.z * ${numClustersX} * ${numClustersY};
    var count = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightView = (camera.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;
        let closest = clamp(lightView, boxMin, boxMax);
        if (distance(lightView, closest) <= f32(${lightRadius}) && count < ${maxLightsPerCluster}) {
            clusterSet.clusters[clusterIdx].lightIndices[count] = lightIdx;
            count++;
        }
    }
    clusterSet.clusters[clusterIdx].minPos = boxMin;
    clusterSet.clusters[clusterIdx].maxPos = boxMax;
    clusterSet.clusters[clusterIdx].lightCount = count;
}
