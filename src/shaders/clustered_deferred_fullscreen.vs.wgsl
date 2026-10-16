// CHECKITOUT: draws one triangle that covers the whole screen, with its vertices generated from the vertex index,
// so no vertex buffer is needed. The fragment shader reads everything else from the G-buffer.

@vertex
fn main(@builtin(vertex_index) vertexIdx: u32) -> @builtin(position) vec4f
{
    // vertices 0, 1, 2 map to NDC (-1, -1), (3, -1), (-1, 3)
    let uv = vec2f(f32((vertexIdx << 1u) & 2u), f32(vertexIdx & 2u));
    return vec4f(uv * 2.f - 1.f, 0.f, 1.f);
}
