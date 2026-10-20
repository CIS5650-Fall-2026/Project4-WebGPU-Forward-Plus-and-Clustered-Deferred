// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

@vertex
fn main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f {
    var pos = array<vec2f, 3>(vec2(-1,-1), vec2(3,-1), vec2(-1,3));
    return vec4f(pos[idx].xy, 0.f, 1.f);
}
