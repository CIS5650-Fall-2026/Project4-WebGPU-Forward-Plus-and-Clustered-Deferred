// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct VertexOutput
{
    // since position, normal already given by gBuffer
    @builtin(position) fragPos: vec4f,
}

@vertex
fn main(@builtin(vertex_index) i: u32) -> VertexOutput
{
    // ndc - range -1 to 1 aligns with pixelspace height and width of screen
    // computing the quad at screen bounds 
    const quad = array<vec2f, 6> (
        vec2f(-1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), 
        vec2f(1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0)
    );
    var out: VertexOutput;
    out.fragPos = vec4f(quad[i], 0.0, 1.0);
    return out;
}
