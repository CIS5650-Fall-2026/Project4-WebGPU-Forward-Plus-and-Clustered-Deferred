import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { OptimizedDeferredRenderer } from './renderers/optimized_deferred';
import { OptimizedForwardPlusRenderer } from './renderers/optimized_forward_plus';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const lightingSettings: { mode: 'compute' | 'fullscreen' } = { mode: 'compute' };

const cullingSettings = { enabled: true };

const debugSettings = { view: '0' };

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});

const lightingModeController = gui.add(lightingSettings, 'mode', ['compute', 'fullscreen']).name('Optimized lighting').onChange(() => {
    if (renderer instanceof OptimizedDeferredRenderer) {
        renderer.lightingMode = lightingSettings.mode;
    }
});

const cullingController = gui.add(cullingSettings, 'enabled').name('Culling').onChange(() => {
    if (renderer instanceof OptimizedForwardPlusRenderer) {
        renderer.cullingEnabled = cullingSettings.enabled;
    }
});

const debugViewController = gui.add(debugSettings, 'view', {
    None: 0,
    'Light count': 1,
    'Decoded normals': 2,
    'Decoded albedo': 3
}).name('Debug view').onChange(() => {
    if (renderer) {
        renderer.debugView = Number(debugSettings.view);
    }
});

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer(mode: string) {
    renderer?.stop();
    lightingModeController.domElement.closest('li')!.style.display = mode === renderModes.optimizedDeferred ? '' : 'none';

    cullingController.domElement.closest('li')!.style.display = mode === renderModes.optimizedForwardPlus ? '' : 'none';
    debugViewController.domElement.closest('li')!.style.display = mode === renderModes.naive ? 'none' : '';
    const isDeferred = mode === renderModes.clusteredDeferred || mode === renderModes.optimizedDeferred;
    debugViewController.domElement.querySelectorAll('option').forEach(option => {
        option.disabled = !isDeferred && Number(option.value) > 1;
    });
    if (!isDeferred && Number(debugSettings.view) > 1) {
        debugViewController.setValue('0');
    }

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
        case renderModes.optimizedDeferred:
            const optimizedRenderer = new OptimizedDeferredRenderer(stage);
            optimizedRenderer.lightingMode = lightingSettings.mode;
            renderer = optimizedRenderer;
            break;
        case renderModes.optimizedForwardPlus:
            const optimizedForwardRenderer = new OptimizedForwardPlusRenderer(stage);
            optimizedForwardRenderer.cullingEnabled = cullingSettings.enabled;
            renderer = optimizedForwardRenderer;
            break;
    }
    if (renderer) {
        renderer.debugView = Number(debugSettings.view);
    }
}

const renderModes = { 
    naive: 'naive', 
    forwardPlus: 'forward+', 
    optimizedForwardPlus: 'optimized forward+', 
    clusteredDeferred: 'clustered deferred', 
    optimizedDeferred: 'optimized deferred'
};

let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());
