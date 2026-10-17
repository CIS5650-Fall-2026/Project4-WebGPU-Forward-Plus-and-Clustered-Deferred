// CHECKITOUT: same lighting as forward_plus.fs.wgsl, but with the surface attributes read from the G-buffer, so each
// pixel is shaded exactly once no matter how much geometry overlaps it

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gBuffer}) @binding(0) var gBufferPosition: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(1) var gBufferNormal: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(2) var gBufferAlbedo: texture_2d<f32>;

// set at pipeline creation; when false, the debug branch is compiled out
override showClusterLightCounts = false;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragCoord.xy);

    let position = textureLoad(gBufferPosition, pixel, 0);
    if (position.w == 0.f) {
        return vec4f(0, 0, 0, 1); // no geometry was rasterized at this pixel
    }
    let pos = position.xyz;
    let nor = textureLoad(gBufferNormal, pixel, 0).xyz;
    let albedo = textureLoad(gBufferAlbedo, pixel, 0).rgb;

    let viewDepth = -(camera.viewMat * vec4f(pos, 1.f)).z;
    let clusterIdx = clusterIndex(fragCoord.xy, viewDepth, camera.screenDims, camera.nearPlane, camera.farPlane);
    // access the cluster through a pointer so that its (large) light index array isn't copied
    let cluster = &clusterSet.clusters[clusterIdx];

    let numClusterLights = (*cluster).numLights;
    if (showClusterLightCounts) {
        return vec4(clusterLightCountColor(numClusterLights) * (0.5f + 0.5f * albedo), 1);
    }

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < numClusterLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    var finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1);
}
