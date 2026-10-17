// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var positionTexture: texture_2d<f32>;
@group(1) @binding(1) var normalTexture: texture_2d<f32>;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragCoord: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let pixelCoord = vec2i(in.fragCoord.xy);

    let positionData = textureLoad(positionTexture, pixelCoord, 0);
    let normalData = textureLoad(normalTexture, pixelCoord, 0);
    let albedoData = textureLoad(albedoTexture, pixelCoord, 0);

    if (albedoData.a == 0.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let posWorld = positionData.xyz;
    let normal = normalize(normalData.xyz);

    let clusterCountX = ${clusterCountX}u;
    let clusterCountY = ${clusterCountY}u;
    let clusterCountZ = ${clusterCountZ}u;

    let screenWidth = cameraUniforms.clusteringParams.z;
    let screenHeight = cameraUniforms.clusteringParams.w;

    let clusterX = min(u32(floor(in.fragCoord.x / screenWidth * f32(clusterCountX))), clusterCountX - 1u);
    let clusterY = min(u32(floor(in.fragCoord.y / screenHeight * f32(clusterCountY))), clusterCountY - 1u);

    let viewPos = cameraUniforms.viewMat * vec4f(posWorld, 1.0);
    let depth = max(-viewPos.z, cameraUniforms.clusteringParams.x);

    let nearPlane = cameraUniforms.clusteringParams.x;
    let farPlane = cameraUniforms.clusteringParams.y;
    let depthRatio = farPlane / nearPlane;
    let clusterZFloat = log(depth / nearPlane) / log(depthRatio) * f32(clusterCountZ);
    let clusterZ = u32(clamp(floor(clusterZFloat), 0.0, f32(clusterCountZ - 1u)));

    let clusterIdx = clusterX + clusterY * clusterCountX + clusterZ * clusterCountX * clusterCountY;
    let clusterLightCount = clusterSet.clusters[clusterIdx].numLights;

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

    for (var i = 0u; i < clusterLightCount; i++) {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, posWorld, normal);
    }

    let finalColor = albedoData.rgb * totalLightContrib;
    return vec4f(finalColor, 1.0);
}