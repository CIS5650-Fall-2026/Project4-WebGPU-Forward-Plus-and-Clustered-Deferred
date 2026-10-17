@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lights: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusters: ClusterSet;

@group(1) @binding(0) var gbuffPos: texture_2d<f32>;
@group(1) @binding(1) var gbuffNorm: texture_2d<f32>;
@group(1) @binding(2) var gbuffAlbedo: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);

    let pos = textureLoad(gbuffPos, pixel, 0);
    if (pos.w < 0.5f) {
        return vec4f(0, 0, 0, 1);
    }
        let viewPos = cameraUniforms.viewMat * vec4f(pos.xyz, 1);
   
    let albedo = textureLoad(gbuffAlbedo, pixel, 0).rgb;


    let clusterIdx = clusterPixel(fragPos.xy,-viewPos.z, cameraUniforms);
    let cluster = &clusters.clusters[clusterIdx];

//calculate total light contrib
    let normal = textureLoad(gbuffNorm, pixel, 0).xyz;
    //set to 0
    var totalLight = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let lightIdx = (*cluster).lightsIndicesInCluster[i];
        totalLight += calculateLightContrib(lights.lights[lightIdx], pos.xyz, normal);
    }

//multiply by albedo and return
    return vec4f(albedo * totalLight, 1);
}
