@group(0) @binding(0) var gbufferTexture: texture_2d<u32>;
@group(0) @binding(1) var depthTexture: texture_depth_2d;
@group(0) @binding(2) var<storage, read> lightSet: LightSet;
@group(0) @binding(3) var<storage, read> clusterSet: ClusterSet;
@group(0) @binding(4) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(5) var outputTexture: texture_storage_2d<rgba16float, write>;

const TILE_SIZE = ${clusterTileSize}u;
const DEPTH_SLICES = ${clusterDepthSlices}u;
const MAX_LIGHTS_PER_CLUSTER = ${maxLightsPerCluster}u;
const WORKGROUP_SIZE = ${deferredWorkgroupSize}u;

fn decodeOctahedralNormal(oct: vec2f) -> vec3f {
    var normal = vec3f(oct, 1.f - abs(oct.x) - abs(oct.y));
    if (normal.z < 0.f) {
        let folded = (1.f - abs(normal.yx)) * select(
            vec2f(-1.f),
            vec2f(1.f),
            normal.xy >= vec2f(0.f)
        );
        normal = vec3f(folded, normal.z);
    }
    return normalize(normal);
}

@compute @workgroup_size(WORKGROUP_SIZE, WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let screenSize = vec2u(cameraUniforms.viewportAndProjection.xy);
    if (globalId.x >= screenSize.x || globalId.y >= screenSize.y) {
        return;
    }

    let pixel = vec2i(globalId.xy);
    let depth = textureLoad(depthTexture, pixel, 0);
    if (depth >= 1.f) {
        textureStore(outputTexture, pixel, vec4f(0.f, 0.f, 0.f, 1.f));
        return;
    }

    let packedData = textureLoad(gbufferTexture, pixel, 0);
    let normal = decodeOctahedralNormal(unpack2x16snorm(packedData.x));
    let albedo = unpack4x8unorm(packedData.y).rgb;

    let pixelCenter = vec2f(globalId.xy) + vec2f(0.5f);
    let ndc = vec2f(
        pixelCenter.x / f32(screenSize.x) * 2.f - 1.f,
        1.f - pixelCenter.y / f32(screenSize.y) * 2.f
    );
    let worldH = cameraUniforms.invViewProjMat * vec4f(ndc, depth, 1.f);
    let worldPosition = worldH.xyz / worldH.w;

    let gridSize = vec2u(ceil(vec2f(screenSize) / f32(TILE_SIZE)));
    let tileX = min(globalId.x / TILE_SIZE, gridSize.x - 1u);
    let tileY = min(globalId.y / TILE_SIZE, gridSize.y - 1u);
    let viewDepth = -(cameraUniforms.viewMat * vec4f(worldPosition, 1.f)).z;
    let nearPlane = cameraUniforms.depthRange.x;
    let farPlane = cameraUniforms.depthRange.y;
    let depthSlice = u32(clamp(
        floor(log(max(viewDepth, nearPlane) / nearPlane) / log(farPlane / nearPlane)
            * f32(DEPTH_SLICES)),
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
                worldPosition,
                normal
            );
        }
    } else {
        for (var listIdx = 0u; listIdx < clusterLightCount; listIdx++) {
            let lightIdx = clusterSet.data[clusterBase + 1u + listIdx];
            totalLightContrib += calculateLightContrib(
                lightSet.lights[lightIdx],
                worldPosition,
                normal
            );
        }
    }

    textureStore(outputTexture, pixel, vec4f(albedo * totalLightContrib, 1.f));
}
