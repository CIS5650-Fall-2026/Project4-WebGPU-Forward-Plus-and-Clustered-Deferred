import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer, adapterInfo, canvas, frameTimer, gpuTimer } from './renderer';
import { constants } from './shaders/shaders';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
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

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

function setRenderer(mode: string) {
    renderer?.stop();

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
    }
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', clusteredDeferred: 'clustered deferred' };
// On mobile I want clustered deferred to be the default, since
// naive is not real time.
const isMobile = window.matchMedia('(pointer: coarse)').matches;
let renderModeController = gui.add({ mode: isMobile ? renderModes.clusteredDeferred : renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('bench')) {
    runBenchmark(urlParams);
}

async function runBenchmark(params: URLSearchParams) {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const mode = params.get('mode') ?? renderModes.naive;
    const warmupMs = Number(params.get('warmup') ?? 1500);
    const measureMs = Number(params.get('measure') ?? 4000);

    lights.numLights = Number(params.get('lights') ?? lights.numLights);
    lights.updateLightSetUniformNumLights();
    gui.updateDisplay();
    // triggers onChange, which calls setRenderer
    renderModeController.setValue(mode);

    await sleep(warmupMs);
    frameTimer.reset();
    gpuTimer?.reset();
    await sleep(measureMs);
    const frame = frameTimer.stats();

    renderer?.stop();
    await sleep(1000);

    const result = {
        mode: mode,
        numLights: lights.numLights,
        clusters: [constants.clusterCountX, constants.clusterCountY, constants.clusterCountZ],
        maxLightsPerCluster: constants.maxLightsPerCluster,
        canvas: [canvas.width, canvas.height],
        adapter: { vendor: adapterInfo.vendor, architecture: adapterInfo.architecture, description: adapterInfo.description },
        frame: frame,
        gpu: gpuTimer?.stats() ?? {}
    };
    (window as any).benchResult = result;
    console.log(JSON.stringify(result));
}
