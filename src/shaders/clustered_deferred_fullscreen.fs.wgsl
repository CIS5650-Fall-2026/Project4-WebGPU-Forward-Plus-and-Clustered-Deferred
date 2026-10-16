@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var albedoTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var normalTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var posTex:    texture_2d<f32>;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@fragment 
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {

    // from g-buffer tex 
    let uv = vec2i(fragCoord.xy);
    let albedo = textureLoad(albedoTex, uv, 0);
    let nor    = textureLoad(normalTex, uv, 0).xyz;
    let pos    = textureLoad(posTex, uv , 0).xyz;

    let diffuseColor = albedo;
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // get the cluster 
    let clusterIdx = getClusterFromPt(fragCoord.xy / cameraUniforms.screenSize, pos, 
        cameraUniforms.view, cameraUniforms.near, cameraUniforms.far);

    var totalLightContrib = vec3f(0, 0, 0);
    let numLights = clusterSet.clusters[clusterIdx].numLights;
    for (var i = 0u; i < numLights; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    // return vec4f(f32(numLights) / 40.0);
    return vec4(finalColor, 1);
}