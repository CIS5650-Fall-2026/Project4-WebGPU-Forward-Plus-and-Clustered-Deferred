// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f
{
    var positions = array<vec2f, 3>(
        vec2f(-1, -1),
        vec2f( 3, -1),
        vec2f(-1,  3)
    );
    return vec4f(positions[vertexIndex], 0, 1);
}
