// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

@vertex
fn main(@builtin(vertex_index) in: u32) -> @builtin(position) vec4f
{
    let quad = array<vec2f, 6>(
        vec2f(-1, -1),
        vec2f(1, -1.),
        vec2f(-1, 1),
        vec2f(-1, 1),
        vec2f(1, -1),
        vec2f(1, 1),
    );

    return vec4f(quad[in], 0, 1);
}
