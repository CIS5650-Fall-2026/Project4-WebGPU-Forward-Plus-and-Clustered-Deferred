// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gbuff}) @binding(0) var pos_g_buff: texture_2d<f32>;
@group(${bindGroup_gbuff}) @binding(1) var nor_g_buff: texture_2d<f32>;
@group(${bindGroup_gbuff}) @binding(2) var albedo_g_buff: texture_2d<f32>;

@group(${bindGroup_gbuff}) @binding(3) var texSampler: sampler;

struct FragmentInput
{
    @builtin(position) frag_coord: vec4f,
    @location(0) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let pixel = vec2i(in.frag_coord.xy);

    let full_pos = textureLoad(pos_g_buff, pixel, 0);
    let pos = full_pos.rgb;
    let depth = full_pos.w;
    let nor = textureLoad(nor_g_buff, pixel, 0).xyz;
    let albedo = textureLoad(albedo_g_buff, pixel, 0);

    // determine cluster
    let cluster_x = min(u32(floor(in.frag_coord.x / f32(camUniforms.width) * f32(clusterCountX))),
        clusterCountX - 1u);

    let cluster_y = min(u32(floor((1.0 - in.frag_coord.y / f32(camUniforms.height)) * f32(clusterCountY))),
        clusterCountY - 1u);

    let cluster_z = min(u32(floor(depth * f32(clusterCountZ))),
        clusterCountZ - 1u);

    let clusterIdx = cluster_x + cluster_y * clusterCountX + cluster_z * clusterCountX * clusterCountY;

    var totalLightContrib = vec3f(0.0);
    for (var lightClusterIdx = 0u; lightClusterIdx < clusterSet.clusters[clusterIdx].numLights; lightClusterIdx++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lights[lightClusterIdx]];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
