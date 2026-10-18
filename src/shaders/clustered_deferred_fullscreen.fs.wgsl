// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(0) @binding(3) var albedoTex: texture_2d<f32>;
@group(0) @binding(4) var normalTex: texture_2d<f32>;
@group(0) @binding(5) var positionTex: texture_2d<f32>;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pixel = vec2i(in.fragCoord.xy);
    let albedo = textureLoad(albedoTex, pixel, 0);
    if (albedo.a < 0.5) {
        discard;
    }

    let normal = textureLoad(normalTex, pixel, 0).xyz;
    let worldPos = textureLoad(positionTex, pixel, 0).xyz;

    let tileSize = vec2f(
        camera.screenSize.x / f32(${numClustersX}),
        camera.screenSize.y / f32(${numClustersY})
    );
    let clusterX = min(u32(in.fragCoord.x / tileSize.x), ${numClustersX} - 1u);
    let clusterY = min(u32(in.fragCoord.y / tileSize.y), ${numClustersY} - 1u);

    let viewPos = camera.viewMat * vec4f(worldPos, 1.0);
    let depth = max(-viewPos.z, camera.nearPlane);
    let slice = log(depth / camera.nearPlane) / log(camera.farPlane / camera.nearPlane);
    let clusterZ = min(u32(slice * f32(${numClustersZ})), ${numClustersZ} - 1u);

    let clusterIdx = clusterX + clusterY * ${numClustersX} + clusterZ * ${numClustersX} * ${numClustersY};
    let lightCount = clusterSet.clusters[clusterIdx].lightCount;
    if (camera.debugLightCount != 0u) {
        return vec4f(clusterLightHeat(lightCount), 1.0);
    }

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var i = 0u; i < lightCount; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[i];
        totalLightContrib += calculateLightContrib(lightSet.lights[lightIdx], worldPos, normalize(normal));
    }

    return vec4f(albedo.rgb * totalLightContrib, 1.0);
}