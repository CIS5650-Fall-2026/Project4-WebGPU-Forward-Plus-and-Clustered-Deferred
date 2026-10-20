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
    lightsIdx: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    numClusters: u32,
    clusters: array<Cluster>
}


struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewMat: mat4x4f,
    viewProjMat: mat4x4f,
    invProjMat: mat4x4f,
    nearClip: f32,
    farClip: f32,
    resolution: vec2<f32>
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

fn getClusterIndices(fragPos: vec2f, viewDepth: f32, camera: CameraUniforms) -> vec3u {
    // Get index into clusterSet.clusters
    let tx = fragPos.x / camera.resolution.x; // [0,1]
    let ty = (camera.resolution.y - fragPos.y) / camera.resolution.y; // [0,1]
    var tz = (viewDepth - camera.nearClip) / (${cluster_far_clip} - camera.nearClip); // [0,1]
    if (${logSlicing} == 1) {
        tz = log(viewDepth / camera.nearClip) / log(${cluster_far_clip} / camera.nearClip);
    }

    // [0, nClusterCnt]
    let cx = u32(floor(tx * ${xClusterCnt}));
    let cy = u32(floor(ty * ${yClusterCnt}));
    let cz = min(u32(floor(tz * ${zClusterCnt})), ${zClusterCnt} - 1u);
    return vec3u(cx, cy, cz);
}

fn getClusterIndex(cx: u32, cy: u32, cz: u32) -> u32 {
    return cz * ${xClusterCnt} * ${yClusterCnt} + cy * ${xClusterCnt} + cx;
}