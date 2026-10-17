@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var brightTexture: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(brightTexture);
    if (id.x >= size.x || id.y >= size.y) { return; }

    let sceneSize = vec2i(textureDimensions(sceneTexture));
    var bright = vec3f(0.0);
    for (var y = 0; y < 2; y += 1) {
        for (var x = 0; x < 2; x += 1) {
            let pixel = min(vec2i(id.xy) * 2 + vec2i(x, y), sceneSize - vec2i(1));
            let color = textureLoad(sceneTexture, pixel, 0).rgb;
            let brightness = max(max(color.r, color.g), color.b);
            bright += color * max(brightness - 0.6, 0.0) / max(brightness, 0.00001);
        }
    }
    textureStore(brightTexture, vec2i(id.xy), vec4f(bright * 0.25, 1.0));
}
