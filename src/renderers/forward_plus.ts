import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ scene bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } }
            ]
        });
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "forward+ scene bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterSetStorageBuffer } }
            ]
        });
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();
        this.pipeline = renderer.device.createRenderPipeline({
            label: "forward+ pipeline",
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [this.sceneUniformsBindGroupLayout, renderer.modelBindGroupLayout, renderer.materialBindGroupLayout]
            }),
            depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
            vertex: {
                module: renderer.device.createShaderModule({ label: "forward+ vertex shader", code: shaders.naiveVertSrc }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({ label: "forward+ fragment shader", code: shaders.forwardPlusFragSrc }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder);
        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            colorAttachments: [{
                view: renderer.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store"
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store"
            }
        });
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });
        renderPass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}
