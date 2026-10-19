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

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;
@group(${bindGroup_scene}) @binding(0)var<uniform> camera: CameraUniforms;

@group(${bindGroup_scene}) @binding(2)var<storage, read> clusterSet: ClusterSet;

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

    let clip = camera.viewProj * vec4f(in.pos, 1.0);
    let ndc = clip.xy / clip.w;

    let screenUV = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);

    let countX = u32(${clusterCountX});
    let countY = u32(${clusterCountY});
    let countZ = u32(${clusterCountZ});

    let x = min(u32(clamp(screenUV.x, 0.0, 1.0)*f32(countX)),countX - 1u);
    let y = min(u32(clamp(screenUV.y, 0.0, 1.0)*f32(countY)),countY - 1u);

    let viewPos = camera.view*vec4f(in.pos, 1.0);
    let depth = -viewPos.z;

    let near = f32(${cameraNear});
    let far = f32(${cameraFar});
    let depthFraction = log(clamp(depth, near, far) / near) / log(far / near);

    let z = min(u32(floor(depthFraction * f32(countZ))), countZ - 1u);

    let clusterIndex = x + y*countX + z*countX*countY;

    let lightCount = clusterSet.clusters[clusterIndex].numLights;
    //test for checking how many light sources overflow off for now
    /*
    if (lightCount > u32(${maxNumLights})) {
        //return vec4f(1.0, 0.0, 0.0, 1.0);
    }*/
    let normal = normalize(in.nor);
    var totalLightContrib = vec3f(0.0);

    for (var i = 0u; i < lightCount; i++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];

        let light = lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(light, in.pos, normal);
    }

    return vec4f(diffuseColor.rgb*totalLightContrib, 1.0);
}
