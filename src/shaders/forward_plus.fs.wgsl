// 2: implement the Forward+ fragment shader

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
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

const NX: u32 = ${clusterCountX}u;
const NY: u32 = ${clusterCountY}u;
const NZ: u32 = ${clusterCountZ}u;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let screenUV = in.fragPos.xy / vec2f(camera.screenWidth, camera.screenHeight);

    let x = u32(clamp(floor(screenUV.x * f32(NX)), 0.0, f32(NX - 1u)));
    let y = u32(clamp(floor(screenUV.y * f32(NY)), 0.0, f32(NY - 1u)));

    let viewPos = camera.viewMat * vec4f(in.pos, 1.0);
    let depth = clamp(-viewPos.z, camera.nearZ, camera.farZ);

    let slice = log(depth / camera.nearZ) / log(camera.farZ / camera.nearZ) * f32(NZ);
    let z = u32(clamp(floor(slice), 0.0, f32(NZ - 1u)));

    let clusterIndex = x + y * NX + z * NX * NY;

    let lightCount = clusterSet.clusters[clusterIndex].count;
    let normal = normalize(in.nor);
    var totalLightContrib = vec3f(0, 0, 0);

    for (var i = 0u; i < lightCount; i++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];
        let light = lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(light, in.pos, normal);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
