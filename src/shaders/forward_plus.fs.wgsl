// CHECKITOUT: same as naive.fs.wgsl, except that each fragment only loops over the lights in its cluster

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

// set at pipeline creation; when false, the debug branch is compiled out
override showClusterLightCounts = false;

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

    let viewDepth = -(camera.viewMat * vec4f(in.pos, 1.f)).z;
    let clusterIdx = clusterIndex(in.fragCoord.xy, viewDepth, camera.screenDims, camera.nearPlane, camera.farPlane);
    // access the cluster through a pointer so that its (large) light index array isn't copied
    let cluster = &clusterSet.clusters[clusterIdx];

    let numClusterLights = (*cluster).numLights;
    if (showClusterLightCounts) {
        return vec4(clusterLightCountColor(numClusterLights) * (0.5f + 0.5f * diffuseColor.rgb), 1);
    }

    let nor = normalize(in.nor);
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < numClusterLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, in.pos, nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
