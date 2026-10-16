@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct GBufferOut {
    @location(0) albedo: vec4f,
    @location(1) normal: vec4f,
    @location(2) pos: vec4f
}

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment fn main(in: FragmentInput) -> GBufferOut {
    // albedo 
    let c = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (c.a < 0.5) { 
        discard; 
    }
    return GBufferOut(c, vec4f(normalize(in.nor), 0), vec4f(in.pos, 1));
}