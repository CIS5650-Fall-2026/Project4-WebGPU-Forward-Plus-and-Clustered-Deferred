// 3: implement the Clustered Deferred G-buffer fragment shader
// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec2u { // old: GBufferOutput
    let diffuse = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuse.a < 0.5f) {
        discard;
    }

    // as part of g-buffer optimization:
    let packedNormal = pack2x16snorm(octEncode(normalize(in.nor)));
    let packedAlbedo = pack4x8unorm(vec4f(diffuse.rgb, 1.0));
    return vec2u(packedNormal, packedAlbedo);

    // old way
    //var out: GBufferOutput;
    //out.position = vec4f(in.pos, 1.0);
    //out.normal = vec4f(normalize(in.nor), 0.0);
    //out.albedo = vec4f(diffuse.rgb, 1.0);
    //return out;
}