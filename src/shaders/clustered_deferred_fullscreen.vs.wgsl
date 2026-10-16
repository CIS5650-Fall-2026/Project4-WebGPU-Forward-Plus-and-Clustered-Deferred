// Runs a hard coded fullscreen quad when asked to draw 6 vertices

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    var quadPositions = array<vec2f, 6>(
        vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
        vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1)
    );

    return vec4f(quadPositions[vertexIndex], 0.0, 1.0);
}