// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var  diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var  diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput
{
    @location(0) normal: vec4f,
    @location(1) color: vec4f,
    @location(2) position: vec4<f32>
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    let normal = vec4f(normalize(in.nor), 0.f);
    let position = vec4f(in.pos, 1.0);
    return FragmentOutput(normal, diffuseColor, position);
}