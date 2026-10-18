// 3: implement the Clustered Deferred fullscreen fragment shader
// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var gPosition: texture_2d<f32>;
@group(1) @binding(1) var gNormal: texture_2d<f32>;
@group(1) @binding(2) var gAlbedo: texture_2d<f32>;

// after optimization, this shader pass becomes negligible!
@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
    let coord = vec2i(fragPos.xy);
    let depth = textureLoad(gDepth, coord, 0);
    if (depth >= 1.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let g = textureLoad(gBuffer, coord, 0);
    let albedo = unpack4x8unorm(g.y).rgb;
    let pos = transformWorldPos(fragPos.xy, depth, cameraUniforms);
    let nor = octDecode(unpack2x16snorm(g.x));

    let clusterIdx = getClusterIdx(fragPos.xy, pos, cameraUniforms);
    let numLights = clusterSet.clusters[clusterIdx].numLights;

    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < numLights; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    return vec4(albedo.rgb * totalLightContrib, 1.0);
}