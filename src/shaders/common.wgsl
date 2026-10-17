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
    screenSize: vec2f,
    tanHalfFov: vec2f, // x already has the aspect ratio in it
    invViewProjMat: mat4x4f
}

// depth of the near side of slice k
// slice 0 goes from the camera to clusterNear, the other slices are spaced in log scale
fn sliceDepth(k: u32) -> f32 {
    if (k == 0u) {
        return 0.f;
    }
    return ${clusterNear} * pow(${clusterFar} / ${clusterNear}, f32(k - 1u) / (${clusterZ} - 1));
}

// turns a depth buffer value back into the distance along the view direction
fn viewDepthFromDepth(depth: f32) -> f32 {
    return ${cameraNear} * ${cameraFar} / (${cameraFar} - depth * (${cameraFar} - ${cameraNear}));
}

// fragCoord is in pixels (y goes down), viewDepth is positive
fn clusterIndex(fragCoord: vec2f, viewDepth: f32, screenSize: vec2f) -> u32 {
    let uv = vec2f(fragCoord.x, screenSize.y - fragCoord.y) / screenSize;
    let x = min(u32(uv.x * ${clusterX}), ${clusterX} - 1);
    let y = min(u32(uv.y * ${clusterY}), ${clusterY} - 1);
    let zf = log(viewDepth / ${clusterNear}) / log(${clusterFar} / ${clusterNear}) * (${clusterZ} - 1) + 1;
    let z = u32(clamp(zf, 0.f, ${clusterZ} - 1.f));
    return x + y * ${clusterX} + z * ${clusterX} * ${clusterY};
}

// octahedron normal encoding, a unit vector becomes a point in [-1, 1]^2
fn octEncode(n: vec3f) -> vec2f {
    let p = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
    if (n.z >= 0.f) {
        return p;
    }
    // fold the lower half over the diagonals
    return (1.f - abs(p.yx)) * select(vec2f(-1.f), vec2f(1.f), p >= vec2f(0.f));
}

fn octDecode(e: vec2f) -> vec3f {
    var n = vec3f(e, 1.f - abs(e.x) - abs(e.y));
    let t = max(-n.z, 0.f);
    n.x += select(t, -t, n.x >= 0.f);
    n.y += select(t, -t, n.y >= 0.f);
    return normalize(n);
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
