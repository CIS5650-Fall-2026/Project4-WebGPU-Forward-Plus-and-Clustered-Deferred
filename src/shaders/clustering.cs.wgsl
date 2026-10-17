// TODO-2: implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// list of clusters that have visible geometry, made by compact_clusters.cs.wgsl
struct ActiveClusters {
    dispatch: vec3u,
    count: u32,
    indices: array<u32>
}
@group(${bindGroup_scene}) @binding(3) var<storage, read> activeClusters: ActiveClusters;

// true when the forward+ depth prepass found the active clusters
override onlyActiveClusters = false;

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

// view space positions of the lights this workgroup is testing right now
var<workgroup> tileLights: array<vec3f, ${clusteringWorkgroupSize}>;

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u, @builtin(local_invocation_index) localIdx: u32) {
    var clusterIdx = globalIdx.x;
    // no early return, every thread has to help load the lights
    var valid = clusterIdx < ${clusterX} * ${clusterY} * ${clusterZ};
    if (onlyActiveClusters) {
        valid = globalIdx.x < activeClusters.count;
        clusterIdx = activeClusters.indices[select(0u, globalIdx.x, valid)];
    }

    let x = clusterIdx % ${clusterX};
    let y = (clusterIdx / ${clusterX}) % ${clusterY};
    let z = clusterIdx / (${clusterX} * ${clusterY});

    // tile bounds in ndc, then scaled so that view xy = ndc * tanHalfFov * depth
    let tiles = vec2f(${clusterX}, ${clusterY});
    let lo = (vec2f(f32(x), f32(y)) / tiles * 2.f - 1.f) * camera.tanHalfFov;
    let hi = (vec2f(f32(x + 1), f32(y + 1)) / tiles * 2.f - 1.f) * camera.tanHalfFov;
    let zNear = sliceDepth(z);
    let zFar = sliceDepth(z + 1);

    // the camera looks down -z in view space
    let aabbMin = vec3f(min(lo * zNear, lo * zFar), -zFar);
    let aabbMax = vec3f(max(hi * zNear, hi * zFar), -zNear);

    let cluster = &clusterSet.clusters[clusterIdx];
    var count = 0u;
    for (var base = 0u; base < lightSet.numLights; base += ${clusteringWorkgroupSize}) {
        // each thread moves one light to view space
        if (base + localIdx < lightSet.numLights) {
            tileLights[localIdx] = (camera.viewMat * vec4f(lightSet.lights[base + localIdx].pos, 1.f)).xyz;
        }
        workgroupBarrier();

        let n = min(${clusteringWorkgroupSize}u, lightSet.numLights - base);
        for (var j = 0u; j < n; j++) {
            // closest point of the box to the light
            let d = clamp(tileLights[j], aabbMin, aabbMax) - tileLights[j];
            if (valid && count < ${maxLightsPerCluster} && dot(d, d) <= ${lightRadius} * ${lightRadius}) {
                (*cluster).lightIndices[count] = base + j;
                count++;
            }
        }
        workgroupBarrier();
    }
    if (valid) {
        (*cluster).numLights = count;
    }
}
