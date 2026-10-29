// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var gNormal: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var gColor: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var gPosition: texture_2d<f32>;

@fragment
fn main(@builtin(position) frag_coord: vec4f) -> @location(0) vec4f
{
    let fcoord = vec2i(frag_coord.xy);

    let color = textureLoad(gColor, fcoord, 0);

    if (color.a == 0.f) {
        return vec4f(0., 0., 0., 1.);
    }

    let pos = textureLoad(gPosition, fcoord, 0);
    let nor = textureLoad(gNormal, fcoord, 0);

    // Determine which cluster contains the current fragment.
    let dims = vec3f(${clusterDimX}, ${clusterDimY}, ${clusterDimZ});
    // take fragment position, put in screen space to determine which cluster in XY it belongs to. 

    let pos_clip = cameraUniforms.viewProjMat * pos;
    let pos_ndc = pos_clip.xyz / pos_clip.w;
    let uv = vec2f(pos_ndc.x * 0.5 + 0.5, 0.5 - pos_ndc.y * 0.5);
    let clusterXY = clamp(floor(uv * dims.xy), vec2f(0.0), dims.xy - vec2f(1.0));
    
    // get from world to view space
    let pos_view = cameraUniforms.viewMat * pos;
    let z_proportion = log(-pos_view.z / cameraUniforms.nClip) / log(cameraUniforms.fClip / cameraUniforms.nClip) * dims.z;
    let clusterZ = clamp(floor(z_proportion), 0.0, dims.z - 1.0);

    let clusterIdx = u32(clusterXY.x)
               + u32(clusterXY.y) * ${clusterDimX}
               + u32(clusterZ) * ${clusterDimX} * ${clusterDimY};


// Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let numLights = clusterSet.clusters[clusterIdx].numLightsInCluster;

    var totalLightContrib = vec3f(0.);

    for (var i = 0; u32(i) < numLights; i++)
    {
        let lightIdx = clusterSet.clusters[clusterIdx].lightIndices[u32(i)];
        // calculate contribution of light 
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, pos.xyz, nor.xyz);
    }

    var finalColor = color.rgb * totalLightContrib;
    return vec4f(finalColor, 1.f);
}