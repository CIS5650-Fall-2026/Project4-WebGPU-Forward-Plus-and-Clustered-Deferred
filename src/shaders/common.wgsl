// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// DONE-2: you may want to create a ClusterSet struct similar to LightSet
struct Cluster {
    numLights: u32,
    lights: array<u32, 512>
}
struct ClusterData {
    dim: vec3u,
    maxNumLightPerCluster: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // DONE-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    invProjMat: mat4x4f,
    viewMat: mat4x4f,
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

fn getClusterIndex(posWorld: vec3f, dim: vec3u, camera: CameraUniforms) -> u32 {

    // X and Y index
    let posClip = camera.viewProjMat * vec4f(posWorld, 1.0);
    let ndc = posClip.xyz / posClip.w;

    let u = ndc.x * 0.5 + 0.5;
    let v = 0.5 - ndc.y * 0.5;
    let xIdx = u32(clamp(u * f32(dim.x), 0.0, f32(dim.x - 1u)));
    let yIdx = u32(clamp(v * f32(dim.y), 0.0, f32(dim.y - 1u)));

    // Z index
    let depth = -(camera.viewMat * vec4f(posWorld, 1.0)).z;
    let sliceF = log(depth / camera.near) / log(camera.far / camera.near) * f32(dim.z);
    let zIdx = u32(clamp(sliceF, 0.0, f32(dim.z - 1u)));

    return xIdx + yIdx * dim.x + zIdx * dim.x * dim.y;

}

fn screenToWorld(posScreen: vec3f, invViewProjMat: mat4x4f) -> vec3f {
    let posClip = vec4f(posScreen * 2.0 - 1.0, 1.0);
    let posWorld = invViewProjMat * posClip;
    return posWorld.xyz / posWorld.w;
}