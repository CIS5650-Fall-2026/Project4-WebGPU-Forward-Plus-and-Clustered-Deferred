// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gBuffers}) @binding(0) var positionTex: texture_2d<f32>;
@group(${bindGroup_gBuffers}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gBuffers}) @binding(2) var albedoTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixelCoord = vec2i(fragPos.xy);
    let worldPos = textureLoad(positionTex, pixelCoord, 0).xyz;
    let normal = textureLoad(normalTex, pixelCoord, 0).xyz;
    let albedo = textureLoad(albedoTex, pixelCoord, 0);

    if (albedo.a < 0.5f){
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let viewPos = cameraUniforms.viewMat * vec4(worldPos, 1);
    let viewZ = -viewPos.z;

    let clusterIdx = getClusterIndex(fragPos.xy, viewZ, cameraUniforms);
    let cluster = &clusterSet.clusters[clusterIdx];
    let lightCount = (*cluster).numLights;

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < lightCount; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
