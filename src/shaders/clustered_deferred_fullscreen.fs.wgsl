@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var positionTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var normalTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var albedoTexture: texture_2d<f32>;

@group(${bindGroup_scene}) @binding(6) var<storage, read> pixelClusters: array<u32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixelCoord = vec2i(fragPos.xy);
    let albedo = textureLoad(albedoTexture, pixelCoord, 0);

    // The albedo buffer is cleared to transparent black, so an alpha below the
    // material cutoff identifies pixels not covered by scene geometry.
    if (albedo.a < 0.5f) {
        return vec4f(0.f);
    }

    let worldPosition = textureLoad(positionTexture, pixelCoord, 0).xyz;
    let worldNormal = normalize(textureLoad(normalTexture, pixelCoord, 0).xyz);

    // Never derive the cluster from the half-float G-buffer position: rounding
    // near slice boundaries can otherwise select a cluster marked empty.
    let clusterIndex = pixelClusters[u32(pixelCoord.y) * u32(cameraUniforms.screenSize.x) + u32(pixelCoord.x)];
    if (clusterIndex == INVALID_CLUSTER) {
        return vec4f(0.f);
    }
    let overflow = clusterSet.clusters[clusterIndex].header.y != 0u;
    let numLights = select(clusterSet.clusters[clusterIndex].header.x, lightSet.numLights, overflow);

    var totalLight = vec3f(0.f);
    for (var listIndex = 0u; listIndex < numLights; listIndex++) {
        var lightIndex = listIndex;
        if (!overflow) {
            lightIndex = clusterSet.clusters[clusterIndex].lightIndices[listIndex];
        }
        let light = lightSet.lights[lightIndex];
        totalLight += calculateLightContrib(light, worldPosition, worldNormal);
    }

    return vec4f(albedo.rgb * totalLight, 1.f);
}
