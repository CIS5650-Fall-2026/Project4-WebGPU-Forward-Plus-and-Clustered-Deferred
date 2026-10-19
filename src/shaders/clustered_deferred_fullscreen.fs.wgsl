// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(1) @binding(0) var positionTexture: texture_2d<f32>;
@group(1) @binding(1) var normalTexture: texture_2d<f32>;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
    let pixel = vec2i(fragPos.xy);
    let positionData = textureLoad(positionTexture, pixel, 0);

    if (positionData.w == 0.0) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let worldPos = positionData.xyz;
    let normal = normalize(textureLoad(normalTexture, pixel, 0).xyz);
    let albedo = textureLoad(albedoTexture, pixel, 0).rgb;

    let resolution = vec2f(textureDimensions(positionTexture));
    let screenUV = fragPos.xy/resolution;

    let countX = u32(${clusterCountX});
    let countY = u32(${clusterCountY});
    let countZ = u32(${clusterCountZ});

    let x = min(u32(screenUV.x*f32(countX)), countX - 1u);
    let y = min(u32(screenUV.y*f32(countY)), countY - 1u);

    let viewPos = camera.view*vec4f(worldPos, 1.0);
    let depth = -viewPos.z;

    let near = f32(${cameraNear});
    let far = f32(${cameraFar});
    let depthFraction = log(clamp(depth, near, far)/near)/log(far/near);

    let z = min(u32(floor(depthFraction * f32(countZ))), countZ - 1u);

    let clusterIndex = x + y*countX + z*countX*countY;

    let lightCount = clusterSet.clusters[clusterIndex].numLights;
    var totalLightContrib = vec3f(0.0);

    for (var i = 0u; i < lightCount; i++) {
        let lightIndex = clusterSet.clusters[clusterIndex].lightIndices[i];
        let light = lightSet.lights[lightIndex];

        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    return vec4f(albedo*totalLightContrib, 1.0);
}