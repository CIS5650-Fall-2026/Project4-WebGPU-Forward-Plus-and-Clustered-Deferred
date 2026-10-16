import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer, RenderSettings } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import { gpuTimer } from './gpu_timer';
import { cpuTimer } from './cpu_timer';

await initWebGPU();
setupLoaders();

gpuTimer.init();

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

// Add a gui button to run a simple benchmark
// Average frame time over 100 sampled frames, ignoring the first 20 warm-up frames
function averageFrameTime(frameTimes: number[]) {
    var totalFrameTime = 0.0
    for (let i = 20; i < 120; i++) {
        totalFrameTime += frameTimes[i];
    }
    return totalFrameTime / 100;
}

const benchmark = {
    gpuAvgMs: '',
    cpuAvgMs: '',
    runBenchmark: () => {
        gpuTimer.reset();
        cpuTimer.reset();

        function tick() {
            // 20 warm-up frames and 100 sampled frames
            const gpuDone = !gpuTimer.enabled || gpuTimer.frameTimes.length >= 120;
            const cpuDone = cpuTimer.frameTimes.length >= 120;
            if (!gpuDone || !cpuDone) {
                // Keep ticking the benchmark until both the CPU and GPU timers are done
                requestAnimationFrame(tick);
                return;
            }

            // Store the cpu and gpu results as strings
            benchmark.gpuAvgMs = gpuTimer.enabled
                ? `${averageFrameTime(gpuTimer.frameTimes).toFixed(2)}`
                : 'timestamp queries disabled'; // Just show a message so we know
            benchmark.cpuAvgMs = `${averageFrameTime(cpuTimer.frameTimes).toFixed(3)}`;
            resultGuiController.updateDisplay();
            cpuResultGuiController.updateDisplay();
        }
        requestAnimationFrame(tick);
    }
};

gui.add(benchmark, 'runBenchmark').name('Run Benchmark'); // Add a benchmark button to the gui
const resultGuiController = gui.add(benchmark, 'gpuAvgMs').name('GPU avg ms:'); // Add the benchmark result to the gui
const cpuResultGuiController = gui.add(benchmark, 'cpuAvgMs').name('CPU draw avg ms:');

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

// Settings visible to the GUI
const settings : RenderSettings = {
    bUseRenderBundles: true
};

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage, settings);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage, settings);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage, settings);
            break;
    }
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', clusteredDeferred: 'clustered deferred' };
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

setRenderer(renderModeController.getValue());

function updateRenderSettings(){
    if(renderer){
        renderer.setRenderSettings(settings);
    }
}

let renderBundleController = gui.add(settings, "bUseRenderBundles");
renderBundleController.onChange(updateRenderSettings);

updateRenderSettings();