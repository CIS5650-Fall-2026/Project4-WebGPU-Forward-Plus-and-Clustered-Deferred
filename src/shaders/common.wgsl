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
struct ClusterInfo {
    offset: u32,
    count: u32,
}

struct ClusterGrid {
    clusters: array<ClusterInfo>,
}

struct LightIndexList {
    indices: array<u32>,
}

const CLUSTER_OVERFLOW: u32 = 0xffffffffu;

struct LightIndexCounter {
    nextIndex: atomic<u32>,
    overflowRequired: atomic<u32>,
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    screenAndClip: vec4f,
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

fn getClusterIndex(pixelPosition: vec2f, viewDepth: f32, screenAndClip: vec4f) -> u32 {
    let gridSize = vec2f(f32(${clusterCountX}), f32(${clusterCountY}));

    let tile = clamp(
        floor(pixelPosition / screenAndClip.xy * gridSize),
        vec2f(0.0),
        gridSize - vec2f(1.0)
    );

    let nearPlane = screenAndClip.z;
    let farPlane = screenAndClip.w;
    let depth = clamp(viewDepth, nearPlane, farPlane);

    let slice = clamp(
        floor(
            log(depth / nearPlane) /
            log(farPlane / nearPlane) *
            f32(${clusterCountZ})
        ),
        0.0,
        f32(${clusterCountZ} - 1)
    );

    let clusterCoord = vec3u(u32(tile.x), u32(tile.y), u32(slice));

    return clusterCoord.x + ${clusterCountX}u * (clusterCoord.y + ${clusterCountY}u * clusterCoord.z);
}