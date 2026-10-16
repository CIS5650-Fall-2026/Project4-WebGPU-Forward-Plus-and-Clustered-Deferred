// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput
{
    @location(0) pos: vec4f,
    @location(1) nor: vec4f,
    @location(2) albedo: vec4f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    
    var gBufferOutput: GBufferOutput;
    gBufferOutput.pos = vec4f(in.pos, 1.0);
    gBufferOutput.nor = vec4f(in.nor, 0.0);
    gBufferOutput.albedo = diffuseColor;
    return gBufferOutput;
}