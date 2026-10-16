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
    viewProj: mat4x4f,
    view: mat4x4f,
    invProj: mat4x4f,
    screenSize: vec2f,
    near: f32,
    far: f32
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


fn getClusterFromPt(uv: vec2f, pos: vec3f, view: mat4x4f, 
        near: f32, far: f32) -> u32 {
    let grid = vec3f(${clusterX}, ${clusterY}, ${clusterZ});
    let cx = u32(uv.x * grid.x);
    let cy = u32((1.0 - uv.y) * grid.y);

    let viewZ = -(view * vec4f(pos, 1.0)).z;
    let cz = u32((viewZ - near) / (far - near) * grid.z);

    let clusterIdx = min(cx, ${clusterX} - 1)
               + min(cy, ${clusterY} - 1) * ${clusterX}
               + min(cz, ${clusterZ} - 1) * ${clusterX} * ${clusterY};
    return clusterIdx;
}
