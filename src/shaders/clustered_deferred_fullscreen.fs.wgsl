// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(2) var positionTex: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f, // xy in pixels
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    // --- SAMPLE GBUFFER ---
    let xy = vec2i(in.fragPos.xy);
    let diffuseColor: vec4f = textureLoad(albedoTex, xy, 0);
    let normal: vec3f = textureLoad(normalTex, xy, 0).xyz;
    let position: vec3f = textureLoad(positionTex, xy, 0).xyz;

    // --- INDEX CLUSTERSET ---
    // Get depth in view space
    let viewDepth = -(camera.viewMat * vec4f(position, 1.f)).z;
    
    // Get index into clusterSet.clusters
    let cN: vec3u = getClusterIndices(in.fragPos.xy, viewDepth, camera);
    let clusterIdx = getClusterIndex(cN.x, cN.y, cN.z);

    let lightCnt = clusterSet.clusters[clusterIdx].numLights;

    // --- DEBUG VIEWS ---
    switch (${debugView}) {
        case 1: {
            return vec4f(f32(cN.x) / ${xClusterCnt}, f32(cN.y) / ${yClusterCnt}, f32(cN.z) / ${zClusterCnt}, 1.f);
        }
        case 2: {
            return vec4f(vec3f(f32(lightCnt) / f32(${maxLightsPerCluster})), 1.f);
        }
        case 3: {
            if (lightCnt >= ${maxLightsPerCluster}) {
                return vec4f(1.f, 0.f, 0.f, 1.f);
            }
        }
        default: {}
    }

    // --- SHADING ---
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < lightCnt; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightsIdx[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position, normalize(normal));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
