import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    gbufferBindGroupLayout: GPUBindGroupLayout;
    gbufferBindGroup: GPUBindGroup;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gbufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.albedoTexture = renderer.device.createTexture({
            label: "albedo gbuffer",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            label: "normal gbuffer",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.positionTexture = renderer.device.createTexture({
            label: "position gbuffer",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.positionTextureView = this.positionTexture.createView();

        this.gbufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer bind group layout",
            entries: [
                { // albedo data
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "unfilterable-float"}
                },
                { // normal data
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "unfilterable-float"}
                },
                { // position data
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "unfilterable-float"}
                }
            ]
        });

        this.gbufferBindGroup = renderer.device.createBindGroup({
            label: "gbuffer bind group",
            layout: this.gbufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.albedoTextureView
                },
                {
                    binding: 1,
                    resource: this.normalTextureView
                },
                {
                    binding: 2,
                    resource: this.positionTextureView
                }
            ]
        });

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera data
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {type: "uniform"}
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "read-only-storage"}
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "read-only-storage"}
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                },
                {
                    binding: 1,
                    resource: {buffer: this.lights.lightSetStorageBuffer}
                },
                {
                    binding: 2,
                    resource: {buffer: this.lights.clusterSetStorageBuffer}
                }
            ]
        });
        
        this.depthTexture = renderer.device.createTexture({
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format: "depth24plus",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT
                });
        this.depthTextureView = this.depthTexture.createView();

        this.gbufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clusteredDeferred gbuffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
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
                    label: "clusteredDeferred gbuffer vert shader",
                    code: shaders.naiveVertSrc 
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clusteredDeferred gbuffer frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    {
                        format: "rgba8unorm"
                    },
                    {
                        format: "rgba16float"
                    },
                    {
                        format: "rgba32float"
                    }
                ]
            }
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clusteredDeferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gbufferBindGroupLayout
                ]
            }),
            // No depth stencil
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clusteredDeferred fullscreen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc 
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clusteredDeferred fullscreen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
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

        const encoder = renderer.device.createCommandEncoder();
        
        // --- COMPUTE PASS ---
        
        this.lights.doLightClustering(encoder);

        // --- GBUFFER PASS ---

        const gbufferPass = encoder.beginRenderPass({
            label: "clusteredDeferred gbuffer pass",
            colorAttachments: [
                {
                    view: this.albedoTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.positionTextureView,
                    clearValue: [0,0,0,0],
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
        gbufferPass.setPipeline(this.gbufferPipeline);

        gbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
                
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

        // --- FULLSCREEN PASS ---
        
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const fullscreenPass = encoder.beginRenderPass({
            label: "clusteredDeferred fullscreen pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            // No depth
        });
        fullscreenPass.setPipeline(this.fullscreenPipeline);

        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gbufferBindGroup);

        // draw fullscreen tri
        fullscreenPass.draw(3);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
