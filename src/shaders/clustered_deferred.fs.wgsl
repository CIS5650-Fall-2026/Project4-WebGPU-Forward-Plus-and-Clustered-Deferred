// 3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput
{
    @location(0) position: vec4f,
    @location(1) normal: vec4f,
    @location(2) albedo: vec4f
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var out: FragmentOutput;
    out.position = vec4f(in.pos, 1.0);
    out.normal = vec4f(in.nor, 0.0);
    out.albedo = diffuseColor;
    return out;
}
