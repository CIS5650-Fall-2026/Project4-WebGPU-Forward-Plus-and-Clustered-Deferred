// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(0) @binding(0) var<uniform> camUnifs: CameraUniforms;
@group(0) @binding(1) var<uniform> canvasDims: CanvasResolution;
@group(0) @binding(2) var<uniform> clusterInfo: ClusterInfo;
@group(0) @binding(3) var<storage, read> lightSet: LightSet;
@group(0) @binding(4) var<storage, read> lightClusters: LightClusters;
@group(0) @binding(5) var albedoTex: texture_2d<f32>;
@group(0) @binding(6) var normalTex: texture_2d<f32>;
@group(0) @binding(7) var depthTex: texture_depth_2d;

fn depthToWorldPos(depth: f32, fragPos: vec2f, w: u32, h: u32) -> vec3f{
    let uv = fragPos / vec2f(f32(w), f32(h));
    let ndc = vec3f(uv.x * 2.0 - 1.0, 1.0 - 2.0 * uv.y, depth);
    let world = camUnifs.invViewProjMat * vec4f(ndc, 1.0);
    return world.xyz / world.w;
}

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{

    let numX = clusterInfo.numX;
    let numY = clusterInfo.numY;
    let slices = clusterInfo.slices;
    let near = clusterInfo.near;
    let far = clusterInfo.far;
    let w = canvasDims.w;
    let h = canvasDims.h;
    
    let col = textureLoad(albedoTex, vec2i(fragPos.xy), 0).rgb;
    let nor = textureLoad(normalTex, vec2i(fragPos.xy), 0).xyz;
    let depth = textureLoad(depthTex, vec2i(fragPos.xy), 0);
    let pos = depthToWorldPos(depth, vec2f(fragPos.xy), w, h);

    let xTileSize = f32(w) / f32(numX);
    let yTileSize = f32(h) / f32(numY);

    // get xy tile from screen space position 
    let tileX = u32(fragPos.x / xTileSize);
    let tileY = u32(fragPos.y / yTileSize);

    // get z slice
    let viewPos = camUnifs.viewMat * vec4f(pos, 1.0);
    let zSlice = u32(log(-viewPos.z / near) / log(far / near) * f32(slices));

    let zIdx = clamp(zSlice, 0u, slices - 1u);

    // cluster index
    let idx = tileX  + tileY * numX + zIdx * numX * numY;

    let lights = lightClusters.clusters[idx].lights;

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < lightClusters.clusters[idx].numLights; lightIdx++) {
        let light = lightSet.lights[lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, pos, normalize(nor));
    }

    var finalColor = col * totalLightContrib;
    // G-buffer views
    // return vec4(col, 1);
    // return vec4(nor, 1);
    // return vec4(pos, 1);
    return vec4(finalColor, 1);
}
