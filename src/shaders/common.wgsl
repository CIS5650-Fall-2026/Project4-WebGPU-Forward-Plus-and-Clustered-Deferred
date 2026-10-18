// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// 2: a ClusterSet struct similar to LightSet

struct CameraUniforms {
    // 1.3: entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f, // 64
    viewMat: mat4x4f, // offset 64; 64
    invProjMat: mat4x4f, // offset 128; 64
    screenSize: vec2f, // offset 192; 8
    near: f32, // offset 200
    far: f32, // offset 204
    invViewProjMat: mat4x4f // offset 208 (to transform pixel depth back to world space)
} // 272

struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsInCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
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

fn getClusterIdx(fragCoord: vec2f, posWorld: vec3f, camera: CameraUniforms) -> u32 {
    // fun cluster stuff
    let X = ${clusterCountX}u;
    let Y = ${clusterCountY}u;
    let Z = ${clusterCountZ}u;

    // find the screen tile (xy plane)
    let XY = vec2u(
        fragCoord / camera.screenSize * vec2f(f32(X), f32(Y))
    );
    let tX = min(XY.x, X - 1u);
    let tY = min(XY.y, Y - 1u);

    // find depth slice (z)
    let near = camera.near;
    let far = camera.far;
    let vZ = -(camera.viewMat * vec4f(posWorld, 1.0)).z;

    let slice = u32(max(log(vZ / near) / log(far / near) * f32(Z), 0.0));
    let tZ = min(slice, Z - 1u);

    return tX + tY * X + tZ * X * Y;
}

// for additional g-buffer optimization
// using octahedral normal encoding, the sphere can be mapped onto an octahedron
// this is then unwrapped into a square and we store the 2d position in the square
fn signNotZero(v : vec2f) -> vec2f {
    return select(vec2f(-1.0), vec2f(1.0), v >= vec2f(0.0));
}

fn octEncode(n: vec3f) -> vec2f {
    let p = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));

    if (n.z < 0.0) {
        return (1.0 - abs(p.yx)) * signNotZero(p);
    }

    return p;
}

// expected range from -1 to 1
fn octDecode(e: vec2f) -> vec3f {
    var n = vec3f(e, 1.0 - abs(e.x) - abs(e.y));

    if (n.z < 0.0) {
        n = vec3f(
            (1.0 - abs(n.yx)) * signNotZero(n.xy), 
            n.z
        );
    }

    return normalize(n);
}

fn transformWorldPos(p: vec2f, depth: f32, camera: CameraUniforms) -> vec3f {
    // pixel -> ndc
    let uv = (p + 0.5) / camera.screenSize;
    let ndc = vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
    let world = camera.invViewProjMat * ndc;
    return world.xyz / world.w;
}