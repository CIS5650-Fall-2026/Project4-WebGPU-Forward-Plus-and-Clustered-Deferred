// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    screenRadius: f32,
    depthFromCam: f32,
    screenPos: vec2f,
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// MAX NUMBER OF LIGHTS IS 1001
struct Cluster {
    numLights: u32,
    minDepth: f32,
    maxDepth: f32,
    minCornerXY: vec2f,
    maxCornerXY: vec2f,
    lightIndices: array<u32, 1001>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct ClusterSet {
    numClusters: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    pos: vec3f,
    viewProjMat: mat4x4f,
    invViewProjMat: mat4x4f,
    viewMat: mat4x4f
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

// used for debugging by showing single stationary light
fn calculateLightContribSingleLight(posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = vec3f(0.2,1,0.5) - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return vec3f(0,1,0) * lambert * rangeAttenuation(distToLight);
}
