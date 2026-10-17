@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(0) @binding(3) var<storage, read_write> activeClusterMask: array<atomic<u32>>;

const TILE_SIZE = ${clusterTileSize}u;
const DEPTH_SLICES = ${clusterDepthSlices}u;
const MAX_LIGHTS_PER_CLUSTER = ${maxLightsPerCluster}u;
const LIGHT_RADIUS = ${lightRadius}.f;

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let screenSize = cameraUniforms.viewportAndProjection.xy;
    let gridSize = vec2u(ceil(screenSize / f32(TILE_SIZE)));
    let clustersPerLayer = gridSize.x * gridSize.y;
    let totalClusters = clustersPerLayer * DEPTH_SLICES;
    let clusterIdx = globalId.x;
    if (clusterIdx >= totalClusters) {
        return;
    }
    let clusterStride = MAX_LIGHTS_PER_CLUSTER + 1u;
    let clusterBase = clusterIdx * clusterStride;
    if (atomicLoad(&activeClusterMask[clusterIdx]) == 0u) {
        clusterSet.data[clusterBase] = 0u;
        return;
    }

    let depthSlice = clusterIdx / clustersPerLayer;
    let tileIdx = clusterIdx % clustersPerLayer;
    let tileX = tileIdx % gridSize.x;
    let tileY = tileIdx / gridSize.x;

    let pixelMin = vec2f(f32(tileX * TILE_SIZE), f32(tileY * TILE_SIZE));
    let pixelMax = min(pixelMin + f32(TILE_SIZE), screenSize);
    let ndcLeft = pixelMin.x / screenSize.x * 2.f - 1.f;
    let ndcRight = pixelMax.x / screenSize.x * 2.f - 1.f;
    let ndcTop = 1.f - pixelMin.y / screenSize.y * 2.f;
    let ndcBottom = 1.f - pixelMax.y / screenSize.y * 2.f;

    let nearPlane = cameraUniforms.depthRange.x;
    let farPlane = cameraUniforms.depthRange.y;
    let depthScale = pow(farPlane / nearPlane, 1.f / f32(DEPTH_SLICES));
    let nearDepth = nearPlane * pow(depthScale, f32(depthSlice));
    let farDepth = nearPlane * pow(depthScale, f32(depthSlice + 1u));
    let projectionScaleY = cameraUniforms.viewportAndProjection.z;
    let projectionScaleX = projectionScaleY * cameraUniforms.viewportAndProjection.w;

    let xMin = min(
        min(ndcLeft * nearDepth, ndcRight * nearDepth),
        min(ndcLeft * farDepth, ndcRight * farDepth)
    ) * projectionScaleX;
    let xMax = max(
        max(ndcLeft * nearDepth, ndcRight * nearDepth),
        max(ndcLeft * farDepth, ndcRight * farDepth)
    ) * projectionScaleX;
    let yMin = min(
        min(ndcBottom * nearDepth, ndcTop * nearDepth),
        min(ndcBottom * farDepth, ndcTop * farDepth)
    ) * projectionScaleY;
    let yMax = max(
        max(ndcBottom * nearDepth, ndcTop * nearDepth),
        max(ndcBottom * farDepth, ndcTop * farDepth)
    ) * projectionScaleY;
    let boundsMin = vec3f(xMin, yMin, -farDepth);
    let boundsMax = vec3f(xMax, yMax, -nearDepth);

    var lightCount = 0u;
    var overflow = false;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightPosView = (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.f)).xyz;
        let closestPoint = clamp(lightPosView, boundsMin, boundsMax);
        let offset = lightPosView - closestPoint;
        if (dot(offset, offset) <= LIGHT_RADIUS * LIGHT_RADIUS) {
            if (lightCount < MAX_LIGHTS_PER_CLUSTER) {
                clusterSet.data[clusterBase + 1u + lightCount] = lightIdx;
                lightCount += 1u;
            } else {
                overflow = true;
            }
        }
    }

    clusterSet.data[clusterBase] = select(lightCount, MAX_LIGHTS_PER_CLUSTER + 1u, overflow);
}
