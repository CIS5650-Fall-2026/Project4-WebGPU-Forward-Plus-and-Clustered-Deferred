@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var litTex: texture_2d<f32>;
@group(0) @binding(2) var gDepth: texture_depth_2d;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;

const BANDS = 5.0;
const OUTLINE_COLOR = vec3f(0.0, 0.0, 0.0);
const EDGE_THRESHOLD = 0.1;

// depth buffer -> positive viewing distance
fn linearDepth(coord: vec2i) -> f32 {
    let d = textureLoad(gDepth, coord, 0);
    let v = cameraUniforms.invProjMat * vec4f(0.0, 0.0, d, 1.0);
    
    return -v.z / v.w;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = vec2i(textureDimensions(outputTex));
    let coord = vec2i(id.xy);
    if (coord.x >= size.x || coord.y >= size.y) {
        return;
    }

    // ramp shading
    let color = textureLoad(litTex, coord, 0).rgb;
    let lum = dot(color, vec3f(0.2126, 0.7152, 0.0722)); // use standard luminance coeffs
    let banded = floor(lum * BANDS) / BANDS;
    var result = color * (banded / max(lum, 1e-4));

    // basic depth edge detection
    let center = linearDepth(coord);
    let maxCoord = size - 1;
    
    let dl = linearDepth(
        clamp(
            coord + vec2i(-1, 0), 
            vec2i(0),
            maxCoord
        )
    );

    let dr = linearDepth(
        clamp(
            coord + vec2i(1, 0), 
            vec2i(0),
            maxCoord
        )
    );

    let du = linearDepth(
        clamp(
            coord + vec2i(0, -1), 
            vec2i(0),
            maxCoord
        )
    );

    let dd = linearDepth(
        clamp(
            coord + vec2i(0, 1), 
            vec2i(0),
            maxCoord
        )
    );

    let maxDiff = max(
        max(
            abs(dl - center),
            abs(dr - center)
        ), 
        max(
            abs(du - center),
            abs(dd - center)
        )
    );

    if (maxDiff / center > EDGE_THRESHOLD) {
        result = OUTLINE_COLOR;
    }

    textureStore(outputTex, coord, vec4f(result, 1.0));
}