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



// lights, cells and the camera slots
@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> camera: CameraUniforms;

// how we cut the screen
const cellsX: u32 = ${clusterCountWidth}u;
const cellsY: u32 = ${clusterCountHeight}u;
const cellsZ: u32 = ${clusterCountDepth}u;
const maxLights: u32 = 512u;

// distance from the camera to the front of this depth layer
// layer 0 is near, the last wall is far
fn layerDistance(layer: u32) -> f32 {
    let near = camera.depthDist.x;
    let far = camera.depthDist.y;
    return near * pow(far / near, f32(layer) / f32(cellsZ));
}

// get pixel plus a distance and make s a point in front of the camera
fn pixelToCamera(pixel: vec2f, dist: f32) -> vec3f {
    let onScreen = vec2f(
        pixel.x / camera.camScreen.x * 2.0 - 1.0,
        (1.0 - pixel.y / camera.camScreen.y) * 2.0 - 1.0
    );
    let view = camera.reverseProjMat * vec4f(onScreen, 1.0, 1.0);
    let dir = view.xyz / view.w;
    return dir * (-dist / dir.z);
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3u) {
    // extra threads from the last group just leave
    let index = id.x;
    let cellCount = cellsX * cellsY * cellsZ;
    if (index >= cellCount) {
        return;
    }

    // get coordinates
    let x = index % cellsX;
    let y = (index / cellsX) % cellsY;
    let z = index / (cellsX * cellsY);

    // cell rectangle on the window
    let cellWidth = camera.camScreen.x / f32(cellsX);
    let cellHeight = camera.camScreen.y / f32(cellsY);
    let topLeft = vec2f(f32(x) * cellWidth, f32(y) * cellHeight);
    let bottomRight = vec2f(f32(x + 1u) * cellWidth, f32(y + 1u) * cellHeight);

    // front and back of depth layer
    let closeWall = layerDistance(z);
    let farWall = layerDistance(z + 1u);

    // eight corners of the cell
    var boxMin = pixelToCamera(topLeft, closeWall);
    var boxMax = boxMin;
    let corners = array<vec3f, 8>(
        boxMin,
        pixelToCamera(vec2f(bottomRight.x, topLeft.y), closeWall),
        pixelToCamera(vec2f(topLeft.x, bottomRight.y), closeWall),
        pixelToCamera(bottomRight, closeWall),
        pixelToCamera(topLeft, farWall),
        pixelToCamera(vec2f(bottomRight.x, topLeft.y), farWall),
        pixelToCamera(vec2f(topLeft.x, bottomRight.y), farWall),
        pixelToCamera(bottomRight, farWall)
    );
    for (var i = 0u; i < 8u; i++) {
        boxMin = min(boxMin, corners[i]);
        boxMax = max(boxMax, corners[i]);
    }

    // keep the light number if the sphere touches the box
    var count = 0u;
    let radius = f32(${lightRadius});
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lampPos = (camera.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;
        let nearest = clamp(lampPos, boxMin, boxMax);
        if (distance(lampPos, nearest) <= radius && count < maxLights) {
            clusterSet.clusters[index].lights[count] = lightIdx;
            count++;
        }
    }
    clusterSet.clusters[index].numLights = count;
}
