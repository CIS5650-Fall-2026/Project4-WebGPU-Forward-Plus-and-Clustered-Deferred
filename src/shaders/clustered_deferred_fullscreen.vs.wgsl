// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

//vertex_index is a vertex number supplied by WebGPU, (0,1,2) (3,4,5) ..., return value in the builtin position variable
//output as builtin(position) because that tells the GPU where each vertex corner is
//when builtin(position) is read in the fragment shader it becomes a different value (rasterized screen space coords)
@vertex
fn main(@builtin(vertex_index) vertIdx : u32) -> @builtin(position) vec4f 
{
    let positions = array<vec2f, 3>(
        vec2(-1,1),
        vec2(-1,-3),
        vec2(3,1)
    );


    return vec4(positions[vertIdx],0,1);
}