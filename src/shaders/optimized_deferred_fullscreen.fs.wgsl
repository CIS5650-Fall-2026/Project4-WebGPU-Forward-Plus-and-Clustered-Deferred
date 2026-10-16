// 3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> debugView: u32;

@group(${bindGroup_gbuffer}) @binding(0) var normalAlbedoTex: texture_2d<u32>;
@group(${bindGroup_gbuffer}) @binding(1) var depthTex: texture_depth_2d;

const NX: u32 = ${clusterCountX}u;
const NY: u32 = ${clusterCountY}u;
const NZ: u32 = ${clusterCountZ}u;

fn octDecode(encoded: vec2f) -> vec3f
{
    var n = vec3f(encoded, 1.0 - abs(encoded.x) - abs(encoded.y));

    if (n.z < 0.0) {
        let unfolded = (vec2f(1.0) - abs(n.yx)) * signNotZero(n.xy);
        n = vec3f(unfolded, n.z);
    }

    return normalize(n);
}

fn reconstructViewPosition(uv: vec2f, depth: f32) -> vec3f
{
    let ndc = vec4f(
        uv.x * 2.0 - 1.0,
        1.0 - uv.y * 2.0,
        depth,
        1.0
    );

    let view = camera.invProjMat * ndc;
    return view.xyz / view.w;
}

fn viewToWorldPosition(positionView: vec3f) -> vec3f {
    let viewRotation = mat3x3f(
        camera.viewMat[0].xyz,
        camera.viewMat[1].xyz,
        camera.viewMat[2].xyz
    );

    return transpose(viewRotation)
        * (positionView - camera.viewMat[3].xyz);
}

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);

    let screenUV = fragPos.xy / vec2f(camera.screenWidth, camera.screenHeight);

    let depthSample = textureLoad(depthTex, pixel, 0);

    if (depthSample >= 1.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let positionView = reconstructViewPosition(screenUV, depthSample);
    let position = viewToWorldPosition(positionView);

    let normalAlbedo = textureLoad(normalAlbedoTex, pixel, 0).xy;
    let normal = octDecode(unpack2x16snorm(normalAlbedo.x));
    let albedo = unpack4x8unorm(normalAlbedo.y).rgb;

    if (debugView == 2u) {
        return vec4f(normal * 0.5 + 0.5, 1.0);
    }
    if (debugView == 3u) {
        return vec4f(albedo, 1.0);
    }

    let x = u32(clamp(floor(screenUV.x * f32(NX)), 0.0, f32(NX - 1u)));
    let y = u32(clamp(floor(screenUV.y * f32(NY)), 0.0, f32(NY - 1u)));

    let depth = clamp(-positionView.z, camera.nearZ, camera.farZ);

    let slice = log(depth / camera.nearZ) / log(camera.farZ / camera.nearZ) * f32(NZ);
    let z = u32(clamp(floor(slice), 0.0, f32(NZ - 1u)));

    let clusterIndex = x + y * NX + z * NX * NY;

    let lightCount = clusterSet.clusters[clusterIndex].count;
    var totalLightContrib = vec3f(0, 0, 0);

    for (var i = 0u; i < lightCount; i++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];
        let light = lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(light, position, normal);
    }

    var finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1);
}
