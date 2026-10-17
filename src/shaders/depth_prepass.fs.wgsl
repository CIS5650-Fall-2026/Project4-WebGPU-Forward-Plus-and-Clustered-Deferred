// depth only, but the alpha test still has to cut holes in the leaves

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@fragment
fn main(@location(2) uv: vec2f)
{
    if (textureSample(diffuseTex, diffuseTexSampler, uv).a < 0.5f) {
        discard;
    }
}
