// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
@group(${bindGroup_scene}) @binding(0) var<uniform> camUniforms: CameraUniforms;

struct VertexInput
{
    @location(0) pos: vec3f
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    var out: VertexOutput;

    let modelPos = vec4(in.pos, 1);
    //out.fragPos = camUniforms.viewProjMat * modelPos; // TODO-1.3: replace ??? with the view proj mat from your CameraUniforms uniform variable
    out.fragPos = vec4(in.pos.x*1000, in.pos.y*1000, 0.5, 1);
    out.pos = modelPos.xyz / modelPos.w;


    // out.fragPos = vec4f(in.pos, 1); 
    // out.pos = in.pos;
    // out.uv = vec2f(0.5, 0.5);
    return out;
}