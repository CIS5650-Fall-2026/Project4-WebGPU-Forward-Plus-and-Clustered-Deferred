import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution


    //
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    normalTexture: GPUTexture;
    uvTexture: GPUTexture;
    albedoTexture: GPUTexture;

    positionTextureView: GPUTextureView;
    normalTextureView: GPUTextureView;
    uvTextureView: GPUTextureView;
    albedoTextureView: GPUTextureView;

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    attributesPipeline: GPURenderPipeline;


    //
    quadVertexBuffer: GPUBuffer;
    quadIndexBuffer: GPUBuffer;
    quadNumIndices = -1;

    compositePipeline: GPURenderPipeline;

    compositeSceneUniformsBindGroupLayout: GPUBindGroupLayout;
    compositeSceneUniformBindGroup: GPUBindGroup;

    attributeTextureSampler: GPUSampler;

    constructor(stage: Stage) {
        super(stage);

        // Create scene bindings & layout
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                    buffer: {type: "uniform"}
                },
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                }
            ]
        });

        // Create depth texture
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        // Create attachment textures
        this.positionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float", 
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float", 
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.uvTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm", // Color
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.positionTextureView = this.positionTexture.createView();
        this.normalTextureView = this.normalTexture.createView();
        this.uvTextureView = this.uvTexture.createView();
        this.albedoTextureView = this.albedoTexture.createView();

        this.attributesPipeline = renderer.device.createRenderPipeline({
            label: "deferred attributes pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred attributes layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred attribute vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred attribute frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    {
                        format: this.positionTexture.format
                    },
                    {
                        format: this.normalTexture.format
                    },
                    {
                        format: this.uvTexture.format
                    },
                    {
                        format: this.albedoTexture.format
                    }
                ]
            }
        })

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.attributeTextureSampler = renderer.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest',
            mipmapFilter: 'nearest',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge'
        });

        this.compositeSceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "composite scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
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
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {type: "read-only-storage"}
                },

                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 6,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 7,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },

                {
                    binding: 8,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
            ]
        });

        this.compositeSceneUniformBindGroup = renderer.device.createBindGroup({
            label: "composite scene uniforms bind group",
            layout: this.compositeSceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer}
                },
                {
                    binding: 3,
                    resource: {buffer: this.lights.clusterLightIDsStorageBuffer}
                },
                
                {
                    binding: 4,
                    resource: this.positionTextureView
                },
                {
                    binding: 5,
                    resource: this.normalTextureView
                },
                {
                    binding: 6,
                    resource: this.uvTextureView
                },
                {
                    binding: 7,
                    resource: this.albedoTextureView
                },

                {
                    binding: 8,
                    resource: this.attributeTextureSampler
                }
            ]
        });

        this.compositePipeline = renderer.device.createRenderPipeline({
            label: "deferred composite pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "deferred composite layout",
                bindGroupLayouts: [this.compositeSceneUniformsBindGroupLayout]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred composite vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                buffers: [ renderer.minimal2DVertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred composite frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        })

        let vertsArray = new Float32Array([
            -1.0, -1.0,
            -1.0, 1.0,
            1.0, -1.0,
            1.0, 1.0
        ]);

        let indicesArray = new Uint32Array([
            0, 1, 2,
            1, 2, 3
        ]);
        
        this.quadVertexBuffer = renderer.device.createBuffer({
            label: "quad vertex buffer",
            size: vertsArray.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.quadVertexBuffer, 0, vertsArray);

        this.quadIndexBuffer = renderer.device.createBuffer({
            label: "quad index buffer",
            size: indicesArray.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.quadIndexBuffer, 0, indicesArray);

        this.quadNumIndices = indicesArray.length;
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        
        const encoder = renderer.device.createCommandEncoder();

        // Attribute Gather
        const attributeRenderPass = encoder.beginRenderPass({
            label: "deferred attribute pass",
            colorAttachments: [
                {
                    view: this.positionTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.uvTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.albedoTextureView,
                    clearValue: [0,0,0,0],
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
        attributeRenderPass.setPipeline(this.attributesPipeline);
        attributeRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        
        this.scene.iterate(node => {
            attributeRenderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            attributeRenderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            attributeRenderPass.setVertexBuffer(0, primitive.vertexBuffer);
            attributeRenderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            attributeRenderPass.drawIndexed(primitive.numIndices);
        });

        attributeRenderPass.end();

        // Light cluster
        this.lights.doLightClustering(encoder);

        // Fullscreen Composite
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const compositeRenderPass = encoder.beginRenderPass({
            label: "deferred composite pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });

        compositeRenderPass.setPipeline(this.compositePipeline);
        compositeRenderPass.setBindGroup(shaders.constants.bindGroup_scene, this.compositeSceneUniformBindGroup)
        
        compositeRenderPass.setVertexBuffer(0, this.quadVertexBuffer);
        compositeRenderPass.setIndexBuffer(this.quadIndexBuffer, 'uint32');
        compositeRenderPass.drawIndexed(this.quadNumIndices);

        compositeRenderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
