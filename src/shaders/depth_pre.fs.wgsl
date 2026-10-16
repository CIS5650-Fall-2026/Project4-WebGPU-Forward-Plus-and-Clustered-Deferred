@group(${bindGroup_material}) @binding(0)var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1)var diffuseTexSampler: sampler;

@fragment
fn main(@location(2) uv: vec2f)
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, uv);

    if (diffuseColor.a < 0.5f) {
        discard;
    }
}