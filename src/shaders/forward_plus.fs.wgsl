// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterData: ClusterData;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

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

// testfunction
fn debugToColor(index: u32, dim: vec3u) -> vec3f {
    let x = index % dim.x;
    let y = (index / dim.x) % dim.y;
    let z = index / (dim.x * dim.y);

    return vec3f(
        f32(x) / f32(dim.x),
        f32(y) / f32(dim.y),
        f32(z) / f32(dim.z)
    );
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);
    
    // determine which cluster contains the current fragment
    let clusterIndex = getClusterIndex(in.pos, clusterData.dim, camera);
    let nLights = clusterData.clusters[clusterIndex].numLights;

    var test : f32 = 0.0;

    for (var lightIdx = 0u; lightIdx < nLights; lightIdx++) {

        test += 0.05;

        // access light using index in cluster data
        let light = lightSet.lights[clusterData.clusters[clusterIndex].lights[lightIdx]];

        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    
    //finalColor = debugToColor(clusterIndex, clusterData.dim);

    //finalColor = vec3f(test, 0.0, 0.0);

    return vec4(finalColor, 1);
}
