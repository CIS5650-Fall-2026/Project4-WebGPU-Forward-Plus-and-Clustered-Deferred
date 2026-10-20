// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput
{
    @builtin(position) fragPos: vec4f
}

@vertex
fn main(@builtin(vertex_index) i: u32) -> VertexOutput
{
    let corners = array<vec2f, 3>(
        vec2f(-1, -1),
        vec2f(-1,  3),
        vec2f( 3, -1),
    );
    var out: VertexOutput;
    out.fragPos = vec4f(corners[i], 0, 1);
    return out;
}