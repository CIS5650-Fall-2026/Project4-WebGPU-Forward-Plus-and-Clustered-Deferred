@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn pointAtDepth(uv: vec2f, depth: f32) -> vec3f {
    let ndc = vec2f(
        uv.x * 2.0 - 1.0,
        1.0 - uv.y * 2.0
    );

    let projected = camera.invProjMat * vec4f(ndc, 0.0, 1.0);
    let viewPoint = projected.xyz / projected.w;

    return viewPoint * (depth / -viewPoint.z);
}

@compute @workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let countX = ${clusterCountX}u;
    let countY = ${clusterCountY}u;
    let countZ = ${clusterCountZ}u;
    let clusterId = globalId.x;

    if (clusterId >= countX * countY * countZ) {
        return;
    }

    let x = clusterId % countX;
    let y = (clusterId / countX) % countY;
    let z = clusterId / (countX * countY);

    let uvMin = vec2f(
        f32(x) / f32(countX),
        f32(y) / f32(countY)
    );

    let uvMax = vec2f(
        f32(x + 1u) / f32(countX),
        f32(y + 1u) / f32(countY)
    );

    let depthRatio = camera.farPlane / camera.nearPlane;

    let nearDepth = camera.nearPlane * pow(
        depthRatio,
        f32(z) / f32(countZ)
    );

    let farDepth = camera.nearPlane * pow(
        depthRatio,
        f32(z + 1u) / f32(countZ)
    );

    let corners = array<vec3f, 8>(
        pointAtDepth(vec2f(uvMin.x, uvMin.y), nearDepth),
        pointAtDepth(vec2f(uvMax.x, uvMin.y), nearDepth),
        pointAtDepth(vec2f(uvMin.x, uvMax.y), nearDepth),
        pointAtDepth(vec2f(uvMax.x, uvMax.y), nearDepth),
        pointAtDepth(vec2f(uvMin.x, uvMin.y), farDepth),
        pointAtDepth(vec2f(uvMax.x, uvMin.y), farDepth),
        pointAtDepth(vec2f(uvMin.x, uvMax.y), farDepth),
        pointAtDepth(vec2f(uvMax.x, uvMax.y), farDepth)
    );

    var boundsMin = corners[0];
    var boundsMax = corners[0];

    for (var i = 1u; i < 8u; i += 1u) {
        boundsMin = min(boundsMin, corners[i]);
        boundsMax = max(boundsMax, corners[i]);
    }

    var numLights = 0u;
    var overflow = 0u;
    let radiusSquared = f32(${lightRadius} * ${lightRadius});

    for (var lightIndex = 0u; lightIndex < lightSet.numLights; lightIndex += 1u) {
        let lightPosition = (
            camera.viewMat * vec4f(lightSet.lights[lightIndex].pos, 1.0)
        ).xyz;

        let closestPoint = clamp(lightPosition, boundsMin, boundsMax);
        let offset = lightPosition - closestPoint;

        if (dot(offset, offset) <= radiusSquared) {
            if (numLights < ${maxLightsPerCluster}u) {
                clusterSet.clusters[clusterId].lightIndices[numLights] = lightIndex;
                numLights += 1u;
            } else {
                overflow = 1u;
                break;
            }
        }
    }

    clusterSet.clusters[clusterId].numLights = numLights;
    clusterSet.clusters[clusterId].overflow = overflow;
}