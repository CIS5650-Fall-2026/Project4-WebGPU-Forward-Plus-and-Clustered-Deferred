// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.



@group(${bindGroup_material}) @binding(0)

var diffuseTex: texture_2d<f32>;

@group(${bindGroup_material}) @binding(1)

var diffuseTexSampler: sampler;



struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}


struct GBufferOutput {
    @location(0) packedData: vec4f
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    let diffuseColor = textureSample(
        diffuseTex,
        diffuseTexSampler,
        in.uv
    );


    // Preserve the alpha test from the Naive renderer
    if (diffuseColor.a < 0.5f) {
        discard;
    }



    var output: GBufferOutput;



    output.packedData = vec4f(
        diffuseColor.rgb,
        packNormal(in.nor)
    );




    return output;
}