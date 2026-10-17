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

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<storage, read_write> clusterLightIDs: ClusterLightIDs;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if(diffuseColor.a < 0.5) {
        discard;
    }

    // Get 2D tile
    var uv = in.fragPos.xy/camera.resolution;
    uv.y = 1.0-uv.y;
    let tile = floor(uv*vec2f(clusterSet.clusterDim.xy));

    // Get Camera Space Depth    
    var viewPos = camera.inverseProj * vec4f((uv*2.0-1.0), in.fragPos.z, 1.0);
    viewPos /= viewPos.w;
    let clusterDepth = getClusterDepthID(-viewPos.z, clusterSet.clusterDim.z);

    // Get Cluster ID
    let clusterId3 = vec3u(vec2u(tile), u32(clusterDepth));
    let clusterIdx = getClusterId1(clusterId3, clusterSet.clusterDim);

    // Get Lights in BBX
    let lightStart = clusterSet.clusters[clusterIdx].lightStart;
    let lightEnd = lightStart + clusterSet.clusters[clusterIdx].lightCount;

    var totalLight = vec3f(0,0,0);
    for(var i = lightStart; i < lightEnd; i++) {
        let light = lightSet.lights[clusterLightIDs.indices[i]];
        totalLight += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    // let lightDisplay = f32(clusterSet.clusters[clusterIdx].lightCount)/f32(lightSet.numLights);
    // return vec4f(vec3f(lightDisplay, 0.0, 0.0), 1.0);

    var col = diffuseColor.rgb * totalLight;
    return vec4(col, 1.0);

}