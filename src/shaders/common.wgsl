// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// CHECKITOUT: lights affecting each cluster. Clusters are indexed as x + y * clusterCountX + z * clusterCountX * clusterCountY,
// where x and y index screen-space tiles (y = 0 is the top row) and z indexes exponentially spaced depth slices.
struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

// must match the layout of CameraUniforms in camera.ts
struct CameraUniforms {
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    screenDims: vec2f,
    nearPlane: f32,
    farPlane: f32
}

// View-space depth (distance in front of the camera) at which depth slice "slice" begins. Slices are spaced
// exponentially so that clusters keep roughly the same shape at every distance from the camera.
fn clusterSliceStartDepth(slice: u32, nearPlane: f32, farPlane: f32) -> f32 {
    return nearPlane * pow(farPlane / nearPlane, f32(slice) / f32(${clusterCountZ}));
}

// Inverse of clusterSliceStartDepth(): the depth slice containing view-space depth "viewDepth".
fn clusterSliceIndex(viewDepth: f32, nearPlane: f32, farPlane: f32) -> u32 {
    let slice = log(viewDepth / nearPlane) / log(farPlane / nearPlane) * f32(${clusterCountZ});
    return u32(clamp(slice, 0.f, f32(${clusterCountZ} - 1)));
}

// Index of the cluster containing a fragment, given its framebuffer coordinates and view-space depth.
fn clusterIndex(fragCoord: vec2f, viewDepth: f32, screenDims: vec2f, nearPlane: f32, farPlane: f32) -> u32 {
    let clusterCountXY = vec2f(${clusterCountX}, ${clusterCountY});
    let tile = vec2u(clamp(fragCoord / screenDims * clusterCountXY, vec2f(0), clusterCountXY - 1));
    let slice = clusterSliceIndex(viewDepth, nearPlane, farPlane);
    return tile.x + tile.y * ${clusterCountX} + slice * ${clusterCountX} * ${clusterCountY};
}

// Debug view color for a cluster's light count on a log2 scale, along a blue -> cyan -> green -> yellow -> red ramp from
// 0 lights (blue) to a full cluster (red).
fn clusterLightCountColor(numClusterLights: u32) -> vec3f {
    let t = log2(f32(numClusterLights) + 1.f) / log2(f32(${maxLightsPerCluster}) + 1.f);
    let x = clamp(t, 0.f, 1.f) * 4.f;
    return clamp(vec3f(x - 2.f, 2.f - abs(x - 2.f), 2.f - x), vec3f(0.f), vec3f(1.f));
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}
