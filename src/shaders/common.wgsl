// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct Cluster {
    // Corners of bounding box
    minAABB: vec4f, // using vec4f for auto padding, dont think we need .w value
    maxAABB: vec4f,

    numLights: u32,
    // not expecting to use all indicies, but we cant use a vector/need to allocate in the case that all lights hit the cluster
    lightIndices: array<u32, ${maxLightsPerCluster}> 
}

struct ClusterSet {
    clusters: array<Cluster>
}

// Pull values pre defined
const NUM_CLUSTERS_X: u32 = ${numClustersX}u;
const NUM_CLUSTERS_Y: u32 = ${numClustersY}u;
const NUM_CLUSTERS_Z: u32 = ${numClustersZ}u;
const TOTAL_CLUSTERS: u32 = ${totalClusters}u;
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster}u;

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    inverseProjMat: mat4x4f,
    screenSize: vec2f,
    _padding: vec2f // Align with 16 bytes, not used
}

fn clusterDepthBoundary(slice: u32) -> f32 {
    let nearPlane = f32(${nearPlane});
    let farPlane = f32(${farPlane});

    // (normalize by depth)
    let sliceNormalized = f32(slice) / f32(NUM_CLUSTERS_Z);

    return nearPlane * pow(farPlane / nearPlane, sliceNormalized);
}

fn flattenClusterIndex(coords: vec3u) -> u32 {
    return coords.x + NUM_CLUSTERS_X * (coords.y + NUM_CLUSTERS_Y * coords.z);
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn sphereIntersectsAABB(center: vec3f, rad: f32, boxMin: vec3f, boxMax: vec3f) -> bool {
    let closestPos = clamp(center, boxMin, boxMax);
    let diff = center - closestPos;

    // Avoid compute square root, just compare with square
    return dot(diff, diff) <= rad * rad;
}

fn clusterZFromDepthView(depth: f32) -> u32 {
    let nearPlane = f32(${nearPlane});
    let farPlane = f32(${farPlane});

    let safeDepth = clamp(depth, nearPlane, farPlane);

    // Computed depth exponetially, so undo it with log
    let normalizedDepth = log(safeDepth / nearPlane) / log(farPlane / nearPlane);
    let scaledDepth = floor(clamp(normalizedDepth, 0.0, 1.0) * f32(NUM_CLUSTERS_Z));

    return min(u32(scaledDepth), NUM_CLUSTERS_Z - 1u);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}
