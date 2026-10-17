@group(${bindGroup_material}) @binding(0)
var diffuseTex: texture_2d<f32>;

@group(${bindGroup_material}) @binding(1)
var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec2u {
    let color = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (color.a < 0.5) {
        discard;
    }

    let normal = pack2x16snorm(encodeOctNormal(normalize(in.nor)));
    let albedo = pack4x8unorm(vec4f(color.rgb, 1.0));
    return vec2u(normal, albedo);
}
