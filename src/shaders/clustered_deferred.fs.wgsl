// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct GBufferOutput {
    @location(0) position: vec4f,
    @location(1) albedo: vec4f,
    @location(2) normal: vec4f,
}

@fragment
fn main(
    @location(0) worldPosition: vec3f,
    @location(1) worldNormal: vec3f,
    @location(2) uv: vec2f,
) -> GBufferOutput {
    var out: GBufferOutput;
    let albedo = textureSample(diffuseTex, diffuseTexSampler, uv);
    if (albedo.a < 0.5f) {
        discard;
    }

    out.position = vec4f(worldPosition, 1.0);
    out.albedo = albedo;
    out.normal = vec4f(normalize(worldNormal), 1.0);
    return out;
}