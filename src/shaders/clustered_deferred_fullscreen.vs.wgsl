// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.



@vertex 
fn main(
    @builtin(vertex_index) vertexIndex: u32 
) -> @builtin(position) vec4f {


    // A fullscreen triangle covering the entire viewport
    let x = f32((vertexIndex << 1u) & 2u);
    let y = f32(vertexIndex & 2u);


    return vec4f(x * 2.0 - 1.0, 1.0 - y * 4.0, 0.0, 1.0);
}