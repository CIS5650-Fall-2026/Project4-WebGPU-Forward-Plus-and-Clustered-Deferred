import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    shadingBindGroupLayout: GPUBindGroupLayout;

    gBufferTexture: GPUTexture;
    depthTexture: GPUTexture;

    gBufferPipeline: GPURenderPipeline;
    shadingPipeline: GPUComputePipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        const size = [renderer.canvas.width, renderer.canvas.height];
        const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
        this.gBufferTexture = renderer.device.createTexture({ label: "g-buffer", size, format: "rg32uint", usage });
        this.depthTexture = renderer.device.createTexture({ label: "depth", size, format: "depth24plus", usage });

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer bind group layout",
            entries: [
                { // camera
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

        this.shadingBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "shading bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // gBuffer
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "uint" }
                },
                { // depth
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { sampleType: "depth" }
                },
                { // output
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: renderer.canvasFormat }
                }
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
                    { format: "rg32uint" }
                ]
            }
        });

        this.shadingPipeline = renderer.device.createComputePipeline({
            label: "shading pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "shading pipeline layout",
                bindGroupLayouts: [ this.shadingBindGroupLayout ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "shading compute shader",
                    code: shaders.clusteredDeferredShadingComputeSrc
                }),
                entryPoint: "main"
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

        const gBufferPass = encoder.beginRenderPass({
            label: "g-buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufferTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
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

        // the canvas texture changes every frame, so this bind group does too
        const shadingBindGroup = renderer.device.createBindGroup({
            label: "shading bind group",
            layout: this.shadingBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterSetStorageBuffer } },
                { binding: 3, resource: this.gBufferTexture.createView() },
                { binding: 4, resource: this.depthTexture.createView() },
                { binding: 5, resource: canvasTextureView }
            ]
        });

        const shadingPass = encoder.beginComputePass({ label: "shading compute pass" });
        shadingPass.setPipeline(this.shadingPipeline);
        shadingPass.setBindGroup(shaders.constants.bindGroup_scene, shadingBindGroup);
        shadingPass.dispatchWorkgroups(
            Math.ceil(renderer.canvas.width / shaders.constants.shadingTileSize),
            Math.ceil(renderer.canvas.height / shaders.constants.shadingTileSize)
        );
        shadingPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
