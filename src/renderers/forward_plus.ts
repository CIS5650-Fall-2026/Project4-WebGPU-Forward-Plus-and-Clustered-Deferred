import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    forwardPlusBindGroupLayout: GPUBindGroupLayout;
    forwardPlusBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    forwardPlusPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        this.forwardPlusBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward plus scene uniforms bind group layout",
            entries: [
                { //camera
                    binding:0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer:{type: "uniform"}
                },
                { //light
                    binding:1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer:{type: "read-only-storage"}
                },
                { //cluster
                    binding:2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer:{type: "read-only-storage"}
                }
            ]
        });

        this.forwardPlusBindGroup = renderer.device.createBindGroup({
            label: "forward plus scene bind group",
            layout: this.forwardPlusBindGroupLayout,
            entries: [
                {
                    binding:0,
                    resource: {buffer:this.camera.uniformsBuffer}
                },
                {
                    binding:1,
                    resource: {buffer:this.lights.lightSetStorageBuffer}
                },
                {
                    binding:2,
                    resource: {buffer:this.lights.clusterStorageBuffer}
                }
            ]
        });

        //WebGPU doesn't automatically supply a depth buffer lmao
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        })
        this.depthTextureView = this.depthTexture.createView();

        //pipeline describes how to draw (shaders, vertex input format, depth testing, and other rendering settings)
        //configured processing stages and rules
        this.forwardPlusPipeline = renderer.device.createRenderPipeline({
            label: "forward plus render pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward plus render pipeline layout",
                bindGroupLayouts: [
                    this.forwardPlusBindGroupLayout,
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
                    label: "forward plus naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout] //tells how to decode the raw vertex data, vertex buffers have a special input path into the vertex shader
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward plus frag shader",
                    code: shaders.forwardPlusFragSrc
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
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        //compute pass
        this.lights.doLightClustering(encoder);

        //make renderPass, record encoder and submit calls
        //renderpass records drawing into particular attachments (which color/depth textures to use, whether to clear them, and the actual draw commands)
        const renderPass = encoder.beginRenderPass({
            label: "forward plus render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
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
        })
        //select a pipeline for the pass
        renderPass.setPipeline(this.forwardPlusPipeline);

        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.forwardPlusBindGroup);

        this.scene.iterate(
            node => { renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);},
            material => { renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);},
            primitive => { renderPass.setVertexBuffer(0,primitive.vertexBuffer);
                            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                            renderPass.drawIndexed(primitive.numIndices);}
        );

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
