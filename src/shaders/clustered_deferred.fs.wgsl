// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct GBufferOutput {
    @location(0) position : vec4f,
    @location(1) normal : vec4f,
    @location(2) albedo : vec4f
}

struct FragmentInput
{
    @builtin(position) frag_coord: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    var output : GBufferOutput;

    output.position = vec4f(in.pos.x, in.pos.y, in.pos.z, in.frag_coord.z);
    output.normal = vec4f(in.nor.x, in.nor.y, in.nor.z, 0.0);
    output.albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv);

    if (output.albedo.a < 0.5) {
        discard;
    }

    return output;
}
