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


@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;



const cellsX: u32 = ${clusterCountWidth}u;
const cellsY: u32 = ${clusterCountHeight}u;
const cellsZ: u32 = ${clusterCountDepth}u;


struct FragmentInput
{
    @builtin(position) windowPos: vec4f,
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

    // which column and row on the screen
    let x = min(u32(in.windowPos.x / camera.camScreen.x * f32(cellsX)), cellsX - 1u);
    let y = min(u32(in.windowPos.y / camera.camScreen.y * f32(cellsY)), cellsY - 1u);


    // same layer split as layerDistance, just backwards
    let near = camera.depthDist.x;
    let far = camera.depthDist.y;

    // forward is negative, so we flip the sign
    let dist = max(-(camera.viewMat * vec4f(in.pos, 1.0)).z, near);
    let layer = min(u32(log(dist / near) / log(far / near) * f32(cellsZ)), cellsZ - 1u);


    let cellId = x + y * cellsX + layer * cellsX * cellsY;


    // lights this specific cell kept
    var totalLightContributoin = vec3f(0, 0, 0);
    let lightCount = clusterSet.clusters[cellId].numLights;
    for (var i = 0u; i < lightCount; i++) {
        let lightId = clusterSet.clusters[cellId].lights[i];
        let light = lightSet.lights[lightId];
        totalLightContributoin += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContributoin;
    return vec4(finalColor, 1);
}
