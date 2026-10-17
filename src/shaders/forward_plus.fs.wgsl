@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lights: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusters: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(fragmentData: FragmentInput) -> @location(0) vec4f {
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    let norm = normalize(fragmentData.nor);
    let fragPos = vec4f(fragmentData.pos, 1.0);
    let viewPos = cameraUniforms.viewMat * fragPos;
    let fragDep = -viewPos.z;
    let clusterInd = clusterPixel(fragmentData.fragPos.xy, fragDep, cameraUniforms);
        let current = &clusters.clusters[clusterInd];
    

//add contributions from all lights
    for (var i = 0u; i < (*current).numLights; i++) {
        let lightInd = (*current).lightsIndicesInCluster[i];
        let currLight = lights.lights[lightInd];
        totalLightContrib = totalLightContrib + calculateLightContrib(currLight, fragmentData.pos, norm);
    }
    //calkulate the color
    let color = textureSample(diffuseTex, diffuseTexSampler, fragmentData.uv);
    //multiply by calculated lighting
    return vec4f( totalLightContrib * color.rgb, 1.0);
}