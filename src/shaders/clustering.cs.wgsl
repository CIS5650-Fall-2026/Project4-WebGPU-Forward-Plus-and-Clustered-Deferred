// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn pointOnViewPlane(ndc: vec2f, depth: f32) -> vec3f {
    let farPoint = cameraUniforms.invProjMat * vec4f(ndc, 1.0, 1.0);
    let viewPoint = farPoint.xyz / farPoint.w;
    return viewPoint * (depth / -viewPoint.z);
}

fn sphereIntersectsAABB(center: vec3f, radius: f32, minPoint: vec3f, maxPoint: vec3f) -> bool {
    let closestPoint = clamp(center, minPoint, maxPoint);
    let difference = center - closestPoint;
    return dot(difference, difference) <= radius * radius;
}

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterCountX = ${clusterCountX}u;
    let clusterCountY = ${clusterCountY}u;
    let clusterCountZ = ${clusterCountZ}u;
    let totalClusters = clusterCountX * clusterCountY * clusterCountZ;

    let clusterIdx = globalIdx.x;
    if (clusterIdx >= totalClusters) {
        return;
    }

    let clustersPerDepthSlice = clusterCountX * clusterCountY;
    let clusterZ = clusterIdx / clustersPerDepthSlice;
    let indexInSlice = clusterIdx % clustersPerDepthSlice;
    let clusterY = indexInSlice / clusterCountX;
    let clusterX = indexInSlice % clusterCountX;

    let xMin = f32(clusterX) / f32(clusterCountX);
    let xMax = f32(clusterX + 1u) / f32(clusterCountX);
    let yMin = f32(clusterY) / f32(clusterCountY);
    let yMax = f32(clusterY + 1u) / f32(clusterCountY);

    let ndcLeft = xMin * 2.0 - 1.0;
    let ndcRight = xMax * 2.0 - 1.0;
    let ndcTop = 1.0 - yMin * 2.0;
    let ndcBottom = 1.0 - yMax * 2.0;

    let nearPlane = cameraUniforms.clusteringParams.x;
    let farPlane = cameraUniforms.clusteringParams.y;
    let depthRatio = farPlane / nearPlane;

    let clusterNear = nearPlane * pow(depthRatio, f32(clusterZ) / f32(clusterCountZ));
    let clusterFar = nearPlane * pow(depthRatio, f32(clusterZ + 1u) / f32(clusterCountZ));

    let nearTopLeft = pointOnViewPlane(vec2f(ndcLeft, ndcTop), clusterNear);
    let nearTopRight = pointOnViewPlane(vec2f(ndcRight, ndcTop), clusterNear);
    let nearBottomLeft = pointOnViewPlane(vec2f(ndcLeft, ndcBottom), clusterNear);
    let nearBottomRight = pointOnViewPlane(vec2f(ndcRight, ndcBottom), clusterNear);

    let farTopLeft = pointOnViewPlane(vec2f(ndcLeft, ndcTop), clusterFar);
    let farTopRight = pointOnViewPlane(vec2f(ndcRight, ndcTop), clusterFar);
    let farBottomLeft = pointOnViewPlane(vec2f(ndcLeft, ndcBottom), clusterFar);
    let farBottomRight = pointOnViewPlane(vec2f(ndcRight, ndcBottom), clusterFar);

    var minPoint = nearTopLeft;
    var maxPoint = nearTopLeft;

    minPoint = min(minPoint, nearTopRight);
    minPoint = min(minPoint, nearBottomLeft);
    minPoint = min(minPoint, nearBottomRight);
    minPoint = min(minPoint, farTopLeft);
    minPoint = min(minPoint, farTopRight);
    minPoint = min(minPoint, farBottomLeft);
    minPoint = min(minPoint, farBottomRight);

    maxPoint = max(maxPoint, nearTopRight);
    maxPoint = max(maxPoint, nearBottomLeft);
    maxPoint = max(maxPoint, nearBottomRight);
    maxPoint = max(maxPoint, farTopLeft);
    maxPoint = max(maxPoint, farTopRight);
    maxPoint = max(maxPoint, farBottomLeft);
    maxPoint = max(maxPoint, farBottomRight);

    clusterSet.clusters[clusterIdx].minPoint = vec4f(minPoint, 0.0);
    clusterSet.clusters[clusterIdx].maxPoint = vec4f(maxPoint, 0.0);

    var clusterLightCount = 0u;

    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let lightViewPos = (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;

        if (sphereIntersectsAABB(lightViewPos, ${lightRadius}, minPoint, maxPoint)) {
            if (clusterLightCount < ${maxLightsPerCluster}u) {
                clusterSet.clusters[clusterIdx].lightIndices[clusterLightCount] = lightIdx;
                clusterLightCount++;
            }
        }
    }

    clusterSet.clusters[clusterIdx].numLights = clusterLightCount;
}