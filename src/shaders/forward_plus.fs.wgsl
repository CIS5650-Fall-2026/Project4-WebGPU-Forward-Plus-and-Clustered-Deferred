// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

override debugView: u32 = 0u;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

// ------------------------------------
// Shading process:
// ------------------------------------
@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Determine which cluster contains the current fragment.
    let clusterIdx = clusterIndex(in.fragPos, in.pos, cameraUniforms);
    let cluster = &clusterSet.clusters[clusterIdx];

    // Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let numLights = (*cluster).numLights;

    // Initialize a variable to accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0, 0, 0);

    // For each light in the cluster:
    for (var i = 0u; i < numLights; i++) {
        // Access the light's properties using its index.
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        // Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
        // Add the calculated contribution to the total light accumulation.
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution.
    var finalColor = diffuseColor.rgb * totalLightContrib;
    if (debugView == 1u) {
        finalColor = debugLightCountColor(numLights);
    } else if (debugView == 2u) {
        finalColor = diffuseColor.rgb;
    } else if (debugView == 3u) {
        finalColor = normalize(in.nor) * 0.5f + 0.5f;
    } else if (debugView == 4u) {
        finalColor = debugPositionColor(in.pos);
    }

    // Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
    return vec4(finalColor, 1);
}
