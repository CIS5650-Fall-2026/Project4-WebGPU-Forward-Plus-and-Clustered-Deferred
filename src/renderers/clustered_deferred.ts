import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    static readonly albedoFormat: GPUTextureFormat = "rgba8unorm";
    static readonly normalFormat: GPUTextureFormat = "rgba16float";
    static readonly depthFormat: GPUTextureFormat = "depth24plus";

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout (clustered deferred)",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group (clustered deferred)",
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

        const size = [renderer.canvas.width, renderer.canvas.height];
        const gBufferUsage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;

        this.albedoTexture = renderer.device.createTexture({
            label: "g-buffer albedo",
            size: size,
            format: ClusteredDeferredRenderer.albedoFormat,
            usage: gBufferUsage
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            label: "g-buffer normal",
            size: size,
            format: ClusteredDeferredRenderer.normalFormat,
            usage: gBufferUsage
        });
        this.normalTextureView = this.normalTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "g-buffer depth",
            size: size,
            format: ClusteredDeferredRenderer.depthFormat,
            usage: gBufferUsage
        });
        this.depthTextureView = this.depthTexture.createView();

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "g-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                { binding: 0, resource: this.albedoTextureView },
                { binding: 1, resource: this.normalTextureView },
                { binding: 2, resource: this.depthTextureView }
            ]
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "g-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "g-buffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: ClusteredDeferredRenderer.depthFormat
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "g-buffer vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "g-buffer frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                // note that @location() and colorAttachments order must match this
                targets: [
                    { format: ClusteredDeferredRenderer.albedoFormat },
                    { format: ClusteredDeferredRenderer.normalFormat }
                ]
            }
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "deferred fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout, // bindGroup_scene = 0
                    this.gBufferBindGroupLayout        // bindGroup_gbuffer = 1
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [ { format: renderer.canvasFormat } ]
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder({ label: "clustered deferred frame encoder" });
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        encoder.pushDebugGroup("cluster lights");
        this.lights.doLightClustering(encoder);
        encoder.popDebugGroup();

        encoder.pushDebugGroup("g-buffer");
        const gBufferPass = encoder.beginRenderPass({
            label: "g-buffer pass",
            timestampWrites: renderer.gpuTimer?.passWrites("g-buffer"),
            colorAttachments: [
                { view: this.albedoTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
                { view: this.normalTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        this.scene.iterate(node => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gBufferPass.drawIndexed(primitive.numIndices);
        });
        gBufferPass.end();
        encoder.popDebugGroup();

        encoder.pushDebugGroup("deferred shading");
        const shadingPass = encoder.beginRenderPass({
            label: "deferred fullscreen pass",
            timestampWrites: renderer.gpuTimer?.passWrites("fullscreen shading"),
            colorAttachments: [
                { view: canvasTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }
            ]
        });
        shadingPass.setPipeline(this.fullscreenPipeline);
        shadingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        shadingPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gBufferBindGroup);
        shadingPass.draw(3);
        shadingPass.end();
        encoder.popDebugGroup();

        renderer.gpuTimer?.resolve(encoder);
        renderer.device.queue.submit([encoder.finish()]);
        renderer.gpuTimer?.afterSubmit();
    }
}
