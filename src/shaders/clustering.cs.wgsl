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

@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

fn screenToView(screenPos: vec2f) -> vec3f {
    let clipPos = vec4f(screenPos, 1.0, 1.0);
    let viewPos = cameraUniforms.inverseProjMat * clipPos;
    return viewPos.xyz / viewPos.w;
}

fn lineIntersectionToZPlane(point_vs: vec3f, zPlane: f32) -> vec3f {
    return point_vs * (zPlane / point_vs.z);
}

fn checkIntersection(lightPos: vec3f, lightRadius: f32, minAABB: vec3f, maxAABB: vec3f) -> bool {
    let closestPoint = clamp(lightPos, minAABB, maxAABB);
    let dist = length(closestPoint - lightPos);
    return dist < lightRadius;
}

@compute
@workgroup_size(${doLightClusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= clusterSet.numClusters) {
        return;
    }
    
    let tileZ = clusterIdx / (${clusterX} * ${clusterY});
    let remainder = clusterIdx % (${clusterX} * ${clusterY});
    let tileY = remainder / ${clusterX};
    let tileX = remainder % ${clusterX};

    // calculating cluster bounds
    let cluster = &clusterSet.clusters[clusterIdx];
    (*cluster).numLights = 0u;

    // calculate screen space bounds
    let deltaX = 2.0 / ${clusterX};
    let deltaY = 2.0 / ${clusterY};

    let minX = -1.0 + f32(tileX) * deltaX;
    let maxX = -1.0 + f32(tileX + 1u) * deltaX;

    let minY = -1.0 + f32(tileY) * deltaY;
    let maxY = -1.0 + f32(tileY + 1u) * deltaY;

    let minBound = vec2(minX, minY);
    let maxBound = vec2(maxX, maxY);

    // calculate the depth bounds for this cluster in Z
    let tileNear = -cameraUniforms.nearPlane * pow(cameraUniforms.farPlane / cameraUniforms.nearPlane, f32(tileZ) / f32(${clusterZ}));
    let tileFar  = -cameraUniforms.nearPlane * pow(cameraUniforms.farPlane / cameraUniforms.nearPlane, f32(tileZ + 1u) / f32(${clusterZ}));
    
    // convert to view-space
    let minBound_vs = screenToView(minBound).xyz;
    let maxBound_vs = screenToView(maxBound).xyz;
    
    let minPointNear = lineIntersectionToZPlane(minBound_vs, tileNear);
    let minPointFar  = lineIntersectionToZPlane(minBound_vs, tileFar);
    let maxPointNear = lineIntersectionToZPlane(maxBound_vs, tileNear);
    let maxPointFar  = lineIntersectionToZPlane(maxBound_vs, tileFar);

    // store bounding box
    let minAABB = min(min(minPointNear, minPointFar), min(maxPointNear, maxPointFar));
    let maxAABB = max(max(minPointNear, minPointFar), max(maxPointNear, maxPointFar));

    // assigning lights to clusters
    var lightCount: u32 = 0;
    for (var i = 0u; i < lightSet.numLights; i++) {
        // check if the light intersects with the cluster’s bounding box (AABB) 
        let position = lightSet.lights[i].pos;
        let viewPos = (cameraUniforms.viewMat * vec4f(position, 1.0)).xyz;
        let radius = ${lightRadius};

        if (checkIntersection(viewPos, f32(radius), minAABB, maxAABB)) {
            // add the light to the cluster's light list
            // stop adding lights if the maximum number of lights is reached
            if (lightCount < ${maxLightsPerCluster}) {
                (*cluster).lightIndices[lightCount] = i;
                lightCount++;
            }
        }
    }

    (*cluster).numLights = lightCount;
}