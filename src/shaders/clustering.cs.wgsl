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

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterGrid: ClusterGrid;
@group(0) @binding(3) var<storage, read_write> lightIndexList: LightIndexList;
@group(0) @binding(4) var<storage, read_write> lightIndexCounter: LightIndexCounter;

struct ClusterBounds {
    minPoint: vec3f,
    maxPoint: vec3f,
}

const LIGHT_MASK_WORDS: u32 = (${maxNumLights}u + 31u) / 32u;

var<workgroup> lightMask: array<atomic<u32>, LIGHT_MASK_WORDS>;
var<workgroup> localCount: atomic<u32>;
var<workgroup> outputCursor: atomic<u32>;

var<workgroup> globalOffset: u32;
var<workgroup> sharedBounds: ClusterBounds;

fn screenToViewAtDepth(uv: vec2f, depth: f32) -> vec3f {
    let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    let viewH = cameraUniforms.invProjMat * vec4f(ndc, 0.0, 1.0);
    let viewPoint = viewH.xyz / viewH.w;
    return viewPoint * (depth / -viewPoint.z);
}

fn calculateClusterBounds(clusterCoord: vec3u) -> ClusterBounds {
    let gridSize = vec2f(f32(${clusterCountX}), f32(${clusterCountY}));

    let uvMin = vec2f(clusterCoord.xy) / gridSize;
    let uvMax = vec2f(clusterCoord.xy + vec2u(1u)) / gridSize;

    let nearPlane = cameraUniforms.screenAndClip.z;
    let farPlane = cameraUniforms.screenAndClip.w;
    let depthRatio = farPlane / nearPlane;

    let nearDepth = nearPlane * pow(depthRatio, f32(clusterCoord.z) / f32(${clusterCountZ}));
    let farDepth = nearPlane * pow(depthRatio, f32(clusterCoord.z + 1u) / f32(${clusterCountZ}));

    var bounds: ClusterBounds;
    bounds.minPoint = vec3f(1e30);
    bounds.maxPoint = vec3f(-1e30);

    for (var corner = 0u; corner < 4u; corner++) {
        let uv = vec2f(
            select(uvMin.x, uvMax.x, (corner & 1u) != 0u),
            select(uvMin.y, uvMax.y, (corner & 2u) != 0u)
        );

        let nearPoint = screenToViewAtDepth(uv, nearDepth);
        let farPoint = screenToViewAtDepth(uv, farDepth);

        bounds.minPoint = min(bounds.minPoint, min(nearPoint, farPoint));
        bounds.maxPoint = max(bounds.maxPoint, max(nearPoint, farPoint));
    }

    return bounds;
}

fn sphereIntersectsAABB(center: vec3f, radius: f32, bounds: ClusterBounds) -> bool {
    let closestPoint = clamp(center, bounds.minPoint, bounds.maxPoint);
    let delta = center - closestPoint;
    return dot(delta, delta) <= radius * radius;
}

@compute @workgroup_size(${clusteringWorkgroupSize})
fn main(
    @builtin(workgroup_id) clusterCoord: vec3u,
    @builtin(local_invocation_index) localIndex: u32
) {
    let clusterIndex = clusterCoord.x + ${clusterCountX}u * (clusterCoord.y + ${clusterCountY}u * clusterCoord.z);

    for (var word = localIndex; word < LIGHT_MASK_WORDS; word += ${clusteringWorkgroupSize}u )
    {
        atomicStore(&lightMask[word], 0u);
    }

    if (localIndex == 0u) {
        atomicStore(&localCount, 0u);
        atomicStore(&outputCursor, 0u);
        globalOffset = 0u;
        sharedBounds = calculateClusterBounds(clusterCoord);
    }

    workgroupBarrier();

    for (var lightIndex = localIndex; lightIndex < lightSet.numLights; lightIndex += ${clusteringWorkgroupSize}u)
    {
        let lightViewPos = (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIndex].pos, 1.0)).xyz;

        if (sphereIntersectsAABB(lightViewPos, f32(${lightRadius}), sharedBounds)) {
            let wordIndex = lightIndex / 32u;
            let bitIndex = lightIndex % 32u;

            atomicOr(&lightMask[wordIndex], 1u << bitIndex);
            atomicAdd(&localCount, 1u);
        }
    }

    workgroupBarrier();

    if (localIndex == 0u) {
        let count = atomicLoad(&localCount);
        let capacity = arrayLength(&lightIndexList.indices);

        if (count > 0u) {
            let offset = atomicAdd(&lightIndexCounter.nextIndex, count);

            if (offset <= capacity && count <= capacity - offset) {
                globalOffset = offset;

                clusterGrid.clusters[clusterIndex].offset = offset;
                clusterGrid.clusters[clusterIndex].count = count;
            } else {
                globalOffset = CLUSTER_OVERFLOW;

                clusterGrid.clusters[clusterIndex].offset = 0u;
                clusterGrid.clusters[clusterIndex].count = CLUSTER_OVERFLOW;

                atomicMax(&lightIndexCounter.overflowRequired, offset + count);
            }
        } else {
            globalOffset = 0u;

            clusterGrid.clusters[clusterIndex].offset = 0u;
            clusterGrid.clusters[clusterIndex].count = 0u;
        }
    }

    workgroupBarrier();

    if (globalOffset == CLUSTER_OVERFLOW) {
        return;
    }

    for (var lightIndex = localIndex; lightIndex < lightSet.numLights; lightIndex += ${clusteringWorkgroupSize}u) 
    {
        let wordIndex = lightIndex / 32u;
        let bitIndex = lightIndex % 32u;

        let mask = atomicLoad(&lightMask[wordIndex]);

        if ((mask & (1u << bitIndex)) != 0u) {
            let localOffset = atomicAdd(&outputCursor, 1u);
            lightIndexList.indices[globalOffset + localOffset] = lightIndex;
        }
    }
}