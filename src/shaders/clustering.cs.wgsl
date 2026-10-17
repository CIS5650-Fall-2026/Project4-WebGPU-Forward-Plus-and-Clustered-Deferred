// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

struct AABB {
	min: vec3f,
	max: vec3f
}

@group(0) @binding(0) var<uniform> camUnifs: CameraUniforms;
@group(0) @binding(1) var<uniform> canvasRes: CanvasResolution;
@group(0) @binding(2) var<uniform> clusterInfo: ClusterInfo;
@group(0) @binding(3) var<storage, read_write> clusters: array<AABB>;

@compute @workgroup_size(4, 4, 4)
fn build_clusters(@builtin(global_invocation_id) index: vec3u) {

	let numX = clusterInfo.numX;
	let numY = clusterInfo.numY;
	let slices = clusterInfo.slices;
	let near = clusterInfo.near;
	let far = clusterInfo.far;
	let w = canvasRes.w;
	let h = canvasRes.h;

	if (index.x < numX && index.y < numY && index.z < slices) {
		let tileSize = vec2f(f32(w) / f32(numX), f32(h) / f32(numY));

		// screen space bounds
		let pxMin = vec2f(f32(index.x) * tileSize.x, f32(index.y) * tileSize.y);
		let pxMax = vec2f(f32(index.x + 1u) * tileSize.x, f32(index.y + 1u) * tileSize.y);

		// undo viewport transform 
		let ndcMin = vec2f((pxMin.x / f32(w)) * 2.0 - 1.0, 1.0 - (pxMin.y / f32(h)) * 2.0);
		let ndcMax = vec2f((pxMax.x / f32(w)) * 2.0 - 1.0, 1.0 - (pxMax.y / f32(h)) * 2.0);

		// calculate depth slice
		let ratio = far / near;
		let minZ = near * pow(ratio, f32(index.z) / f32(slices));
		let maxZ = near * pow(ratio, f32(index.z + 1u) / f32(slices));

		var aabbMin = vec3f(1e30);
		var aabbMax = vec3f(-1e30);

		let corners = array<vec2f, 4>(
			vec2f(ndcMin.x, ndcMin.y), 
			vec2f(ndcMax.x, ndcMin.y),
			vec2f(ndcMin.x, ndcMax.y),
			vec2f(ndcMax.x, ndcMax.y)
		);

		for (var i = 0u; i < 4u; i++) {
			let undoPersp = camUnifs.invProjMat * vec4f(corners[i], 0.0, 1.0);
			let view = undoPersp.xyz / undoPersp.w;

			let pNear = view * (minZ / -view.z); // along view on near plane
			let pFar = view * (maxZ / -view.z); // along view on far plane 

			aabbMin = min(aabbMin, min(pNear, pFar));
			aabbMax = max(aabbMax, max(pNear, pFar));
		}

		let idx = index.x + index.y * numX + index.z * numX * numY;
		clusters[idx] = AABB(aabbMin, aabbMax);
	}
}

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

struct LightInfo {
	numX: u32,
	numY: u32,
	slices: u32,
	maxLights: u32
}

@group(0) @binding(0) var<uniform> camUnifs1: CameraUniforms;
@group(0) @binding(1) var<uniform> lightInfo: LightInfo;
@group(0) @binding(2) var<storage, read> lightSet: LightSet;
@group(0) @binding(3) var<storage, read> aabbs: array<AABB>;
@group(0) @binding(4) var<storage, read_write> lightClusters: LightClusters;

fn intersectionTest(pos: vec3f, rad: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
	// if edges of aabb are within radius of center 
	let nearest = clamp(pos, aabbMin, aabbMax); // closest point inside aabb
	let d = nearest - pos;
	return dot(d, d) <= rad * rad;
}

@compute @workgroup_size(4, 4, 4)
fn assign_lights(@builtin(global_invocation_id) index: vec3u) {

	let numX = lightInfo.numX;
	let numY = lightInfo.numY;
	let slices = lightInfo.slices;
	let maxLights = lightInfo.maxLights;
	let radius = f32(${lightRadius});

	if (index.x < numX && index.y < numY && index.z < slices) {
		var count = 0u;

		// load this cluster's aabb
		let idx = index.x + index.y * numX + index.z * numX * numY;
		let aabbMin = aabbs[idx].min;
		let aabbMax = aabbs[idx].max;

		// for each light, check if it intersects
		for (var i = 0u; i < lightSet.numLights; i++) {
			if (count >= maxLights) {break;}

			let light = lightSet.lights[i];
			let viewPos = (camUnifs1.viewMat * vec4f(light.pos, 1.0)).xyz;

			if (intersectionTest(viewPos, radius, aabbMin, aabbMax)) {
				// record light index 
				lightClusters.clusters[idx].lights[count] = u32(i);
				count += 1u;
			}
		}

		// set light count 
		lightClusters.clusters[idx].numLights = u32(count);

	}
}
