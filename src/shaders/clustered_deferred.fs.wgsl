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

struct FragmentOutput 
{
    @location(0) pos: vec4f, // more convenient to use pos instead of depth but would prolly b better to use depth
    @location(1) nor: vec4f,
    @location(2) uv: vec4f,
    @location(3) albedo: vec4f
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    let albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if(albedo.a < 0.5) {
        discard;
    }

    var out: FragmentOutput;
    out.pos = vec4f(in.pos, 1.0);
    out.nor = vec4f(normalize(in.nor), 1.0);
    out.uv = vec4f(in.uv, 0.0, 1.0);
    out.albedo = albedo;
    return out;
}


