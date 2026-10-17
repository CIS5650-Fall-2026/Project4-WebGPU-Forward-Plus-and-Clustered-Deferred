import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    //bindgroups:
    clusterComputeBindGroupLayout: GPUBindGroupLayout;
    clusterComputeBindGroup: GPUBindGroup;
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    
    // textures
    zTexture: GPUTexture;
    zTextureView: GPUTextureView;
    gBufferPositionTexture: GPUTexture;
    gBufferPositionTextureView: GPUTextureView;
    gBufferAlbedoTexture: GPUTexture;
    gBufferAlbedoTextureView: GPUTextureView;
    gBufferNormalTexture: GPUTexture;
    gBufferNormalTextureView: GPUTextureView;

    // pipelines:
    clusterComputePipeline: GPUComputePipeline;
    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        // setup textures
                // setup textures
        this.zTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.zTextureView = this.zTexture.createView();
        this.gBufferPositionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferPositionTextureView = this.gBufferPositionTexture.createView();

        this.gBufferAlbedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferAlbedoTextureView = this.gBufferAlbedoTexture.createView();

        this.gBufferNormalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.gBufferNormalTextureView = this.gBufferNormalTexture.createView();

        // assign bind group layouts and bind groups here
        this.clusterComputeBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "light clustering compute bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.clusterComputeBindGroup = renderer.device.createBindGroup({
            label: "light clustering compute bind group",
            layout: this.clusterComputeBindGroupLayout,
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
                    resource: { buffer: this.camera.clusterDataBuffer }
                }
            ]
        });
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward plus scene uniforms bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // light set
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // cluster set
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
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.clusterDataBuffer }
                }
            ]
        });
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g buffer read layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } }, // position
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } }, // albedo
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } }  // normal
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "g buffer read bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                { binding: 0, resource: this.gBufferPositionTextureView },
                { binding: 1, resource: this.gBufferAlbedoTextureView },
                { binding: 2, resource: this.gBufferNormalTextureView }
            ]
        });
        
        // create pipelines
        // compute pipeline
        this.clusterComputePipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [this.clusterComputeBindGroupLayout],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteringComputeSrc,
                }),
                entryPoint: 'main',
            },
        });

        // create g buffer render pipeline
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
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "cluster deferred frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    { format: "rgba16float" }, // 0 position
                    { format: "rgba8unorm" },  // 1 albedo
                    { format: "rgba16float" }  // 2 normal
                ]
            }
        });

        
        // create full screen render pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "forward plus pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout,
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "full screen vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "full screen frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });


    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusterComputePipeline);

        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.clusterComputeBindGroup);

        computePass.dispatchWorkgroups(Math.ceil(this.camera.clusterDim[0] / 4), Math.ceil(this.camera.clusterDim[1] / 4), Math.ceil(this.camera.clusterDim[2] / 4));

        computePass.end();
        
        // - run the G-buffer pass, outputting position, albedo, and normals

        const gBufferPass = encoder.beginRenderPass({
            label: "g buffer render pass",
            colorAttachments: [
                {
                    view: this.gBufferPositionTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferAlbedoTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferNormalTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.zTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
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

        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const fullscreenPass = encoder.beginRenderPass({
            label: "fullscreen render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
        fullscreenPass.setPipeline(this.fullscreenPipeline);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        fullscreenPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gBufferBindGroup);
        fullscreenPass.draw(3, 1, 0, 0);
        fullscreenPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
