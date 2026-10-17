// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var colTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var positionTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f
{
    let texCoord = vec2i(fragCoord.xy);
    let col = textureLoad(colTex, texCoord, 0);
    if (col.a == 0.0) {
        return vec4f(0, 0, 0, 0);
    }
    let nor = textureLoad(normalTex, texCoord, 0).xyz;
    let pos = textureLoad(positionTex, texCoord, 0).xyz;

    let viewZ = -(camera.viewMat * vec4f(pos, 1.0)).z;
    let cx = min(u32(fragCoord.x / camera.screenSize.x * f32(${clusterX})), ${clusterX} - 1);
    let cy = min(u32((1.0 - fragCoord.y / camera.screenSize.y) * f32(${clusterY})), ${clusterY} - 1);
    let cz = u32(clamp(log(viewZ / camera.near) / log(camera.far / camera.near) * f32(${clusterZ}), 0.0, f32(${clusterZ} - 1)));
    let clusterIdx = cx + cy * ${clusterX} + cz * ${clusterX} * ${clusterY};

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < clusterSet.clusters[clusterIdx].numLights; i++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lightIdxs[i]];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = col.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
