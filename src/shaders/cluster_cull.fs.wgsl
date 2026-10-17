@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(2) var<storage, read_write> activeClusterMask: array<atomic<u32>>;

const TILE_SIZE = ${clusterTileSize}u;
const DEPTH_SLICES = ${clusterDepthSlices}u;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f
}

@fragment
fn main(in: FragmentInput) {
    let pixel = vec2i(in.fragCoord.xy);
    let depth = textureLoad(depthTexture, pixel, 0);
    if (depth >= 1.f) {
        return;
    }

    let screenSize = cameraUniforms.viewportAndProjection.xy;
    let ndc = vec2f(
        in.fragCoord.x / screenSize.x * 2.f - 1.f,
        1.f - in.fragCoord.y / screenSize.y * 2.f
    );
    let worldH = cameraUniforms.invViewProjMat * vec4f(ndc, depth, 1.f);
    let worldPosition = worldH.xyz / worldH.w;
    let viewDepth = -(cameraUniforms.viewMat * vec4f(worldPosition, 1.f)).z;
    let nearPlane = cameraUniforms.depthRange.x;
    let farPlane = cameraUniforms.depthRange.y;
    let depthSlice = u32(clamp(
        floor(log(max(viewDepth, nearPlane) / nearPlane) / log(farPlane / nearPlane)
            * f32(DEPTH_SLICES)),
        0.f,
        f32(DEPTH_SLICES - 1u)
    ));
    let gridSize = vec2u(ceil(screenSize / f32(TILE_SIZE)));
    let tileX = min(u32(pixel.x) / TILE_SIZE, gridSize.x - 1u);
    let tileY = min(u32(pixel.y) / TILE_SIZE, gridSize.y - 1u);
    let clusterIdx = (depthSlice * gridSize.y + tileY) * gridSize.x + tileX;
    atomicStore(&activeClusterMask[clusterIdx], 1u);
}
