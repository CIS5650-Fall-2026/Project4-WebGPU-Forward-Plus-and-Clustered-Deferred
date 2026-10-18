// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(4) var<uniform> screenHeight: f32;
@group(${bindGroup_scene}) @binding(5) var<uniform> screenWidth: f32;
@group(${bindGroup_scene}) @binding(6) var<uniform> clusterRowLength: f32;

@group(1) @binding(0) var normalDepth: texture_2d<f32>;
@group(1) @binding(1) var normalDepthSampler: sampler;
@group(1) @binding(2) var color: texture_2d<f32>;
@group(1) @binding(3) var colorSampler: sampler;
@group(1) @binding(4) var positionTex: texture_2d<f32>;
@group(1) @binding(5) var positionTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput
{
    @location(0) color: vec4f,
    @location(1) nor: vec4f
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    let clusterCubeZLength = 25;
    var out: FragmentOutput;

    // grab values from gbuffer textures
    let fragposUV = vec2f(in.fragPos.x / (clusterRowLength*screenWidth), in.fragPos.y / (clusterRowLength*screenHeight));
    let normalFromTex = textureSample(normalDepth, normalDepthSampler, fragposUV);
    let diffuseColor = textureSample(color, colorSampler, fragposUV);
    let posFromTex =  textureSample(positionTex, positionTexSampler, fragposUV);

    // calculate cluster index from pixel pos
    let clusterHeight = u32(screenHeight);
    let clusterWidth = u32(screenWidth);
    let clustersPerRow = u32(clusterRowLength);
    let intFragX = u32(in.fragPos.x);
    let intFragY = u32(in.fragPos.y);
    let clusterX = intFragX/clusterWidth;
    let clusterY = intFragY/clusterHeight;
    // CALCULATE BASED ON DEPTH
    let fragDepth = u32(distance(posFromTex.xyz, camUniforms.pos));
    let clusterZ = fragDepth/u32(clusterCubeZLength);
    // UPDATE TO USE Z INDEX
    let clusterIndex = clusterZ*clustersPerRow*clustersPerRow + clusterY*clustersPerRow + clusterX;

    let currCluster = clusterSet.clusters[clusterIndex];

    // COLORS TO DISPLAY FOR CLUSTER DEBUGGING
    // let idxColor = f32(clusterIndex)/f32(clusterSet.numClusters);
    // out.color = vec4(idxColor, idxColor, idxColor, 1);

    var totalLightContrib = vec3f(0, 0, 0);

    // naive light calculation
    // for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
    //     let light = lightSet.lights[lightIdx];
    //     totalLightContrib += calculateLightContrib(light, posFromTex.xyz, normalFromTex.xyz);
    // }

    // cluster based light calc
    for (var lightIdx = 0u; lightIdx < currCluster.numLights; lightIdx++) {
        let lightsetLightIdx = currCluster.lightIndices[lightIdx];
        let light = lightSet.lights[lightsetLightIdx];
        totalLightContrib += calculateLightContrib(light, posFromTex.xyz, normalFromTex.xyz);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    out.color = vec4f(finalColor.xyz, 1);

    // let fragDepth = distance(posFromTex.xyz, camUniforms.pos)/10;
    // //out.color = vec4(fragDepth, fragDepth, fragDepth, 1);
    
    return out;
}