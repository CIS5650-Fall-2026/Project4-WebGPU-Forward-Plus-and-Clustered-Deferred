@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput {
    @location(0) data: vec2u
}

fn encodeOctahedralNormal(normal: vec3f) -> vec2f {
    let projected = normal / (abs(normal.x) + abs(normal.y) + abs(normal.z));
    var oct = projected.xy;
    if (projected.z < 0.f) {
        oct = (1.f - abs(oct.yx)) * select(vec2f(-1.f), vec2f(1.f), oct >= vec2f(0.f));
    }
    return oct;
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var out: GBufferOutput;
    out.data = vec2u(
        pack2x16snorm(encodeOctahedralNormal(normalize(in.nor))),
        pack4x8unorm(vec4f(diffuseColor.rgb, 1.f))
    );
    return out;
}
