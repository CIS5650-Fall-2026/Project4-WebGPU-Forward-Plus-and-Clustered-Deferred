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
    @builtin(position) fragCoord: vec4f,
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

    // determine which cluster contains the current fragment
    let tileX = min(u32(floor((in.fragCoord.x / cameraUniforms.screenDimensions.x) * f32(${clusterX}))), ${clusterX}u - 1u);
    let tileY = min(u32(floor(((cameraUniforms.screenDimensions.y - in.fragCoord.y) / cameraUniforms.screenDimensions.y) * f32(${clusterY}))), ${clusterY}u - 1u);
    let clusterXIdx = min(tileX, ${clusterX}u - 1u);
    let clusterYIdx = min(tileY, ${clusterY}u - 1u);

    let viewPos = (cameraUniforms.viewMat * vec4f(in.pos, 1.0)).xyz;
    let linearDepth = max(-viewPos.z, cameraUniforms.nearPlane);

    let depth = clamp(-viewPos.z, cameraUniforms.nearPlane, cameraUniforms.farPlane);
    let logRatio = log(depth / cameraUniforms.nearPlane) / log(cameraUniforms.farPlane / cameraUniforms.nearPlane);
    let clusterZIdx = min(u32(logRatio * f32(${clusterZ})), ${clusterZ}u - 1u);

    let clusterIdx = clusterXIdx + clusterYIdx * ${clusterX}u + clusterZIdx * ${clusterX}u * ${clusterY}u;
    let cluster = &clusterSet.clusters[clusterIdx];
    let numLights = (*cluster).numLights;

    // accumulate total light contribution for the fragment
    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < numLights; lightIdx++) {
        let light = lightSet.lights[(*cluster).lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}