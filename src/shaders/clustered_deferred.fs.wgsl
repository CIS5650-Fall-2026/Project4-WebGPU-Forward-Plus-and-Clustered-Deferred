// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
};

struct GBufferOutput {
    @location(0) pos: vec4f,
    @location(1) nor: vec4f,
    @location(2) albedo: vec4f //Apparently it'll auto-convert to rgba8unorm
};

@fragment
fn main(in: FragInput) -> GBufferOutput {
    var out: GBufferOutput;
    
    out.pos = vec4f(in.pos, 1.0);
    out.nor = vec4f(normalize(in.nor), 0.0);
    out.albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv);

    if (out.albedo.a < 0.5) {
        discard;
    }
    return out;
}