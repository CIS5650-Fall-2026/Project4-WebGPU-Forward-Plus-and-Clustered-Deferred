// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: array<ClusterSet>;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    //Compute view space coordinate of the frag
    let vPos: vec3f = (cameraUniforms.view * vec4f(in.pos, 1.0)).xyz;

    let tile = vec2u(in.fragPos.xy) / ${clusterPixelSize};
    let slice = floor(clamp(f32(${numSlices}) * log(abs(vPos.z / cameraUniforms.near)) / log(abs(cameraUniforms.far / cameraUniforms.near)),
        0, ${numSlices} - 1));
    let cluster: vec3u = vec3u(tile, u32(slice));
    let clusterIdx = cluster.x + 
        cluster.y * u32(ceil(f32(cameraUniforms.dims.x) / f32(${clusterPixelSize}))) +
        cluster.z * u32(ceil(f32(cameraUniforms.dims.x) / f32(${clusterPixelSize})) * ceil(f32(cameraUniforms.dims.y) / f32(${clusterPixelSize})));
    
    
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i: u32 = 0; i < clusterSet[clusterIdx].lightCounter; i++) {
        totalLightContrib += calculateLightContrib(lightSet.lights[clusterSet[clusterIdx].lights[i]], in.pos, 
        normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4f(finalColor, 1);
}