// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';
import depthPrepassFragRaw from './depth_prepass.fs.wgsl?raw';
import fullscreenVertRaw from './fullscreen.vs.wgsl?raw';
import markClustersFragRaw from './mark_clusters.fs.wgsl?raw';
import compactClustersComputeRaw from './compact_clusters.cs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredShadingComputeRaw from './clustered_deferred_shading.cs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,

    moveLightsWorkgroupSize: 128,

    lightRadius: 2,

    cameraNear: Camera.nearPlane,
    cameraFar: Camera.farPlane,

    clusterX: 32,
    clusterY: 18,
    clusterZ: 32,
    clusterNear: 1, // slice 0 covers everything closer than this
    clusterFar: 50, // the whole sponza scene fits in this depth
    maxLightsPerCluster: 1023,
    clusteringWorkgroupSize: 64,

    shadingTileSize: 8
};

// =================================

function evalShaderRaw(raw: string) {
    // look up each ${name} by its key, so the production build keeps every constant
    return raw.replace(/\$\{(\w+)\}/g, (_, name: string) => String(constants[name as keyof typeof constants]));
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);
export const depthPrepassFragSrc: string = processShaderRaw(depthPrepassFragRaw);
export const fullscreenVertSrc: string = processShaderRaw(fullscreenVertRaw);
export const markClustersFragSrc: string = processShaderRaw(markClustersFragRaw);
export const compactClustersComputeSrc: string = processShaderRaw(compactClustersComputeRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredShadingComputeSrc: string = processShaderRaw(clusteredDeferredShadingComputeRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
