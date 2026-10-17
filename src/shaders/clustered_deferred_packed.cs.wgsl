@group(${bindGroup_scene}) @binding(0)
var<uniform> camera: CameraUniforms;

@group(${bindGroup_scene}) @binding(1)
var<storage, read> lightSet: LightSet;

@group(${bindGroup_scene}) @binding(2)
var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0)
var packedTexture: texture_2d<u32>;

@group(1) @binding(1)
var depthTexture: texture_depth_2d;

@group(2) @binding(0)
var outputTexture: texture_storage_2d<OUTPUT_FORMAT, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = textureDimensions(outputTexture);
    if (id.x >= size.x || id.y >= size.y) {
        return;
    }

    let pixel = vec2i(id.xy);
    // Match the pixel centers used by the fragment shader.
    let fragPos = vec2f(id.xy) + vec2f(0.5);
    let sceneDepth = textureLoad(depthTexture, pixel, 0);

    if (sceneDepth >= 1.0) {
        textureStore(outputTexture, pixel, vec4f(0.0, 0.0, 0.0, 1.0));
        return;
    }

    // WebGPU depth is [0, 1]; screen Y points down while NDC Y points up.
    let ndc = vec2f(
        fragPos.x / camera.screenSize.x * 2.0 - 1.0,
        1.0 - fragPos.y / camera.screenSize.y * 2.0
    );
    let world = camera.invViewProjMat * vec4f(ndc, sceneDepth, 1.0);
    let worldPosition = world.xyz / world.w;
    let packed = textureLoad(packedTexture, pixel, 0).xy;
    let normal = decodeOctNormal(unpack2x16snorm(packed.x));
    let albedo = unpack4x8unorm(packed.y).rgb;

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

    textureStore(outputTexture, pixel, vec4f(albedo * totalLightContrib, 1.0));
}
