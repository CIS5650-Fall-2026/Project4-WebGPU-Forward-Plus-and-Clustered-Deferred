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

struct CameraUniforms { // total = 52 floats
    viewProjMat: mat4x4f, // offset = 0 floats
    viewMat: mat4x4f, // offset = 16 floats
    invProjMat: mat4x4f, // offset = 32 floats
    screenSize: vec2f, // offset = 48 floats
    near: f32, // offset = 50 floats
    far: f32, // offset = 51 floats
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

fn getClusterIndex(fragPosXY: vec2f, viewZ: f32, cameraUniforms: CameraUniforms) -> u32 {
    let uv = fragPosXY / cameraUniforms.screenSize;

    // Debug for clusters
    let xSlice = floor(uv.x * ${clusterCountX});
    let ySlice = floor(uv.y * ${clusterCountY});

    // z slicing from https://www.aortiz.me/2018/12/21/CG.html#part-2
    let logFarNear = log(cameraUniforms.far / cameraUniforms.near);
    let zSlice = floor(log(viewZ) * ${clusterCountZ} / logFarNear - ${clusterCountZ} * log(cameraUniforms.near) / logFarNear);
    let cx = u32(clamp(xSlice, 0.0, f32(${clusterCountX} - 1)));
    let cy = u32(clamp(ySlice, 0.0, f32(${clusterCountY} - 1)));
    let cz = u32(clamp(zSlice, 0.0, f32(${clusterCountZ} - 1)));

    return cx + cy * ${clusterCountX} + cz * ${clusterCountX} * ${clusterCountY};
}