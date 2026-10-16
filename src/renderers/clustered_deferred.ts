import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.positionTexture = renderer.device.createTexture({
            label: "deferred position texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.positionTextureView = this.positionTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            label: "deferred normal texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            label: "deferred albedo texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "deferred depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.sceneUniformsBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "deferred scene bind group layout",
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
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "read-only-storage" }
                    }
                ]
            });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "deferred scene bind group",
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
                    resource: { buffer: this.lights.clusterGridBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.lights.lightIndexBuffer }
                }
            ]
        });

        this.gBufferBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "deferred G-buffer bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: { sampleType: "unfilterable-float" }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: { sampleType: "float" }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: { sampleType: "float" }
                    }
                ]
            });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "deferred G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView
                },
                {
                    binding: 1,
                    resource: this.normalTextureView
                },
                {
                    binding: 2,
                    resource: this.albedoTextureView
                }
            ]
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "deferred G-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred G-buffer vertex shader",
                    code: shaders.naiveVertSrc
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: "rgba32float" },
                    { format: "rgba16float" },
                    { format: "rgba8unorm" }
                ]
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "deferred fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder({
            label: "deferred command encoder"
        });

        this.lights.doLightClustering(encoder);

        const gBufferPass = encoder.beginRenderPass({
            label: "deferred G-buffer pass",
            colorAttachments: [
                {
                    view: this.positionTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.albedoTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );

        this.scene.iterate(node => {
            gBufferPass.setBindGroup(
                shaders.constants.bindGroup_model,
                node.modelBindGroup
            );
        }, material => {
            gBufferPass.setBindGroup(
                shaders.constants.bindGroup_material,
                material.materialBindGroup
            );
        }, primitive => {
            gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gBufferPass.setIndexBuffer(primitive.indexBuffer, "uint32");
            gBufferPass.drawIndexed(primitive.numIndices);
        });

        gBufferPass.end();

        const fullscreenPass = encoder.beginRenderPass({
            label: "deferred fullscreen pass",
            colorAttachments: [
                {
                    view: renderer.context.getCurrentTexture().createView(),
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );
        fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
        fullscreenPass.draw(3);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);

        void this.lights.checkOverflow();
    }
}
