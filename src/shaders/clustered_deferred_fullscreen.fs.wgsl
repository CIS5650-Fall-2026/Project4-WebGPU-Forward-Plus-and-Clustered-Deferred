// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gBuffer}) @binding(0) var positionTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(2) var albedoTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
    let pixel = vec2i(fragPos.xy);
    let position = textureLoad(positionTex, pixel, 0);
    if (position.w == 0.f) {
        return vec4f(0);
    }
    let normal = normalize(textureLoad(normalTex, pixel, 0).xyz);
    let albedo = textureLoad(albedoTex, pixel, 0).rgb;

    // logarithmic depth
    let depth = -(camera.viewMat * vec4f(position.xyz, 1.f)).z;
    let clusterIdx = clusterIndexFromPixel(fragPos.xy, depth, camera.viewportAndClip);
    let count = clusterSet.clusters[clusterIdx].count;
    let overflow = count > ${maxLightsPerCluster}u;
    let lightCount = select(count, lightSet.numLights, overflow); // overflow falls back to all lights

    var totalLightContrib = vec3f(0);
    for (var i = 0u; i < lightCount; i++) {
        var lightIdx = i;
        if (!overflow) {
            lightIdx = clusterSet.clusters[clusterIdx].indices[i];
        }
        totalLightContrib += calculateLightContrib(lightSet.lights[lightIdx], position.xyz, normal);
    }

    return vec4f(albedo * totalLightContrib, 1.f);
}
