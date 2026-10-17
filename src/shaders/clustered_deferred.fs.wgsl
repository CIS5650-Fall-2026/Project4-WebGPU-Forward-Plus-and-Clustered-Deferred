// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
// no lighting G-buffer fragment shader 

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
    @location(0) col: vec4f,
    @location(1) nor: vec4f
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    var out: FragmentOutput;

    // albedo 
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    out.col = vec4f(diffuseColor.rgb, 1.0);

    // normal 
    out.nor = vec4f(in.nor, 1.0);

    return out;
}

