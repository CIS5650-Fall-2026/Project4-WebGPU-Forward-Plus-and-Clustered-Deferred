@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    let positions = array<vec2f, 3>(
        vec2f(-1.0f, -1.0f),
        vec2f( 3.0f, -1.0f),
        vec2f(-1.0f,  3.0f),
    );

    return vec4f(positions[vertexIndex], 0.0f, 1.0f);
}
