// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(4) var<uniform> screenHeight: f32;
@group(${bindGroup_scene}) @binding(5) var<uniform> screenWidth: f32;
@group(${bindGroup_scene}) @binding(6) var<uniform> clusterRowLength: f32;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

// @group(${bindGroup_finalPassMaterial}) @binding(0) var normalDepth: texture_2d<f32>;
// @group(${bindGroup_finalPassMaterial}) @binding(1) var normalDepthSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput
{
    @location(0) color: vec4f,
    @location(1) nor: vec4f,
    @location(2) pos: vec4f
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    var out: FragmentOutput;

    // calculate position
    out.pos = vec4f(in.pos, 0);

    // calculate normal
    out.nor = vec4f(in.nor, 0);

    //calculate diffuse color
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    out.color = vec4f(diffuseColor.xyz, 0);
    //out.color = vec4f(1,1, 0, 1);
    return out;
}
