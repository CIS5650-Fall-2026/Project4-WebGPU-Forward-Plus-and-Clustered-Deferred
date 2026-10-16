@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(1) @binding(0) var depthTex: texture_depth_2d;

const NX: u32 = ${clusterCountX}u;
const NY: u32 = ${clusterCountY}u;
const NZ: u32 = ${clusterCountZ}u;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
    let depthSample = textureLoad(depthTex, vec2i(fragPos.xy), 0);
    if (depthSample >= 1.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let screenUV = fragPos.xy / vec2f(camera.screenWidth, camera.screenHeight);
    let x = min(u32(screenUV.x * f32(NX)), NX - 1u);
    let y = min(u32(screenUV.y * f32(NY)), NY - 1u);

    let viewPos = camera.invProjMat * vec4f(
        screenUV.x * 2.0 - 1.0, 1.0 - screenUV.y * 2.0, depthSample, 1.0);
    let depth = clamp(-viewPos.z / viewPos.w, camera.nearZ, camera.farZ);
    let slice = log(depth / camera.nearZ) / log(camera.farZ / camera.nearZ) * f32(NZ);
    let z = u32(clamp(floor(slice), 0.0, f32(NZ - 1u)));

    let lightCount = clusterSet.clusters[x + y * NX + z * NX * NY].count;

    let brightness = log2(1.0 + f32(lightCount))
        / log2(1.0 + f32(${maxLightsPerCluster}u));
    return vec4f(vec3f(brightness), 1.0);
}
