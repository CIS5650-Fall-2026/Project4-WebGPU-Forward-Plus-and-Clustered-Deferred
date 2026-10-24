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
// all shaders (naive as well) get these structs
struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

// 208 bytes = 52 * 4 bytes. no padding needed
struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    invProjMat: mat4x4f,
    resolution: vec2f,
    nearPlane: f32,
    farPlane: f32
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

fn clusterIndex(fragPos: vec4f, posWorld: vec3f, camera: CameraUniforms) -> u32 {
    let clusterCounts = vec3f(f32(${clusterCountX}), f32(${clusterCountY}), f32(${clusterCountZ}));

    let screenUv = fragPos.xy / camera.resolution;
    let x = floor(screenUv.x * clusterCounts.x);
    let y = floor((1.f - screenUv.y) * clusterCounts.y);  // flip y

    // calculate the depth index based on the fragment's view space z-coord
    let near = camera.nearPlane;
    let far = camera.farPlane;
    let viewZ = (camera.viewMat * vec4f(posWorld, 1.f)).z;
    let z = floor(log(-viewZ / near) / log(far / near) * clusterCounts.z);  // inverse of the pow() used in the clustering compute shader

    // clamp to valid cluster indices
    let clusterIdx = vec3u(clamp(vec3f(x, y, z), vec3f(0.f), clusterCounts - 1.f));
    return clusterIdx.x + clusterIdx.y * ${clusterCountX}u + clusterIdx.z * ${clusterCountX}u * ${clusterCountY}u;
}

// ------------------------------------
fn debugLightCountColor(numLights: u32) -> vec3f {
    if (numLights >= ${maxLightsPerCluster}u) {
        return vec3f(1.f);
    }
    let t = log2(1.f + f32(numLights)) / log2(1.f + f32(${maxLightsPerCluster}));
    return clamp(vec3f(1.5f) - abs(4.f * t - vec3f(3.f, 2.f, 1.f)), vec3f(0.f), vec3f(1.f));
}

fn debugPositionColor(posWorld: vec3f) -> vec3f {
    return fract(posWorld * 0.2f);
}
