// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

override debugView: u32 = 0u;

@group(${bindGroup_scene}) @binding(3) var positionTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var normalTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var albedoTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let coord = vec2i(fragPos.xy);
    let pos = textureLoad(positionTex, coord, 0).xyz;
    let nor = textureLoad(normalTex, coord, 0).xyz;
    let albedo = textureLoad(albedoTex, coord, 0);

    var finalColor = vec3f(0, 0, 0);
    if (albedo.a > 0.f) {
        let clusterIdx = clusterIndex(fragPos, pos, cameraUniforms);
        let cluster = &clusterSet.clusters[clusterIdx];
        let numLights = (*cluster).numLights;

        var totalLightContrib = vec3f(0, 0, 0);
        for (var i = 0u; i < numLights; i++) {
            let light = lightSet.lights[(*cluster).lightIndices[i]];
            totalLightContrib += calculateLightContrib(light, pos, nor);
        }

        finalColor = albedo.rgb * totalLightContrib;
        if (debugView == 1u) {
            finalColor = debugLightCountColor(numLights);
        } else if (debugView == 2u) {
            finalColor = albedo.rgb;
        } else if (debugView == 3u) {
            finalColor = nor * 0.5f + 0.5f;
        } else if (debugView == 4u) {
            finalColor = debugPositionColor(pos);
        }
    }

    return vec4(finalColor, 1);
}
