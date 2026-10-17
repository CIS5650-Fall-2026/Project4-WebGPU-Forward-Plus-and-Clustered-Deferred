import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { createSceneRenderBundle, encodeSceneDraws } from './scene_draw';

export class ForwardPlusRenderer extends renderer.Renderer {
    private sceneBindGroupLayout: GPUBindGroupLayout;
    private sceneBindGroup: GPUBindGroup;
    private depthSceneBindGroup: GPUBindGroup;
    private depthTexture: GPUTexture;
    private depthTextureView: GPUTextureView;
    private pipeline: GPURenderPipeline;
    private baselinePipeline: GPURenderPipeline;
    private sceneRenderBundle: GPURenderBundle;
    private baselineRenderBundle: GPURenderBundle;
    private depthPipeline: GPURenderPipeline;
    private depthRenderBundle: GPURenderBundle;
    private clusterCullBindGroupLayout: GPUBindGroupLayout;
    private clusterCullBindGroup: GPUBindGroup;
    private clusterCullPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        this.sceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Forward+ scene bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.sceneBindGroup = renderer.device.createBindGroup({
            label: "Forward+ scene bind group",
            layout: this.sceneBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterDataBuffer } },
                { binding: 3, resource: { buffer: this.camera.uniformsBuffer } }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            label: "Forward+ depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        const depthSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Forward+ depth-only scene bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }]
        });
        this.depthSceneBindGroup = renderer.device.createBindGroup({
            label: "Forward+ depth-only scene bind group",
            layout: depthSceneBindGroupLayout,
            entries: [{ binding: 0, resource: { buffer: this.camera.uniformsBuffer } }]
        });
        const depthPipelineLayout = renderer.device.createPipelineLayout({
            label: "Forward+ depth-only pipeline layout",
            bindGroupLayouts: [
                depthSceneBindGroupLayout,
                renderer.modelBindGroupLayout,
                renderer.materialBindGroupLayout
            ]
        });

        this.depthPipeline = renderer.device.createRenderPipeline({
            label: "Forward+ depth prepass pipeline",
            layout: depthPipelineLayout,
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Forward+ depth-only vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Forward+ alpha-tested depth-only fragment shader",
                    code: shaders.forwardPlusDepthFragSrc
                }),
                targets: []
            }
        });
        this.depthRenderBundle = createSceneRenderBundle(
            this.scene,
            this.depthPipeline,
            this.depthSceneBindGroup,
            null
        );

        this.clusterCullBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "depth-based cluster culling bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "storage" }
                }
            ]
        });
        this.clusterCullBindGroup = renderer.device.createBindGroup({
            label: "depth-based cluster culling bind group",
            layout: this.clusterCullBindGroupLayout,
            entries: [
                { binding: 0, resource: this.depthTextureView },
                { binding: 1, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 2, resource: { buffer: this.lights.forwardPlusClusterMaskBuffer } }
            ]
        });
        this.clusterCullPipeline = renderer.device.createRenderPipeline({
            label: "depth-based cluster culling fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "depth-based cluster culling pipeline layout",
                bindGroupLayouts: [this.clusterCullBindGroupLayout]
            }),
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "always",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "depth-based cluster culling fullscreen vertex shader",
                    code: shaders.clusterCullFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "depth-based cluster culling fragment shader",
                    code: shaders.clusterCullFragSrc
                }),
                targets: []
            }
        });

        this.pipeline = this.createForwardPipeline("equal", false, "Forward+ prepass shading pipeline");
        this.baselinePipeline = this.createForwardPipeline("less", true, "Forward+ baseline pipeline");

        this.sceneRenderBundle = createSceneRenderBundle(
            this.scene,
            this.pipeline,
            this.sceneBindGroup,
            renderer.canvasFormat
        );
        this.baselineRenderBundle = createSceneRenderBundle(
            this.scene,
            this.baselinePipeline,
            this.sceneBindGroup,
            renderer.canvasFormat
        );
    }

    private createForwardPipeline(
        depthCompare: GPUCompareFunction,
        depthWriteEnabled: boolean,
        label: string
    ): GPURenderPipeline {
        return renderer.device.createRenderPipeline({
            label,
            layout: renderer.device.createPipelineLayout({
                label: `${label} layout`,
                bindGroupLayouts: [
                    this.sceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled,
                depthCompare,
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: `${label} vertex shader`,
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: `${label} fragment shader`,
                    code: shaders.forwardPlusFragSrc
                }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        if (renderer.forwardPlusDepthOptimizationEnabled) {
            const depthPrepass = encoder.beginRenderPass({
                label: "Forward+ depth prepass",
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthClearValue: 1,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                }
            });
            if (renderer.renderBundlesEnabled) {
                depthPrepass.executeBundles([this.depthRenderBundle]);
            } else {
                encodeSceneDraws(depthPrepass, this.scene, this.depthPipeline, this.depthSceneBindGroup);
            }
            depthPrepass.end();

            encoder.clearBuffer(this.lights.forwardPlusClusterMaskBuffer);
            const clusterCullPass = encoder.beginRenderPass({
                label: "depth-based cluster culling fullscreen pass",
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthReadOnly: true
                }
            });
            clusterCullPass.setPipeline(this.clusterCullPipeline);
            clusterCullPass.setBindGroup(0, this.clusterCullBindGroup);
            clusterCullPass.draw(3);
            clusterCullPass.end();

            this.lights.doLightClustering(encoder, true);
        } else {
            this.lights.doLightClustering(encoder);
        }

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const optimized = renderer.forwardPlusDepthOptimizationEnabled;
        const renderPass = encoder.beginRenderPass({
            label: "Forward+ render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: optimized ? undefined : 1,
                depthLoadOp: optimized ? "load" : "clear",
                depthStoreOp: "store"
            }
        });

        const pipeline = optimized ? this.pipeline : this.baselinePipeline;
        const bundle = optimized ? this.sceneRenderBundle : this.baselineRenderBundle;
        if (renderer.renderBundlesEnabled) {
            renderPass.executeBundles([bundle]);
        } else {
            encodeSceneDraws(renderPass, this.scene, pipeline, this.sceneBindGroup);
        }
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
