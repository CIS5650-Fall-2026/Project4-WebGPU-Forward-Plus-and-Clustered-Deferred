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
    bbxMin: vec3f,
    lightStart: u32,
    bbxMax: vec3f,
    lightCount: u32
}

struct ClusterSet {
    clusterDim: vec3u,
    clusters: array<Cluster>
}

struct ClusterLightIDs {
    count: atomic<u32>,
    indices: array<u32>
}

struct CameraUniforms {
    viewProj: mat4x4f,
    view: mat4x4f,
    inverseProj: mat4x4f,
    inverseViewProj: mat4x4f,
    resolution: vec2f,
    clipPlanes: vec2f,
    position: vec3f,
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

fn getClusterId3(clusterIdx: u32, clusterDim: vec3u) -> vec3u {
    return vec3u(
        clusterIdx % clusterDim.x, 
        (clusterIdx / clusterDim.x) % clusterDim.y,
        (clusterIdx / (clusterDim.x * clusterDim.y)) % clusterDim.z
    );
}

fn getClusterId1(clusterId3: vec3u, clusterDim: vec3u) -> u32 {
    return clusterId3.x + clusterId3.y * clusterDim.x + clusterId3.z * clusterDim.x * clusterDim.y;
}

fn getClusterDepthID(z: f32, zClusterCount: u32) -> f32 {
    return floor(f32(zClusterCount)*saturate((z-${clusterLowerZBound})/(${clusterUpperZBound}-${clusterLowerZBound})));
}

fn getClusterDepth(normZ: f32) -> f32 {
    return mix(${clusterLowerZBound}, ${clusterUpperZBound}, normZ);//normZ*10.0+0.1;
}