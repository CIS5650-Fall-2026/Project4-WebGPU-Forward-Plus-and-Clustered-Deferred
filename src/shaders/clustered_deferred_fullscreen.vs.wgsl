// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
@vertex
fn main(@builtin(vertex_index) vertexIdx: u32) -> @builtin(position) vec4f
{
    // one triangle big enough to cover the whole screen (NDC -1..1); the parts outside are clipped
    var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    return vec4f(corners[vertexIdx], 0.0, 1.0);
}
