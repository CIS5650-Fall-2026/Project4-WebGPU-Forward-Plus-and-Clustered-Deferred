@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    var positions = array<vec2f, 3>(
        vec2f(-1.f, -1.f),
        vec2f(3.f, -1.f),
        vec2f(-1.f, 3.f)
    );
    return vec4f(positions[vertexIndex], 0.f, 1.f);
}
