// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.



@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(0) @binding(3) var<uniform> screen: ScreenUniforms;



// Extra Credit: packed albedo and normal, plus separate depth
@group(1) @binding(0) var packedBufferTex: texture_2d<f32>;
@group(1) @binding(1) var depthTex: texture_depth_2d;



struct ScreenUniforms {
    resolution: vec2f
}




const nearPlane: f32 = 0.1;
const farPlane: f32 = 1000.0;

@fragment
fn main(
    @builtin(position) fragCoord: vec4f
) -> @location(0) vec4f {

    
    // Read G-buffer data
    
    let pixel = vec2i(fragCoord.xy);



    let packedData = textureLoad(packedBufferTex, pixel, 0);
    let depth = textureLoad(depthTex, pixel, 0);




    // Background pixels have no geometry
    if (depth >= 1.0) {
        return vec4f(0.0, 0.0, 0.0, 0.0);
    }

    let nor = unpackNormal(packedData.a);

   
    // Reconstruct world-space position
   
    let ndcXY = vec2f(
        fragCoord.x / screen.resolution.x * 2.0 - 1.0,
        1.0 - fragCoord.y / screen.resolution.y * 2.0
    );

    // WebGPU depth values are already in the [0, 1] NDC range
    let ndcPos = vec4f(ndcXY, depth, 1.0);


    let viewHomogeneous = camera.inverseProjMat * ndcPos;
    let posView = viewHomogeneous.xyz / viewHomogeneous.w;

    let worldHomogeneous = camera.inverseViewMat * vec4f(posView, 1.0);
    let posWorld = worldHomogeneous.xyz / worldHomogeneous.w;

    
    // Determine the fragment's cluster


    let clusterX = min(
        u32(fragCoord.x / screen.resolution.x * f32(${clusterCountX})),
        ${clusterCountX}u - 1u
    );



    let clusterY = min(
        u32(fragCoord.y / screen.resolution.y * f32(${clusterCountY})),
        ${clusterCountY}u - 1u
    );




    // Match the logarithmic depth slicing in clustering.cs.wgsl
    let viewDepth = max(-posView.z, nearPlane);
    let depthRatio = farPlane / nearPlane;

    let normalizedDepth = log(viewDepth / nearPlane) / log(depthRatio);

    let clusterZ = min(
        u32(clamp(normalizedDepth, 0.0, 1.0) * f32(${clusterCountZ})),
        ${clusterCountZ}u - 1u
    );


    let clusterIndex = clusterX + clusterY * ${clusterCountX}u + clusterZ * ${clusterCountX}u * ${clusterCountY}u;

    
    // Accumulate lighting from this cluster
  

    let numClusterLights = clusterSet.clusters[clusterIndex].numLights;

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);


    for (var i = 0u; i < numClusterLights; i++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];

        let light = lightSet.lights[lightIndex];

        totalLightContrib += calculateLightContrib(light, posWorld, nor);

    }

    // Same final lighting calculation as Naive and Forward+
    let finalColor = packedData.rgb * totalLightContrib;

    return vec4f(finalColor, 1.0);
}