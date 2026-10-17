import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    albView: GPUTextureView;
    posView: GPUTextureView;
    normView: GPUTextureView;
    depthTexture: GPUTexture;
    
    gpubindlayout: GPUBindGroupLayout;
    gpubindgroup: GPUBindGroup;

    depthTextureView: GPUTextureView;
    albTexture: GPUTexture;
    posTexture: GPUTexture;
    normTexture: GPUTexture;
    

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred scene bind group layout",
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
            label: "clustered deferred scene bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterSetStorageBuffer } }
            ]
        });

        const size = [renderer.canvas.width, renderer.canvas.height];

        this.depthTexture = renderer.device.createTexture({
            size,
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.albTexture = renderer.device.createTexture({
            label: "gbuffer albedo",
            size,
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.posTexture = renderer.device.createTexture({
            label: "g buffer position",
            size,
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.normTexture = renderer.device.createTexture({
            label: "g buffer normalized texture",
            size,
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

                this.posView = this.posTexture.createView();
                this.normView = this.normTexture.createView();


        this.albView = this.albTexture.createView();
        
        this.gpubindlayout = renderer.device.createBindGroupLayout({
            label: "gbuffer bind group layout",
            entries: [
                { binding: 0, 
                    visibility: GPUShaderStage.FRAGMENT, 
                    texture: { sampleType: "unfilterable-float" } },
                { binding: 1, 
                    visibility: GPUShaderStage.FRAGMENT, 
                    texture: { sampleType: "unfilterable-float" } },
                { binding: 2, 
                    visibility: GPUShaderStage.FRAGMENT, 
                    texture: { sampleType: "unfilterable-float" } }
            ]
        });

        this.gpubindgroup = renderer.device.createBindGroup({
            label: "g-buffer bind group",
            layout: this.gpubindlayout,
            entries: [
                { binding: 0, 
                    resource: this.posView },
                { binding: 1,
                    resource: this.normView },
                { binding: 2, 
                    resource: this.albView }
            ]
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "gbuffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "gbuffer pipeline layout",
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
                    label: "gbuffer naive shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "gbuffer fragment shader (deferred)",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: "rgba32float" },
                    { format: "rgba16float" },
                    { format: "rgba8unorm" }
                ]
            }
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "clustered deferred fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gpubindlayout
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
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        this.lights.doLightClustering(encoder);

        //setup the gbuffpass
        const gbuffpass = encoder.beginRenderPass({
            label: "g buffer pass",
            colorAttachments: [
                { view: this.posView, 
                    clearValue: [0, 0, 0, 0], 
                    loadOp: "clear", storeOp: "store" },
                { view: this.normView, 
                    clearValue: [0, 0, 0, 0], 
                    loadOp: "clear", storeOp: "store" },
                { view: this.albView, 
                    clearValue: [0, 0, 0, 0], 
                    loadOp: "clear", storeOp: "store" }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        gbuffpass.setPipeline(this.gBufferPipeline);
        gbuffpass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            gbuffpass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gbuffpass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gbuffpass.setVertexBuffer(0, primitive.vertexBuffer);
            gbuffpass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gbuffpass.drawIndexed(primitive.numIndices);
        });

        gbuffpass.end();

        const fullscreenRenderPass = 
        encoder.beginRenderPass({
            label: "deferred fullscreen pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        fullscreenRenderPass.setBindGroup(0, this.sceneUniformsBindGroup);
        fullscreenRenderPass.setBindGroup(1, this.gpubindgroup);

        fullscreenRenderPass.setPipeline(this.fullscreenPipeline);

        fullscreenRenderPass.draw(3);
        fullscreenRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
