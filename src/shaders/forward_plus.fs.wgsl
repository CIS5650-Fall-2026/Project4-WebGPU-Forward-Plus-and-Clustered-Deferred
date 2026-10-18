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

@group(${bindGroup_scene}) @binding(0) var<uniform> camUniform: CameraUniforms;
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

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);
    
    //decide which cluster the fragment is in
    let X = u32(${clusterX});
    let Y = u32(${clusterY});
    let Z = u32(${clusterZ});
    let screenW = camUniform.screenDim.x;
    let screenH = camUniform.screenDim.y;
    let near = camUniform.screenDim.z;
    let far = camUniform.screenDim.w;

    var x = u32(in.fragPos.x / screenW * f32(X));
    var y = u32((1.0 - in.fragPos.y / screenH) * f32(Y));
    let depth = -(camUniform.viewMat * vec4f(in.pos, 1.0)).z;     
    var z = u32(log(depth / near) / log(far / near) * f32(Z));

    x = clamp(x, 0u, X - 1u);
    y = clamp(y, 0u, Y - 1u);
    z = clamp(z, 0u, Z - 1u);

    let dix = x + y * X + z * X * Y;

    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[dix].numLights; lightIdx++) {
        let lightIndex = clusterSet.clusters[dix].lightsIndexes[lightIdx];
        let light = lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    return vec4f(totalLightContrib * diffuseColor.rgb, diffuseColor.a);
}
