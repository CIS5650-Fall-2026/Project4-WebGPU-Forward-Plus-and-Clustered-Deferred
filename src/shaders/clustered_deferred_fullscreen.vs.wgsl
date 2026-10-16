// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
}

@vertex
fn main(@builtin(vertex_index) vertIdx: u32) -> VertexOutput
{
    var out: VertexOutput;
    let fragTexCoord: vec2f = vec2f(vec2u((vertIdx << 1) & 2, vertIdx & 2));
    out.fragPos = vec4f((fragTexCoord * 2.0) - 1.0, 0.0, 1.0);
    return out;
}
