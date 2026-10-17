@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(1) @binding(0) var gBuffer: texture_2d<u32>;
@group(1) @binding(1) var depthTex: texture_depth_2d;
@group(1) @binding(2) var litImage: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(litImage);
    if (any(id.xy >= size)) { return; }
    let pixel = vec2i(id.xy);
    let depth = textureLoad(depthTex, pixel, 0);
    if (depth == 1) {
        textureStore(litImage, pixel, vec4f(0));
        return;
    }
    let uv = (vec2f(id.xy) + 0.5) / vec2f(size);
    let world = camera.invViewProjMat * vec4f(uv.x * 2 - 1, 1 - uv.y * 2, depth, 1);
    let position = world.xyz / world.w;
    let data = textureLoad(gBuffer, pixel, 0);
    let albedo = bitcast<vec3f>(data.xyz);
    let normal = octDecode(unpack2x16snorm(data.w));
    let cluster = &clusterSet.clusters[clusterIndex(vec2f(id.xy) + 0.5, position, camera)];
    var totalLightContrib = vec3f(0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, position, normal);
    }
    textureStore(litImage, pixel, vec4f(albedo * totalLightContrib, 1));
}
