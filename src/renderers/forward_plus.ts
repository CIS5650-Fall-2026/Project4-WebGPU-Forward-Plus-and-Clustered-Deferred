import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { settings } from '../settings';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    prepassPipeline: GPURenderPipeline | undefined;
    prepassBundle: GPURenderBundle | undefined;

    pipeline: GPURenderPipeline;
    bundle: GPURenderBundle | undefined;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ scene uniforms bind group layout",
            entries: [
                { // cameraUniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "forward+ scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        const pipelineLayout = renderer.device.createPipelineLayout({
            label: "forward+ pipeline layout",
            bindGroupLayouts: [
                this.sceneUniformsBindGroupLayout,
                renderer.modelBindGroupLayout,
                renderer.materialBindGroupLayout
            ]
        });

        const vertex: GPUVertexState = {
            module: renderer.device.createShaderModule({
                label: "forward+ vert shader",
                code: shaders.naiveVertSrc
            }),
            buffers: [ renderer.vertexBufferLayout ]
        };

        if (settings.depthPrepass) {
            this.prepassPipeline = renderer.device.createRenderPipeline({
                layout: pipelineLayout,
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: "less",
                    format: "depth24plus"
                },
                vertex: vertex,
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "depth prepass frag shader",
                        code: shaders.depthPrepassFragSrc
                    }),
                    targets: []
                }
            });
        }

        this.pipeline = renderer.device.createRenderPipeline({
            layout: pipelineLayout,
            depthStencil: {
                depthWriteEnabled: !settings.depthPrepass,
                depthCompare: settings.depthPrepass ? "less-equal" : "less",
                format: "depth24plus"
            },
            vertex: vertex,
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ frag shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        if (settings.renderBundles) {
            this.bundle = this.recordBundle([renderer.canvasFormat], this.pipeline, this.sceneUniformsBindGroup);
            if (this.prepassPipeline) {
                this.prepassBundle = this.recordBundle([], this.prepassPipeline, this.sceneUniformsBindGroup);
            }
        }
    }

    override stop() {
        super.stop();
        this.depthTexture.destroy();
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        this.lights.doLightClustering(encoder, this.timestampWrites());

        if (this.prepassPipeline) {
            const prepass = encoder.beginRenderPass({
                label: "depth prepass",
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthClearValue: 1.0,
                    depthLoadOp: "clear",
                    depthStoreOp: "store"
                },
                timestampWrites: this.timestampWrites()
            });
            if (this.prepassBundle) {
                prepass.executeBundles([this.prepassBundle]);
            } else {
                prepass.setPipeline(this.prepassPipeline);
                prepass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
                this.drawScene(prepass);
            }
            prepass.end();
        }

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
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
                depthClearValue: 1.0,
                depthLoadOp: this.prepassPipeline ? "load" : "clear",
                depthStoreOp: "store"
            },
            timestampWrites: this.timestampWrites()
        });
        if (this.bundle) {
            renderPass.executeBundles([this.bundle]);
        } else {
            renderPass.setPipeline(this.pipeline);
            renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            this.drawScene(renderPass);
        }
        renderPass.end();

        this.resolveTimestamps(encoder);
        renderer.device.queue.submit([encoder.finish()]);
    }
}
