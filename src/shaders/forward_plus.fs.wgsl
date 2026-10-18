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
    let tileSize = vec2f(
        camera.screenSize.x / f32(${numClustersX}),
        camera.screenSize.y / f32(${numClustersY})
    );
    let clusterX = min(u32(in.fragCoord.x / tileSize.x), ${numClustersX} - 1u);
    let clusterY = min(u32(in.fragCoord.y / tileSize.y), ${numClustersY} - 1u);
    let viewPos = camera.viewMat * vec4f(in.pos, 1.0);
    let depth = max(-viewPos.z, camera.nearPlane);
    let slice = log(depth / camera.nearPlane) / log(camera.farPlane / camera.nearPlane);
    let clusterZ = min(u32(slice * f32(${numClustersZ})), ${numClustersZ} - 1u);
    let clusterIdx = clusterX + clusterY * ${numClustersX} + clusterZ * ${numClustersX} * ${numClustersY};
    let lightCount = clusterSet.clusters[clusterIdx].lightCount;
    if (camera.debugLightCount != 0u) {
        return vec4f(clusterLightHeat(lightCount), 1.0);
    }
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < lightCount; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[i];
        totalLightContrib += calculateLightContrib(lightSet.lights[lightIdx], in.pos, normalize(in.nor));
    }
    return vec4(diffuseColor.rgb * totalLightContrib, 1);
}