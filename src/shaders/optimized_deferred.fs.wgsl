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
    @location(0) normalAlbedo: vec2u
}

fn octEncode(normal: vec3f) -> vec2f
{
    let n = normal / (abs(normal.x) + abs(normal.y) + abs(normal.z));

    var encoded = n.xy;

    if (n.z < 0.0) {
        encoded = (vec2f(1.0) - abs(encoded.yx)) * signNotZero(encoded);
    }

    return encoded;
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var out: FragmentOutput;

    let packedNormal = pack2x16snorm(octEncode(normalize(in.nor)));
    let packedAlbedo = pack4x8unorm(vec4f(diffuseColor.rgb, 1.0));

    out.normalAlbedo = vec2u(packedNormal, packedAlbedo);
    return out;
}
