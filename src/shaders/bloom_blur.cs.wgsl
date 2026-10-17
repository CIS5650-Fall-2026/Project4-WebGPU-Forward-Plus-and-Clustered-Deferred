@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

override axis: u32 = 0u;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(outputTexture);
    if (id.x >= size.x || id.y >= size.y) { return; }

    var color = vec3f(0.0);
    var totalWeight = 0.0;
    // Radius 8, sigma 4. Run once horizontally and once vertically.
    for (var i = -8; i <= 8; i += 1) {
        let offset = select(vec2i(0, i), vec2i(i, 0), axis == 0u);
        let pixel = clamp(vec2i(id.xy) + offset, vec2i(0), vec2i(size) - vec2i(1));
        let weight = exp(-f32(i * i) / 32.0);
        color += textureLoad(inputTexture, pixel, 0).rgb * weight;
        totalWeight += weight;
    }
    textureStore(outputTexture, vec2i(id.xy), vec4f(color / totalWeight, 1.0));
}
