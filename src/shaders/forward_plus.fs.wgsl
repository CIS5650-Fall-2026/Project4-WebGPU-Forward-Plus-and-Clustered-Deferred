// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights


// Shading process

// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).




@group(${bindGroup_scene}) @binding(0) var<uniform> camera:CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

struct ScreenUniforms {
    resolution: vec2f
}

@group(${bindGroup_scene}) @binding(3)
var<uniform> screen: ScreenUniforms;



@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;




struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}




const nearPlane: f32 = 0.1;
const farPlane: f32 = 1000.0;




@fragment
fn main(
    in: FragmentInput,
    @builtin(position) fragCoord: vec4f
) -> @location(0) vec4f {

    // Sample the diffuse texture, as in naive.fs.wgsl
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);

    if (diffuseColor.a < 0.5f) {
        discard;
    }

    
    // Determine the fragment's cluster
    

    // Convert the fragment's world-space position to view space
    let posView = camera.viewMat * vec4f(in.pos, 1.0);

    // View-space forward depth is positive
    let viewDepth = max(-posView.z, nearPlane);

    // Calculate the fragment's XY cluster coordinates
    let screenWidth = screen.resolution.x;
    let screenHeight = screen.resolution.y;


    let clusterX = min(
        u32(fragCoord.x / screenWidth * f32(${clusterCountX})),
        ${clusterCountX}u - 1u
    );



    let clusterY = min(
        u32(fragCoord.y / screenHeight * f32(${clusterCountY})),
        ${clusterCountY}u - 1u
    );


    // Calculate logarithmic Z slice, matching clustering.cs.wgsl
    let depthRatio = farPlane / nearPlane;

    let normalizedDepth = log(viewDepth / nearPlane) / log(depthRatio);

    let clusterZ = min(
        u32(clamp(normalizedDepth, 0.0, 1.0) * f32(${clusterCountZ})),
        ${clusterCountZ}u - 1u
    );

    // Convert 3D cluster coordinates to a linear index
    let clusterIndex = clusterX + clusterY * ${clusterCountX}u + clusterZ * ${clusterCountX}u * ${clusterCountY}u;

    
    // Shade using only this cluster's lights
    let numClusterLights = clusterSet.clusters[clusterIndex].numLights;

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

    for (var i = 0u; i < numClusterLights; i++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];
        let light = lightSet.lights[lightIndex];

        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));


    }

    // Same final color calculation as naive.fs.wgsl
    let finalColor = diffuseColor.rgb * totalLightContrib;

    return vec4f(finalColor, 1.0);
}