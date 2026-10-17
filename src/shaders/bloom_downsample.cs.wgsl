@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_storage_2d<rgba16float, write>;

const WORKGROUP_SIZE = ${deferredWorkgroupSize}u;
const BRIGHT_THRESHOLD = 0.65f;

fn brightPass(color: vec3f) -> vec3f {
    let luminance = dot(color, vec3f(0.2126f, 0.7152f, 0.0722f));
    return color * max(luminance - BRIGHT_THRESHOLD, 0.f) / max(luminance, 0.0001f);
}

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let bloomSize = textureDimensions(bloomTexture);
    if (globalId.x >= bloomSize.x || globalId.y >= bloomSize.y) {
        return;
    }

    let sceneSize = textureDimensions(sceneTexture);
    let sourceOrigin = vec2i(globalId.xy * 2u);
    var brightColor = vec3f(0.f);
    var sampleCount = 0.f;

    for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) {
            let sourcePixel = sourceOrigin + vec2i(x, y);
            if (sourcePixel.x < i32(sceneSize.x) && sourcePixel.y < i32(sceneSize.y)) {
                brightColor += brightPass(textureLoad(sceneTexture, sourcePixel, 0).rgb);
                sampleCount += 1.f;
            }
        }
    }

    textureStore(bloomTexture, vec2i(globalId.xy), vec4f(brightColor / sampleCount, 1.f));
}
