// Extra Credit: display the output of compute-based deferred lighting
// Lighting calculations are performed in the compute shader, not here

@group(0) @binding(0) var lightingTex: texture_2d<f32>;



@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    return textureLoad(lightingTex, vec2i(fragCoord.xy), 0);
}
