import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView
    posTexture: GPUTexture;
    posTextureView: GPUTextureView
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gbufferBindGroupLayout: GPUBindGroupLayout;
    gbufferBindGroup: GPUBindGroup;
    gBufferPipeline: GPURenderPipeline;

    fullscreenBindGroupLayout: GPUBindGroupLayout;
    fullscreenBindGroup: GPUBindGroup;
    fullscreenPipeline: GPURenderPipeline;


    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass 

        this.gbufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer bind group layout",
            entries: [ 
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.gbufferBindGroup = renderer.device.createBindGroup({
            label: "gbuffer bind group",
            layout: this.gbufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });

        // G-buffer textures setup 
        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.posTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.posTextureView = this.posTexture.createView();
        
        this.depthTexture = renderer.device.createTexture({
                            size: [renderer.canvas.width, renderer.canvas.height],
                            format: "depth24plus",
                            usage: GPUTextureUsage.RENDER_ATTACHMENT
                        });
        this.depthTextureView = this.depthTexture.createView(); 



        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "gbuffer pipeline layout",
                bindGroupLayouts: [
                    this.gbufferBindGroupLayout,
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
                    label: "vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: "rgba8unorm" },
                    { format: "rgba16float" },
                    { format: "rgba16float" }
                ]
            }
        });

        this.fullscreenBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "fullscreen bind group layout",
            entries: [
                { // camera uniforms
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
                        }, 
                        { // albedo texture
                            binding: 3,
                            visibility: GPUShaderStage.FRAGMENT,
                            texture: { sampleType: "float" }
                        },
                        { // normal texture
                            binding: 4,
                            visibility: GPUShaderStage.FRAGMENT,
                            texture: { sampleType: "float" }
                        },
                        { // pos texture
                            binding: 5,
                            visibility: GPUShaderStage.FRAGMENT,
                            texture: { sampleType: "float" }
                        }
            ]
        });

        this.fullscreenBindGroup = renderer.device.createBindGroup({
            label: "fullscreen bind group",
            layout: this.fullscreenBindGroupLayout,
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
                    resource: { buffer: this.lights.clusterBuffer }
                }, 
                {
                    binding: 3,
                    resource: this.albedoTextureView
                }, 
                {
                    binding: 4,
                    resource: this.normalTextureView
                }, 
                {
                    binding: 5,
                    resource: this.posTextureView
                }
            ]
        });


        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",    
                bindGroupLayouts: [
                    this.fullscreenBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc, 
                }),
                buffers: []
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc, 
                }),
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
        // - 
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // 0. run the clustering compute shader
        this.lights.doLightClustering(encoder);

        // 1. run the G-buffer pass
        const gbufferPass = encoder.beginRenderPass({
            label: "gbuffer pass", 
            colorAttachments: [
                {
                    view: this.albedoTextureView,
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
                    view: this.posTextureView,
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
        gbufferPass.setPipeline(this.gBufferPipeline);
        gbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.gbufferBindGroup);

        this.scene.iterate(node => {
                            gbufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
                        }, material => {
                            gbufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
                        }, primitive => {
                            gbufferPass.setVertexBuffer(0, primitive.vertexBuffer);
                            gbufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                            gbufferPass.drawIndexed(primitive.numIndices);
                        });
        gbufferPass.end();

        // 2. run the fullscreen pass
        const fullscreenPass = encoder.beginRenderPass({
            label: "fullscreen pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(0, this.fullscreenBindGroup);
        fullscreenPass.draw(6); // 2 triangles * 3 vert 
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
