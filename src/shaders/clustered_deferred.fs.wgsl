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

// x: albedo as 4 x 8 bits, y: normal as 2 x 16 bits
// the position comes back from the depth buffer
@fragment
fn main(in: FragmentInput) -> @location(0) vec2u
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let albedo = pack4x8unorm(vec4f(diffuseColor.rgb, 1.f));
    let normal = pack2x16snorm(octEncode(normalize(in.nor)));
    return vec2u(albedo, normal);
}
