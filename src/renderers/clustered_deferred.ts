import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import {canvas, device, fovYDegrees} from '../renderer'

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    geometryBindGroupLayout: GPUBindGroupLayout;
    geometryBindGroup: GPUBindGroup;
    lightingBindGroupLayout: GPUBindGroupLayout;
    lightingBindGroup: GPUBindGroup;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    geometryPipeline: GPURenderPipeline;
    lightingPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        // need light clusters for this 
     
        // G-buffer pass

        this.geometryBindGroupLayout = device.createBindGroupLayout({
            label: "geometry pass bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {type: "uniform"}
                }
            ]
        });

        this.geometryBindGroup = device.createBindGroup({
            label: "geometry bind group",
            layout: this.geometryBindGroupLayout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                }
            ]
        });

        // depth texture (needed for G buffer pass)
        this.depthTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING // reuse later for position
        });
        this.depthTextureView = this.depthTexture.createView();

        // albedo texture
        this.albedoTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();

        // normal texture 
        this.normalTexture = device.createTexture({
            size: [canvas.width, canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.geometryPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ 
                label: "geometry pass pipeline layout",
                bindGroupLayouts: [ 
                    this.geometryBindGroupLayout,
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
                module: device.createShaderModule({
                    label: "geometry vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: device.createShaderModule({
                    label: "geometry frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [ // render on albedo, normal targets 
                    {format: "rgba8unorm"},
                    {format: "rgba16float"}
                ]
            }
        });

        // Lighting pass

        this.lightingBindGroupLayout = device.createBindGroupLayout({
            label: "lighting pass bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {type: "uniform"}
                },
                { // canvas dimensions
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "uniform"}
                },
                { // cluster info
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "uniform"}
                },
                { // lights
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "read-only-storage"}
                },
                { // light clusters
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "read-only-storage"}
                },
                { // albedo texture
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "unfilterable-float"}
                },
                { // normal texture
                    binding: 6,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "unfilterable-float"}
                },
                { // depth texture
                    binding: 7,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {sampleType: "depth"}
                }
            ]
        });

        this.lightingBindGroup = device.createBindGroup({
            label: "lighting pass bind group",
            layout: this.lightingBindGroupLayout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                },
                { // canvas dimensions
                    binding: 1,
                    resource: {buffer: this.lights.canvasDimsBuffer}
                },
                { // cluster info
                    binding: 2,
                    resource: {buffer: this.lights.clusterInfoBuffer}
                },
                { // lights
                    binding: 3,
                    resource: {buffer: this.lights.lightSetStorageBuffer}
                },
                { // light clusters
                    binding: 4,
                    resource: {buffer: this.lights.lightClusterBuffer}
                },
                { // albedo texture
                    binding: 5,
                    resource: this.albedoTextureView
                },
                { // normal texture
                    binding: 6,
                    resource: this.normalTextureView
                },
                { // depth texture
                    binding: 7,
                    resource: this.depthTextureView
                }
            ]
        });

        this.lightingPipeline = device.createRenderPipeline({ // no depthStencil bc rendering on fullscreen quad
            layout: device.createPipelineLayout({
                label: "lighting pass pipeline layout",
                bindGroupLayouts: [
                    this.lightingBindGroupLayout
                ]
            }),
            vertex: {
                module: device.createShaderModule({
                    label: "lighting pass vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: device.createShaderModule({
                    label: "lighting pass frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
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
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);

        const gPass = encoder.beginRenderPass({
            label: "geometry render pass",
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
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        gPass.setPipeline(this.geometryPipeline);
        gPass.setBindGroup(0, this.geometryBindGroup);

         // for loaded nodes, materials, primitives, set bind groups
        this.scene.iterate(node => {
            gPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gPass.setVertexBuffer(0, primitive.vertexBuffer);
            gPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gPass.drawIndexed(primitive.numIndices);
        });

        gPass.end();

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const lightingPass = encoder.beginRenderPass({
            label: "lighting render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        lightingPass.setPipeline(this.lightingPipeline);
        lightingPass.setBindGroup(0, this.lightingBindGroup);

        lightingPass.draw(6);
        lightingPass.end();

        device.queue.submit([encoder.finish()]);
    }
}
