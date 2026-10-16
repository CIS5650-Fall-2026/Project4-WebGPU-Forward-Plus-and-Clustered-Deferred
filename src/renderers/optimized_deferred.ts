import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class OptimizedDeferredRenderer extends renderer.Renderer {
    // 3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gbufferBindGroupLayout: GPUBindGroupLayout;
    gbufferBindGroup: GPUBindGroup;

    lightingOutputBindGroupLayout: GPUBindGroupLayout;
    
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    normalAlbedoTexture: GPUTexture;
    normalAlbedoTextureView: GPUTextureView;
    
    geometryPipeline: GPURenderPipeline;
    fullScreenLightingPipeline: GPURenderPipeline;
    computeLightingPipeline: GPUComputePipeline;

    lightingMode: "compute" | "fullscreen" = "compute";

    constructor(stage: Stage) {
        super(stage);

        // 3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT 
                        | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage' }
                },
                { // debugView
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.debugUniformBuffer }
                },
            ]
        });

        const createGBufferTexture = (label: string, format: GPUTextureFormat) => 
            renderer.device.createTexture({
                label,
                size: [renderer.canvas.width, renderer.canvas.height],
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT 
                     | GPUTextureUsage.TEXTURE_BINDING
            });

        this.normalAlbedoTexture = createGBufferTexture("gbuffer texture", "rg32uint");
        this.depthTexture = createGBufferTexture("depth texture", "depth24plus");

        this.normalAlbedoTextureView = this.normalAlbedoTexture.createView();
        this.depthTextureView = this.depthTexture.createView();

        this.geometryPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "optimized deferred geometry pipeline layout",
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
                    label: "optimized deferred geometry vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred geometry frag shader",
                    code: shaders.optimizedDeferredFragSrc,
                }),
                targets: [
                    { format: "rg32uint" }
                ]
            }
        });

        this.gbufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer bind group layout",
            entries: [
                { // normalAlbedo
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    texture: { sampleType: "uint" }
                },
                { // depth
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    texture: { sampleType: "depth" }
                }
            ]
        });

        this.gbufferBindGroup = renderer.device.createBindGroup({
            label: "g-buffer bind group",
            layout: this.gbufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.normalAlbedoTextureView
                },
                {
                    binding: 1,
                    resource: this.depthTextureView
                }
            ]
        });

        this.fullScreenLightingPipeline = renderer.device.createRenderPipeline({
            label: "optimized deferred lighting fullscreen pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "optimized deferred lighting pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gbufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred lighting vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred lighting frag shader",
                    code: shaders.optimizedDeferredFullscreenFragSrc,
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        });

        this.lightingOutputBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "lighting output bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: renderer.canvasFormat
                    }
                }
            ]
        });

        this.computeLightingPipeline = renderer.device.createComputePipeline({
            label: "optimized deferred lighting compute pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "optimized deferred compute pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gbufferBindGroupLayout,
                    this.lightingOutputBindGroupLayout
                ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "optimized deferred lighting compute shader",
                    code: shaders.getOptimizedDeferredLightingComputeSrc(
                        renderer.canvasFormat
                    )
                })
            }
        });
    }

    override draw() {
        // 3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();

        const geometryPass = encoder.beginRenderPass({
            label: "deferred geometry pass",
            colorAttachments: [
                {
                    view: this.normalAlbedoTextureView,
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
        geometryPass.setPipeline(this.geometryPipeline);

        geometryPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            geometryPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            geometryPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            geometryPass.setVertexBuffer(0, primitive.vertexBuffer);
            geometryPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            geometryPass.drawIndexed(primitive.numIndices);
        });

        geometryPass.end();

        this.lights.doLightClustering(encoder);

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        if (this.lightingMode === "compute") {
            const outputBindGroup = renderer.device.createBindGroup({
                label: "lighting output bind group",
                layout: this.lightingOutputBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: canvasTextureView
                    }
                ]
            });

            const lightingPass = encoder.beginComputePass({
                label: "optimized deferred lighting compute pass"
            });
            lightingPass.setPipeline(this.computeLightingPipeline);

            lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            lightingPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gbufferBindGroup);
            lightingPass.setBindGroup(shaders.constants.bindGroup_target, outputBindGroup);

            lightingPass.dispatchWorkgroups(
                Math.ceil(renderer.canvas.width / 8),
                Math.ceil(renderer.canvas.height / 8)
            );
            lightingPass.end();
        } else {
            const lightingPass = encoder.beginRenderPass({
                label: "deferred lighting pass",
                colorAttachments: [
                    {
                        view: canvasTextureView,
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ]
            });
            lightingPass.setPipeline(this.fullScreenLightingPipeline);

            lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            lightingPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gbufferBindGroup);

            lightingPass.draw(3);
            lightingPass.end();
        }

        this.drawClusterHeatmap(encoder, canvasTextureView,
            this.sceneUniformsBindGroupLayout, this.sceneUniformsBindGroup, this.depthTextureView);

        renderer.device.queue.submit([encoder.finish()]);
    }
}
