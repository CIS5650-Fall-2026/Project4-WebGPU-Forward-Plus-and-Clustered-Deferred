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

// Light indices assigned to each 3D cluster 
struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}


struct ClusterSet {
    clusters: array<Cluster>
}




struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)


    // Camera view-projection matrix used to transform vertices into clip space
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    inverseProjMat: mat4x4f,
    inverseViewMat: mat4x4f
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



// Extra Credit: octahedral normal encoding for a single-color G-buffer

fn octEncodeNormal(normal: vec3f) -> vec2f {
    let n = normalize(normal);
    let projected = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));



    var encoded = projected;

    if (n.z < 0.0) {
        encoded = (vec2f(1.0) - abs(projected.yx)) * select(vec2f(-1.0), vec2f(1.0), projected >= vec2f(0.0));
    }

    return encoded * 0.5 + vec2f(0.5);
}



fn octDecodeNormal(encoded: vec2f) -> vec3f {
    let f = encoded * 2.0 - vec2f(1.0);


    var normal = vec3f(
        f.x,
        f.y,
        1.0 - abs(f.x) - abs(f.y)
    );

    if (normal.z < 0.0) {
        let folded = (vec2f(1.0) - abs(normal.yx)) * select(vec2f(-1.0), vec2f(1.0), normal.xy >= vec2f(0.0));
        normal = vec3f(folded, normal.z);
    }


    return normalize(normal);
}




// Extra Credit: 11-bit octahedral normal packed into float16 alpha
// 6 bits for X and 5 bits for Y; packed integers are exactly representable
fn packNormal(normal: vec3f) -> f32 {
    let encoded = octEncodeNormal(normal);

    let x = u32(round(clamp(encoded.x, 0.0, 1.0) * 63.0));
    let y = u32(round(clamp(encoded.y, 0.0, 1.0) * 31.0));

    return f32(x | (y << 6u));
}


fn unpackNormal(packed: f32) -> vec3f {
    let bits = u32(round(packed));

    let x = f32(bits & 63u) / 63.0;
    let y = f32((bits >> 6u) & 31u) / 31.0;

    return octDecodeNormal(vec2f(x, y));
}