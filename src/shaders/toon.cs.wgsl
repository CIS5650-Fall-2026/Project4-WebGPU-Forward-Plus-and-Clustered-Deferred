@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var inputTex: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;

@compute
@workgroup_size(${fullscreenWorkgroupSize}, ${fullscreenWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let pixel = vec2i(globalIdx.xy);
    let maxPixel = vec2i(cameraUniforms.resolution) - 1;
    if (any(pixel > maxPixel)) {
        return;
    }

    let color = textureLoad(inputTex, pixel, 0).rgb;
    let ramped = round(color * ${toonLevels}) / ${toonLevels};

    let depth = linearDepth(textureLoad(depthTex, pixel, 0));
    var offsets = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
    var maxDepthDiff = 0.0;
    for (var i = 0; i < 4; i++) {
        let neighbor = clamp(pixel + offsets[i], vec2i(0), maxPixel);
        maxDepthDiff = max(maxDepthDiff, abs(linearDepth(textureLoad(depthTex, neighbor, 0)) - depth));
    }
    let isEdge = maxDepthDiff > ${toonEdgeThreshold} * depth;

    textureStore(outputTex, pixel, vec4f(select(ramped, vec3f(0), isEdge), 1));
}
