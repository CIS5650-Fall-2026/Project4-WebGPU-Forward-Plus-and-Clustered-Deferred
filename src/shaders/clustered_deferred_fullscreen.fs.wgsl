// TODO-3: implement the Clustered Deferred fullscreen fragment shader
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(1) @binding(0) var positionTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var albedoTex: texture_2d<f32>;

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
struct FragmentInput {
    @builtin(position) fragCoord: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pixelCoords = vec2i(in.fragCoord.xy);
    let position = textureLoad(positionTex, pixelCoords, 0);

    if (position.w == 0.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let positionWorld = position.xyz;
    let normal = normalize(textureLoad(normalTex, pixelCoords, 0).xyz);
    let albedo = textureLoad(albedoTex, pixelCoords, 0).rgb;

    let clusterX = min(
        u32(floor(
        in.fragCoord.x /
        cameraUniforms.screenSize.x *
        f32(NUM_CLUSTERS_X)
        )),
        NUM_CLUSTERS_X - 1u
    );

    let clusterY = min(
        u32(floor(
        in.fragCoord.y /
        cameraUniforms.screenSize.y *
        f32(NUM_CLUSTERS_Y)
        )),
        NUM_CLUSTERS_Y - 1u
    );

    let positionView = cameraUniforms.viewMat * vec4f(positionWorld, 1.0);

    let viewDepth = -positionView.z;
    let clusterZ = clusterZFromDepthView(viewDepth);
    let clusterIndex = flattenClusterIndex(vec3u(clusterX, clusterY, clusterZ));

    let clusterLightCount = min(clusterSet.clusters[clusterIndex].numLights, MAX_LIGHTS_PER_CLUSTER);
    var totalLightContrib = vec3f(0.0);

    for (var clusterLightIndex = 0u; clusterLightIndex < clusterLightCount; clusterLightIndex++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[clusterLightIndex];
        let light = lightSet.lights[lightIndex];

        totalLightContrib += calculateLightContrib(light, positionWorld, normal);
    }

    let finalColor = albedo * totalLightContrib;
    return vec4f(finalColor, 1.0);
}