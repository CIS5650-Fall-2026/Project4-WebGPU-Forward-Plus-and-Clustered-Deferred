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
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(
    in: FragmentInput,
    @builtin(position) fragPos: vec4f
) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Access the light's properties using its index.
    let x = min(u32(fragPos.x / camera.screenSize.x * ${clustersX}), ${clustersX} - 1u);
    let y = min(u32(fragPos.y / camera.screenSize.y * ${clustersY}), ${clustersY} - 1u);

    let viewPos = camera.viewMat * vec4f(in.pos, 1);
    let depth = clamp(-viewPos.z, ${nearPlane}, ${farPlane});

    let sliceDepth = (${farPlane} - ${nearPlane}) / ${clustersZ};
    let z = min(u32((depth - ${nearPlane}) / sliceDepth), ${clustersZ} - 1u);

    let clusterIdx = x + y * ${clustersX} + z * ${clustersX} * ${clustersY};

    let numLights = clusterSet.clusters[clusterIdx].numLights;

    // Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < clusterSet.clusters[clusterIdx].numLights; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lights[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
