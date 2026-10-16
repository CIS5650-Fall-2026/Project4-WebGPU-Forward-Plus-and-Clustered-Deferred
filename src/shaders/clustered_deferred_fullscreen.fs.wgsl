// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterGrid: ClusterGrid;
@group(${bindGroup_scene}) @binding(3) var<storage, read> lightIndexList: LightIndexList;

@group(1) @binding(0) var positionTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var albedoTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);

    let position = textureLoad(positionTex, pixel, 0);
    if (position.w == 0.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let posWorld = position.xyz;
    let normal = normalize(textureLoad(normalTex, pixel, 0).xyz);
    let albedo = textureLoad(albedoTex, pixel, 0).rgb;

    let viewPosition = (cameraUniforms.viewMat * vec4f(posWorld, 1.0)).xyz;

    let clusterIndex = getClusterIndex(
        fragPos.xy,
        -viewPosition.z,
        cameraUniforms.screenAndClip
    );

    let offset = clusterGrid.clusters[clusterIndex].offset;
    let count = clusterGrid.clusters[clusterIndex].count;
    if (count == CLUSTER_OVERFLOW) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    var totalLightContrib = vec3f(0.0);

    for (var i = 0u; i < count; i++) {
        let lightIndex = lightIndexList.indices[offset + i];

        totalLightContrib += calculateLightContrib(
            lightSet.lights[lightIndex],
            posWorld,
            normal
        );
    }

    return vec4f(albedo * totalLightContrib, 1.0);
}