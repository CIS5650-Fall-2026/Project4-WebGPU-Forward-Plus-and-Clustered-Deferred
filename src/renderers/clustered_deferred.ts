import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // 3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    // G buffer pass
    gBufferSceneBindGroupLayout: GPUBindGroupLayout;
    gBufferSceneBindGroup: GPUBindGroup;
    gBufferPipeline: GPURenderPipeline;
    // lighting compute pass
    lightingSceneBindGroupLayout: GPUBindGroupLayout;
    lightingTexturesBindGroup: GPUBindGroup;
    lightingSceneBindGroup: GPUBindGroup;
    lightingTexturesBindGroupLayout: GPUBindGroupLayout;
    lightingComputePipeline: GPUComputePipeline;
    // post process layout
    postBindGroupLayout: GPUBindGroupLayout;

    // G buffer textures
    // used to be position, normal, and albedo
    // but for optimization, turn to just one field
    gBufferTexture: GPUTexture;
    gBufferTextureView: GPUTextureView;

    // post processing textures
    litTexture: GPUTexture;
    litTextureView: GPUTextureView;
    postPipeline: GPUComputePipeline;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    constructor(stage: Stage) {
        super(stage);

        const size = [renderer.canvas.width, renderer.canvas.height];

        this.gBufferTexture = renderer.device.createTexture(
            {
                label: "g-buffer packed",
                size,
                format: "rg32uint",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            }
        );
        this.gBufferTextureView = this.gBufferTexture.createView();

        this.depthTexture = renderer.device.createTexture(
            {
                label: "deferred depth",
                size,
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            }
        );
        this.depthTextureView = this.depthTexture.createView();

        this.litTexture = renderer.device.createTexture(
            {
                label: "lit color",
                size,
                format: "rgba16float",
                usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
            }
        );
        this.litTextureView = this.litTexture.createView();

        // G buffer pass
        this.gBufferSceneBindGroupLayout = renderer.device.createBindGroupLayout(
            {
                label: "g-buffer scene bind group layout",
                entries: [
                    { // camera
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: { type: "uniform" }
                    }
                ]
            }
        );

        this.gBufferSceneBindGroup = renderer.device.createBindGroup(
            {
                label: "g-buffer scene bind group",
                layout: this.gBufferSceneBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.camera.uniformsBuffer
                        }
                    }
                ]
            }
        );

        this.gBufferPipeline = renderer.device.createRenderPipeline(
            {
                label: "g-buffer pipeline",
                layout: renderer.device.createPipelineLayout(
                    {
                        label: "g-buffer pipeline layout",
                        bindGroupLayouts: [
                            this.gBufferSceneBindGroupLayout,
                            renderer.modelBindGroupLayout,
                            renderer.materialBindGroupLayout
                        ]
                    }
                ), 
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: "less",
                    format: "depth24plus"
                }, 
                vertex: {
                    module: renderer.device.createShaderModule(
                        {
                            label: "naive vert shader (g-buffer)",
                            code: shaders.naiveVertSrc
                        }
                    ), 
                    buffers: [
                        renderer.vertexBufferLayout
                    ]
                }, 
                fragment: {
                    module: renderer.device.createShaderModule(
                        {
                            label: "packed g-buffer frag shader",
                            code: shaders.clusteredDeferredFragSrc
                        }
                    ), 
                    targets: [
                        { format: "rg32uint" }
                    ]
                }
            }
        );

        // replace fullscreen pass with single lighting compute pass
        this.lightingSceneBindGroupLayout = renderer.device.createBindGroupLayout(
            {
                label: "lighting scene bind group layout",
                entries: [
                    { // camera
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: {
                            type: "uniform"
                        }
                    },
                    { // light set
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: {
                            type: "read-only-storage"
                        }
                    },
                    { // cluster set
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: {
                            type: "read-only-storage"
                        }
                    }
                ]
            }
        );

        this.lightingSceneBindGroup = renderer.device.createBindGroup(
            {
                label: "lighting scene bind group",
                layout: this.lightingSceneBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.camera.uniformsBuffer
                        }
                    },
                    {
                        binding: 1,
                        resource: {
                            buffer: this.lights.lightSetStorageBuffer
                        }
                    },
                    {
                        binding: 2,
                        resource: {
                            buffer: this.lights.clusterSetStorageBuffer
                        }
                    }
                ]
            }
        );

        this.lightingTexturesBindGroupLayout = renderer.device.createBindGroupLayout(
            {
                label: "lighting textures bind group layout",
                entries: [
                    { // packed normal + albedo
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: {
                            sampleType: "uint"
                        }
                    },
                    { // depth
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: {
                            sampleType: "depth"
                        }
                    },
                    { // lit texture
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: {
                            access: "write-only",
                            format: "rgba16float"
                        }
                    }
                ]
            }
        );

        this.lightingTexturesBindGroup = renderer.device.createBindGroup(
            {
                label: "lighting textures bind group",
                layout: this.lightingTexturesBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: this.gBufferTextureView
                    },
                    {
                        binding: 1,
                        resource: this.depthTextureView
                    },
                    {
                        binding: 2,
                        resource: this.litTextureView
                    }
                ]
            }
        );

        this.lightingComputePipeline = renderer.device.createComputePipeline(
            {
                label: "deferred lighting compute pipeline",
                layout: renderer.device.createPipelineLayout(
                    {
                        label: "deferred lighting pipeline layout",
                        bindGroupLayouts: [
                            this.lightingSceneBindGroupLayout,
                            this.lightingTexturesBindGroupLayout
                        ]
                    }
                ),
                compute: {
                    module: renderer.device.createShaderModule(
                        {
                            label: "deferred lighting compute shader",
                            code: shaders.clusteredDeferredLightingComputeSrc
                        }
                    ),
                    entryPoint: "main"
                }
            }
        );

        // post process layout
        this.postBindGroupLayout = renderer.device.createBindGroupLayout(
            {
                label: "toon post bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" }
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: { sampleType: "unfilterable-float" }
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        texture: { sampleType: "depth" }
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: {
                            access: "write-only",
                            format: "rgba8unorm"
                        }
                    }
                ]
            }
        );

        this.postPipeline = renderer.device.createComputePipeline(
            {
                label: "toon post pipeline",
                layout: renderer.device.createPipelineLayout(
                    {
                        label: "toon post pipeline layout",
                        bindGroupLayouts: [
                            this.postBindGroupLayout
                        ]
                    }
                ),
                compute: {
                    module: renderer.device.createShaderModule(
                        {
                            label: "toon post compute shader",
                            code: shaders.toonPostComputeSrc
                        }
                    ), 
                    entryPoint: "main"
                }
            }
        );
    }

    override draw() {
        // 3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations

        const encoder = renderer.device.createCommandEncoder();

        // first clustering pass (recall forward+)
        this.lights.doLightClustering(encoder);

        // G-buffer pass
        const gPass = encoder.beginRenderPass(
            {
                label: "g-buffer pass",
                colorAttachments: [
                    {
                        view: this.gBufferTextureView,
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
            }
        );

        gPass.setPipeline(this.gBufferPipeline);
        gPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferSceneBindGroup);

        this.scene.iterate(node => {
            gPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            gPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            gPass.setVertexBuffer(0, primitive.vertexBuffer);
            gPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            gPass.drawIndexed(primitive.numIndices);
        });

        gPass.end();

        const lightingPass = encoder.beginComputePass(
            {
                label: "deferred lighting pass"
            }
        );

        lightingPass.setPipeline(this.lightingComputePipeline);
        lightingPass.setBindGroup(0, this.lightingSceneBindGroup);
        lightingPass.setBindGroup(1, this.lightingTexturesBindGroup);
        lightingPass.dispatchWorkgroups(
            Math.ceil(renderer.canvas.width / 8), 
            Math.ceil(renderer.canvas.height / 8)
        );

        lightingPass.end();

        // post processing pass
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const postBindGroup = renderer.device.createBindGroup(
            {
                label: "toon post bind group",
                layout: this.postBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.camera.uniformsBuffer
                        }
                    },
                    {
                        binding: 1,
                        resource: this.litTextureView
                    },
                    {
                        binding: 2,
                        resource: this.depthTextureView
                    },
                    {
                        binding: 3,
                        resource: canvasTextureView
                    }
                ]
            }
        );

        const postPass = encoder.beginComputePass(
            {
                label: "toon post pass"
            }
        );
        
        postPass.setPipeline(this.postPipeline);
        postPass.setBindGroup(0, postBindGroup);
        postPass.dispatchWorkgroups(
            Math.ceil(renderer.canvas.width / 8),
            Math.ceil(renderer.canvas.height / 8)
        );

        postPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
