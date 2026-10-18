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

export abstract class Renderer {
    protected scene: Scene;
    protected lights: Lights;
    protected camera: Camera;

    protected stats: Stats;

    private prevTime: number = 0;
    private readonly frameChannel = new MessageChannel();
    private running = true;
    private framePending = false;
    private readonly onVisibilityChange = () => {
        this.prevTime = 0;
        this.scheduleFrame();
    };

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        this.frameChannel.port1.onmessage = () => { void this.onFrame(); };
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.scheduleFrame();
    }

    stop(): void {
        this.running = false;
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.frameChannel.port1.close();
        this.frameChannel.port2.close();
    }

    protected abstract draw(): void;

    private scheduleFrame() {
        if (!this.running || this.framePending || document.hidden) return;
        this.framePending = true;
        // A separate task yields to input and canvas presentation without waiting
        // for requestAnimationFrame's display-refresh pacing or timer clamping.
        this.frameChannel.port2.postMessage(null);
    }

    private async onFrame() {
        if (!this.running || document.hidden) {
            this.framePending = false;
            return;
        }

        try {
            const time = performance.now();
            const deltaTime = this.prevTime === 0 ? 0 : time - this.prevTime;
            this.prevTime = time;
            this.camera.onFrame(deltaTime);
            this.lights.onFrame(time);

            this.stats.begin();
            this.draw();
            // Bound outstanding GPU work instead of accumulating an unlimited
            // command backlog. FPS counts completed renders, not submissions.
            await device.queue.onSubmittedWorkDone();
            if (this.running) this.stats.end();
        } catch (error) {
            console.error('Renderer stopped after a rendering error:', error);
            this.stop();
        } finally {
            this.framePending = false;
            this.scheduleFrame();
        }
    }
}
