// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
struct VertexInput
{
    @location(0) pos: vec2f,
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    var out: VertexOutput;
    out.fragPos = vec4f(in.pos, 0.0, 1.0);
    out.uv = in.pos*0.5+0.5;
    return out;
}
