// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var albedoTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var normalTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var positionTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f
{
    let pixel = vec2u(fragCoord.xy);
    let albedo = textureLoad(albedoTex, pixel, 0);
    if (albedo.a == 0.0) {
        return vec4f(0, 0, 0, 1); // nothing was drawn at this pixel
    }
    let nor = textureLoad(normalTex, pixel, 0).xyz;
    let pos = textureLoad(positionTex, pixel, 0).xyz;

    let x = min(u32(fragCoord.x / cameraUniforms.screenSize.x * ${clusterCountX}), ${clusterCountX} - 1);
    let y = min(u32((1.0 - fragCoord.y / cameraUniforms.screenSize.y) * ${clusterCountY}), ${clusterCountY} - 1);

    let depth = -(cameraUniforms.viewMat * vec4f(pos, 1.0)).z;
    let near = cameraUniforms.nearPlane;
    let far = cameraUniforms.farPlane;
    let z = min(u32(max(log(depth / near) / log(far / near) * ${clusterCountZ}, 0.0)), ${clusterCountZ} - 1);

    let clusterIdx = x + y * ${clusterCountX} + z * ${clusterCountX} * ${clusterCountY};

    var totalLightContrib = vec3f(0, 0, 0);
    let numLights = clusterSet.clusters[clusterIdx].numLights;
    for (var i = 0u; i < numLights; i++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
