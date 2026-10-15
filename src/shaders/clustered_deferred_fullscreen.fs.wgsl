// TODO-3: implement the Clustered Deferred fullscreen fragment shader

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniform: CameraUniforms;
@group(${bindGroup_lighting}) @binding(0) var positionTex: texture_2d<f32>;
@group(${bindGroup_lighting}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_lighting}) @binding(2) var colorTex: texture_2d<f32>;
@group(${bindGroup_lighting}) @binding(3) var<storage, read> lightSet: LightSet;
@group(${bindGroup_lighting}) @binding(4) var<storage, read> clusterSet: ClusterSet;

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
// when builtin(position) is read in the fragment shader it becomes a different value (rasterized screen space coords)
@fragment
fn main(@builtin(position) screenPos: vec4f) -> @location(0) vec4f { //location 0 is canvasTextureView
    let pixel = vec2i(screenPos.xy);
    let pos = textureLoad(positionTex, pixel, 0);
    if(pos.w == 0){
        discard;
    }
    let norm = textureLoad(normalTex, pixel, 0);
    let diffuseColor = textureLoad(colorTex, pixel, 0); //0 is mip level

    let offsetX = cameraUniform.screenX / ${clusterCountsX};
    let offsetY = cameraUniform.screenY / ${clusterCountsY};
    let offsetZ = (cameraUniform.farPlane - cameraUniform.nearPlane) / ${clusterCountsZ};

    let viewPos = cameraUniform.viewMat * vec4f(pos.xyz,1);

    let clusterX = clamp(u32(screenPos.x / offsetX),0, ${clusterCountsX} -1);
    let clusterY = clamp(u32(screenPos.y / offsetY),0, ${clusterCountsY} -1);
    
    var clusterZ : u32 = 0;
    if(${useLogarithmicSlices}){ //floor(N*log(-viewPos.z/n) / log(f/n)) , camera is looking into negative Z, while near/far planes represent positive depth
        clusterZ = clamp(u32(${clusterCountsZ} * log(-viewPos.z/cameraUniform.nearPlane) / log(cameraUniform.farPlane / cameraUniform.nearPlane)),0,${clusterCountsZ} -1);
    }
    else{
        clusterZ = clamp(u32((-viewPos.z -cameraUniform.nearPlane) / offsetZ),0,${clusterCountsZ} -1);
    }

    let clusterId = clusterZ * ${clusterCountsY} * ${clusterCountsX} + clusterY * ${clusterCountsX} + clusterX;

    let cluster = clusterSet.clusters[clusterId];

    let norNormalized = normalize(norm.xyz);
    var totalLightContrib = vec3f(0, 0, 0);
    for(var i: u32 = 0; i < cluster.numLightsInCluster; i++){
        let light = lightSet.lights[cluster.lightIndicesInCluster[i]];

        totalLightContrib += calculateLightContrib(light, pos.xyz, norNormalized);
    }

    let finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}