// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

@vertex
fn main(@builtin(vertex_index) vertexIdx: u32) -> @builtin(position) vec4f
{   
    // positions of the big triangle
    let positions = array(
        vec2f(-1.f, -1.f),
        vec2f(3.f, -1.f),
        vec2f(-1.f, 3.f)
    );
    return vec4f(positions[vertexIdx], 0.f, 1.f);
}
