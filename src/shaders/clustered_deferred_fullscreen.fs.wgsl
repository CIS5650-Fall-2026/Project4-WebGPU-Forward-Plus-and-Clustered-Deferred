// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var gBufferPos: texture_2d<f32>;
@group(1) @binding(1) var gBufferNor: texture_2d<f32>;
@group(1) @binding(2) var gBufferAlbedo: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);
    let albedo = textureLoad(gBufferAlbedo, pixel, 0);
    if (albedo.a == 0) {
        return vec4(0, 0, 0, 1);
    }
    let pos = textureLoad(gBufferPos, pixel, 0).xyz;
    let nor = textureLoad(gBufferNor, pixel, 0).xyz;

    let viewDepth = -(cameraUniforms.viewMat * vec4(pos, 1)).z;
    let cluster = &clusterSet.clusters[clusterIdx(fragPos.xy, viewDepth, cameraUniforms.resolution)];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    return vec4(albedo.rgb * totalLightContrib, 1);
}
