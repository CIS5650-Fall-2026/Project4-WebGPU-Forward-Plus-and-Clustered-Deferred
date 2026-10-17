import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    markClustersBindGroupLayout: GPUBindGroupLayout;
    markClustersBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    depthPrepassPipeline: GPURenderPipeline;
    markClustersPipeline: GPURenderPipeline;
    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ scene uniforms bind group layout",
            entries: [
                { // camera
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

        // depth32float keeps the exact depth of each fragment, so the depth test can use "equal"
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.markClustersBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "mark clusters bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // depth
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                { // clusterFlags
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.markClustersBindGroup = renderer.device.createBindGroup({
            label: "mark clusters bind group",
            layout: this.markClustersBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: this.depthTextureView
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterFlagsStorageBuffer }
                }
            ]
        });

        const sceneLayout = renderer.device.createPipelineLayout({
            label: "forward+ pipeline layout",
            bindGroupLayouts: [
                this.sceneUniformsBindGroupLayout,
                renderer.modelBindGroupLayout,
                renderer.materialBindGroupLayout
            ]
        });
        const vertModule = renderer.device.createShaderModule({
            label: "forward+ vert shader",
            code: shaders.naiveVertSrc
        });

        this.depthPrepassPipeline = renderer.device.createRenderPipeline({
            label: "depth prepass pipeline",
            layout: sceneLayout,
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth32float"
            },
            vertex: {
                module: vertModule,
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "depth prepass frag shader",
                    code: shaders.depthPrepassFragSrc
                }),
                targets: []
            }
        });

        this.markClustersPipeline = renderer.device.createRenderPipeline({
            label: "mark clusters pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "mark clusters pipeline layout",
                bindGroupLayouts: [ this.markClustersBindGroupLayout ]
            }),
            // the depth buffer stays attached read-only, the shader reads it as a texture
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "always",
                format: "depth32float"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.fullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "mark clusters frag shader",
                    code: shaders.markClustersFragSrc
                }),
                targets: []
            }
        });

        this.pipeline = renderer.device.createRenderPipeline({
            label: "forward+ pipeline",
            layout: sceneLayout,
            // only the closest fragment of each pixel passes, so each pixel is shaded once
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "equal",
                format: "depth32float"
            },
            vertex: {
                module: vertModule,
                buffers: [ renderer.vertexBufferLayout ]
            },
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
    }

    private drawScene(pass: GPURenderPassEncoder) {
        pass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

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

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const prepass = encoder.beginRenderPass({
            label: "depth prepass",
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        prepass.setPipeline(this.depthPrepassPipeline);
        this.drawScene(prepass);
        prepass.end();

        encoder.clearBuffer(this.lights.clusterFlagsStorageBuffer);
        const markPass = encoder.beginRenderPass({
            label: "mark clusters pass",
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthReadOnly: true
            }
        });
        markPass.setPipeline(this.markClustersPipeline);
        markPass.setBindGroup(shaders.constants.bindGroup_scene, this.markClustersBindGroup);
        markPass.draw(3);
        markPass.end();

        this.lights.doLightClustering(encoder, true);

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
                depthReadOnly: true
            }
        });
        renderPass.setPipeline(this.pipeline);
        this.drawScene(renderPass);
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
