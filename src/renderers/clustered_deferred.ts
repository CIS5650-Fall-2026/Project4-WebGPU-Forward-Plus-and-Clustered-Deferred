import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    cameraBindGroupLayout: GPUBindGroupLayout;
    cameraBindGroup: GPUBindGroup;

    lightingBindGroupLayout: GPUBindGroupLayout;
    lightingBindGroup: GPUBindGroup;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    clusteredDeferredGeometryPipeline: GPURenderPipeline;
    clusteredDeferredLightingPipeline: GPURenderPipeline;


    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.cameraBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred camera uniform bind group layout",
            entries: [
                { //camera
                    binding:0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer:{type: "uniform"}
                }
            ]
        });

        this.cameraBindGroup = renderer.device.createBindGroup({
            label: "clustered deferred camera uniform bind group",
            layout: this.cameraBindGroupLayout,
            entries: [
                {
                    binding:0,
                    resource: {buffer:this.camera.uniformsBuffer}
                }
            ]
        });

        //GBuffer textures
        this.positionTexture = renderer.device.createTexture({
            label: "G-buffer position",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba32float", //try changing for performance tests
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        })
        this.positionTextureView = this.positionTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            label: "G-buffer normal",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        })
        this.normalTextureView = this.normalTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            label: "G-buffer albedo",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        })
        this.albedoTextureView = this.albedoTexture.createView();
                

        this.lightingBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clustered deferred lighting bind group layout",
            entries: [
                { //position
                    binding:0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture:{
                        sampleType: "unfilterable-float",
                        viewDimension: "2d"
                    }
                },
                { //normal
                    binding:1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture:{
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                },
                { //albedo
                    binding:2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture:{
                        sampleType: "float",
                        viewDimension: "2d"
                    }
                },
                { //lights
                    binding:3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer:{type: "read-only-storage"}
                },
                { //clusters
                    binding:4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer:{type: "read-only-storage"}
                }
            ]
        });

        this.lightingBindGroup = renderer.device.createBindGroup({
            label: "clustered deferred lighting bind group",
            layout: this.lightingBindGroupLayout,
            entries: [
                { //position
                    binding:0,
                    resource: this.positionTextureView
                },
                { //normal
                    binding:1,
                    resource: this.normalTextureView
                },
                { //albedo
                    binding:2,
                    resource: this.albedoTextureView
                },
                { //lights
                    binding:3,
                    resource: {buffer:this.lights.lightSetStorageBuffer} //syntax: tells bind grup which actual GPU buffer to use, buffer is the API's property name
                },
                { //clusters
                    binding:4,
                    resource: {buffer:this.lights.clusterStorageBuffer}
                }
            ]
        });

        //WebGPU doesn't automatically supply a depth buffer lmao
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        })
        this.depthTextureView = this.depthTexture.createView();

        this.clusteredDeferredGeometryPipeline = renderer.device.createRenderPipeline({
            label: "clustered deferred geometry pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred geometry pipeline layout",
                bindGroupLayouts: [
                    this.cameraBindGroupLayout,
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
                module: renderer.device.createShaderModule({ //WebGPu object containing WGSL shader code
                    label: "clustered deferred naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout] //layout, not actual GPU buffer
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred frag shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    { format: "rgba32float"}, //@location(0)
                    { format: "rgba16float"}, //@location(1)
                    { format: "rgba8unorm"} //@location(2)
                ]
            }
        });


        this.clusteredDeferredLightingPipeline = renderer.device.createRenderPipeline({
            label: "clustered deferred lighting pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "clustered deferred lighting pipeline layout",
                bindGroupLayouts: [
                    this.cameraBindGroupLayout,
                    this.lightingBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred lighting vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                //no buffer: because the fullscreen shader generates its vertices using vertex_index
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred lighting frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            }
        })
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        
        //encoder records the overall command sequence and render pass encoder records drawing commands within one pass
        //encoder holds recordings of all render passes
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        //compute pass
        this.lights.doLightClustering(encoder);

        //make renderPass, record encoder and submit calls
        //renderpass records drawing into particular attachments (which color/depth textures to use, whether to clear them, and the actual draw commands)
        const renderPass = encoder.beginRenderPass({
            label: "clustered deferred geometry pass",
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
        })
        renderPass.setPipeline(this.clusteredDeferredGeometryPipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.cameraBindGroup);
        
        this.scene.iterate(
            node => { renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);},
            material => { renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);},
            primitive => { renderPass.setVertexBuffer(0,primitive.vertexBuffer);
                            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                            renderPass.drawIndexed(primitive.numIndices);} //this is this pass's draw call
        );

        renderPass.end();

        const renderPass1 = encoder.beginRenderPass({
            label: "clustered deferred lighting pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        })
        renderPass1.setPipeline(this.clusteredDeferredLightingPipeline);
        renderPass1.setBindGroup(shaders.constants.bindGroup_scene, this.cameraBindGroup);
        renderPass1.setBindGroup(shaders.constants.bindGroup_lighting, this.lightingBindGroup);
        //bindGroupLayouts[index]
        //setBindGroup(index, group)
        //WGSL @group(index)
        //all must be consistent
        
        renderPass1.draw(3); //draw triangle covering the scene
        renderPass1.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
