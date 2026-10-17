@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var outputTexture: texture_storage_2d<${canvasStorageFormat}, write>;

const WORKGROUP_SIZE = ${deferredWorkgroupSize}u;
const BLOOM_STRENGTH = 1.5f;

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let sceneSize = textureDimensions(sceneTexture);
    if (globalId.x >= sceneSize.x || globalId.y >= sceneSize.y) {
        return;
    }

    let bloomSize = textureDimensions(bloomTexture);
    let bloomPixel = vec2i(globalId.xy / 2u);
    var blurredBloom = vec3f(0.f);
    var weightTotal = 0.f;
    for (var offsetY = -1; offsetY <= 1; offsetY++) {
        for (var offsetX = -1; offsetX <= 1; offsetX++) {
            let weight = select(1.f, 2.f, offsetX == 0) * select(1.f, 2.f, offsetY == 0);
            let samplePixel = clamp(
                bloomPixel + vec2i(offsetX, offsetY),
                vec2i(0),
                vec2i(bloomSize) - vec2i(1)
            );
            blurredBloom += textureLoad(bloomTexture, samplePixel, 0).rgb * weight;
            weightTotal += weight;
        }
    }

    let sceneColor = textureLoad(sceneTexture, vec2i(globalId.xy), 0).rgb;
    let finalColor = sceneColor + (blurredBloom / weightTotal) * BLOOM_STRENGTH;
    textureStore(outputTexture, vec2i(globalId.xy), vec4f(finalColor, 1.f));
}
