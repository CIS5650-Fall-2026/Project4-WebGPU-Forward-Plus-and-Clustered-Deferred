@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var gBuffer: texture_2d<u32>;
@group(1) @binding(1) var depthTex: texture_depth_2d;
@group(1) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;

@compute
@workgroup_size(${fullscreenWorkgroupSize}, ${fullscreenWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let pixel = globalIdx.xy;
    if (any(pixel >= vec2u(cameraUniforms.resolution))) {
        return;
    }

    let depth = textureLoad(depthTex, pixel, 0);
    if (depth >= 1) {
        textureStore(outputTex, pixel, vec4f(0, 0, 0, 1));
        return;
    }

    let gBufferData = textureLoad(gBuffer, pixel, 0);
    let albedo = unpack4x8unorm(gBufferData.x).rgb;
    let nor = octDecode(unpack2x16snorm(gBufferData.y));

    let fragCoord = vec2f(pixel) + 0.5;
    let ndc = vec2f(fragCoord.x / cameraUniforms.resolution.x * 2 - 1, 1 - fragCoord.y / cameraUniforms.resolution.y * 2);
    let posClip = cameraUniforms.invViewProjMat * vec4f(ndc, depth, 1);
    let pos = posClip.xyz / posClip.w;

    let viewDepth = -(cameraUniforms.viewMat * vec4(pos, 1)).z;
    let cluster = &clusterSet.clusters[clusterIdx(fragCoord, viewDepth, cameraUniforms.resolution)];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    textureStore(outputTex, pixel, vec4f(albedo * totalLightContrib, 1));
}
