import * as shaders from './shaders/shaders';
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

var gpuTimeElement: HTMLElement;
const maxTimestamps = 16;
const gpuTimeAverageFrames = 30;

// CHECKITOUT: this function initializes WebGPU and also creates some bind group layouts shared by all the renderers
export async function initWebGPU() {
    canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;
    gpuTimeElement = document.getElementById("gpuTime") as HTMLElement;

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

    const requiredFeatures: GPUFeatureName[] = adapter.features.has("timestamp-query") ? ["timestamp-query"] : [];
    device = await adapter.requestDevice({ requiredFeatures: requiredFeatures });

    context = canvas.getContext("webgpu")!;
    canvasFormat = "rgba8unorm";
    context.configure({
        device: device,
        format: canvasFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
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

    private timestampQuerySet: GPUQuerySet | undefined;
    private timestampResolveBuffer: GPUBuffer | undefined;
    private timestampResultBuffer: GPUBuffer | undefined;
    private timestampPassCount = 0;
    private timestampReadPending = false;
    private gpuTimes: number[] = [];

    constructor(stage: Stage) {
        this.scene = stage.scene;
        this.lights = stage.lights;
        this.camera = stage.camera;
        this.stats = stage.stats;

        if (device.features.has("timestamp-query")) {
            this.timestampQuerySet = device.createQuerySet({ type: "timestamp", count: maxTimestamps });
            this.timestampResolveBuffer = device.createBuffer({
                label: "timestamp resolve buffer",
                size: 8 * maxTimestamps,
                usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
            });
            this.timestampResultBuffer = device.createBuffer({
                label: "timestamp result buffer",
                size: 8 * maxTimestamps,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            });
        }

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }

    protected timestampWrites(): GPURenderPassTimestampWrites | undefined {
        if (!this.timestampQuerySet) {
            return undefined;
        }
        const index = 2 * this.timestampPassCount++;
        return { querySet: this.timestampQuerySet, beginningOfPassWriteIndex: index, endOfPassWriteIndex: index + 1 };
    }

    protected resolveTimestamps(encoder: GPUCommandEncoder) {
        if (!this.timestampQuerySet || !this.timestampResolveBuffer || !this.timestampResultBuffer || this.timestampReadPending) {
            return;
        }
        encoder.resolveQuerySet(this.timestampQuerySet, 0, 2 * this.timestampPassCount, this.timestampResolveBuffer, 0);
        encoder.copyBufferToBuffer(this.timestampResolveBuffer, 0, this.timestampResultBuffer, 0, 16 * this.timestampPassCount);
    }

    private async readTimestamps() {
        if (!this.timestampResultBuffer || this.timestampReadPending) {
            return;
        }
        this.timestampReadPending = true;
        const numPasses = this.timestampPassCount;
        await this.timestampResultBuffer.mapAsync(GPUMapMode.READ);
        const times = new BigInt64Array(this.timestampResultBuffer.getMappedRange());
        let totalNs = 0;
        for (let i = 0; i < numPasses; i++) {
            totalNs += Number(times[2 * i + 1] - times[2 * i]);
        }
        this.timestampResultBuffer.unmap();
        this.timestampReadPending = false;

        this.gpuTimes.push(totalNs * 1e-6);
        if (this.gpuTimes.length > gpuTimeAverageFrames) {
            this.gpuTimes.shift();
        }
        const averageMs = this.gpuTimes.reduce((sum, ms) => sum + ms, 0) / this.gpuTimes.length;
        gpuTimeElement.textContent = `GPU: ${averageMs.toFixed(2)} ms`;
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    protected drawScene(pass: GPURenderPassEncoder | GPURenderBundleEncoder) {
        this.scene.iterate(node => {
            pass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            pass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            pass.setVertexBuffer(0, primitive.vertexBuffer);
            pass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            pass.drawIndexed(primitive.numIndices);
        });
    }

    protected recordBundle(colorFormats: GPUTextureFormat[], pipeline: GPURenderPipeline, sceneBindGroup: GPUBindGroup): GPURenderBundle {
        const encoder = device.createRenderBundleEncoder({
            colorFormats: colorFormats,
            depthStencilFormat: "depth24plus"
        });
        encoder.setPipeline(pipeline);
        encoder.setBindGroup(shaders.constants.bindGroup_scene, sceneBindGroup);
        this.drawScene(encoder);
        return encoder.finish();
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

        this.timestampPassCount = 0;
        this.draw();
        this.readTimestamps();

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
