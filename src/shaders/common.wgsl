// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

struct Cluster {
    numLights: u32,
    overflow: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>,
}

struct ClusterSet {
    clusters: array<Cluster>,
}

struct CameraUniforms {
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    screenSize: vec2f,
    nearPlane: f32,
    farPlane: f32,
    invViewProjMat: mat4x4f,
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

fn encodeOctNormal(normal: vec3f) -> vec2f {
    let n = normal / (abs(normal.x) + abs(normal.y) + abs(normal.z));
    if (n.z < 0.0) {
        let signs = select(vec2f(-1.0), vec2f(1.0), n.xy >= vec2f(0.0));
        return (vec2f(1.0) - abs(n.yx)) * signs;
    }
    return n.xy;
}

fn decodeOctNormal(encoded: vec2f) -> vec3f {
    var n = vec3f(encoded, 1.0 - abs(encoded.x) - abs(encoded.y));
    if (n.z < 0.0) {
        let signs = select(vec2f(-1.0), vec2f(1.0), n.xy >= vec2f(0.0));
        n = vec3f((vec2f(1.0) - abs(n.yx)) * signs, n.z);
    }
    return normalize(n);
}
