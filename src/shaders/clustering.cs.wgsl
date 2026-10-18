@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<storage, read_write> activeClusters: ActiveClusters;

fn viewRayFromPixelEdge(pixel: vec2f) -> vec3f {
    let uv = pixel / cameraUniforms.screenSize;
    let ndc = vec2f(uv.x * 2.f - 1.f, 1.f - uv.y * 2.f);
    let viewH = cameraUniforms.invProjMat * vec4f(ndc, 1.f, 1.f);
    return normalize(viewH.xyz / viewH.w);
}

fn makeSidePlane(rayA: vec3f, rayB: vec3f, insideRay: vec3f) -> vec4f {
    var normal = normalize(cross(rayA, rayB));
    if (dot(normal, insideRay) < 0.f) {
        normal = -normal;
    }
    return vec4f(normal, 0.f);
}

@compute
@workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= atomicLoad(&activeClusters.count)) {
        return;
    }
    let clusterIdx = activeClusters.indices[id.x];
    let clusterCoord = clusterCoordFromIndex(clusterIdx);
    let clusterCounts = vec3u(
        ${clusterCountX}u,
        ${clusterCountY}u,
        ${clusterCountZ}u
    );

    // Bounds are implicit in the cluster ID, independent of scene geometry.
    let clusterMinPixel =
        vec2f(clusterCoord.xy) * cameraUniforms.screenSize /
        vec2f(clusterCounts.xy);
    let clusterMaxPixel =
        vec2f(clusterCoord.xy + vec2u(1u)) * cameraUniforms.screenSize /
        vec2f(clusterCounts.xy);

    let minDepth = clusterDepthBoundary(clusterCoord.z, cameraUniforms);
    let maxDepth = clusterDepthBoundary(clusterCoord.z + 1u, cameraUniforms);

    let topLeft = viewRayFromPixelEdge(clusterMinPixel);
    let topRight = viewRayFromPixelEdge(
        vec2f(clusterMaxPixel.x, clusterMinPixel.y)
    );
    let bottomLeft = viewRayFromPixelEdge(
        vec2f(clusterMinPixel.x, clusterMaxPixel.y)
    );
    let bottomRight = viewRayFromPixelEdge(clusterMaxPixel);
    let insideRay = viewRayFromPixelEdge(
        (clusterMinPixel + clusterMaxPixel) * 0.5f
    );

    var frustumPlanes: array<vec4f, 6>;
    frustumPlanes[0] = makeSidePlane(topLeft, bottomLeft, insideRay);
    frustumPlanes[1] = makeSidePlane(bottomRight, topRight, insideRay);
    frustumPlanes[2] = makeSidePlane(topRight, topLeft, insideRay);
    frustumPlanes[3] = makeSidePlane(bottomLeft, bottomRight, insideRay);
    frustumPlanes[4] = vec4f(0.f, 0.f, -1.f, -minDepth);
    frustumPlanes[5] = vec4f(0.f, 0.f, 1.f, maxDepth);

    var intersectingLightCount = 0u;
    var overflow = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        let centerView = (cameraUniforms.viewMat * vec4f(light.pos, 1.f)).xyz;

        var intersectsCluster = true;
        for (var planeIdx = 0u; planeIdx < 6u; planeIdx++) {
            let plane = frustumPlanes[planeIdx];
            let signedDistance = dot(plane.xyz, centerView) + plane.w;
            if (signedDistance < -f32(${lightRadius})) {
                intersectsCluster = false;
                break;
            }
        }

        if (intersectsCluster) {
            if (intersectingLightCount == ${maxLightsPerCluster}u) {
                // Shading falls back to all lights instead of silently losing light.
                overflow = 1u;
                break;
            }
            clusterSet.clusters[clusterIdx].lightIndices[intersectingLightCount] = lightIdx;
            intersectingLightCount++;
        }
    }

    clusterSet.clusters[clusterIdx].header =
        vec4u(intersectingLightCount, overflow, 0u, 0u);
}
