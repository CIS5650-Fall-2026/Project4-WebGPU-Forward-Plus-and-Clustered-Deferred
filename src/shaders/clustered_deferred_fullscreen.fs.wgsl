// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusters: ClusterSet;

@group(${bindGroup_scene}) @binding(3) var posTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var norTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var colorTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);
    let pos = textureLoad(posTex, pixel, 0).xyz;
    let nor = textureLoad(norTex, pixel, 0).xyz;
    let color = textureLoad(colorTex, pixel, 0);

    var totalLightContrib = vec3f(0, 0, 0);

    // in to id.x
    var temp = camera.viewProjMat * vec4f(pos, 1);
    temp /= temp.w;
    let depth = -(camera.viewMat * vec4f(pos, 1)).z;
    let x = min(u32((temp.x + 1) / 2 * ${cluster_dim1}), ${cluster_dim1} - 1);
    let y = min(u32((temp.y + 1) / 2 * ${cluster_dim2}), ${cluster_dim2} - 1);
    let z = min(u32((depth - ${nearPlane}) / (${farPlane} - ${nearPlane}) * ${cluster_dim3}), ${cluster_dim3} - 1);
    let tempIndex = x + y * ${cluster_dim1} + z * ${cluster_dim1} * ${cluster_dim2};
    
    let lightCount = clusters.clusters[tempIndex].numLights;
    for (var lightIdx = 0u; lightIdx < lightCount; lightIdx++) {
        let light = lightSet.lights[clusters.clusters[tempIndex].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = color.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}