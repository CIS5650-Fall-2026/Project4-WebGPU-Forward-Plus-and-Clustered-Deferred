// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gBuffer}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(2) var depthTex: texture_depth_2d;

struct FragmentInput {
    @builtin(position) fragCoord: vec4f
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let pixelCoord = vec2i(in.fragCoord.xy);

    let albedo = textureLoad(albedoTex, pixelCoord, 0);
    let normal = normalize(textureLoad(normalTex, pixelCoord, 0).xyz);
    let depth = textureLoad(depthTex, pixelCoord, 0);

    if (depth >= 1.0) {
        discard;
    }

    // convert screen pixel coordinates into world space
    let ndcX = (in.fragCoord.x / cameraUniforms.screenDimensions.x) * 2.0 - 1.0;
    let ndcY = (1.0 - (in.fragCoord.y / cameraUniforms.screenDimensions.y)) * 2.0 - 1.0;
    let ndcPos = vec4f(ndcX, ndcY, depth, 1.0);

    let viewPosH = cameraUniforms.inverseProjMat * ndcPos;
    let viewPos = viewPosH.xyz / viewPosH.w;

    let r0 = vec3f(cameraUniforms.viewMat[0].x, cameraUniforms.viewMat[1].x, cameraUniforms.viewMat[2].x);
    let r1 = vec3f(cameraUniforms.viewMat[0].y, cameraUniforms.viewMat[1].y, cameraUniforms.viewMat[2].y);
    let r2 = vec3f(cameraUniforms.viewMat[0].z, cameraUniforms.viewMat[1].z, cameraUniforms.viewMat[2].z);
    let t  = cameraUniforms.viewMat[3].xyz;

    let eye = -(r0 * t.x + r1 * t.y + r2 * t.z);
    let worldPos = (r0 * viewPos.x + r1 * viewPos.y + r2 * viewPos.z) + eye;

    // determine which cluster contains the current fragment
    let tileX = min(u32(floor((in.fragCoord.x / cameraUniforms.screenDimensions.x) * f32(${clusterX}))), ${clusterX}u - 1u);
    let tileY = min(u32(floor(((cameraUniforms.screenDimensions.y - in.fragCoord.y) / cameraUniforms.screenDimensions.y) * f32(${clusterY}))), ${clusterY}u - 1u);
    let clusterXIdx = min(tileX, ${clusterX}u - 1u);
    let clusterYIdx = min(tileY, ${clusterY}u - 1u);

    let linearDepth = max(-viewPos.z, cameraUniforms.nearPlane);
    let logRatio = log(linearDepth / cameraUniforms.nearPlane) / log(cameraUniforms.farPlane / cameraUniforms.nearPlane);
    let clusterZIdx = min(u32(clamp(logRatio, 0.0, 1.0) * f32(${clusterZ})), ${clusterZ}u - 1u);
    
    let clusterIdx = clusterXIdx + clusterYIdx * ${clusterX}u + clusterZIdx * ${clusterX}u * ${clusterY}u;
    let cluster = &clusterSet.clusters[clusterIdx];
    let numLights = (*cluster).numLights;

    // accumulate total light contribution for the fragment
    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < numLights; lightIdx++) {
        let light = lightSet.lights[(*cluster).lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}