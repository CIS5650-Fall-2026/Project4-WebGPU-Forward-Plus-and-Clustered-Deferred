struct VertexOutput
{
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput
{

    var positions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
    );

    var out: VertexOutput;
    out.pos = vec4f(positions[vertex_index], 0.0, 1.0);
    out.uv = positions[vertex_index] * 0.5 + vec2f(0.5);
    return out;
}
