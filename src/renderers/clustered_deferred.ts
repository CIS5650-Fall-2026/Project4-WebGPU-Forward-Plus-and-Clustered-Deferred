import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // 3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gbufferBindGroupLayout: GPUBindGroupLayout;
    gbufferBindGroup: GPUBindGroup;
    
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;
    
    geometryPipeline: GPURenderPipeline;
    lightingPipeline: GPURenderPipeline;

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
                    visibility: GPUShaderStage.FRAGMENT,
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

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        const createGBufferTexture = (label: string, format: GPUTextureFormat) => 
            renderer.device.createTexture({
                label,
                size: [renderer.canvas.width, renderer.canvas.height],
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT 
                     | GPUTextureUsage.TEXTURE_BINDING
            });

        this.positionTexture = createGBufferTexture("position texture", "rgba16float");
        this.normalTexture = createGBufferTexture("normal texture", "rgba16float");
        this.albedoTexture = createGBufferTexture("albedo texture", "rgba8unorm");

        this.positionTextureView = this.positionTexture.createView();
        this.normalTextureView = this.normalTexture.createView();
        this.albedoTextureView = this.albedoTexture.createView();

        this.geometryPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred geometry pipeline layout",
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
                    label: "deferred geometry vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred geometry frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    { format: "rgba16float" },
                    { format: "rgba16float" },
                    { format: "rgba8unorm" }
                ]
            }
        });

        this.gbufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "g-buffer bind group layout",
            entries: [
                { // position
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // normal
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // albedo
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                }
            ]
        });

        this.gbufferBindGroup = renderer.device.createBindGroup({
            label: "g-buffer bind group",
            layout: this.gbufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.positionTextureView 
                },
                {
                    binding: 1,
                    resource: this.normalTextureView
                },
                {
                    binding: 2,
                    resource: this.albedoTextureView
                }
            ]
        });

        this.lightingPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "deferred lighting pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gbufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred lighting vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred lighting frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
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
                    view: this.positionTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.albedoTextureView,
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
        lightingPass.setPipeline(this.lightingPipeline);

        lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        lightingPass.setBindGroup(shaders.constants.bindGroup_gbuffer, this.gbufferBindGroup);

        lightingPass.draw(3);
        lightingPass.end();

        this.drawClusterHeatmap(encoder, canvasTextureView,
            this.sceneUniformsBindGroupLayout, this.sceneUniformsBindGroup, this.depthTextureView);

        renderer.device.queue.submit([encoder.finish()]);
    }
}
