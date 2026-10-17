import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { Bloom } from './bloom';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    sceneUniformsBindGroup: GPUBindGroup;
    gBufferBindGroup: GPUBindGroup;

    gBufferTextures: GPUTexture[];
    gBufferViews: GPUTextureView[];
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline?: GPURenderPipeline;
    computePipeline?: GPUComputePipeline;
    outputBindGroupLayout?: GPUBindGroupLayout;

    private bloom?: Bloom;

    constructor(stage: Stage, private useCompute = false, usePacked = false, useBloom = false) {
        super(stage,
            useBloom ? 'clustered deferred bloom' :
                usePacked ? 'clustered deferred packed' :
                    useCompute ? 'clustered deferred compute' : 'clustered deferred',
            useBloom
                ? ['clustering', 'geometry', 'lighting', 'bloom extract', 'blur horizontal', 'blur vertical', 'bloom composite']
                : ['clustering', 'geometry', 'lighting']);

        if (useBloom) {
            this.bloom = new Bloom(renderer.device, renderer.canvas.width, renderer.canvas.height, renderer.canvasFormat);
        }
        const lightingFormat = useBloom ? 'rgba16float' : renderer.canvasFormat;

        const sceneUniformsBindGroupLayout =
            renderer.device.createBindGroupLayout({
                label: "deferred scene bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility:
                            GPUShaderStage.VERTEX |
                            GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                        buffer: { type: "read-only-storage" }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                        buffer: { type: "read-only-storage" }
                    }
                ]
            });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "deferred scene bind group",
            layout: sceneUniformsBindGroupLayout,
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

        const formats: GPUTextureFormat[] = usePacked
            ? ["rg32uint"]
            : ["rgba32float", "rgba16float", "rgba8unorm"];
        const names = usePacked ? ["packed normal/albedo"] : ["position", "normal", "albedo"];
        this.gBufferTextures = formats.map((format, i) =>
            this.createGBufferTexture("g-buffer " + names[i], format)
        );
        this.gBufferViews = this.gBufferTextures.map(texture => texture.createView());

        const depthFormat = usePacked ? "depth32float" : "depth24plus";
        this.depthTexture = renderer.device.createTexture({
            label: "deferred depth",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: depthFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        const visibility = GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;
        const gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer texture bind group layout",
            entries: usePacked ? [
                { binding: 0, visibility, texture: { sampleType: "uint" } },
                { binding: 1, visibility, texture: { sampleType: "depth" } }
            ] : [
                { binding: 0, visibility, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility, texture: { sampleType: "float" } },
                { binding: 2, visibility, texture: { sampleType: "float" } }
            ]
        });

        const inputViews = usePacked
            ? [this.gBufferViews[0], this.depthTextureView]
            : this.gBufferViews;
        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "g-buffer texture bind group",
            layout: gBufferBindGroupLayout,
            entries: inputViews.map((resource, binding) => ({ binding, resource }))
        });

        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "g-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "g-buffer pipeline layout",
                bindGroupLayouts: [
                    sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "g-buffer vertex shader",
                    code: shaders.naiveVertSrc
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "g-buffer fragment shader",
                    code: usePacked
                        ? shaders.clusteredDeferredPackedFragSrc
                        : shaders.clusteredDeferredFragSrc
                }),
                entryPoint: "main",
                targets: formats.map(format => ({ format }))
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: depthFormat
            }
        });

        if (useCompute) {
            this.outputBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "compute lighting output layout",
                entries: [{
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: { access: "write-only", format: lightingFormat }
                }]
            });

            this.computePipeline = renderer.device.createComputePipeline({
                label: "deferred compute lighting pipeline",
                layout: renderer.device.createPipelineLayout({
                    label: "deferred compute lighting layout",
                    bindGroupLayouts: [
                        sceneUniformsBindGroupLayout,
                        gBufferBindGroupLayout,
                        this.outputBindGroupLayout
                    ]
                }),
                compute: {
                    module: renderer.device.createShaderModule({
                        label: "deferred compute lighting shader",
                        code: shaders.clusteredDeferredComputeSrc(lightingFormat, usePacked)
                    }),
                    entryPoint: "main"
                }
            });
        } else {
            this.fullscreenPipeline = renderer.device.createRenderPipeline({
                label: "deferred fullscreen pipeline",
                layout: renderer.device.createPipelineLayout({
                    label: "deferred fullscreen pipeline layout",
                    bindGroupLayouts: [
                        sceneUniformsBindGroupLayout,
                        gBufferBindGroupLayout
                    ]
                }),
                vertex: {
                    module: renderer.device.createShaderModule({
                        label: "deferred fullscreen vertex shader",
                        code: shaders.clusteredDeferredFullscreenVertSrc
                    }),
                    entryPoint: "main"
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "deferred fullscreen fragment shader",
                        code: shaders.clusteredDeferredFullscreenFragSrc
                    }),
                    entryPoint: "main",
                    targets: [
                        { format: renderer.canvasFormat }
                    ]
                }
            });
        }
    }

    private createGBufferTexture(
        label: string,
        format: GPUTextureFormat
    ): GPUTexture {
        return renderer.device.createTexture({
            label,
            size: [renderer.canvas.width, renderer.canvas.height],
            format,
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder, this.timer.timestamps(0));

        const gBufferPass = encoder.beginRenderPass({
            label: "g-buffer pass",
            timestampWrites: this.timer.timestamps(1),
            colorAttachments: this.gBufferViews.map(view => ({
                view,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear" as const,
                storeOp: "store" as const
            })),
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        gBufferPass.setPipeline(this.gBufferPipeline);

        gBufferPass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );

        this.scene.iterate(
            node => {
                gBufferPass.setBindGroup(
                    shaders.constants.bindGroup_model,
                    node.modelBindGroup
                );
            },
            material => {
                gBufferPass.setBindGroup(
                    shaders.constants.bindGroup_material,
                    material.materialBindGroup
                );
            },
            primitive => {
                gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
                gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                gBufferPass.drawIndexed(primitive.numIndices);
            }
        );

        gBufferPass.end();

        const canvasTextureView =
            renderer.context.getCurrentTexture().createView();

        if (this.useCompute) {
            const outputBindGroup = renderer.device.createBindGroup({
                label: "compute lighting output",
                layout: this.outputBindGroupLayout!,
                entries: [{ binding: 0, resource: this.bloom?.sceneView ?? canvasTextureView }]
            });

            const lightingPass = encoder.beginComputePass({
                label: "deferred compute lighting pass",
                timestampWrites: this.timer.timestamps(2)
            });
            lightingPass.setPipeline(this.computePipeline!);
            lightingPass.setBindGroup(0, this.sceneUniformsBindGroup);
            lightingPass.setBindGroup(1, this.gBufferBindGroup);
            lightingPass.setBindGroup(2, outputBindGroup);
            lightingPass.dispatchWorkgroups(
                Math.ceil(renderer.canvas.width / 8),
                Math.ceil(renderer.canvas.height / 8)
            );
            lightingPass.end();
            this.bloom?.draw(encoder, canvasTextureView, this.timer);
        } else {
            const fullscreenPass = encoder.beginRenderPass({
                label: "deferred fullscreen lighting pass",
                timestampWrites: this.timer.timestamps(2),
                colorAttachments: [
                    {
                        view: canvasTextureView,
                        clearValue: [0, 0, 0, 1],
                        loadOp: "clear",
                        storeOp: "store"
                    }
                ]
            });

            fullscreenPass.setPipeline(this.fullscreenPipeline!);

            fullscreenPass.setBindGroup(
                shaders.constants.bindGroup_scene,
                this.sceneUniformsBindGroup
            );

            fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
            fullscreenPass.draw(6);
            fullscreenPass.end();
        }

        this.timer.submit(encoder);
    }

    override stop(): void {
        super.stop();

        this.gBufferTextures.forEach(texture => texture.destroy());
        this.depthTexture.destroy();
        this.bloom?.destroy();
    }
}
