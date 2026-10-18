import { Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

export var canvas: HTMLCanvasElement;
export var canvasFormat: GPUTextureFormat;
export var context: GPUCanvasContext;
export var device: GPUDevice;
export var canvasTextureView: GPUTextureView;

export var aspectRatio: number;
export const fovYDegrees = 45;

export var modelBindGroupLayout: GPUBindGroupLayout;
export var materialBindGroupLayout: GPUBindGroupLayout;

// CHECKITOUT: this function initializes WebGPU and also creates some bind group layouts shared by all the renderers
export async function initWebGPU() {
    canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;

    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    aspectRatio = canvas.width / canvas.height;

    if (!navigator.gpu)
    {
        let errorMessageElement = document.createElement("h1");
        errorMessageElement.textContent = "This browser doesn't support WebGPU! Try using Google Chrome.";
        errorMessageElement.style.paddingLeft = '0.4em';
        document.body.innerHTML = '';
        document.body.appendChild(errorMessageElement);
        throw new Error("WebGPU not supported on this browser");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
    {
        throw new Error("no appropriate GPUAdapter found");
    }

    device = await adapter.requestDevice();

    context = canvas.getContext("webgpu")!;
    canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    console.log("WebGPU init successsful");

    modelBindGroupLayout = device.createBindGroupLayout({
        label: "model bind group layout",
        entries: [
            { // modelMat
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }
        ]
    });

    materialBindGroupLayout = device.createBindGroupLayout({
        label: "material bind group layout",
        entries: [
            { // diffuseTex
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
            { // diffuseTexSampler
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }
        ]
    });
}

export const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 32,
    attributes: [
        { // pos
            format: "float32x3",
            offset: 0,
            shaderLocation: 0
        },
        { // nor
            format: "float32x3",
            offset: 12,
            shaderLocation: 1
        },
        { // uv
            format: "float32x2",
            offset: 24,
            shaderLocation: 2
        }
    ]
};

// ---------------------------------------------------------------------------
// GPU frame timer (measurement tool, not part of the renderers)
// Measures the time from just before draw() until the GPU reports that all
// submitted work is finished (device.queue.onSubmittedWorkDone). This is not
// affected by vsync, unlike FPS. Averaged over the last `gpuTimerWindow` frames.
// ---------------------------------------------------------------------------
const gpuTimerWindow = 60;
const gpuTimerSamples: number[] = [];
let gpuTimerPending = false;
let gpuTimerElement: HTMLDivElement | undefined;

function showGpuTime(ms: number) {
    if (!gpuTimerElement) {
        gpuTimerElement = document.createElement("div");
        gpuTimerElement.style.cssText =
            "position:fixed;top:56px;left:0;padding:4px 8px;font:12px monospace;" +
            "color:#0f0;background:rgba(0,0,0,0.7);z-index:10000;pointer-events:none;";
        document.body.appendChild(gpuTimerElement);
    }
    gpuTimerElement.textContent = `GPU frame: ${ms.toFixed(2)} ms (avg ${gpuTimerSamples.length})`;
}

export function getAverageGpuFrameTime(): number {
    if (gpuTimerSamples.length === 0) return 0;
    return gpuTimerSamples.reduce((a, b) => a + b, 0) / gpuTimerSamples.length;
}

export function resetGpuTimer() {
    gpuTimerSamples.length = 0;
}

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));

        resetGpuTimer();   // new renderer → start a fresh average
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.stats.begin();

        // only start a new measurement when the previous one has finished,
        // so each sample covers exactly one frame's GPU work
        const measure = !gpuTimerPending;
        const t0 = performance.now();

        this.draw();

        if (measure) {
            gpuTimerPending = true;
            device.queue.onSubmittedWorkDone().then(() => {
                gpuTimerSamples.push(performance.now() - t0);
                if (gpuTimerSamples.length > gpuTimerWindow) {
                    gpuTimerSamples.shift();
                }
                gpuTimerPending = false;
                showGpuTime(getAverageGpuFrameTime());
            });
        }

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
