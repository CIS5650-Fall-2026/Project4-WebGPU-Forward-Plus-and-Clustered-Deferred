// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_scene}) @binding(3) var positionTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var albedoTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var normalTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(fragCoord.xy);

    let albedo = textureLoad(albedoTex, pixel, 0);
    if (albedo.a == 0) {
        return vec4f(0, 0, 0, 1);
    }
    let pos = textureLoad(positionTex, pixel, 0).xyz;
    let nor = textureLoad(normalTex, pixel, 0).xyz;

    let tile = vec2u(fragCoord.xy / camera.resolution * vec2f(${clusterSizeX}, ${clusterSizeY}));
    let tileX = min(tile.x, ${clusterSizeX}u - 1u);
    let tileY = min(tile.y, ${clusterSizeY}u - 1u);

    let viewDepth = -(camera.viewMat * vec4f(pos, 1)).z;
    let tileZ = clusterSliceFromDepth(viewDepth, camera.nearPlane, camera.farPlane);

    let cluster = &clusterSet.clusters[clusterIndex(tileX, tileY, tileZ)];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < (*cluster).numLights; i++) {
        let light = lightSet.lights[(*cluster).lightIndices[i]];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
