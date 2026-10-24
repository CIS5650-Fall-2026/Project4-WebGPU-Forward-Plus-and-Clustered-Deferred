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
    @location(0) position: vec4f,
    @location(1) normal: vec4f,
    @location(2) albedo: vec4f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // just stores the G-buffer information, no shading is done here
    var out: GBufferOutput;
    out.position = vec4f(in.pos, 1.f);
    out.normal = vec4f(normalize(in.nor), 0.f);
    out.albedo = diffuseColor;
    return out;
}
