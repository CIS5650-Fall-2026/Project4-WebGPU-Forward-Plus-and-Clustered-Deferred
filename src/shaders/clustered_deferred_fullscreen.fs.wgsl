// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

// textures from gbuf
@group(1) @binding(0) var albedoTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var depthTex: texture_depth_2d;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragPos.xy);
    let diffuseColor = textureLoad(albedoTex, pixel, 0);
    let normalWorld = normalize(textureLoad(normalTex, pixel, 0).xyz);
    let depthValue = textureLoad(depthTex, pixel, 0);

    if (depthValue >= 1.0) {
        return vec4f(0, 0, 0, 1);
    }

    // viewspace pos from depth
    let ndc = vec2f(2 * fragPos.x / camera.screenSize.x - 1, 1 - 2 * fragPos.y / camera.screenSize.y);

    let viewPos4 = camera.invProjMat * vec4f(ndc, depthValue, 1);
    let viewPos = viewPos4.xyz / viewPos4.w;

    let normalView = normalize((camera.viewMat * vec4f(normalWorld, 0)).xyz);

    let x = min(u32(fragPos.x / camera.screenSize.x * ${clustersX}), ${clustersX} - 1u);
    let y = min(u32(fragPos.y / camera.screenSize.y * ${clustersY}), ${clustersY} - 1u);

    let depth = clamp(-viewPos.z, ${nearPlane}, ${farPlane});
    let sliceDepth = (${farPlane} - ${nearPlane}) / ${clustersZ};

    let z = min(u32((depth - ${nearPlane}) / sliceDepth), ${clustersZ} - 1u);

    let clusterIdx = x + y * ${clustersX} + z * ${clustersX} * ${clustersY};

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < clusterSet.clusters[clusterIdx].numLights; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lights[i];
        let light = lightSet.lights[lightIdx];

        let lightView = Light((camera.viewMat * vec4f(light.pos, 1)).xyz, light.color);

        totalLightContrib += calculateLightContrib(lightView, viewPos, normalView);
    }

    let finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4f(finalColor, 1);
}
