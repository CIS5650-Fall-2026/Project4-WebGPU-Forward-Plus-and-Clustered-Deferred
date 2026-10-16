// CHECKITOUT: light clustering compute shader. Each invocation handles one cluster: it computes the cluster's
// view-space bounding box, then finds every light whose sphere of influence overlaps that box.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// Lights are processed in batches of one light per invocation. Each workgroup transforms a batch into view space once
// and shares it through workgroup memory, so every invocation doesn't have to load and transform every light itself.
var<workgroup> lightPosViewBatch: array<vec3f, ${clusteringWorkgroupSize}>;

// View-space point on the near plane that projects to the given NDC xy.
fn ndcToViewNearPlane(ndc: vec2f) -> vec3f {
    let posView = camera.invProjMat * vec4f(ndc, 0.f, 1.f);
    return posView.xyz / posView.w;
}

// Moves a point along the ray from the camera (the view-space origin) through it until it reaches the given depth.
fn pointAtDepth(pointOnRay: vec3f, depth: f32) -> vec3f {
    return pointOnRay * (depth / -pointOnRay.z);
}

fn sphereIntersectsAabb(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    let closestPoint = clamp(center, aabbMin, aabbMax);
    let closestPointToCenter = center - closestPoint;
    return dot(closestPointToCenter, closestPointToCenter) <= radius * radius;
}

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u, @builtin(local_invocation_index) localIdx: u32) {
    let clusterIdx = globalIdx.x;
    // invocations past the last cluster still have to help load light batches, so they can't return early
    let isValidCluster = clusterIdx < ${numClusters};

    let clusterX = clusterIdx % ${clusterCountX};
    let clusterY = (clusterIdx / ${clusterCountX}) % ${clusterCountY};
    let clusterZ = clusterIdx / (${clusterCountX} * ${clusterCountY});

    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------
    // screen-space bounds of this cluster's tile in NDC (tile row 0 is at the top of the screen, where NDC y = 1)
    let clusterCountXY = vec2f(${clusterCountX}, ${clusterCountY});
    let tileMinUv = vec2f(f32(clusterX), f32(clusterY)) / clusterCountXY;
    let tileMaxUv = vec2f(f32(clusterX + 1), f32(clusterY + 1)) / clusterCountXY;
    let ndcMin = vec2f(tileMinUv.x * 2.f - 1.f, 1.f - tileMaxUv.y * 2.f);
    let ndcMax = vec2f(tileMaxUv.x * 2.f - 1.f, 1.f - tileMinUv.y * 2.f);

    let viewMinOnNearPlane = ndcToViewNearPlane(ndcMin);
    let viewMaxOnNearPlane = ndcToViewNearPlane(ndcMax);

    // depth bounds of this cluster's slice
    let sliceNear = clusterSliceStartDepth(clusterZ, camera.nearPlane, camera.farPlane);
    let sliceFar = clusterSliceStartDepth(clusterZ + 1, camera.nearPlane, camera.farPlane);

    // the part of the tile's frustum between the two depths is bounded by the tile's extreme corners at both depths
    let corner0 = pointAtDepth(viewMinOnNearPlane, sliceNear);
    let corner1 = pointAtDepth(viewMinOnNearPlane, sliceFar);
    let corner2 = pointAtDepth(viewMaxOnNearPlane, sliceNear);
    let corner3 = pointAtDepth(viewMaxOnNearPlane, sliceFar);
    let aabbMin = min(min(corner0, corner1), min(corner2, corner3));
    let aabbMax = max(max(corner0, corner1), max(corner2, corner3));

    // ------------------------------------
    // Assigning lights to clusters:
    // ------------------------------------
    var numClusterLights = 0u;
    let numLights = lightSet.numLights;
    for (var batchStart = 0u; batchStart < numLights; batchStart += ${clusteringWorkgroupSize}) {
        let lightIdx = batchStart + localIdx;
        if (lightIdx < numLights) {
            lightPosViewBatch[localIdx] = (camera.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.f)).xyz;
        }
        workgroupBarrier();

        let batchSize = min(${clusteringWorkgroupSize}, numLights - batchStart);
        for (var i = 0u; i < batchSize; i++) {
            // once the cluster is full, the remaining lights are skipped rather than breaking out of the loop, since a
            // non-uniform break would make the workgroupBarrier() calls fail WGSL's uniformity analysis
            if (numClusterLights < ${maxLightsPerCluster}
                && sphereIntersectsAabb(lightPosViewBatch[i], ${lightRadius}, aabbMin, aabbMax)) {
                if (isValidCluster) {
                    clusterSet.clusters[clusterIdx].lightIndices[numClusterLights] = batchStart + i;
                }
                numClusterLights++;
            }
        }

        // the batch must not be overwritten until every invocation is done reading it
        workgroupBarrier();
    }

    if (isValidCluster) {
        clusterSet.clusters[clusterIdx].numLights = numClusterLights;
    }
}
