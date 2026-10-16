// 2: implement the light clustering compute shader

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

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

const NX: u32 = ${clusterCountX}u;
const NY: u32 = ${clusterCountY}u;
const NZ: u32 = ${clusterCountZ}u;
const N: u32 = ${clusterCount}u;
const MAX_LIGHTS: u32 = ${maxLightsPerCluster}u;
const LIGHT_RADIUS: f32 = ${lightRadius};

fn viewPointAtDepth(uv: vec2f, depth: f32) -> vec3f {
    let ndc = vec3f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0);
    let view = camera.invProjMat * vec4(ndc, 1.0);
    let p = view.xyz / view.w;

    return -p * (depth / p.z);
}

fn isIntersetAABBSphere(boundsMin: vec3f, boundsMax: vec3f, 
    center: vec3f, radius: f32) -> bool {
    let closest = clamp(center, boundsMin, boundsMax);
    let delta = center - closest;
    return dot(delta, delta) <= radius * radius;
}

@compute @workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) index: vec3u) {
    let i = index.x;
    if (i >= ${clusterCount}) {
        return;
    }

    let x = i % NX;
    let y = (i / NX) % NY;
    let z = i / (NX * NY);

    let uvMin = vec2f(f32(x) / f32(NX), f32(y) / f32(NY));
    let uvMax = vec2f(f32(x + 1) / f32(NX), f32(y + 1) / f32(NY));

    let ratio = camera.farZ / camera.nearZ;

    let depthNear = camera.nearZ * pow(ratio, f32(z) / f32(NZ));
    let depthFar = camera.nearZ * pow(ratio, f32(z + 1) / f32(NZ));

    let firstPoint = viewPointAtDepth(uvMin, depthNear);
    var boundsMin = firstPoint;
    var boundsMax = firstPoint;

    for (var dir = 0u; dir < 4u; dir++) {
        let uv = vec2f(
            select(uvMin.x, uvMax.x, (dir & 1u) != 0u),
            select(uvMin.y, uvMax.y, (dir & 2u) != 0u)
        );

        let pNear = viewPointAtDepth(uv, depthNear);
        let pFar = viewPointAtDepth(uv, depthFar);

        boundsMin = min(boundsMin, min(pNear, pFar));
        boundsMax = max(boundsMax, max(pNear, pFar));
    }

    var lightCount = 0u;

    for (var lightIndex = 0u; lightIndex < lightSet.numLights; lightIndex++) {
        let center = (camera.viewMat 
            * vec4f(lightSet.lights[lightIndex].pos, 1.0)).xyz;
        
        if (isIntersetAABBSphere(boundsMin, boundsMax, center, LIGHT_RADIUS)) {
            clusterSet.clusters[i].lightIndices[lightCount] = lightIndex;
            lightCount++;

            if (lightCount >= MAX_LIGHTS) {
                break;
            }
        }
    }

    clusterSet.clusters[i].count = lightCount;
}