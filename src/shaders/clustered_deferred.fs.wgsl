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
    @location(0) albedo: vec4f,
    @location(1) normal: vec4f,
    @location(2) position: vec4f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput
{
    let albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (albedo.a < 0.5f) {
        discard;
    }

    let normal: vec4f = vec4f(normalize(in.nor), 0.f);
    let position: vec4f  = vec4f(in.pos, 1.f);

    return GBufferOutput(albedo, normal, position);
}
