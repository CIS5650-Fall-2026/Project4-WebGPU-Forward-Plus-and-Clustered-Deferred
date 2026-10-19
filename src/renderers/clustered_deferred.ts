import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneLayout: GPUBindGroupLayout;
    sceneGroup: GPUBindGroup;
    
    gbufferLayout: GPUBindGroupLayout;
    gbufferGroup: GPUBindGroup;
    
    
    albedoTexture: GPUTexture;
    normalTexture: GPUTexture;
    positionTexture: GPUTexture;
    
    depthTex: GPUTexture;
    depthView: GPUTextureView;
    
    gbufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        const width = renderer.canvas.width;
        const height = renderer.canvas.height;

        this.sceneLayout = renderer.device.createBindGroupLayout({
            label: "deferred scene layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lights
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // cells
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });
        
        this.sceneGroup = renderer.device.createBindGroup({
            label: "deferred scene group",
            layout: this.sceneLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.cellsBuffer } }
            ]
        });
        

        // color, normal, and position, one texture each
        this.albedoTexture = renderer.device.createTexture({
            size: [width, height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        
        this.normalTexture = renderer.device.createTexture({
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        
        this.positionTexture = renderer.device.createTexture({
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        



        this.gbufferLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} }
            ]
        });
        
        this.gbufferGroup = renderer.device.createBindGroup({
            label: "gbuffer group",
            layout: this.gbufferLayout,
            entries: [
                { binding: 0, resource: this.albedoTexture.createView() },
                { binding: 1, resource: this.normalTexture.createView() },
                { binding: 2, resource: this.positionTexture.createView() }
            ]
        });
        this.depthTex = renderer.device.createTexture({
            size: [width, height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthView = this.depthTex.createView();
        this.gbufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "gbuffer pipeline layout",
                bindGroupLayouts: [
                    this.sceneLayout,
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
                    label: "gbuffer vert",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "gbuffer frag",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: "rgba8unorm" },
                    { format: "rgba16float" },
                    { format: "rgba16float" }
                ]
            }
        });
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.sceneLayout,
                    this.gbufferLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen vert",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "fullscreen frag",
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

        const encoder = renderer.device.createCommandEncoder();

        // fill the cells before drawing
        this.lights.doLightClustering(encoder);

        const gbufferPass = encoder.beginRenderPass({
            label: "gbuffer pass",
            colorAttachments: [
                { view: this.albedoTexture.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
                { view: this.normalTexture.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
                { view: this.positionTexture.createView(), clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }
            ],
            depthStencilAttachment: {
                view: this.depthView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        gbufferPass.setPipeline(this.gbufferPipeline);
        gbufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneGroup);


        // each mesh part, then texture, then triangles
        this.scene.iterate(
            node => { gbufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup); },

            material => { gbufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup); },
            
            primitive => {
                gbufferPass.setVertexBuffer(0, primitive.vertexBuffer);
                gbufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                gbufferPass.drawIndexed(primitive.numIndices);
            }
        );

        gbufferPass.end();
        

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const fullscreenPass = encoder.beginRenderPass({
            label: "fullscreen pass",
            colorAttachments: [{ view: canvasTextureView, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }]});
        
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneGroup);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_model, this.gbufferGroup);
        
        // 3 vertices, the shader makes one triangle that covers our window
        fullscreenPass.draw(3);
        
        fullscreenPass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}
