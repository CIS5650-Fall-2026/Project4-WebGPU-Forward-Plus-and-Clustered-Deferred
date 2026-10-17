@group(${bindGroup_scene}) @binding(0)
var<uniform> camera: CameraUniforms;

@group(${bindGroup_scene}) @binding(1)
var<storage, read> lightSet: LightSet;

@group(${bindGroup_scene}) @binding(2)
var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0)
var positionTexture: texture_2d<f32>;

@group(1) @binding(1)
var normalTexture: texture_2d<f32>;

@group(1) @binding(2)
var albedoTexture: texture_2d<f32>;

@fragment
fn main(
    @builtin(position) fragPos: vec4f
) -> @location(0) vec4f {
    let pixel = vec2i(fragPos.xy);
    let positionData = textureLoad(positionTexture, pixel, 0);

    if (positionData.w < 0.5) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let worldPosition = positionData.xyz;
    let normal = normalize(textureLoad(normalTexture, pixel, 0).xyz);
    let albedo = textureLoad(albedoTexture, pixel, 0).rgb;

    let countX = ${clusterCountX}u;
    let countY = ${clusterCountY}u;
    let countZ = ${clusterCountZ}u;

    let clusterX = min(
        u32(fragPos.x / camera.screenSize.x * f32(countX)),
        countX - 1u
    );

    let clusterY = min(
        u32(fragPos.y / camera.screenSize.y * f32(countY)),
        countY - 1u
    );

    let viewPosition = camera.viewMat * vec4f(worldPosition, 1.0);
    let depth = clamp(
        -viewPosition.z,
        camera.nearPlane,
        camera.farPlane
    );

    let depthFraction =
        log(depth / camera.nearPlane) /
        log(camera.farPlane / camera.nearPlane);

    let clusterZ = min(
        u32(depthFraction * f32(countZ)),
        countZ - 1u
    );

    let clusterId =
        clusterX +
        clusterY * countX +
        clusterZ * countX * countY;

    var totalLightContrib = vec3f(0.0);

    if (clusterSet.clusters[clusterId].overflow != 0u) {
        for (var i = 0u; i < lightSet.numLights; i += 1u) {
            totalLightContrib += calculateLightContrib(
                lightSet.lights[i],
                worldPosition,
                normal
            );
        }
    } else {
        let numLights = clusterSet.clusters[clusterId].numLights;

        for (var i = 0u; i < numLights; i += 1u) {
            let lightIndex =
                clusterSet.clusters[clusterId].lightIndices[i];

            totalLightContrib += calculateLightContrib(
                lightSet.lights[lightIndex],
                worldPosition,
                normal
            );
        }
    }

    return vec4f(albedo * totalLightContrib, 1.0);
}