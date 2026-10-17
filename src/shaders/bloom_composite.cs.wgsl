@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var bloomSampler: sampler;
@group(0) @binding(3) var outputTexture: texture_storage_2d<OUTPUT_FORMAT, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(outputTexture);
    if (id.x >= size.x || id.y >= size.y) { return; }

    let uv = (vec2f(id.xy) + vec2f(0.5)) / vec2f(size);
    let scene = textureLoad(sceneTexture, vec2i(id.xy), 0).rgb;
    let glow = textureSampleLevel(bloomTexture, bloomSampler, uv, 0.0).rgb;
    textureStore(outputTexture, vec2i(id.xy), vec4f(scene + 0.6 * glow, 1.0));
}
