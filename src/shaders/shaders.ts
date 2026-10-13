// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

// import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import clusteredDeferredLightingComputeRaw from './clustered_deferred_lighting.cs.wgsl?raw';

import clusteredDeferredPresentFragRaw from './clustered_deferred_present.fs.wgsl?raw';

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


    // For 3D light clustering
    clusterCountX: 16,
    clusterCountY: 9,
    clusterCountZ: 24,

    maxLightsPerCluster: 128,
    clusteringWorkgroupSize: 64,

    // Storage texture format for compute-based deferred lighting
    outputTextureFormat: "rgba8unorm"
};

// =================================

function evalShaderRaw(raw: string): string {
    return raw.replace(/\$\{([A-Za-z_]\w*)\}/g, (match, name: string) => {
        if (!Object.prototype.hasOwnProperty.call(constants, name)) {
            throw new Error(`Unknown shader constant: ${name}`);
        }

        return String(constants[name as keyof typeof constants]);
    });
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredPresentFragSrc: string = processShaderRaw(clusteredDeferredPresentFragRaw);
// export const clusteredDeferredLightingComputeSrc: string = processShaderRaw(clusteredDeferredLightingComputeRaw);

export function getClusteredDeferredLightingComputeSrc(
    outputTextureFormat: "rgba8unorm" | "bgra8unorm"
): string {
    const raw = clusteredDeferredLightingComputeRaw.replace(
        "${outputTextureFormat}",
        outputTextureFormat
    );

    return processShaderRaw(raw);
}

export const clusteredDeferredLightingComputeSrc: string = getClusteredDeferredLightingComputeSrc("rgba8unorm");

export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
