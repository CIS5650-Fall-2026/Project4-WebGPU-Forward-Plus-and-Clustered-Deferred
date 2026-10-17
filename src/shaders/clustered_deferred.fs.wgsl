@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4u {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) { discard; }
    // One 16-byte color attachment: full-precision RGB and an octahedral normal.
    return vec4u(bitcast<vec3u>(diffuseColor.rgb), pack2x16snorm(octEncode(normalize(in.nor))));
}
