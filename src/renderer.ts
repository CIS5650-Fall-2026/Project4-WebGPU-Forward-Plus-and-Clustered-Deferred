import { Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';
import * as shaders from './shaders/shaders';

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

    const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

    const useBGRAStorage =
        preferredFormat === "bgra8unorm" &&
        adapter.features.has("bgra8unorm-storage");

    canvasFormat = useBGRAStorage ? "bgra8unorm" : "rgba8unorm";

    device = await adapter.requestDevice({
        requiredFeatures: useBGRAStorage
            ? ["bgra8unorm-storage"]
            : []
    });

    context = canvas.getContext("webgpu")!;
    context.configure({
        device: device,
        format: canvasFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT 
             | GPUTextureUsage.STORAGE_BINDING
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
    private debugMode = 0;
    debugUniformBuffer: GPUBuffer;
    private heatmapPipeline?: GPURenderPipeline;
    private heatmapDepthBindGroup?: GPUBindGroup;

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

        this.debugUniformBuffer = device.createBuffer({
            label: "debug view uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }

    stop(): void {
        cancelAnimationFrame(this.frameRequestId);
    }

    protected abstract draw(): void;

    get debugView() {
        return this.debugMode;
    }

    set debugView(value: number) {
        this.debugMode = value;
        device.queue.writeBuffer(this.debugUniformBuffer, 0, new Uint32Array([value]));
    }

    protected drawClusterHeatmap(encoder: GPUCommandEncoder, view: GPUTextureView,
        layout: GPUBindGroupLayout, bindGroup: GPUBindGroup, depthView: GPUTextureView) {
        if (this.debugView !== 1) {
            return;
        }

        if (!this.heatmapPipeline) {
            this.heatmapPipeline = device.createRenderPipeline({
                label: "cluster heatmap pipeline",
                layout: device.createPipelineLayout({
                    bindGroupLayouts: [layout, device.createBindGroupLayout({
                        entries: [
                            {
                                binding: 0,
                                visibility: GPUShaderStage.FRAGMENT,
                                texture: { sampleType: "depth" }
                            }
                        ]
                    })]
                }),
                vertex: {
                    module: device.createShaderModule({
                        code: shaders.clusteredDeferredFullscreenVertSrc
                    })
                },
                fragment: {
                    module: device.createShaderModule({
                        code: shaders.clusterHeatmapFragSrc
                    }),
                    targets: [{ format: canvasFormat }]
                }
            });
            this.heatmapDepthBindGroup = device.createBindGroup({
                layout: this.heatmapPipeline.getBindGroupLayout(1),
                entries: [{ binding: 0, resource: depthView }]
            });
        }

        const heatmapPass = encoder.beginRenderPass({
            label: "cluster heatmap pass",
            colorAttachments: [
                {
                    view,
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        heatmapPass.setPipeline(this.heatmapPipeline);
        heatmapPass.setBindGroup(shaders.constants.bindGroup_scene, bindGroup);
        heatmapPass.setBindGroup(1, this.heatmapDepthBindGroup!);
        heatmapPass.draw(3);
        heatmapPass.end();
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

        this.draw();

        this.stats.end();

        this.prevTime = time;
        this.frameRequestId = requestAnimationFrame((t) => this.onFrame(t));
    }
}
