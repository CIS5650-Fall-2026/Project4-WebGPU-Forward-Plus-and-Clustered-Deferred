// lighting pass of the clustered deferred renderer, one thread per pixel

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var gBuffer: texture_2d<u32>;
@group(${bindGroup_scene}) @binding(4) var depthTex: texture_depth_2d;
@group(${bindGroup_scene}) @binding(5) var outTex: texture_storage_2d<rgba8unorm, write>;

@compute
@workgroup_size(${shadingTileSize}, ${shadingTileSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let size = textureDimensions(outTex);
    if (any(globalIdx.xy >= size)) {
        return;
    }
    let pixel = vec2i(globalIdx.xy);

    let depth = textureLoad(depthTex, pixel, 0);
    if (depth == 1.f) {
        textureStore(outTex, pixel, vec4f(0, 0, 0, 0)); // background
        return;
    }

    let data = textureLoad(gBuffer, pixel, 0).xy;
    let albedo = unpack4x8unorm(data.x).rgb;
    let nor = octDecode(unpack2x16snorm(data.y));

    // rebuild the world position from the depth
    let fragCoord = vec2f(globalIdx.xy) + 0.5f;
    let ndc = vec2f(fragCoord.x / f32(size.x) * 2.f - 1.f, 1.f - fragCoord.y / f32(size.y) * 2.f);
    let world = camera.invViewProjMat * vec4f(ndc, depth, 1.f);
    let pos = world.xyz / world.w;

    let viewDepth = -(camera.viewMat * vec4f(pos, 1.f)).z;
    let cluster = &clusterSet.clusters[clusterIndex(fragCoord, viewDepth, camera.screenSize)];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    textureStore(outTex, pixel, vec4f(albedo * totalLightContrib, 1));
}
