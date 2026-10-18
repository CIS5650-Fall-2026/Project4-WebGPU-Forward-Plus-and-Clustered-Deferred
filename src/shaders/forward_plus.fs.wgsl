@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_scene}) @binding(3) var<storage, read> pixelClusters: array<u32>;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

const CLUSTER_DEBUG_COLORS = false;

fn clusterDebugColor(clusterCoord: vec3u) -> vec3f {
    // X and Y are permuted to make neighboring screen-space clusters distinct.
    // Blue increases with Z, while Z also shifts red and green, so depth-slice
    // transitions are easy to identify. Each (X, Y, Z) tuple is unique.
    let debugX =
        (clusterCoord.x * 11u + clusterCoord.z * 3u) % ${clusterCountX}u;
    let debugY =
        (clusterCoord.y * 7u + clusterCoord.z * 5u) % ${clusterCountY}u;
    let coordinateColor = vec3f(
        f32(debugX) / f32(${clusterCountX}u - 1u),
        f32(debugY) / f32(${clusterCountY}u - 1u),
        f32(clusterCoord.z) / f32(${clusterCountZ}u - 1u)
    );
    return vec3f(0.15f) + coordinateColor * 0.85f;
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor =
        textureSample(diffuseTex, diffuseTexSampler, in.uv);

    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Reuse the exact assignment made from the pre-pass depth sample.
    let pixel = vec2u(in.fragPos.xy);
    let clusterIdx = pixelClusters[pixel.y * u32(cameraUniforms.screenSize.x) + pixel.x];
    if (clusterIdx == INVALID_CLUSTER) {
        return vec4f(0.f);
    }
    let overflow = clusterSet.clusters[clusterIdx].header.y != 0u;
    let numLights = select(clusterSet.clusters[clusterIdx].header.x, lightSet.numLights, overflow);

    // loop over lights in cluster
    var totalLight = vec3f(0.f);
    for (var listIdx = 0u; listIdx < numLights; listIdx++) {
        var lightIdx = listIdx;
        if (!overflow) {
            lightIdx = clusterSet.clusters[clusterIdx].lightIndices[listIdx];
        }
        let light = lightSet.lights[lightIdx];
        totalLight += calculateLightContrib(light, in.pos, normalize(in.nor));
    }
    if (CLUSTER_DEBUG_COLORS) {
        return vec4f(
            clusterDebugColor(clusterCoordFromIndex(clusterIdx)),
            1.f
        );
    }

    return vec4f(diffuseColor.rgb * totalLight, 1.f);
}
