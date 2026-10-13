// Extra Credit: compute-based clustered deferred lighting
// Preserves the lighting and position reconstruction used by clustered_deferred_fullscreen.fs.wgsl

struct ScreenUniforms {
    resolution: vec2f
}



@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(0) @binding(3) var<uniform> screen: ScreenUniforms;




// Single-color G-buffer: RGB = albedo, A = packed normal 
@group(1) @binding(0) var packedBufferTex: texture_2d<f32>;
@group(1) @binding(1) var depthTex: texture_depth_2d;



@group(2) @binding(0) var outputTex: texture_storage_2d<${outputTextureFormat}, write>;



const nearPlane: f32 = 0.1;
const farPlane: f32 = 1000.0;




@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let pixel = globalId.xy;
    let dimensions = textureDimensions(outputTex);



    if (pixel.x >= dimensions.x || pixel.y >= dimensions.y) {
        return;
    }



    let pixelCoord = vec2i(pixel);
    let fragCoord = vec2f(pixel) + vec2f(0.5, 0.5);



    let packedData = textureLoad(packedBufferTex, pixelCoord, 0);
    let depth = textureLoad(depthTex, pixelCoord, 0);




    if (depth >= 1.0) {
        textureStore(outputTex, pixelCoord, vec4f(0.0));
        return;
    }

    let nor = unpackNormal(packedData.a);



    let ndcXY = vec2f(
        fragCoord.x / screen.resolution.x * 2.0 - 1.0,
        1.0 - fragCoord.y / screen.resolution.y * 2.0
    );

    let ndcPos = vec4f(ndcXY, depth, 1.0);



    let viewHomogeneous = camera.inverseProjMat * ndcPos;
    let posView = viewHomogeneous.xyz / viewHomogeneous.w;


    let worldHomogeneous = camera.inverseViewMat * vec4f(posView, 1.0);
    let posWorld = worldHomogeneous.xyz / worldHomogeneous.w;



    let clusterX = min(
        u32(fragCoord.x / screen.resolution.x * f32(${clusterCountX})),
        ${clusterCountX}u - 1u
    );



    let clusterY = min(
        u32(fragCoord.y / screen.resolution.y * f32(${clusterCountY})),
        ${clusterCountY}u - 1u
    );



    let viewDepth = max(-posView.z, nearPlane);
    let depthRatio = farPlane / nearPlane;
    let normalizedDepth = log(viewDepth / nearPlane) / log(depthRatio);




    let clusterZ = min(
        u32(clamp(normalizedDepth, 0.0, 1.0) * f32(${clusterCountZ})),
        ${clusterCountZ}u - 1u
    );

    let clusterIndex = clusterX + clusterY * ${clusterCountX}u + clusterZ * ${clusterCountX}u * ${clusterCountY}u;


    let numClusterLights = clusterSet.clusters[clusterIndex].numLights;


    var totalLightContrib = vec3f(0.0);



    for (var i = 0u; i < numClusterLights; i++) {
        
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];
        let light = lightSet.lights[lightIndex];

        totalLightContrib += calculateLightContrib(light, posWorld, nor);
    }




    let finalColor = packedData.rgb * totalLightContrib;
    textureStore(outputTex, pixelCoord, vec4f(finalColor, 1.0));
}
