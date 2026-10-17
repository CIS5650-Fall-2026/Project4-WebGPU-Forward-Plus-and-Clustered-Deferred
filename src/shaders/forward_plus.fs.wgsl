override debugClusters: bool = false;

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(
        diffuseTex,
        diffuseTexSampler,
        in.uv
    );

    if (diffuseColor.a < 0.5) {
        discard;
    }

    let countX = ${clusterCountX}u;
    let countY = ${clusterCountY}u;
    let countZ = ${clusterCountZ}u;

    let clusterX = min(
        u32(in.fragPos.x / camera.screenSize.x * f32(countX)),
        countX - 1u
    );

    let clusterY = min(
        u32(in.fragPos.y / camera.screenSize.y * f32(countY)),
        countY - 1u
    );

    let viewPosition = camera.viewMat * vec4f(in.pos, 1.0);
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

    if (debugClusters) {
        // Stored count is capped at 128; overflow is a separate flag.
        if (clusterSet.clusters[clusterId].overflow != 0u) {
            return vec4f(1.0, 0.0, 1.0, 1.0);
        }
        let count = clusterSet.clusters[clusterId].numLights;
        let t = clamp(f32(count) / f32(${maxLightsPerCluster}), 0.0, 1.0);
        let blue = vec3f(0.0, 0.0, 1.0);
        let cyan = vec3f(0.0, 1.0, 1.0);
        let yellow = vec3f(1.0, 1.0, 0.0);
        let red = vec3f(1.0, 0.0, 0.0);
        var color = mix(blue, cyan, clamp(t * 3.0, 0.0, 1.0));
        color = mix(color, yellow, clamp(t * 3.0 - 1.0, 0.0, 1.0));
        color = mix(color, red, clamp(t * 3.0 - 2.0, 0.0, 1.0));
        return vec4f(color, 1.0);
    }

    let normal = normalize(in.nor);
    var totalLightContrib = vec3f(0.0);

    if (clusterSet.clusters[clusterId].overflow != 0u) {
        for (var i = 0u; i < lightSet.numLights; i += 1u) {
            totalLightContrib += calculateLightContrib(
                lightSet.lights[i],
                in.pos,
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
                in.pos,
                normal
            );
        }
    }

    return vec4f(diffuseColor.rgb * totalLightContrib, 1.0);
}