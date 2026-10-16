// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';
import clusterHeatmapFragRaw from './cluster_heatmap.fs.wgsl?raw';

import markClustersFragRaw from './mark_clusters.fs.wgsl?raw';
import optimizedClusteringComputeRaw from './optimized_clustering.cs.wgsl?raw';
import optimizedForwardPlusFragRaw from './optimized_forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import optimizedDeferredFragRaw from './optimized_deferred.fs.wgsl?raw';
import optimizedDeferredFullscreenFragRaw from './optimized_deferred_fullscreen.fs.wgsl?raw';
import optimizedDeferredLightingComputeRaw from './optimized_deferred_lighting.cs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';
import depthPreFragRaw from './depth_pre.fs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
const clusterCountX = 16;
const clusterCountY = 9;
const clusterCountZ = 24;

export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,
    bindGroup_gbuffer: 1,
    bindGroup_target: 2,

    moveLightsWorkgroupSize: 128,

    lightRadius: 2,

    clusterCountX,
    clusterCountY,
    clusterCountZ,
    clusterCount: clusterCountX * clusterCountY * clusterCountZ,
    maxLightsPerCluster: 1024,
    clusteringWorkgroupSize: 128
};

// =================================

function evalShaderRaw(raw: string) {
    return raw.replace(/\$\{(\w+)\}/g, (_, name: string) => String(constants[name as keyof typeof constants]));
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);
export const clusterHeatmapFragSrc: string = processShaderRaw(clusterHeatmapFragRaw);

export const markClustersFragSrc = processShaderRaw(markClustersFragRaw);
export const optimizedClusteringComputeSrc = processShaderRaw(optimizedClusteringComputeRaw);
export const optimizedForwardPlusFragSrc = processShaderRaw(optimizedForwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const optimizedDeferredFragSrc: string = processShaderRaw(optimizedDeferredFragRaw);
export const optimizedDeferredFullscreenFragSrc: string = processShaderRaw(optimizedDeferredFullscreenFragRaw);

export function getOptimizedDeferredLightingComputeSrc(format: GPUTextureFormat): string {
    return processShaderRaw(optimizedDeferredLightingComputeRaw).replace("__OUTPUT_FORMAT__", format);
}

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
export const depthPreFragSrc: string = processShaderRaw(depthPreFragRaw);
