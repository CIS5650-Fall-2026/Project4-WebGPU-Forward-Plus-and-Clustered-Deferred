import Stats from 'stats.js';
import { GUI } from 'dat.gui';
import { gpuTiming } from './gpu_timer';
import { cpuTiming } from './cpu_timer';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusterDebugRenderer } from './renderers/cluster_debug';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});
gui.add(lights, 'freezeLights').name('Freeze lights');

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer(mode: string) {
    renderer?.stop();
    cpuTiming.ms = '--';
    cpuTiming.samples = 0;
    debugFolder.domElement.style.display = mode === renderModes.clusterDebug ? '' : 'none';
    debugInfo.status = 'Not captured';
    debugInfo.overflow = '--';
    debugInfo.maxStored = '--';

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.forwardPlusBundles:
            renderer = new ForwardPlusRenderer(stage, true);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
        case renderModes.clusteredDeferredCompute:
            renderer = new ClusteredDeferredRenderer(stage, true);
            break;
        case renderModes.clusteredDeferredPacked:
            renderer = new ClusteredDeferredRenderer(stage, true, true);
            break;
        case renderModes.clusterDebug:
            renderer = new ClusterDebugRenderer(stage);
            break;
        case renderModes.bloom:
            renderer = new ClusteredDeferredRenderer(stage, true, true, true);
            break;
    }
}

const renderModes = {
    naive: 'naive',
    forwardPlus: 'forward+',
    forwardPlusBundles: 'forward+ bundles',
    clusteredDeferred: 'clustered deferred',
    clusteredDeferredCompute: 'clustered deferred compute',
    clusteredDeferredPacked: 'clustered deferred packed',
    bloom: 'clustered deferred bloom',
    clusterDebug: 'cluster debug'
};
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

gui.add(gpuTiming, 'ms').name('GPU avg (ms)').listen();
gui.add(gpuTiming, 'samples').name('Samples / 120').listen();
gui.add(cpuTiming, 'ms').name('CPU encode (ms)').listen();
gui.add(cpuTiming, 'samples').name('CPU samples / 120').listen();
gui.add({ measure: () => renderer?.measureGpu() }, 'measure')
    .name('Measure again');

const debugInfo = { status: 'Not captured', overflow: '--', maxStored: '--' };
const debugFolder = gui.addFolder('Cluster debug');
debugFolder.open();
const legend = document.createElement('div');
legend.style.cssText = 'padding:8px;line-height:1.5;background:#171717;color:white';
legend.innerHTML = `
    <div>Visible surfaces: stored lights / cluster</div>
    <div style="height:10px;background:linear-gradient(to right,blue,cyan,yellow,red)"></div>
    <div style="display:flex;justify-content:space-between"><span>0</span><span>64</span><span>128</span></div>
    <div><span style="color:magenta">■</span> Overflow: more than 128 lights</div>
    <div>Black: no visible surface</div>
    <div>Heatmap replaces lighting; timing is diagnostic.</div>
    <div>Freeze lights, stop moving, then capture.</div>
    <div>Stats cover all 3456 clusters, not pixels.</div>`;
debugFolder.domElement.appendChild(legend);
for (const [key, label] of [
    ['status', 'Snapshot'], ['overflow', 'Overflow'], ['maxStored', 'Max stored']
] as const) {
    const control = debugFolder.add(debugInfo, key).name(label).listen();
    control.domElement.querySelector('input')!.readOnly = true;
}
let capturing = false;
debugFolder.add({ capture: async () => {
    if (!(renderer instanceof ClusterDebugRenderer) || capturing) return;
    if (!lights.freezeLights) {
        debugInfo.status = 'Freeze lights first';
        return;
    }
    const current = renderer;
    capturing = true;
    debugInfo.status = 'Reading...';
    try {
        const result = await current.captureStats();
        if (renderer !== current) return;
        debugInfo.status = `${result.lightCount} lights (snapshot)`;
        debugInfo.overflow = `${result.overflow} / ${result.clusterCount}`;
        debugInfo.maxStored = String(result.maxStored);
        console.log('Cluster debug snapshot:', JSON.stringify(result));
    } catch (error) {
        if (renderer === current) debugInfo.status = 'Read failed';
        console.error('Cluster debug:', error);
    } finally {
        capturing = false;
    }
} }, 'capture').name('Read cluster stats');

setRenderer(renderModeController.getValue());
