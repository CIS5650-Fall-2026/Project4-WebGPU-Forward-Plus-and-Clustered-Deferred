// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

@vertex
fn main(@builtin(vertex_index) vertexIdx: u32) -> @builtin(position) vec4f {
    let uv = vec2f(f32((vertexIdx << 1u) & 2u), f32(vertexIdx & 2u));
    return vec4f(uv * 2.0 - 1.0, 0.0, 1.0);
}