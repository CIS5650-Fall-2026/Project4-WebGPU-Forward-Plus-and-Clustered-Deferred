@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var gBuffer: texture_2d<u32>;
@group(1) @binding(1) var gDepth: texture_depth_2d;
@group(1) @binding(2) var outputTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(outputTex);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    let coord = vec2i(id.xy);
    let p = vec2f(id.xy);
    let depth = textureLoad(gDepth, coord, 0);
    if (depth >= 1.0) {
        textureStore(outputTex, coord, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    let g = textureLoad(gBuffer, coord, 0);
    let nor = octDecode(unpack2x16snorm(g.x));
    let albedo = unpack4x8unorm(g.y).rgb;
    let pos = transformWorldPos(p, depth, cameraUniforms);

    let clusterIdx = getClusterIdx(p + 0.5, pos, cameraUniforms);
    let numLights = clusterSet.clusters[clusterIdx].numLights;

    var total = vec3f(0.0);
    for (var i = 0u; i < numLights; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[i];
        total += calculateLightContrib(lightSet.lights[lightIdx], pos, nor);
    }

    textureStore(outputTex, coord, vec4f(albedo * total, 1.0));
}