// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.


@group(${bindGroup_scene}) @binding(0) var<uniform> camUniform: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_scene}) @binding(3) var albedoTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var normalTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var positionTex: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f, 
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{ 

    var totalLightContrib = vec3f(0, 0, 0);
    
    //decide which cluster the fragment is in
    let X = u32(${clusterX});
    let Y = u32(${clusterY});
    let Z = u32(${clusterZ});
    let screenW = camUniform.screenDim.x;
    let screenH = camUniform.screenDim.y;
    let near = camUniform.screenDim.z;
    let far = camUniform.screenDim.w;
    
    //load G-buffer data
    let coord = vec2i(in.fragPos.xy);
    let pos = textureLoad(positionTex, coord, 0).xyz;
    let nor = textureLoad(normalTex, coord, 0).xyz;
    let albedo = textureLoad(albedoTex, coord, 0).rgb;

    var x = u32(in.fragPos.x / screenW * f32(X));
    var y = u32((1.0 - in.fragPos.y / screenH) * f32(Y));
    let depth = -(camUniform.viewMat * vec4f(pos, 1.0)).z;     
    var z = u32(log(depth / near) / log(far / near) * f32(Z));

    x = clamp(x, 0u, X - 1u);
    y = clamp(y, 0u, Y - 1u);
    z = clamp(z, 0u, Z - 1u);

    let dix = x + y * X + z * X * Y;

    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[dix].numLights; lightIdx++) {
        let lightIndex = clusterSet.clusters[dix].lightsIndexes[lightIdx];
        let light = lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    return vec4f(totalLightContrib * albedo, 1.0);
}
