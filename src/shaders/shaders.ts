// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

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
    bindGroup_gBuffer: 1, // only used by the clustered deferred fullscreen pass, which has no model or material bind groups

    moveLightsWorkgroupSize: 128,

    lightRadius: 2,

    // light clustering: screen-space tiles in X and Y, exponentially spaced depth slices in Z
    // (see the README's performance analysis for how these were chosen)
    clusterCountX: 16,
    clusterCountY: 9,
    clusterCountZ: 64,
    get numClusters() {
        return this.clusterCountX * this.clusterCountY * this.clusterCountZ;
    },
    // each cluster (count + indices) is exactly 8 KB; the fullest cluster at 5000 lights needed ~1300 slots in testing
    maxLightsPerCluster: 2047,

    clusteringWorkgroupSize: 64
};

// =================================

// Shader sources are evaluated as template literals against `constants`. Passing the object into the generated function
// (instead of referencing it from a direct eval) keeps the bundler from tree-shaking constants that only shaders read,
// such as lightRadius, out of production builds.
function evalShaderRaw(raw: string) {
    return new Function('constants', 'return `' + raw.replaceAll('${', '${constants.') + '`;')(constants);
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

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);
