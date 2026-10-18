import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    private readonly positionFormat: GPUTextureFormat = "rgba16float";
    private readonly normalFormat: GPUTextureFormat = "rgba16float";
    private readonly albedoFormat: GPUTextureFormat = "rgba8unorm";
    private readonly depthFormat: GPUTextureFormat = "depth24plus";

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    geometrySceneBindGroupLayout: GPUBindGroupLayout;
    geometrySceneBindGroup: GPUBindGroup;
    geometryPipeline: GPURenderPipeline;

    lightingSceneBindGroupLayout: GPUBindGroupLayout;
    lightingSceneBindGroup: GPUBindGroup;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    lightingPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.positionTexture = renderer.device.createTexture({
            label: "G-buffer position",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: this.positionFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.positionTextureView = this.positionTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            label: "G-buffer normal",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: this.normalFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            label: "G-buffer albedo",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: this.albedoFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.albedoTextureView = this.albedoTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "G-buffer depth",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: this.depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT // We dont sample depth, doesnt need texture binding
        });
        this.depthTextureView = this.depthTexture.createView();

        this.geometrySceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred geometry scene layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.geometrySceneBindGroup = renderer.device.createBindGroup({
            label: "deferred geometry scene bind group",
            layout: this.geometrySceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.camera.uniformsBuffer
                    }
                }
            ]
        });

        this.geometryPipeline = renderer.device.createRenderPipeline({
            label: "deferred geometry pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred geometry pipeline layout",
                bindGroupLayouts: [
                    this.geometrySceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred geometry vertex shader",
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
                    { format: this.positionFormat },
                    { format: this.normalFormat },
                    { format: this.albedoFormat }
                ]
            },
            depthStencil: {
                format: this.depthFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        // Lighting pass bindings
        this.lightingSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred lighting scene layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
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

        this.lightingSceneBindGroup = renderer.device.createBindGroup({
            label: "deferred lighting scene bind group",
            layout: this.lightingSceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.camera.uniformsBuffer
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.lights.lightSetStorageBuffer
                    }
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.lights.clusterSetStorageBuffer
                    }
                }
            ]
        });

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred G-buffer read layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "deferred G-buffer read bind group",
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

        this.lightingPipeline = renderer.device.createRenderPipeline({
            label: "deferred fullscreen lighting pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen lighting pipeline layout",
                bindGroupLayouts: [
                    this.lightingSceneBindGroupLayout, // group 0
                    this.gBufferBindGroupLayout  // group 1
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
                    label: "deferred fullscreen lighting fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                entryPoint: "main",
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder({ label: "clustered deferred command encoder" });

        // Shared cluster light lists
        this.lights.doLightClustering(encoder);

        // Render geom into Gbuffer
        const geometryPass = encoder.beginRenderPass({
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
            depthStencilAttachment : {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        geometryPass.setPipeline(this.geometryPipeline);
        geometryPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.geometrySceneBindGroup
        );

        this.scene.iterate( node => {
            geometryPass.setBindGroup(
                shaders.constants.bindGroup_model,
                node.modelBindGroup
            );
        }, material => {
            geometryPass.setBindGroup(
                shaders.constants.bindGroup_material,
                material.materialBindGroup
            );
        }, primitive => {
            geometryPass.setVertexBuffer(0, primitive.vertexBuffer);
            geometryPass.setIndexBuffer(primitive.indexBuffer, "uint32");
            geometryPass.drawIndexed(primitive.numIndices);
        });

        geometryPass.end();

        // Shade Gbuffer into the canvas

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const lightingPass = encoder.beginRenderPass({
            label : "deferred fullscreen lighting pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear", 
                    storeOp: "store"
                }
            ]
        });

        lightingPass.setPipeline(this.lightingPipeline);
        lightingPass.setBindGroup(0, this.lightingSceneBindGroup);
        lightingPass.setBindGroup(1, this.gBufferBindGroup);

        lightingPass.draw(3);
        lightingPass.end();



        renderer.device.queue.submit([
            encoder.finish()
        ]);
    }
}
