// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gBuffer}) @binding(0) var positionTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(2) var albedoTex: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) screenPos: vec4f,
}

const clusterZScale: f32 = f32(${gridDimZ}) / log2(f32(${farPlane}) / f32(${nearPlane}));
const clusterZBias: f32 = -f32(${gridDimZ}) * log2(f32(${nearPlane})) / log2(f32(${farPlane}) / f32(${nearPlane}));

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let texel: vec2i = vec2i(in.screenPos.xy);
    let diffuseColor: vec4f = textureLoad(albedoTex, texel, 0);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let pos: vec4f = textureLoad(positionTex, texel, 0);
    let nor: vec4f = textureLoad(normalTex, texel, 0);

    let zViewDistance: f32 = -vec4f(camera.viewMat * pos).z;
    let zSliceIdx: u32 = min(u32(max(log2(zViewDistance) * clusterZScale + clusterZBias, 0.0)), u32(${gridDimZ}) - 1u);
    let tilePixelDims: vec2f = camera.screenResolution / vec2f(clusterSet.gridDims.xy);
    let tileIdx: vec2u = vec2u(in.screenPos.xy / tilePixelDims);
    let flatClusterIdx = tileIdx.x
        + tileIdx.y * clusterSet.gridDims.x
        + zSliceIdx * clusterSet.gridDims.x * clusterSet.gridDims.y;

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[flatClusterIdx].numLights; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[flatClusterIdx].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, pos.xyz, normalize(nor.xyz));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4f(finalColor, 1.0);
}