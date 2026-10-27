import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gBuffBindGroupLayout: GPUBindGroupLayout;
    gBuffBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    posGBuffTexture: GPUTexture;
    norGBuffTexture: GPUTexture;
    albedoGBuffTexture: GPUTexture;
    posGBuffTextureView: GPUTextureView;
    norGBuffTextureView: GPUTextureView;
    albedoGBuffTextureView: GPUTextureView;

    pipeline_g: GPURenderPipeline;
    pipeline_shad: GPURenderPipeline;

    gBufTexFormat: GPUTextureFormat;
    gBufSampler;

    constructor(stage: Stage) {
        super(stage);

        this.posGBuffTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.posGBuffTextureView = this.posGBuffTexture.createView();

        this.norGBuffTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.norGBuffTextureView = this.norGBuffTexture.createView();

        this.albedoGBuffTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.albedoGBuffTextureView = this.albedoGBuffTexture.createView();

        this.gBufSampler = renderer.device.createSampler({
            magFilter: "nearest",
            minFilter: "nearest"
        })

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {type: "uniform"}
                },
                { 
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
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
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.cluster.clusterSetStorageBuffer }
                }
            ]
        });

        this.gBuffBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g buff bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
                
            ]
        });

        this.gBuffBindGroup = renderer.device.createBindGroup({
            label: "g buff bind group",
            layout: this.gBuffBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.posGBuffTextureView
                },
                {
                    binding: 1,
                    resource: this.norGBuffTextureView
                },
                {
                    binding: 2,
                    resource: this.albedoGBuffTextureView
                },
                {
                    binding: 3,
                    resource: this.gBufSampler
                }
            ]
        })

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.pipeline_g = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deffered geometry pipeline layout",
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
                        label: "differred geometry vert shader",
                        code: shaders.naiveVertSrc
                    }),
                    buffers: [ renderer.vertexBufferLayout ]
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "forward plus frag shader",
                        code: shaders.clusteredDeferredFragSrc,
                    }),
                    targets: [
                        {
                            format: "rgba16float",
                        }, {
                            format: "rgba16float",
                        },
                        {
                            format: "rgba8unorm",
                        }
                    ]
                }
            });

            this.pipeline_shad = renderer.device.createRenderPipeline({
                layout: renderer.device.createPipelineLayout({
                    label: "deffered shade pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        this.gBuffBindGroupLayout,
                    ]
                }),
                vertex: {
                    module: renderer.device.createShaderModule({
                        label: "differred geometry vert shader",
                        code: shaders.clusteredDeferredFullscreenVertSrc
                    }),
                    buffers: []
                },
                fragment: {
                    module: renderer.device.createShaderModule({
                        label: "forward plus frag shader",
                        code: shaders.clusteredDeferredFullscreenFragSrc,
                    }),
                    targets: [
                        {
                            format: renderer.canvasFormat,
                        }
                    ]
                }
            })
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        
        this.lights.cluster.doLightClustering(encoder);

        const renderPass = encoder.beginRenderPass({
            label: "naive render pass",
            colorAttachments: [
                {
                    view: this.posGBuffTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.norGBuffTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.albedoGBuffTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },

            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        
        renderPass.setPipeline(this.pipeline_g);


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

        const shaderPass = encoder.beginRenderPass({
            label: "deferred shader render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        })
        shaderPass.setPipeline(this.pipeline_shad);

        shaderPass.setBindGroup(shaders.constants.bindGroup_gbuff, this.gBuffBindGroup);
        shaderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        shaderPass.draw(3);

        shaderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
