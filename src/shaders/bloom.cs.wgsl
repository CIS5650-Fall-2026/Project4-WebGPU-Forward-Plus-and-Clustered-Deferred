@group(0) @binding(0) var sourceImage: texture_2d<f32>;
@group(0) @binding(1) var blurImage: texture_storage_2d<rgba16float, write>;

// Separable nine-tap Gaussian. Extract brightness before the first blur.
fn gaussian(pixel: vec2i, direction: vec2i, extract: bool) -> vec3f {
    let size = vec2i(textureDimensions(sourceImage));
    var color = vec3f(0);
    var totalWeight = 0.f;
    for (var offset = -4; offset <= 4; offset++) {
        let samplePixel = clamp(pixel + direction * offset, vec2i(0), size - 1);
        var sampleColor = textureLoad(sourceImage, samplePixel, 0).rgb;
        if (extract) {
            let brightness = dot(sampleColor, vec3f(0.2126, 0.7152, 0.0722));
            sampleColor *= max(brightness - 0.7, 0) / max(brightness, 0.00001);
        }
        let weight = exp(-f32(offset * offset) / 8.f);
        color += sampleColor * weight;
        totalWeight += weight;
    }
    return color / totalWeight;
}

@compute @workgroup_size(8, 8)
fn horizontal(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(blurImage))) { return; }
    textureStore(blurImage, vec2i(id.xy), vec4f(gaussian(vec2i(id.xy), vec2i(1, 0), true), 1));
}

@compute @workgroup_size(8, 8)
fn vertical(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(blurImage))) { return; }
    textureStore(blurImage, vec2i(id.xy), vec4f(gaussian(vec2i(id.xy), vec2i(0, 1), false), 1));
}

@group(1) @binding(0) var bloomImage: texture_2d<f32>;
@group(1) @binding(1) var outputImage: texture_storage_2d<rgba8unorm, write>;
@group(1) @binding(2) var<uniform> bloomStrength: f32;

@compute @workgroup_size(8, 8)
fn composite(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(outputImage))) { return; }
    let pixel = vec2i(id.xy);
    let base = textureLoad(sourceImage, pixel, 0);
    let bloom = textureLoad(bloomImage, pixel, 0).rgb;
    textureStore(outputImage, pixel, vec4f(base.rgb + bloomStrength * bloom, 1));
}
