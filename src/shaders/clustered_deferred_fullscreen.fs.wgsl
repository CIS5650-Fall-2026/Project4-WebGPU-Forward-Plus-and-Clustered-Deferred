// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.



@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_model}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_model}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_model}) @binding(2) var positionTex: texture_2d<f32>;

const cellsX: u32 = ${clusterCountWidth}u;
const cellsY: u32 = ${clusterCountHeight}u;
const cellsZ: u32 = ${clusterCountDepth}u;


@fragment
fn main(@builtin(position) windowPos: vec4f) -> @location(0) vec4f
{
    let pixel = vec2i(windowPos.xy);
    let albedo = textureLoad(albedoTex, pixel, 0);
    let normal = textureLoad(normalTex, pixel, 0);
    let position = textureLoad(positionTex, pixel, 0);


    // if nothing is drawn
    if (albedo.a < 0.5) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }


    // which column and row on the screen
    let x = min(u32(windowPos.x / camera.camScreen.x * f32(cellsX)), cellsX - 1u);
    let y = min(u32(windowPos.y / camera.camScreen.y * f32(cellsY)), cellsY - 1u);
    
    // like we had in layerDistance, but backwards
    let near = camera.depthDist.x;
    let far = camera.depthDist.y;
    
    // again forward is negative, so flip the sign
    let dist = max(-(camera.viewMat * vec4f(position.xyz, 1.0)).z, near);
    let layer = min(u32(log(dist / near) / log(far / near) * f32(cellsZ)), cellsZ - 1u);
    let cellId = x + y * cellsX + layer * cellsX * cellsY;
    
    // lights this specific cell kept
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    let lightCount = clusterSet.clusters[cellId].numLights;

    for (var i = 0u; i < lightCount; i++) {
        let lightId = clusterSet.clusters[cellId].lights[i];
        let light = lightSet.lights[lightId];
        totalLightContrib += calculateLightContrib(light, position.xyz, normalize(normal.xyz));
    }
    
    return vec4f(albedo.rgb * totalLightContrib, 1.0);
}