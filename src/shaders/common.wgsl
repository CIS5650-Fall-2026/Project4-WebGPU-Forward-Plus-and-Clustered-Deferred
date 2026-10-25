// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// 1028 bytes with 256 maxLightsPerCluster
struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct ClusterSet {
    clusters: array<Cluster>
}

// size: 272 (would be 264 if not for padding)
struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,       // byte 0
    viewMat: mat4x4f,           // byte 64
    invProjMat: mat4x4f,        // byte 128
    invViewProjMat: mat4x4f,    // byte 192
    nearPlane: f32,             // byte 256
    farPlane: f32               // byte 260
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

fn clusterIndexFromWorldPos(posWorld: vec3f, viewProjMat: mat4x4f, viewMat: mat4x4f, nearPlane: f32, farPlane: f32) -> u32 {
    let clipPos = viewProjMat * vec4f(posWorld, 1.0);
    let ndc = clipPos.xy / clipPos.w;
    let x = u32(clamp((ndc.x * 0.5 + 0.5) * f32(${clusterCountX}), 0.0, f32(${clusterCountX} - 1)));
    let y = u32(clamp((ndc.y * 0.5 + 0.5) * f32(${clusterCountY}), 0.0, f32(${clusterCountY} - 1)));

    let viewDepth = -(viewMat * vec4f(posWorld, 1.0)).z;
    let zSlice = log(viewDepth / nearPlane) / log(farPlane / nearPlane) * f32(${clusterCountZ});
    let z = u32(clamp(zSlice, 0.0, f32(${clusterCountZ} - 1)));

    return x + y * ${clusterCountX}u + z * ${clusterCountX}u * ${clusterCountY}u;
}