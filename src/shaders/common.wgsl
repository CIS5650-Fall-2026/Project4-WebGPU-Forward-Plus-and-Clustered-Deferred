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
    header: vec4u,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct ActiveClusters {
    count: atomic<u32>,
    indices: array<u32>
}

const INVALID_CLUSTER = 0xffffffffu;

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    screenSize: vec2f,
    nearPlane: f32,
    farPlane: f32,
}

// Implicit logarithmic slices cover the entire camera frustum. No per-cluster
// depth bounds are stored or reduced from the depth buffer.
fn clusterDepthBoundary(slice: u32, camera: CameraUniforms) -> f32 {
    return camera.nearPlane * pow(camera.farPlane / camera.nearPlane,
        f32(slice) / f32(${clusterCountZ}));
}

fn clusterIndexFromDepth(pixel: vec2u, depth: f32, camera: CameraUniforms) -> u32 {
    let uv = (vec2f(pixel) + vec2f(0.5f)) / camera.screenSize;
    let viewH = camera.invProjMat * vec4f(uv.x * 2.f - 1.f, 1.f - uv.y * 2.f, depth, 1.f);
    let viewDepth = clamp(-viewH.z / viewH.w, camera.nearPlane, camera.farPlane);
    let z = min(u32(log(viewDepth / camera.nearPlane) /
        log(camera.farPlane / camera.nearPlane) * f32(${clusterCountZ})), ${clusterCountZ}u - 1u);
    let xy = min(vec2u(uv * vec2f(${clusterCountX}, ${clusterCountY})),
        vec2u(${clusterCountX}u - 1u, ${clusterCountY}u - 1u));
    return z * ${clusterCountX}u * ${clusterCountY}u + xy.y * ${clusterCountX}u + xy.x;
}

fn clusterCoordFromIndex(index: u32) -> vec3u {
    return vec3u(index % ${clusterCountX}u,
        (index / ${clusterCountX}u) % ${clusterCountY}u,
        index / (${clusterCountX}u * ${clusterCountY}u));
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
