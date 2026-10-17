// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<storage, read> clusterLightIDs: ClusterLightIDs;

@group(${bindGroup_scene}) @binding(4) var positionTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var normalTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(6) var uvTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(7) var albedoTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(8) var texSampler: sampler;

struct FragmentInput {
    @location(0) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let flippedUV = vec2f(in.uv.x, 1.0-in.uv.y);
    let pos = textureSample(positionTexture, texSampler, flippedUV).xyz;
    let norm = normalize(textureSample(normalTexture, texSampler, flippedUV).xyz); // Try without normalize
    let albedo = textureSample(albedoTexture, texSampler, flippedUV).xyz;

    //
    let tile = floor(in.uv*vec2f(clusterSet.clusterDim.xy));

    // Get Camera Space Depth    
    var viewPos = camera.view * vec4f(pos, 1.0);
    let clusterDepth = getClusterDepthID(-viewPos.z, clusterSet.clusterDim.z);

    // Get Cluster ID
    let clusterId3 = vec3u(vec2u(tile), u32(clusterDepth));
    let clusterIdx = getClusterId1(clusterId3, clusterSet.clusterDim);

    // Get Lights in BBX
    let lightStart = clusterSet.clusters[clusterIdx].lightStart;
    let lightEnd = lightStart + clusterSet.clusters[clusterIdx].lightCount;

    // Iterate through lights & get contribution
    var totalLight = vec3f(0,0,0);
    for(var i = lightStart; i < lightEnd; i++) {
        let light = lightSet.lights[clusterLightIDs.indices[i]];
        totalLight += calculateLightContrib(light, pos, norm);
    }

    let col = totalLight * albedo;
    return vec4f(col, 1.0);
    return vec4f(vec3f(-viewPos.z)*0.1, 1.0);
}