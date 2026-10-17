import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    fullscreenBindGroupLayout: GPUBindGroupLayout;
    fullscreenBindGroup: GPUBindGroup;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;
    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        // G-buffer textures: one texel per screen pixel
        const size = [renderer.canvas.width, renderer.canvas.height];
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        this.albedoTexture = renderer.device.createTexture({ label: "g-buffer albedo", size, format: "rgba8unorm", usage });
        this.albedoTextureView = this.albedoTexture.createView();
        this.normalTexture = renderer.device.createTexture({ label: "g-buffer normal", size, format: "rgba16float", usage });
        this.normalTextureView = this.normalTexture.createView();
        this.positionTexture = renderer.device.createTexture({ label: "g-buffer position", size, format: "rgba32float", usage });
        this.positionTextureView = this.positionTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            size,
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        // pass 1 (G-buffer): only the vertex shader needs the camera
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer bind group layout",
            entries: [
                { // cameraUniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "g-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });

        // pass 2 (fullscreen): camera, lights, clusters and the three G-buffer textures
        this.fullscreenBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "fullscreen bind group layout",
            entries: [
                { // cameraUniforms
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
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
                { // albedoTex
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // normalTex
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                { // positionTex
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                }
            ]
        });

        this.fullscreenBindGroup = renderer.device.createBindGroup({
            label: "fullscreen bind group",
            layout: this.fullscreenBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterSetStorageBuffer } },
                { binding: 3, resource: this.albedoTextureView },
                { binding: 4, resource: this.normalTextureView },
                { binding: 5, resource: this.positionTextureView }
            ]
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "g-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "g-buffer pipeline layout",
                bindGroupLayouts: [
                    this.gBufferBindGroupLayout,
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
                targets: [
                    { format: "rgba8unorm" },  // @location(0) albedo
                    { format: "rgba16float" }, // @location(1) normal
                    { format: "rgba32float" }  // @location(2) position
                ]
            }
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",
                bindGroupLayouts: [ this.fullscreenBindGroupLayout ]
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
        this.lights.doLightClustering(encoder);

        // pass 1: write albedo, normal and position of the closest surface at every pixel
        const gBufferPass = encoder.beginRenderPass({
            label: "g-buffer render pass",
            colorAttachments: [
                { view: this.albedoTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
                { view: this.normalTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
                { view: this.positionTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferBindGroup);

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

        // pass 2: one big triangle over the screen; light each pixel from the G-buffer
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const fullscreenPass = encoder.beginRenderPass({
            label: "fullscreen render pass",
            colorAttachments: [
                { view: canvasTextureView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }
            ]
        });
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.fullscreenBindGroup);
        fullscreenPass.draw(3);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
