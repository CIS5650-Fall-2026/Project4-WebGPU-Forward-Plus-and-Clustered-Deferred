@group(${bindGroup_scene}) @binding(0) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUniforms: CameraUniforms;

// TODO-2: implement the light clustering compute shader
fn testSphereAABB(lightPos: vec3f, minPointAABB: vec3f, maxPointAABB: vec3f) -> bool{
    let radius : f32 = ${lightRadius};
    
    let closestPoint = vec3f(clamp(lightPos.x, minPointAABB.x, maxPointAABB.x),
                            clamp(lightPos.y, minPointAABB.y, maxPointAABB.y),
                            clamp(lightPos.z, minPointAABB.z, maxPointAABB.z));

    let xyzDiff = closestPoint - lightPos;
    
    return (xyzDiff.x * xyzDiff.x + xyzDiff.y * xyzDiff.y + xyzDiff.z * xyzDiff.z) <= (radius * radius);
}

fn lineIntersectionToZplane(eye: vec3f, screenPoint: vec3f, zDistance: f32) -> vec3f{
    //all cluster planes are aligned in the same z direction
    let normal = vec3f(0,0,1);

    //line from eye to tile
    let eyeToTile = screenPoint - eye;

    //Intersection length for the line and the plane
    let t = (zDistance - dot(normal, eye)) / dot(normal,eyeToTile);

    //Computing the actual xyz position of the point along the line
    let result = eye + t * eyeToTile;
    return result;

}

fn screenToView(screen: vec4f) -> vec4f{
    let texCoordX = screen.x / cameraUniforms.screenX;
    let texCoordY = screen.y / cameraUniforms.screenY;

    let clip = vec4(vec2(texCoordX, 1.0 - texCoordY) * 2.0 - 1.0, screen.z, screen.w);

    var view = cameraUniforms.invProjMat * clip;

    view = view / view.w;

    return view;
}

@compute
@workgroup_size(${computeClusterWorkgroupSize}, ${computeClusterWorkgroupSize}, ${computeClusterWorkgroupSize}) //4
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    let clusterIdy = globalIdx.y;
    let clusterIdz = globalIdx.z;
    if(clusterIdx >= ${clusterCountsX} || 
        clusterIdy >= ${clusterCountsY} ||
        clusterIdz >= ${clusterCountsZ}){
        return;
    }
    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------
    // For each cluster (X, Y, Z):
    //     - Calculate the screen-space bounds for this cluster in 2D (XY).
    //     - Calculate the depth bounds for this cluster in Z (near and far planes).
    //     - Convert these screen and depth bounds into view-space coordinates.
    //     - Store the computed bounding box (AABB) for the cluster.
    
    let eye = vec3f(0.0);

    let xOffset = cameraUniforms.screenX / ${clusterCountsX};
    let yOffset = cameraUniforms.screenY / ${clusterCountsY};
    let zOffset = (cameraUniforms.farPlane - cameraUniforms.nearPlane) / ${clusterCountsZ};

    //get minmax of each axis in screencoords
    let minX = xOffset * f32(clusterIdx);
    let minY = yOffset * f32(clusterIdy);

    let maxX = minX + xOffset;
    let maxY = minY + yOffset;

    var minZ : f32 = 0;
    var maxZ : f32 = 0;
    if(${useLogarithmicSlices}){ //minZ: near(far/near)^(i/N), maxZ: near(far/near)^((i+1)/N)
        minZ = cameraUniforms.nearPlane * pow((cameraUniforms.farPlane / cameraUniforms.nearPlane), f32(clusterIdz)/f32(${clusterCountsZ}));
        maxZ = cameraUniforms.nearPlane * pow((cameraUniforms.farPlane / cameraUniforms.nearPlane), f32(clusterIdz+1u)/f32(${clusterCountsZ}));
    }
    else{
        minZ = zOffset * f32(clusterIdz) + cameraUniforms.nearPlane;
        maxZ = minZ + zOffset;
    }

    //convert screencoords to view coords
    let viewMin = screenToView(vec4f(minX, minY, 1, 1));
    let viewMax = screenToView(vec4f(maxX, maxY, 1, 1));

    //find intersection points in 
    let minPointNear = lineIntersectionToZplane(eye, viewMin.xyz, -minZ);
    let minPointFar = lineIntersectionToZplane(eye, viewMin.xyz, -maxZ);
    let maxPointNear = lineIntersectionToZplane(eye, viewMax.xyz, -minZ);
    let maxPointFar = lineIntersectionToZplane(eye, viewMax.xyz, -maxZ);
    
    let minPointAABB = min(min(minPointNear, minPointFar),min(maxPointNear, maxPointFar));
    let maxPointAABB = max(max(minPointNear, minPointFar),max(maxPointNear, maxPointFar));

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
    var numLights: u32 = 0;
    let clusterId = clusterIdz * ${clusterCountsY} * ${clusterCountsX} + clusterIdy * ${clusterCountsX} + clusterIdx;

    for(var i : u32 = 0; i < lightSet.numLights; i++){
        let currLight = lightSet.lights[i];
        let lightViewPos = cameraUniforms.viewMat * vec4f(currLight.pos, 1);
        
        //if inside boundingbox
        if(testSphereAABB(lightViewPos.xyz, minPointAABB, maxPointAABB)){
            clusterSet.clusters[clusterId].lightIndicesInCluster[numLights] = i;
            
            numLights++;
            if(numLights == ${maxLightsPerCluster}){
                break;
            }
        }
    }

    clusterSet.clusters[clusterId].numLightsInCluster = numLights;
}

// lightSSPos.x >= minPointAABB.x && lightSSPos.x <= maxPointAABB.x
//             && lightSSPos.y >= minPointAABB.y && lightSSPos.y <= maxPointAABB.y
//             && lightSSPos.z >= minPointAABB.z && lightSSPos.z <= maxPointAABB.z