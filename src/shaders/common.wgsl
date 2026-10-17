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
    minBounds: vec3f,
    maxBounds: vec3f,
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct CameraUniforms {
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    screenSize: vec2f,
    nearPlane: f32,
    farPlane: f32,
    invViewProjMat: mat4x4f
}

fn octEncode(normal: vec3f) -> vec2f {
    let n = normal / (abs(normal.x) + abs(normal.y) + abs(normal.z));
    if (n.z < 0) {
        return (1 - abs(n.yx)) * select(vec2f(-1), vec2f(1), n.xy >= vec2f(0));
    }
    return n.xy;
}

fn octDecode(encoded: vec2f) -> vec3f {
    var n = vec3f(encoded, 1 - abs(encoded.x) - abs(encoded.y));
    let fold = max(-n.z, 0);
    n.x += select(fold, -fold, n.x >= 0);
    n.y += select(fold, -fold, n.y >= 0);
    return normalize(n);
}

fn clusterIndex(pixel: vec2f, posWorld: vec3f, camera: CameraUniforms) -> u32 {
    let xy = min(vec2u(pixel / camera.screenSize * vec2f(${clusterCountX}, ${clusterCountY})),
                 vec2u(${clusterCountX}u - 1u, ${clusterCountY}u - 1u));
    let depth = max(-(camera.viewMat * vec4f(posWorld, 1)).z, camera.nearPlane);
    let z = u32(clamp(floor(log(depth / camera.nearPlane) / log(camera.farPlane / camera.nearPlane)
                           * f32(${clusterCountZ})), 0, f32(${clusterCountZ} - 1)));
    return xy.x + xy.y * ${clusterCountX}u + z * ${clusterCountX}u * ${clusterCountY}u;
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
