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
    lightsIndicesInCluster: array<u32, ${lightsPerCluster}>
}

struct ClusterSet {
    numClusters: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,
    inverseProjMat: mat4x4f,
    viewMat: mat4x4f,
    screenDimension: vec2f,
    front: f32,
    back: f32
}

fn clusterPixel(pixel: vec2f, viewDepth: f32, camera: CameraUniforms) -> u32 {
    let uv = pixel / camera.screenDimension;
    let x_calc = max(floor(uv.x * f32(${clusterX})), 0.f);
    let x = min(u32(x_calc), ${clusterX}u - 1);
    let y_calc = max(floor((1.f - uv.y) * f32(${clusterY})), 0.f);
    let y = min(u32(y_calc), ${clusterY}u - 1);
    
    //calculate the z coordinate of the pixel
    let depth = max(viewDepth, camera.front);
    let segment = floor(log(depth / camera.front) / log(camera.back / camera.front) * f32(${clusterZ}));
    let z = min(u32(max(segment, 0.f)), ${clusterZ} - 1);

//determine the cluster index for the pixel
    return x + z * ${clusterX} * ${clusterY} + y * ${clusterX};
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
