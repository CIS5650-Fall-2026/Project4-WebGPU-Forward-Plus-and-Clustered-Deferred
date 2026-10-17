@vertex
fn main(@builtin(vertex_index) vertexInd: u32) -> @builtin(position) vec4f
{
    var points = array<vec2f, 3>(vec2f(-1, -1),vec2f(3, -1),vec2f(-1, 3));
    return vec4f(points[vertexInd], 0, 1);
}
