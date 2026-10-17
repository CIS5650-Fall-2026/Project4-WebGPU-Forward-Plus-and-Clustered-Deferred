// marks every cluster that has a visible pixel in the depth prepass

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var depthTex: texture_depth_2d;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterFlags: array<u32>;

@fragment
fn main(@builtin(position) fragPos: vec4f)
{
    let depth = textureLoad(depthTex, vec2i(fragPos.xy), 0);
    if (depth == 1.f) {
        return; // background
    }

    let clusterIdx = clusterIndex(fragPos.xy, viewDepthFromDepth(depth), camera.screenSize);
    // most pixels find their cluster already marked, reading first saves writes
    if (clusterFlags[clusterIdx] == 0u) {
        clusterFlags[clusterIdx] = 1u;
    }
}
