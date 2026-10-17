// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@group(0) @binding(0) var<uniform> camUnifs: CameraUniforms;
@group(0) @binding(1) var<uniform> canvasDims: CanvasResolution;
@group(0) @binding(2) var<uniform> clusterInfo: ClusterInfo;
@group(0) @binding(3) var<storage, read> lightSet: LightSet;
@group(0) @binding(4) var<storage, read> lightClusters: LightClusters;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;


struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput, @builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let numX = clusterInfo.numX;
    let numY = clusterInfo.numY;
    let slices = clusterInfo.slices;
    let near = clusterInfo.near;
    let far = clusterInfo.far;
    let w = canvasDims.w;
    let h = canvasDims.h;

    let xTileSize = f32(w) / f32(numX);
    let yTileSize = f32(h) / f32(numY);

    // get xy tile from screen space position 
    let tileX = u32(fragPos.x / xTileSize);
    let tileY = u32(fragPos.y / yTileSize);

    // get z slice
    let viewPos = camUnifs.viewMat * vec4f(in.pos, 1.0);
    let zSlice = u32(log(-viewPos.z / near) / log(far / near) * f32(slices));

    let zIdx = clamp(zSlice, 0u, slices - 1u);

    // cluster index
    let idx = tileX  + tileY * numX + zIdx * numX * numY;

    let lights = lightClusters.clusters[idx].lights;

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < lightClusters.clusters[idx].numLights; lightIdx++) {
        let light = lightSet.lights[lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
