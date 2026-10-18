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
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(4) var<uniform> screenHeight: f32;
@group(${bindGroup_scene}) @binding(5) var<uniform> screenWidth: f32;
@group(${bindGroup_scene}) @binding(6) var<uniform> clusterRowLength: f32;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let clusterCubeZLength = 25;

    // calculate cluster index from pixel pos
    let clusterHeight = u32(screenHeight);
    let clusterWidth = u32(screenWidth);
    let clustersPerRow = u32(clusterRowLength);
    let intFragX = u32(in.fragPos.x);
    let intFragY = u32(in.fragPos.y);
    let clusterX = intFragX/clusterWidth;
    let clusterY = intFragY/clusterHeight;
    // CALCULATE BASED ON DEPTH
    let fragDepth = u32(distance(in.pos, camUniforms.pos));
    let clusterZ = fragDepth/u32(clusterCubeZLength);
    // UPDATE TO USE Z INDEX
    let clusterIndex = clusterZ*clustersPerRow*clustersPerRow + clusterY*clustersPerRow + clusterX;

    let currCluster = clusterSet.clusters[clusterIndex];

    // COLORS TO DISPLAY FOR DEBUGGING
    let idxColor = f32(clusterIndex)/f32(clusterSet.numClusters);
    let numLightsColor = f32(currCluster.numLights)/f32(lightSet.numLights);
    //return vec4(idxColor, idxColor, idxColor, 1);
    //return vec4(numLightsColor, numLightsColor, numLightsColor, 1);
    // //return vec4(cluster.frontMin.xyz, 1);

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < currCluster.numLights; lightIdx++) {
        let lightsetLightIdx = currCluster.lightIndices[lightIdx];
        let light = lightSet.lights[lightsetLightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var outputColor = diffuseColor.rgb * totalLightContrib;
    return vec4(outputColor, 1);
    


    

    // var finalColor = diffuseColor.rgb * totalLightContrib;
    //var finalColor = in.pos.xyz;
    //var finalColor = camUniforms.invViewProjMat* in.fragPos;
    var finalColor = camUniforms.viewMat* vec4(in.pos, 1);

    // calculate pixel pos of light by applying viewprojmat, divide by w
    // add 1 and divide by 2, flip y
    // multiply by 2* width
    let calculatedFrag = camUniforms.viewProjMat * vec4(in.pos, 1);
    let adjustedCalculatedFrag = calculatedFrag /calculatedFrag.w; 
    //return vec4((adjustedCalculatedFrag.x + 1)/2, 1 - (adjustedCalculatedFrag.y+1)/2, 0, 1);
    // turn in.fragpos to what calculated frag outputs
    // fragpos / 2*width or height respectively
    //return vec4(in.fragPos.x/1880, in.fragPos.y/1320, 0, 1);
}