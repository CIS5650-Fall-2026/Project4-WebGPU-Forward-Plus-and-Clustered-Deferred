// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_gbuffer}) @binding(0) var positionTexture: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(1) var albedoTexture: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(2) var normalTexture: texture_2d<f32>;

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;

@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterData: ClusterData;

struct FragmentInput {
    @location(0) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{

    let dimensions = textureDimensions(albedoTexture);
    let pixel = vec2i(in.uv * vec2f(dimensions));

    let albedo = textureLoad(albedoTexture, pixel, 0);
    let position = textureLoad(positionTexture, pixel, 0).xyz;
    let normal = textureLoad(normalTexture, pixel, 0).xyz;

    if (albedo.a < 0.5f) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);
    
    // determine which cluster contains the current fragment
    let clusterIndex = getClusterIndex(position, clusterData.dim, camera);
    let nLights = clusterData.clusters[clusterIndex].numLights;

    var test : f32 = 0.0;

    for (var lightIdx = 0u; lightIdx < nLights; lightIdx++) {

        test += 0.05;

        // access light using index in cluster data
        let light = lightSet.lights[clusterData.clusters[clusterIndex].lights[lightIdx]];

        totalLightContrib += calculateLightContrib(light, position, normalize(normal));
    }

    let finalColor = albedo.rgb * totalLightContrib;

    return vec4(finalColor, 1);
}
