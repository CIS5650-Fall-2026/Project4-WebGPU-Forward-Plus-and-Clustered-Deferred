// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.
struct VertexOutput {
    @builtin(position) pos: vec4f
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var xy = vec2f(-1.0, -1.0);
    if (vertexIndex == 1u) {
        xy = vec2f(3.0, -1.0);
    } else if (vertexIndex == 2u) {
        xy = vec2f(-1.0, 3.0);
    }

    var out: VertexOutput;
    out.pos = vec4f(xy, 0.0, 1.0);
    return out;
}