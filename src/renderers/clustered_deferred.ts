import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    positionTexture: GPUTexture;
    normalTexture: GPUTexture;
    albedoTexture: GPUTexture;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

            this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "scene uniforms bind group layout",
                entries: [
                    {//camera
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                        buffer: { type : "uniform"}
                    },
                    { // lightSet
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "read-only-storage" }
                    },
                    { //clusterSet
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        buffer: { type: "read-only-storage" }
                    }
                ]
            });

            this.sceneUniformsBindGroup = renderer.device.createBindGroup({
                label: "scene uniforms bind group",
                layout: this.sceneUniformsBindGroupLayout,
                entries: [
                    
                    {
                        binding: 0,
                        resource: { buffer: this.camera.uniformsBuffer}
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.lights.lightSetStorageBuffer }
                    },
                    {
                        binding: 2,
                        resource: { buffer: this.lights.clusterBuffer }
                    }
                ]
            });

            this.depthTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
            this.depthTextureView = this.depthTexture.createView();

            const createGBufferTexture = (label: string, format: GPUTextureFormat) =>
                renderer.device.createTexture({
                    label,
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT |
                        GPUTextureUsage.TEXTURE_BINDING,
                });

            this.positionTexture = createGBufferTexture("position", "rgba16float");
            this.normalTexture = createGBufferTexture("normal", "rgba16float");
            this.albedoTexture = createGBufferTexture("albedo", "rgba8unorm");

        
            this.gBufferPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "forward plus pipeline layout",
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
                //fine, we use the same vert shader
                vertex: {
                    module: renderer.device.createShaderModule({
                        label: "naive vert shader",
                        code: shaders.naiveVertSrc
                    }),
                    buffers: [ renderer.vertexBufferLayout ]
                },
                //add compute here

                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "g buffer frag shader",
                        code: shaders.clusteredDeferredFragSrc,
                    }),
                    targets: [
                            { format: "rgba16float" }, //pos
                            { format: "rgba16float" }, //norm
                            { format: "rgba8unorm" },  //albedo
                    ]
                }
            });

            this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "G-buffer read layout",
                entries: [0, 1, 2].map(binding => ({
                    binding,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" as GPUTextureSampleType },
                })),
            });

            this.gBufferBindGroup = renderer.device.createBindGroup({
                layout: this.gBufferBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.positionTexture.createView() },
                    { binding: 1, resource: this.normalTexture.createView() },
                    { binding: 2, resource: this.albedoTexture.createView() },
                ],
            });

            this.fullscreenPipeline = renderer.device.createRenderPipeline({
                label: "deferred lighting pipeline",
                layout: renderer.device.createPipelineLayout({
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout, // group 0: camera/lights/clusters
                        this.gBufferBindGroupLayout,       // group 1: G-buffer textures
                    ],
                }),
                vertex: {
                    module: renderer.device.createShaderModule({
                        code: shaders.clusteredDeferredFullscreenVertSrc,
                    }),
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        code: shaders.clusteredDeferredFullscreenFragSrc,
                    }),
                    targets: [{ format: renderer.canvasFormat }],
                },
            });

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        this.lights.doLightClustering(encoder);
        
        const renderPass = encoder.beginRenderPass({
            label: "forward plus render pass",
            colorAttachments: [
                {
                    view: this.positionTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.normalTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.albedoTexture.createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });


        renderPass.setPipeline(this.gBufferPipeline);

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

        const fullscreenPass = encoder.beginRenderPass({
            label: "deferred lighting pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(0, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
        fullscreenPass.draw(3);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
