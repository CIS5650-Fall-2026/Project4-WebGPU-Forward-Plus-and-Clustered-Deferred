import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export const deferredSettings = { bloom: true };

export class ClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroup: GPUBindGroup;
    gBufferBindGroup: GPUBindGroup;
    gBufferTexture: GPUTexture;
    gBufferView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    gBufferPipeline: GPURenderPipeline;
    lightingPipeline: GPUComputePipeline;
    litTexture: GPUTexture;
    bloomTextures: GPUTexture[];
    blurBindGroups: GPUBindGroup[];
    horizontalPipeline: GPUComputePipeline;
    verticalPipeline: GPUComputePipeline;
    compositePipeline: GPUComputePipeline;
    compositeBindGroupLayout: GPUBindGroupLayout;
    bloomStrengthBuffer: GPUBuffer;

    constructor(stage: Stage) {
        super(stage);

        const sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred scene bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }
            ]
        });
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "clustered deferred scene bind group",
            layout: sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterSetStorageBuffer } }
            ]
        });
        this.gBufferTexture = renderer.device.createTexture({
            label: "packed G-buffer",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32uint",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferView = this.gBufferTexture.createView();
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();
        this.litTexture = renderer.device.createTexture({
            label: "deferred HDR lighting",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
        const gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer compute bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "uint" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "depth" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } }
            ]
        });
        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer compute bind group",
            layout: gBufferBindGroupLayout,
            entries: [
                { binding: 0, resource: this.gBufferView },
                { binding: 1, resource: this.depthTextureView },
                { binding: 2, resource: this.litTexture.createView() }
            ]
        });
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "G-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [sceneUniformsBindGroupLayout, renderer.modelBindGroupLayout, renderer.materialBindGroupLayout]
            }),
            depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth32float" },
            vertex: {
                module: renderer.device.createShaderModule({ label: "G-buffer vertex shader", code: shaders.naiveVertSrc }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({ label: "G-buffer fragment shader", code: shaders.clusteredDeferredFragSrc }),
                targets: [{ format: "rgba32uint" }]
            }
        });
        this.lightingPipeline = renderer.device.createComputePipeline({
            label: "clustered deferred lighting compute pipeline",
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [sceneUniformsBindGroupLayout, gBufferBindGroupLayout]
            }),
            compute: {
                module: renderer.device.createShaderModule({ label: "deferred compute shader", code: shaders.clusteredDeferredComputeSrc }),
                entryPoint: "main"
            }
        });

        this.bloomTextures = [0, 1].map(index => renderer.device.createTexture({
            label: `bloom blur ${index}`,
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
        }));
        const blurBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "bloom blur bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } }
            ]
        });
        this.blurBindGroups = [this.litTexture, this.bloomTextures[0]].map((source, index) => renderer.device.createBindGroup({
            layout: blurBindGroupLayout,
            entries: [
                { binding: 0, resource: source.createView() },
                { binding: 1, resource: this.bloomTextures[index].createView() }
            ]
        }));
        const bloomModule = renderer.device.createShaderModule({ label: "bloom compute shader", code: shaders.bloomSrc });
        const blurPipelineLayout = renderer.device.createPipelineLayout({ bindGroupLayouts: [blurBindGroupLayout] });
        this.horizontalPipeline = renderer.device.createComputePipeline({
            label: "bloom horizontal Gaussian pipeline", layout: blurPipelineLayout,
            compute: { module: bloomModule, entryPoint: "horizontal" }
        });
        this.verticalPipeline = renderer.device.createComputePipeline({
            label: "bloom vertical Gaussian pipeline", layout: blurPipelineLayout,
            compute: { module: bloomModule, entryPoint: "vertical" }
        });
        this.compositeBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "bloom composite bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba8unorm" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
            ]
        });
        this.bloomStrengthBuffer = renderer.device.createBuffer({
            label: "bloom strength", size: 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.compositePipeline = renderer.device.createComputePipeline({
            label: "bloom composite pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [blurBindGroupLayout, this.compositeBindGroupLayout] }),
            compute: { module: bloomModule, entryPoint: "composite" }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder);
        const gBufferPass = encoder.beginRenderPass({
            label: "G-buffer pass",
            colorAttachments: [{
                view: this.gBufferView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store"
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store"
            }
        });
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
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
        const workgroupsX = Math.ceil(renderer.canvas.width / 8);
        const workgroupsY = Math.ceil(renderer.canvas.height / 8);
        const lightingPass = encoder.beginComputePass({ label: "deferred lighting compute pass" });
        lightingPass.setPipeline(this.lightingPipeline);
        lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        lightingPass.setBindGroup(1, this.gBufferBindGroup);
        lightingPass.dispatchWorkgroups(workgroupsX, workgroupsY);
        lightingPass.end();

        if (deferredSettings.bloom) {
            const horizontalPass = encoder.beginComputePass({ label: "bloom horizontal pass" });
            horizontalPass.setPipeline(this.horizontalPipeline);
            horizontalPass.setBindGroup(0, this.blurBindGroups[0]);
            horizontalPass.dispatchWorkgroups(workgroupsX, workgroupsY);
            horizontalPass.end();
            const verticalPass = encoder.beginComputePass({ label: "bloom vertical pass" });
            verticalPass.setPipeline(this.verticalPipeline);
            verticalPass.setBindGroup(0, this.blurBindGroups[1]);
            verticalPass.dispatchWorkgroups(workgroupsX, workgroupsY);
            verticalPass.end();
        }
        renderer.device.queue.writeBuffer(this.bloomStrengthBuffer, 0, new Float32Array([deferredSettings.bloom ? 0.65 : 0]));
        const compositeBindGroup = renderer.device.createBindGroup({
            layout: this.compositeBindGroupLayout,
            entries: [
                { binding: 0, resource: this.bloomTextures[1].createView() },
                { binding: 1, resource: renderer.context.getCurrentTexture().createView() },
                { binding: 2, resource: { buffer: this.bloomStrengthBuffer } }
            ]
        });
        const compositePass = encoder.beginComputePass({ label: "bloom composite pass" });
        compositePass.setPipeline(this.compositePipeline);
        compositePass.setBindGroup(0, this.blurBindGroups[0]);
        compositePass.setBindGroup(1, compositeBindGroup);
        compositePass.dispatchWorkgroups(workgroupsX, workgroupsY);
        compositePass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}
