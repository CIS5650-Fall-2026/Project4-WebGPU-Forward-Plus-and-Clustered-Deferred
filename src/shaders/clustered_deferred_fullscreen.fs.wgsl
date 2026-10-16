// 3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> debugView: u32;

@group(${bindGroup_gbuffer}) @binding(0) var positionTex: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(2) var albedoTex: texture_2d<f32>;

const NX: u32 = ${clusterCountX}u;
const NY: u32 = ${clusterCountY}u;
const NZ: u32 = ${clusterCountZ}u;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);

    let positionSampled = textureLoad(positionTex, pixel, 0);

    if (positionSampled.w == 0.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let position = positionSampled.xyz;
    let normal = normalize(textureLoad(normalTex, pixel, 0).xyz);
    let albedo = textureLoad(albedoTex, pixel, 0).rgb;

    if (debugView == 2u) {
        return vec4f(normal * 0.5 + 0.5, 1.0);
    }
    if (debugView == 3u) {
        return vec4f(albedo, 1.0);
    }

    let screenUV = fragPos.xy / vec2f(camera.screenWidth, camera.screenHeight);

    let x = u32(clamp(floor(screenUV.x * f32(NX)), 0.0, f32(NX - 1u)));
    let y = u32(clamp(floor(screenUV.y * f32(NY)), 0.0, f32(NY - 1u)));

    let viewPos = camera.viewMat * vec4f(position, 1.0);
    let depth = clamp(-viewPos.z, camera.nearZ, camera.farZ);

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
