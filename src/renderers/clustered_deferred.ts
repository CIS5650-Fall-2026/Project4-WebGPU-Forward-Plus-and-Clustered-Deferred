import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { settings } from '../settings';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferTextures: GPUTexture[];
    gBufferTextureViews: GPUTextureView[];
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    gBufferPipeline: GPURenderPipeline;
    gBufferBundle: GPURenderBundle | undefined;

    fullscreenPipeline: GPURenderPipeline | undefined;

    lightingPipeline: GPUComputePipeline | undefined;
    outputTexture: GPUTexture | undefined;

    toonPipeline: GPUComputePipeline | undefined;
    toonBindGroup: GPUBindGroup | undefined;
    toonOutputTexture: GPUTexture | undefined;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred scene uniforms bind group layout",
            entries: [
                { // cameraUniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
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
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "clustered deferred scene uniforms bind group",
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
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        const gBufferFormats: GPUTextureFormat[] = settings.optimizedGBuffer ? ["rg32uint"] : ["rgba32float", "rgba16float", "rgba8unorm"];
        this.gBufferTextures = gBufferFormats.map(format => renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        }));
        this.gBufferTextureViews = this.gBufferTextures.map(texture => texture.createView());

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "g-buffer pipeline layout",
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
                    label: "g-buffer vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "g-buffer frag shader",
                    code: settings.optimizedGBuffer ? shaders.clusteredDeferredOptimizedFragSrc : shaders.clusteredDeferredFragSrc
                }),
                targets: gBufferFormats.map(format => ({ format: format }))
            }
        });

        if (settings.renderBundles) {
            this.gBufferBundle = this.recordBundle(gBufferFormats, this.gBufferPipeline, this.sceneUniformsBindGroup);
        }

        if (settings.optimizedGBuffer) {
            this.outputTexture = renderer.device.createTexture({
                size: [renderer.canvas.width, renderer.canvas.height],
                format: renderer.canvasFormat,
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
            });

            this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "g-buffer bind group layout",
                entries: [
                    { // gBuffer
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: { sampleType: "uint" }
                    },
                    { // depthTex
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: { sampleType: "depth" }
                    },
                    { // outputTex
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: { format: renderer.canvasFormat }
                    }
                ]
            });

            this.gBufferBindGroup = renderer.device.createBindGroup({
                label: "g-buffer bind group",
                layout: this.gBufferBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.gBufferTextureViews[0]
                    },
                    {
                        binding: 1,
                        resource: this.depthTextureView
                    },
                    {
                        binding: 2,
                        resource: this.outputTexture.createView()
                    }
                ]
            });

            this.lightingPipeline = renderer.device.createComputePipeline({
                label: "clustered deferred lighting compute pipeline",
                layout: renderer.device.createPipelineLayout({
                    label: "clustered deferred lighting compute pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        this.gBufferBindGroupLayout
                    ]
                }),
                compute: {
                    module: renderer.device.createShaderModule({
                        label: "clustered deferred lighting compute shader",
                        code: shaders.clusteredDeferredFullscreenComputeSrc
                    }),
                    entryPoint: "main"
                }
            });

            if (settings.toonShading) {
                this.toonOutputTexture = renderer.device.createTexture({
                    size: [renderer.canvas.width, renderer.canvas.height],
                    format: renderer.canvasFormat,
                    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC
                });

                const toonBindGroupLayout = renderer.device.createBindGroupLayout({
                    label: "toon bind group layout",
                    entries: [
                        { // cameraUniforms
                            binding: 0,
                            visibility: GPUShaderStage.COMPUTE,
                            buffer: { type: "uniform" }
                        },
                        { // inputTex
                            binding: 1,
                            visibility: GPUShaderStage.COMPUTE,
                            texture: {}
                        },
                        { // depthTex
                            binding: 2,
                            visibility: GPUShaderStage.COMPUTE,
                            texture: { sampleType: "depth" }
                        },
                        { // outputTex
                            binding: 3,
                            visibility: GPUShaderStage.COMPUTE,
                            storageTexture: { format: renderer.canvasFormat }
                        }
                    ]
                });

                this.toonBindGroup = renderer.device.createBindGroup({
                    label: "toon bind group",
                    layout: toonBindGroupLayout,
                    entries: [
                        {
                            binding: 0,
                            resource: { buffer: this.camera.uniformsBuffer }
                        },
                        {
                            binding: 1,
                            resource: this.outputTexture.createView()
                        },
                        {
                            binding: 2,
                            resource: this.depthTextureView
                        },
                        {
                            binding: 3,
                            resource: this.toonOutputTexture.createView()
                        }
                    ]
                });

                this.toonPipeline = renderer.device.createComputePipeline({
                    label: "toon compute pipeline",
                    layout: renderer.device.createPipelineLayout({
                        label: "toon compute pipeline layout",
                        bindGroupLayouts: [ toonBindGroupLayout ]
                    }),
                    compute: {
                        module: renderer.device.createShaderModule({
                            label: "toon compute shader",
                            code: shaders.toonComputeSrc
                        }),
                        entryPoint: "main"
                    }
                });
            }
        } else {
            this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "g-buffer bind group layout",
                entries: gBufferFormats.map((_, binding) => ({
                    binding: binding,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                }))
            });

            this.gBufferBindGroup = renderer.device.createBindGroup({
                label: "g-buffer bind group",
                layout: this.gBufferBindGroupLayout,
                entries: this.gBufferTextureViews.map((view, binding) => ({
                    binding: binding,
                    resource: view
                }))
            });

            this.fullscreenPipeline = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "fullscreen pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        this.gBufferBindGroupLayout
                    ]
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
                        {
                            format: renderer.canvasFormat
                        }
                    ]
                }
            });
        }
    }

    override stop() {
        super.stop();
        this.depthTexture.destroy();
        this.gBufferTextures.forEach(texture => texture.destroy());
        this.outputTexture?.destroy();
        this.toonOutputTexture?.destroy();
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTexture = renderer.context.getCurrentTexture();

        this.lights.doLightClustering(encoder, this.timestampWrites());

        const gBufferPass = encoder.beginRenderPass({
            label: "g-buffer render pass",
            colorAttachments: this.gBufferTextureViews.map(view => ({
                view: view,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            })),
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            },
            timestampWrites: this.timestampWrites()
        });
        if (this.gBufferBundle) {
            gBufferPass.executeBundles([this.gBufferBundle]);
        } else {
            gBufferPass.setPipeline(this.gBufferPipeline);
            gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            this.drawScene(gBufferPass);
        }
        gBufferPass.end();

        if (this.lightingPipeline && this.outputTexture) {
            const workgroupsX = Math.ceil(renderer.canvas.width / shaders.constants.fullscreenWorkgroupSize);
            const workgroupsY = Math.ceil(renderer.canvas.height / shaders.constants.fullscreenWorkgroupSize);

            const computePass = encoder.beginComputePass({
                label: "clustered deferred lighting compute pass",
                timestampWrites: this.timestampWrites()
            });
            computePass.setPipeline(this.lightingPipeline);
            computePass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            computePass.setBindGroup(1, this.gBufferBindGroup);
            computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
            computePass.end();

            let finalTexture = this.outputTexture;
            if (this.toonPipeline && this.toonBindGroup && this.toonOutputTexture) {
                const toonPass = encoder.beginComputePass({
                    label: "toon compute pass",
                    timestampWrites: this.timestampWrites()
                });
                toonPass.setPipeline(this.toonPipeline);
                toonPass.setBindGroup(0, this.toonBindGroup);
                toonPass.dispatchWorkgroups(workgroupsX, workgroupsY);
                toonPass.end();
                finalTexture = this.toonOutputTexture;
            }

            encoder.copyTextureToTexture(
                { texture: finalTexture },
                { texture: canvasTexture },
                [renderer.canvas.width, renderer.canvas.height]
            );
        } else if (this.fullscreenPipeline) {
            const fullscreenPass = encoder.beginRenderPass({
                label: "fullscreen render pass",
                colorAttachments: [
                    {
                        view: canvasTexture.createView(),
                        clearValue: [0, 0, 0, 0],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ],
                timestampWrites: this.timestampWrites()
            });
            fullscreenPass.setPipeline(this.fullscreenPipeline);
            fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
            fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
            fullscreenPass.draw(3);
            fullscreenPass.end();
        }

        this.resolveTimestamps(encoder);
        renderer.device.queue.submit([encoder.finish()]);
    }
}
