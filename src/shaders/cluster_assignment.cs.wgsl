@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var depthTexture: texture_depth_2d;
@group(0) @binding(2) var<storage, read_write> occupied: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> pixelClusters: array<u32>;

@compute @workgroup_size(${clusterAssignmentWorkgroupSize}, ${clusterAssignmentWorkgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(depthTexture);
    if (any(id.xy >= size)) {
        return;
    }

    let pixelIndex = id.y * size.x + id.x;
    let depth = textureLoad(depthTexture, vec2i(id.xy), 0);
    // Clear depth denotes background, not geometry in the farthest slice.
    pixelClusters[pixelIndex] = INVALID_CLUSTER;
    if (depth >= 1.f) {
        return;
    }

    let clusterIndex = clusterIndexFromDepth(id.xy, depth, cameraUniforms);
    pixelClusters[pixelIndex] = clusterIndex;
    atomicStore(&occupied[clusterIndex], 1u);
}
