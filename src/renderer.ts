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

export const gpuTiming = { totalMs: "..." };

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

    device = await adapter.requestDevice({ requiredFeatures: ["timestamp-query"] });

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

    // Timing stuff
    private readonly timestampQuerySet: GPUQuerySet;
    private readonly timestampResolveBuffer: GPUBuffer;
    private readonly timestampReadbackBuffer: GPUBuffer;
    private timestampCount = 0;
    private timingPending = false;
    private stopped = false;

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        this.timestampQuerySet = device.createQuerySet({
            label: "core pass timestamps",
            type: "timestamp",
            count: 6
        });
        this.timestampResolveBuffer = device.createBuffer({
            label: "core pass timestamp resolve",
            size: 6 * 8, // timestamp is 64-bit unsigned int in ns
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
        });
        this.timestampReadbackBuffer = device.createBuffer({
            label: "core pass timestamp readback",
            size: 6 * 8,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        gpuTiming.totalMs = "...";

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
        this.stopped = true;
    }

    protected abstract draw(): void;

    protected passTimestamps(): GPURenderPassTimestampWrites | undefined {
        if (this.timingPending) {
            return undefined;
        }

        const firstIndex = this.timestampCount;
        this.timestampCount += 2;
        return {
            querySet: this.timestampQuerySet,
            beginningOfPassWriteIndex: firstIndex,
            endOfPassWriteIndex: firstIndex + 1
        };
    }

    protected submitWithTiming(encoder: GPUCommandEncoder): void {
        const queryCount = this.timestampCount;
        if (queryCount > 0) {
            encoder.resolveQuerySet(this.timestampQuerySet, 0, queryCount, this.timestampResolveBuffer, 0);
            encoder.copyBufferToBuffer(this.timestampResolveBuffer, 0,
                this.timestampReadbackBuffer, 0, queryCount * 8);
            this.timingPending = true;
        }

        device.queue.submit([encoder.finish()]);
        if (queryCount > 0) {
            void this.readGpuTime(queryCount);
        }
    }

    private async readGpuTime(queryCount: number): Promise<void> {
        await this.timestampReadbackBuffer.mapAsync(GPUMapMode.READ);
        const timestamps = new BigUint64Array(this.timestampReadbackBuffer.getMappedRange());
        let totalNanoseconds = 0n;
        for (let i = 0; i < queryCount; i += 2) {
            totalNanoseconds += timestamps[i + 1] - timestamps[i];  // sum all pass times
        }
        this.timestampReadbackBuffer.unmap();
        this.timingPending = false;

        if (!this.stopped) {
            gpuTiming.totalMs = (Number(totalNanoseconds) / 1_000_000).toFixed(3);
        }
    }

    // CHECKITOUT: this is the main rendering loop
    private onFrame(time: number) {
        if (this.prevTime == 0) {
            this.prevTime = time;
        }

        let deltaTime = time - this.prevTime;
        this.camera.onFrame(deltaTime);
        this.lights.onFrame(time);

        this.stats.begin();

        this.timestampCount = 0;
        this.draw();

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
