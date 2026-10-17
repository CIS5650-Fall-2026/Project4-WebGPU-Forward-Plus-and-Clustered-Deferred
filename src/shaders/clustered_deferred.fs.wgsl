// Clustered Deferred G-buffer fragment shader
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput{
    @location(0) pos: vec4f,
    @location(1) nor: vec4f,
    @location(2) alb: vec4f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput
{

    
    //sample color from tex
    let color = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (color.a < 0.5f) {discard;};

    var output: GBufferOutput;
    output.alb = vec4f(color.rgb, 1);
    output.pos = vec4f(in.pos, 1);
    output.nor = vec4f(normalize(in.nor), 0);

    return output;
}
