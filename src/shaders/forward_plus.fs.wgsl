@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

const TILE_SIZE = ${clusterTileSize}u;
const DEPTH_SLICES = ${clusterDepthSlices}u;
const MAX_LIGHTS_PER_CLUSTER = ${maxLightsPerCluster}u;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let screenSize = cameraUniforms.viewportAndProjection.xy;
    let gridSize = vec2u(ceil(screenSize / f32(TILE_SIZE)));
    let tileX = min(u32(in.fragCoord.x) / TILE_SIZE, gridSize.x - 1u);
    let tileY = min(u32(in.fragCoord.y) / TILE_SIZE, gridSize.y - 1u);
    let viewDepth = -(cameraUniforms.viewMat * vec4f(in.pos, 1.f)).z;
    let nearPlane = cameraUniforms.depthRange.x;
    let farPlane = cameraUniforms.depthRange.y;
    let depthScale = log(farPlane / nearPlane);
    let depthSlice = u32(clamp(
        floor(log(max(viewDepth, nearPlane) / nearPlane) / depthScale * f32(DEPTH_SLICES)),
        0.f,
        f32(DEPTH_SLICES - 1u)
    ));
    let clusterIdx = (depthSlice * gridSize.y + tileY) * gridSize.x + tileX;
    let clusterStride = MAX_LIGHTS_PER_CLUSTER + 1u;
    let clusterBase = clusterIdx * clusterStride;
    let clusterLightCount = clusterSet.data[clusterBase];

    var totalLightContrib = vec3f(0.f);
    if (clusterLightCount > MAX_LIGHTS_PER_CLUSTER) {
        for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
            totalLightContrib += calculateLightContrib(
                lightSet.lights[lightIdx],
                in.pos,
                normalize(in.nor)
            );
        }
    } else {
        for (var listIdx = 0u; listIdx < clusterLightCount; listIdx++) {
            let lightIdx = clusterSet.data[clusterBase + 1u + listIdx];
            totalLightContrib += calculateLightContrib(
                lightSet.lights[lightIdx],
                in.pos,
                normalize(in.nor)
            );
        }
    }

    return vec4f(diffuseColor.rgb * totalLightContrib, 1.f);
}
