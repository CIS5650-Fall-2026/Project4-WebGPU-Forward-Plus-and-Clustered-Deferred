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
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invViewProjMat: mat4x4f,
    projMat: mat4x4f,
    resolution: vec2f
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

fn linearDepth(depth: f32) -> f32 {
    return ${nearPlane} * ${farPlane} / (${farPlane} - depth * (${farPlane} - ${nearPlane}));
}

fn octEncode(n: vec3f) -> vec2f {
    let p = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    return select((1 - abs(p.yx)) * select(vec2f(-1), vec2f(1), p >= vec2f(0)), p, n.z >= 0);
}

fn octDecode(e: vec2f) -> vec3f {
    var n = vec3f(e, 1 - abs(e.x) - abs(e.y));
    let t = max(-n.z, 0);
    n.x += select(t, -t, n.x >= 0);
    n.y += select(t, -t, n.y >= 0);
    return normalize(n);
}

fn clusterIdx(fragCoord: vec2f, viewDepth: f32, resolution: vec2f) -> u32 {
    let tile = vec2u(fragCoord / resolution * vec2f(${numClustersX}, ${numClustersY}));
    let slice = u32(clamp(log(viewDepth / ${clusterNear}) / log(${clusterFar} / ${clusterNear}) * ${numClustersZ}, 0, ${numClustersZ} - 1));
    let c = min(vec3u(tile, slice), vec3u(${numClustersX} - 1, ${numClustersY} - 1, ${numClustersZ} - 1));
    return c.x + c.y * ${numClustersX} + c.z * ${numClustersX} * ${numClustersY};
}
