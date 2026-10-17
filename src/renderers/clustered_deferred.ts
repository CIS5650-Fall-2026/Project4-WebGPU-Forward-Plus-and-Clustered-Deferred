import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { createSceneRenderBundle, encodeSceneDraws } from './scene_draw';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    private gbufferSceneBindGroupLayout: GPUBindGroupLayout;
    private gbufferSceneBindGroup: GPUBindGroup;
    private lightingBindGroupLayout: GPUBindGroupLayout;
    private bloomDownsampleBindGroupLayout: GPUBindGroupLayout;
    private bloomCompositeBindGroupLayout: GPUBindGroupLayout;

    private gbufferTexture: GPUTexture;
    private gbufferTextureView: GPUTextureView;
    private lightingTexture: GPUTexture;
    private lightingTextureView: GPUTextureView;
    private bloomTexture: GPUTexture;
    private bloomTextureView: GPUTextureView;
    private depthTexture: GPUTexture;
    private depthTextureView: GPUTextureView;

    private gbufferPipeline: GPURenderPipeline;
    private gbufferRenderBundle: GPURenderBundle;
    private lightingPipeline: GPUComputePipeline;
    private bloomDownsamplePipeline: GPUComputePipeline;
    private bloomCompositePipeline: GPUComputePipeline;

    constructor(stage: Stage) {
        super(stage);

        const textureSize: GPUExtent3D = [renderer.canvas.width, renderer.canvas.height];
        this.gbufferTexture = renderer.device.createTexture({
            label: "compact G-buffer",
            size: textureSize,
            format: "rg32uint",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gbufferTextureView = this.gbufferTexture.createView();

        this.lightingTexture = renderer.device.createTexture({
            label: "HDR deferred lighting",
            size: textureSize,
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
        this.lightingTextureView = this.lightingTexture.createView();

        const bloomSize: GPUExtent3D = [
            Math.max(1, Math.ceil(renderer.canvas.width / 2)),
            Math.max(1, Math.ceil(renderer.canvas.height / 2))
        ];
        this.bloomTexture = renderer.device.createTexture({
            label: "half-resolution bloom",
            size: bloomSize,
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
        this.bloomTextureView = this.bloomTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "G-buffer depth",
            size: textureSize,
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.gbufferSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer scene bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }]
        });
        this.gbufferSceneBindGroup = renderer.device.createBindGroup({
            label: "G-buffer scene bind group",
            layout: this.gbufferSceneBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this.camera.uniformsBuffer }
            }]
        });

        this.lightingBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred compute lighting bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "uint" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "depth" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: "rgba16float" }
                }
            ]
        });

        this.bloomDownsampleBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "bloom bright-pass bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: "rgba16float" }
                }
            ]
        });

        this.bloomCompositeBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "bloom composite bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: renderer.canvasFormat }
                }
            ]
        });

        this.gbufferPipeline = renderer.device.createRenderPipeline({
            label: "compact G-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.gbufferSceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "compact G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [{ format: "rg32uint" }]
            }
        });

        this.gbufferRenderBundle = createSceneRenderBundle(
            this.scene,
            this.gbufferPipeline,
            this.gbufferSceneBindGroup,
            "rg32uint"
        );

        this.lightingPipeline = renderer.device.createComputePipeline({
            label: "deferred compute lighting pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred compute lighting pipeline layout",
                bindGroupLayouts: [this.lightingBindGroupLayout]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "deferred compute lighting shader",
                    code: shaders.clusteredDeferredLightingComputeSrc
                }),
                entryPoint: "main"
            }
        });

        this.bloomDownsamplePipeline = renderer.device.createComputePipeline({
            label: "bloom bright-pass pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "bloom bright-pass pipeline layout",
                bindGroupLayouts: [this.bloomDownsampleBindGroupLayout]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "bloom bright-pass shader",
                    code: shaders.bloomDownsampleComputeSrc
                }),
                entryPoint: "main"
            }
        });

        this.bloomCompositePipeline = renderer.device.createComputePipeline({
            label: "bloom composite pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "bloom composite pipeline layout",
                bindGroupLayouts: [this.bloomCompositeBindGroupLayout]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "bloom composite shader",
                    code: shaders.bloomCompositeComputeSrc.replace("rgba8unorm", renderer.canvasFormat)
                }),
                entryPoint: "main"
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder);

        const gbufferPass = encoder.beginRenderPass({
            label: "compact G-buffer pass",
            colorAttachments: [{
                view: this.gbufferTextureView,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        if (renderer.renderBundlesEnabled) {
            gbufferPass.executeBundles([this.gbufferRenderBundle]);
        } else {
            encodeSceneDraws(gbufferPass, this.scene, this.gbufferPipeline, this.gbufferSceneBindGroup);
        }
        gbufferPass.end();

        const lightingBindGroup = renderer.device.createBindGroup({
            label: "deferred compute lighting bind group",
            layout: this.lightingBindGroupLayout,
            entries: [
                { binding: 0, resource: this.gbufferTextureView },
                { binding: 1, resource: this.depthTextureView },
                { binding: 2, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 3, resource: { buffer: this.lights.clusterDataBuffer } },
                { binding: 4, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 5, resource: this.lightingTextureView }
            ]
        });

        const lightingPass = encoder.beginComputePass({ label: "deferred compute lighting pass" });
        lightingPass.setPipeline(this.lightingPipeline);
        lightingPass.setBindGroup(0, lightingBindGroup);
        lightingPass.dispatchWorkgroups(
            Math.ceil(renderer.canvas.width / shaders.constants.deferredWorkgroupSize),
            Math.ceil(renderer.canvas.height / shaders.constants.deferredWorkgroupSize)
        );
        lightingPass.end();

        const bloomDownsampleBindGroup = renderer.device.createBindGroup({
            label: "bloom bright-pass bind group",
            layout: this.bloomDownsampleBindGroupLayout,
            entries: [
                { binding: 0, resource: this.lightingTextureView },
                { binding: 1, resource: this.bloomTextureView }
            ]
        });
        const bloomDownsamplePass = encoder.beginComputePass({ label: "bloom bright-pass compute" });
        bloomDownsamplePass.setPipeline(this.bloomDownsamplePipeline);
        bloomDownsamplePass.setBindGroup(0, bloomDownsampleBindGroup);
        bloomDownsamplePass.dispatchWorkgroups(
            Math.ceil(this.bloomTexture.width / shaders.constants.deferredWorkgroupSize),
            Math.ceil(this.bloomTexture.height / shaders.constants.deferredWorkgroupSize)
        );
        bloomDownsamplePass.end();

        const outputTextureView = renderer.context.getCurrentTexture().createView();
        const bloomCompositeBindGroup = renderer.device.createBindGroup({
            label: "bloom composite bind group",
            layout: this.bloomCompositeBindGroupLayout,
            entries: [
                { binding: 0, resource: this.lightingTextureView },
                { binding: 1, resource: this.bloomTextureView },
                { binding: 2, resource: outputTextureView }
            ]
        });
        const bloomCompositePass = encoder.beginComputePass({ label: "bloom composite compute" });
        bloomCompositePass.setPipeline(this.bloomCompositePipeline);
        bloomCompositePass.setBindGroup(0, bloomCompositeBindGroup);
        bloomCompositePass.dispatchWorkgroups(
            Math.ceil(renderer.canvas.width / shaders.constants.deferredWorkgroupSize),
            Math.ceil(renderer.canvas.height / shaders.constants.deferredWorkgroupSize)
        );
        bloomCompositePass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
