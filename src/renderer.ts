import Stats from 'stats.js';

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

const frameMsPanels = new WeakMap<Stats, Stats.Panel>();

// stats.js rewrites its built-in MS panel on every end() call. Swap in our own panel
// so that readout can be the one-second average instead of the last frame.
function frameMsPanelFor(stats: Stats): Stats.Panel {
    const existing = frameMsPanels.get(stats);
    if (existing) {
        return existing;
    }

    const panel = new Stats.Panel('MS', '#0f0', '#020');
    const builtin = stats.dom.children[1] as HTMLElement;
    panel.dom.style.display = builtin.style.display;
    stats.dom.replaceChild(panel.dom, builtin);
    frameMsPanels.set(stats, panel);
    return panel;
}

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

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private frameRequestId: number;
    private frameOpen = false;
    private frameBegin = 0;
    private frameMsSum = 0;
    private frameMsCount = 0;
    private frameMsWindowStart = 0;
    private frameMsPanel: Stats.Panel;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;
        this.frameMsPanel = frameMsPanelFor(stage.stats);

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        // draw() returns after submitting GPU work, so timing only that call stays near 0 ms
        // while the GPU is still shading. Sample the time until the next frame, then show
        // the average of those samples over the same one-second bucket the FPS counter uses.
        const now = performance.now();
        if (this.frameOpen) {
            this.stats.end();
            this.frameMsSum += now - this.frameBegin;
            this.frameMsCount++;
            if (now >= this.frameMsWindowStart + 1000) {
                this.frameMsPanel.update(this.frameMsSum / this.frameMsCount, 200);
                this.frameMsSum = 0;
                this.frameMsCount = 0;
                this.frameMsWindowStart = now;
            }
        } else {
            this.frameMsWindowStart = now;
        }
        this.stats.begin();
        this.frameBegin = now;
        this.frameOpen = true;

        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.draw();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
