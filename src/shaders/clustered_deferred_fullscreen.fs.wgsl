// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuffer}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gbuffer}) @binding(2) var depthTex: texture_depth_2d;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let pixel = vec2i(floor(fragCoord.xy));

    let depth = textureLoad(depthTex, pixel, 0);
    if (depth >= 1.0) {
        return vec4f(0, 0, 0, 1);
    }

    let albedo = textureLoad(albedoTex, pixel, 0).rgb;
    let nor = textureLoad(normalTex, pixel, 0).xyz;

    let uv = fragCoord.xy / vec2f(textureDimensions(depthTex));
    let ndc = vec3f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth);

    // NDC -> world
    let worldH = camera.invViewProjMat * vec4f(ndc, 1.0);
    let pos = worldH.xyz / worldH.w;

    let clusterIdx = clusterIndexFromWorldPos(pos, camera.viewProjMat, camera.viewMat, camera.nearPlane, camera.farPlane);
    let cluster = &clusterSet.clusters[clusterIdx];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }
    return vec4f(albedo * totalLightContrib, 1.0);
}
