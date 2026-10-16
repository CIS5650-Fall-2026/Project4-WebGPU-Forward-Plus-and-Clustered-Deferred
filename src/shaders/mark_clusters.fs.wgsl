@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var depthTex: texture_depth_2d;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> activeClusters: array<atomic<u32>>;

const NX: u32 = ${clusterCountX}u;
const NY: u32 = ${clusterCountY}u;
const NZ: u32 = ${clusterCountZ}u;

@fragment
fn main(@builtin(position) fragPos: vec4f) {
    let depth = textureLoad(depthTex, vec2i(fragPos.xy), 0);

    if (depth < 1.0) {
        let screenUV = fragPos.xy / vec2f(camera.screenWidth, camera.screenHeight);

        let x = u32(clamp(floor(screenUV.x * f32(NX)), 0.0, f32(NX - 1u)));
        let y = u32(clamp(floor(screenUV.y * f32(NY)), 0.0, f32(NY - 1u)));

        let ndc = vec4f(screenUV.x * 2.0 - 1.0, 1.0 - screenUV.y * 2.0, depth, 1.0);
        let viewPos = camera.invProjMat * ndc;
        let depth = clamp(-viewPos.z / viewPos.w, camera.nearZ, camera.farZ);

        let slice = log(depth / camera.nearZ) / log(camera.farZ / camera.nearZ) * f32(NZ);
        let z = u32(clamp(floor(slice), 0.0, f32(NZ - 1u)));

        let clusterIndex = x + y * NX + z * NX * NY;

        atomicStore(&activeClusters[clusterIndex], 1u);
    }
}