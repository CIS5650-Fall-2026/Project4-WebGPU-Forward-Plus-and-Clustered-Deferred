// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';
import clusteredDeferredComputeRaw from './clustered_deferred.cs.wgsl?raw';
import clusteredDeferredPackedFragRaw from './clustered_deferred_packed.fs.wgsl?raw';
import clusteredDeferredPackedComputeRaw from './clustered_deferred_packed.cs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';
import bloomExtractRaw from './bloom_extract.cs.wgsl?raw';
import bloomBlurRaw from './bloom_blur.cs.wgsl?raw';
import bloomCompositeRaw from './bloom_composite.cs.wgsl?raw';

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

    clusterCountX: 16,
    clusterCountY: 9,
    clusterCountZ: 24,

    maxLightsPerCluster: 128,
    clusteringWorkgroupSize: 64
};

// =================================

function evalShaderRaw(raw: string) {
    return raw.replace(/\$\{(\w+)\}/g, (_, name: string) => {
        const value = constants[name as keyof typeof constants];
        if (value === undefined) throw new Error(`Unknown shader constant: ${name}`);
        return String(value);
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
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const clusteredDeferredPackedFragSrc = processShaderRaw(clusteredDeferredPackedFragRaw);

export function clusteredDeferredComputeSrc(format: GPUTextureFormat, packed = false): string {
    const raw = packed ? clusteredDeferredPackedComputeRaw : clusteredDeferredComputeRaw;
    return processShaderRaw(raw.replace('OUTPUT_FORMAT', format));
}

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);

export const bloomExtractSrc = processShaderRaw(bloomExtractRaw);
export const bloomBlurSrc = processShaderRaw(bloomBlurRaw);
export function bloomCompositeSrc(format: GPUTextureFormat): string {
    return processShaderRaw(bloomCompositeRaw.replace('OUTPUT_FORMAT', format));
}
