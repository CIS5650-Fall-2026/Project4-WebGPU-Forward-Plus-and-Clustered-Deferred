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
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterGrid: ClusterGrid;
@group(${bindGroup_scene}) @binding(3) var<storage, read> lightIndexList: LightIndexList;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5) {
        discard;
    }

    let viewPosition = (cameraUniforms.viewMat * vec4f(in.pos, 1.0)).xyz;

    let clusterIndex = getClusterIndex(
        in.fragPos.xy,
        -viewPosition.z,
        cameraUniforms.screenAndClip
    );

    let offset = clusterGrid.clusters[clusterIndex].offset;
    let count = clusterGrid.clusters[clusterIndex].count;

    if (count == CLUSTER_OVERFLOW) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    if (${forwardPlusDebugMode} == 1) {
        let heatmapMax = 512.0;

        let t = clamp(
            log2(1.0 + f32(count)) / log2(1.0 + heatmapMax),
            0.0,
            1.0
        );

        let c0 = vec3f(0.05, 0.02, 0.20);
        let c1 = vec3f(0.00, 0.30, 1.00);
        let c2 = vec3f(0.00, 0.90, 0.65);
        let c3 = vec3f(1.00, 0.85, 0.00);
        let c4 = vec3f(1.00, 0.08, 0.02);

        var color: vec3f;

        if (t < 0.25) {
            color = mix(c0, c1, t * 4.0);
        } else if (t < 0.5) {
            color = mix(c1, c2, (t - 0.25) * 4.0);
        } else if (t < 0.75) {
            color = mix(c2, c3, (t - 0.5) * 4.0);
        } else {
            color = mix(c3, c4, (t - 0.75) * 4.0);
        }

        return vec4f(color, 1.0);
    }

    let normal = normalize(in.nor);
    var totalLightContrib = vec3f(0.0);

    for (var i = 0u; i < count; i++) {
        let lightIndex = lightIndexList.indices[offset + i];

        totalLightContrib += calculateLightContrib(
            lightSet.lights[lightIndex],
            in.pos,
            normal
        );
    }

    let forwardColor = diffuseColor.rgb * totalLightContrib;
    return vec4f(forwardColor, 1.0);
}