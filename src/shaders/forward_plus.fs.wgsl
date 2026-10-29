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
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
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
fn main(in: FragmentInput) -> @location(0) vec4f
{

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Determine which cluster contains the current fragment.
    let dims = vec3f(${clusterDimX}, ${clusterDimY}, ${clusterDimZ});
    // take fragment position, put in screen space to determine which cluster in XY it belongs to. 
    let pos_clip = cameraUniforms.viewProjMat * vec4f(in.pos, 1.0);
    let pos_ndc = pos_clip.xyz / pos_clip.w;
    let uv = vec2f(pos_ndc.x * 0.5 + 0.5, 0.5 - pos_ndc.y * 0.5);
    let clusterXY = clamp(floor(uv * dims.xy), vec2f(0.0), dims.xy - vec2f(1.0));
    
    // get from world to view space
    let pos_view = cameraUniforms.viewMat * vec4f(in.pos, 1.0);
    let z_proportion = log(-pos_view.z / cameraUniforms.nClip) / log(cameraUniforms.fClip / cameraUniforms.nClip) * dims.z;
    let clusterZ = clamp(floor(z_proportion), 0.0, dims.z - 1.0);

    let clusterIdx = u32(clusterXY.x)
               + u32(clusterXY.y) * ${clusterDimX}
               + u32(clusterZ) * ${clusterDimX} * ${clusterDimY};


// Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let numLights = clusterSet.clusters[clusterIdx].numLightsInCluster;

    var totalLightContrib = vec3f(0.);

    for (var i = 0; u32(i) < numLights; i++)
    {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[u32(i)];
        // calculate contribution of light 
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }



    var finalColor = diffuseColor.rgb * totalLightContrib;

    return vec4(finalColor, 1);
}