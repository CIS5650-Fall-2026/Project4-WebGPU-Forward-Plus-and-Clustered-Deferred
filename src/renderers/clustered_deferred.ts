import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    sceneBindGroupLayout: GPUBindGroupLayout;
    sceneBindGroup: GPUBindGroup;

    fullscreenBindGroupLayout: GPUBindGroupLayout;
    fullscreenBindGroup: GPUBindGroup;

    positionTexture: GPUTexture;
    positionView: GPUTextureView;

    normalTexture: GPUTexture;
    normalView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoView: GPUTextureView;

    depthTexture: GPUTexture;
    depthView: GPUTextureView;

    zPrepassPipeline: GPURenderPipeline;
    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        const gBufferUsage =
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.TEXTURE_BINDING;

        this.positionTexture = renderer.device.createTexture({
            label: "G-buffer position",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: gBufferUsage,
        });
        this.positionView = this.positionTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            label: "G-buffer normal",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: gBufferUsage,
        });
        this.normalView = this.normalTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            label: "G-buffer albedo",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: gBufferUsage,
        });
        this.albedoView = this.albedoTexture.createView();

        this.depthTexture = renderer.device.createTexture({
            label: "deferred depth",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.depthView = this.depthTexture.createView();

        // first pass
        this.sceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred geometry scene bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this.sceneBindGroup = renderer.device.createBindGroup({
            label: "deferred geometry scene bind group",
            layout: this.sceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
            ],
        });

        // fullscreen pass
        this.fullscreenBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred fullscreen bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    binding: 6,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
            ],
        });

        this.fullscreenBindGroup = renderer.device.createBindGroup({
            label: "deferred fullscreen bind group",
            layout: this.fullscreenBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterLightListsStorageBuffer },
                },
                {
                    binding: 3,
                    resource: this.positionView,
                },
                {
                    binding: 4,
                    resource: this.normalView,
                },
                {
                    binding: 5,
                    resource: this.albedoView,
                },
                { binding: 6, resource: { buffer: this.lights.pixelClustersStorageBuffer } },
            ],
        });

        const geometryPipelineLayout = renderer.device.createPipelineLayout({
            label: "deferred geometry pipeline layout",
            bindGroupLayouts: [
                this.sceneBindGroupLayout,
                renderer.modelBindGroupLayout,
                renderer.materialBindGroupLayout,
            ],
        });
        const geometryVertex: GPUVertexState = {
            module: renderer.device.createShaderModule({ code: shaders.naiveVertSrc }),
            buffers: [renderer.vertexBufferLayout],
        };
        this.zPrepassPipeline = renderer.device.createRenderPipeline({
            label: "deferred depth pre-pass pipeline",
            layout: geometryPipelineLayout,
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: geometryVertex,
            fragment: {
                module: renderer.device.createShaderModule({ code: shaders.zPrepassFragSrc }),
                targets: [],
            },
        });
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "deferred G-buffer pipeline",
            layout: geometryPipelineLayout,
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "equal",
                format: "depth24plus",
            },
            vertex: geometryVertex,
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    { format: "rgba16float" },
                    { format: "rgba16float" },
                    { format: "rgba8unorm" },
                ],
            },
        });

        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            label: "deferred fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred fullscreen pipeline layout",
                bindGroupLayouts: [this.fullscreenBindGroupLayout],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred fullscreen fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [{ format: renderer.canvasFormat }]
            },
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        const zPass = encoder.beginRenderPass({
            label: "0. deferred depth pre-pass",
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthView,
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        zPass.setPipeline(this.zPrepassPipeline);
        this.drawScene(zPass);
        zPass.end();

        this.lights.doLightClustering(encoder, this.depthView);

        const gBufferPass = encoder.beginRenderPass({
            label: "deferred G-buffer pass",
            colorAttachments: [
                {
                    view: this.positionView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.normalView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.albedoView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthView,
                depthLoadOp: "load",
                depthStoreOp: "store",
            },
        });

        gBufferPass.setPipeline(this.gBufferPipeline);
        this.drawScene(gBufferPass);
        gBufferPass.end();

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const fullscreenPass = encoder.beginRenderPass({
            label: "deferred fullscreen pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.fullscreenBindGroup);
        fullscreenPass.draw(3);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }

    private drawScene(pass: GPURenderPassEncoder) {
        pass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneBindGroup);

        this.scene.iterate(node => {
            pass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            pass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            pass.setVertexBuffer(0, primitive.vertexBuffer);
            pass.setIndexBuffer(primitive.indexBuffer, "uint32");
            pass.drawIndexed(primitive.numIndices);
        });
    }
}
