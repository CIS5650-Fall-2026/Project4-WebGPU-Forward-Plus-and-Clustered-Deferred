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


@group(${bindGroup_scene}) @binding(0) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) frag_coord: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // determine cluster
    let cluster_x = min(u32(floor(in.frag_coord.x / f32(camUniforms.width) * f32(clusterCountX))),
        clusterCountX - 1u);

    let cluster_y = min(u32(floor((1.0 - in.frag_coord.y / f32(camUniforms.height)) * f32(clusterCountY))),
        clusterCountY - 1u);

    let cluster_z = min(u32(floor(in.frag_coord.z * f32(clusterCountZ))),
        clusterCountZ - 1u);

    let clusterIdx = cluster_x + cluster_y * clusterCountX + cluster_z * clusterCountX * clusterCountY;

    var totalLightContrib = vec3f(0.0);
    for (var lightClusterIdx = 0u; lightClusterIdx < clusterSet.clusters[clusterIdx].numLights; lightClusterIdx++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lights[lightClusterIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
