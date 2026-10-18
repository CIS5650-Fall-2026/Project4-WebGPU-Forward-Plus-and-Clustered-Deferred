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
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct CameraUniforms {
    viewProjMat: mat4x4f, // 0
    viewMat: mat4x4f,     // 64
    invProjMat: mat4x4f,  // 128
    resolution: vec2f,    // 192
    nearPlane: f32,       // 200
    farPlane: f32         // 204
}

fn clusterIndex(x: u32, y: u32, z: u32) -> u32 {
    return x + y * ${clusterSizeX} + z * ${clusterSizeX} * ${clusterSizeY};
}

fn clusterSliceDepth(slice: f32, nearPlane: f32, farPlane: f32) -> f32 {
    return nearPlane * pow(farPlane / nearPlane, slice / f32(${clusterSizeZ}));
}

fn clusterSliceFromDepth(depth: f32, nearPlane: f32, farPlane: f32) -> u32 {
    let slice = log(depth / nearPlane) / log(farPlane / nearPlane) * f32(${clusterSizeZ});
    return u32(clamp(slice, 0, f32(${clusterSizeZ} - 1)));
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
