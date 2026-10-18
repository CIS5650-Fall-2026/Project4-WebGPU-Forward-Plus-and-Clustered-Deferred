// 2: implement the light clustering compute shader

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

fn scaleToDepth(p: vec3f, depth: f32) -> vec3f {
    return p * (-depth / p.z);
}

fn screenToView(ndc: vec2f) -> vec3f {
    let clip = vec4f(ndc, 0.0, 1.0);
    let view = cameraUniforms.invProjMat * clip;

    return view.xyz / view.w;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let X = ${clusterCountX}u;
    let Y = ${clusterCountY}u;
    let Z = ${clusterCountZ}u;

    // manage any extra threads in odd case
    if (id.x >= X || id.y >= Y || id.z >= Z) {
        return;
    }

    let clusterIdx = id.x + id.y * X + id.z * X * Y;

    let gridSize = vec2f(f32(X), f32(Y));

    // convert bounds from screen space to ndc
    let minTile = vec2f(
        f32(id.x), 
        f32(id.y)
    ) / gridSize;

    let maxTile = vec2f(
        f32(id.x + 1u),
        f32(id.y + 1u)
    ) / gridSize;

    // flip y
    let minNDC = vec2f(
        minTile.x * 2.0 - 1.0, 1.0 - maxTile.y * 2.0
    );

    let maxNDC = vec2f(
        maxTile.x * 2.0 - 1.0, 1.0 - minTile.y * 2.0
    );

    // procure a slice
    let near = cameraUniforms.near;
    let far = cameraUniforms.far;
    // let whereveryouare = ...
    let nearZ = near * pow(
        far / near,
        f32(id.z) / f32(Z)
    );

    let farZ = near * pow(
        far / near,
        f32(id.z + 1u) / f32(Z)
    );

    // create boxes from each corner (AABB stuff)
    let box = array<vec2f, 4>(
        minNDC, 
        vec2f(maxNDC.x, minNDC.y),
        vec2f(minNDC.x, maxNDC.y),
        maxNDC
    );

    var minAABB = vec3f(1e30);
    var maxAABB = vec3f(-1e30);

    for (var i = 0u; i < 4u; i++) {
        let p = screenToView(box[i]);
        let np = scaleToDepth(p, nearZ);
        let fp = scaleToDepth(p, farZ);

        minAABB = min(minAABB, min(np, fp));
        maxAABB = max(maxAABB, max(np, fp));
    }

    // conduct a sphere to box test to assign lights 
    var n = 0u;
    let radius = f32(${lightRadius});

    for (var i = 0u; i < lightSet.numLights; i++) {
        let lightView = (
            cameraUniforms.viewMat * vec4f(lightSet.lights[i].pos, 1.0)
        ).xyz;

        let nearest = clamp(lightView, minAABB, maxAABB);
        let dist = nearest - lightView;

        // check if light is within radius
        if (dot(dist, dist) <= radius * radius) {
            clusterSet.clusters[clusterIdx].lightIndices[n] = i;
            n++;

            if (n >= ${maxLightsInCluster}u) {
                break;
            }
        }
    }
    
    clusterSet.clusters[clusterIdx].numLights = n;
}