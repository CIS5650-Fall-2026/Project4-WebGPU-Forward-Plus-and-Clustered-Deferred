import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    fullscreenBindGroupLayout: GPUBindGroupLayout;
    fullscreenBindGroup: GPUBindGroup;

    gBufferTexturesBindGroupLayout: GPUBindGroupLayout;
    gBufferTexturesBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    colorTexture: GPUTexture;
    colorTextureView: GPUTextureView;

    renderPipeline: GPURenderPipeline;
    gbufferPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // initialize textures

        this.depthTexture = renderer.device.createTexture({
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format: "depth24plus",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
                });
        this.depthTextureView = this.depthTexture.createView();
        
        this.positionTexture = renderer.device.createTexture({
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format: "rgba32float",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
                });
        this.positionTextureView = this.positionTexture.createView();

        this.normalTexture = renderer.device.createTexture({
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format: "rgba16float",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
                });
        this.normalTextureView = this.normalTexture.createView();

         this.colorTexture = renderer.device.createTexture({
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format: "rgba8unorm",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT |  GPUTextureUsage.TEXTURE_BINDING
                });
        this.colorTextureView = this.colorTexture.createView();

        // create deferred bind groups

        this.gBufferTexturesBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                { // Camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {type: "uniform"}
                }
            ],
        });

        this.gBufferTexturesBindGroup = renderer.device.createBindGroup({
            layout: this.gBufferTexturesBindGroupLayout,
            entries: [
                { binding: 0, resource: this.camera.uniformsBuffer }

            ],
        });

        // create full screen bind groups

        this.fullscreenBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // position
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // color
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // normal
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.fullscreenBindGroup = renderer.device.createBindGroup({
            label: "fullscreen bind group",
            layout: this.fullscreenBindGroupLayout,
            entries: [
                {
                    binding: 5,
                    resource:  this.positionTextureView
                },
                {
                    binding: 4,
                    resource:  this.colorTextureView
                },
                {
                    binding: 3,
                    resource:  this.normalTextureView
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });
        
        // initialize pipelines

        this.gbufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "gbuffer pre pass pipeline layout",
                bindGroupLayouts: [
                    this.gBufferTexturesBindGroupLayout,
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
                    label: "gbuffer pre pass vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "gbuffer pre pass frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    { format: 'rgba16float'}, // normal
                    { format: 'rgba8unorm'}, // color
                    { format: 'rgba32float'} // position
                ]
            }
        });

        this.renderPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
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
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        // runs the clustering compute shader
        this.lights.doLightClustering(encoder); // this does the compute shader to populate cluster stuff

        // run the gbuffer pass
        const gbufferPass = encoder.beginRenderPass({
            label: "gbuffer pass",
            colorAttachments: [
                {
                    view: this.normalTextureView,
                    clearValue: [0.0, 0.0, 1.0, 1.0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.colorTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.positionTextureView,
                    clearValue: [0, 0, 0, 1],
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

        gbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferTexturesBindGroup);

        this.scene.iterate(
            node =>  {
            gbufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gbufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gbufferPass.setVertexBuffer(0, primitive.vertexBuffer);
            gbufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gbufferPass.drawIndexed(primitive.numIndices);
        });

        gbufferPass.end();

        // run the rendering pass
        const renderPass = encoder.beginRenderPass({
            label: "clustered deferred render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        renderPass.setPipeline(this.renderPipeline);

        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.fullscreenBindGroup);

        renderPass.draw(3);
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);

    }
}
