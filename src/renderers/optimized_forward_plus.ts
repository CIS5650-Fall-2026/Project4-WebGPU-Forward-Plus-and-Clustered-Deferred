import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class OptimizedForwardPlusRenderer extends renderer.Renderer {
    cullingEnabled = true;

    // 2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    markClustersBindGroupLayout: GPUBindGroupLayout;
    markClustersBindGroup: GPUBindGroup;

    cullingBindGroupLayout: GPUBindGroupLayout;
    cullingBindGroup: GPUBindGroup;

    lightingDepthBindGroupLayout: GPUBindGroupLayout;
    lightingDepthBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    activeClustersBuffer: GPUBuffer;

    markClustersPipeline: GPURenderPipeline;
    cullingPipeline: GPUComputePipeline;
    depthPrePipeline: GPURenderPipeline;
    lightingPipeline: GPURenderPipeline;
    
    constructor(stage: Stage) {
        super(stage);

        // 2: initialize layouts, pipelines, textures, etc. needed for Forward+ here
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

        this.activeClustersBuffer = renderer.device.createBuffer({
            size: shaders.constants.clusterCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.markClustersBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT 
                        | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // depth
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    texture: { sampleType: "depth" }
                },
                { // activeClusters
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.markClustersBindGroup = renderer.device.createBindGroup({
            layout: this.markClustersBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: this.depthTextureView },
                { binding: 2, resource: { buffer: this.activeClustersBuffer } }
            ]
        });

        this.markClustersPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "mark clusters pipeline layout",
                bindGroupLayouts: [
                    this.markClustersBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.markClustersFragSrc
                }),
                targets: []
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: false,
                depthCompare: "always"
            }
        });

        this.cullingBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.cullingBindGroup = renderer.device.createBindGroup({
            layout: this.cullingBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.activeClustersBuffer } }
            ]
        });

        this.cullingPipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [
                    this.lights.clusteringComputeBindGroupLayout,
                    this.cullingBindGroupLayout
                ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    code: shaders.optimizedClusteringComputeSrc
                }),
            }
        });

        this.lightingDepthBindGroupLayout = renderer.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                }
            ]
        });

        this.lightingDepthBindGroup = renderer.device.createBindGroup({
            layout: this.lightingDepthBindGroupLayout,
            entries: [
                { binding: 0, resource: this.depthTextureView }
            ]
        });

        this.depthPrePipeline = renderer.device.createRenderPipeline({
            label: "depth pre pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "depth pre pipeline layout",
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
                    label: "forward+ vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ frag shader",
                    code: shaders.depthPreFragSrc,
                }),
                targets: []
            }
        });

        this.lightingPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "forward+ lighting pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                    this.lightingDepthBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "equal",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "forward+ vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ frag shader",
                    code: shaders.optimizedForwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

    }

    override draw() {
        // 2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();

        const depthPrePass = encoder.beginRenderPass({
            label: "depth prepass",
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
        depthPrePass.setPipeline(this.depthPrePipeline);
        
        depthPrePass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            depthPrePass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            depthPrePass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            depthPrePass.setVertexBuffer(0, primitive.vertexBuffer);
            depthPrePass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            depthPrePass.drawIndexed(primitive.numIndices);
        });

        depthPrePass.end();

        if (this.cullingEnabled) {
            encoder.clearBuffer(this.activeClustersBuffer);

            const markPass = encoder.beginRenderPass({
                label: "mark active clusters",
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthReadOnly: true
                }
            });

            markPass.setPipeline(this.markClustersPipeline);
            markPass.setBindGroup(0, this.markClustersBindGroup);
            markPass.draw(3);
            markPass.end();

            const clusteringPass = encoder.beginComputePass({
                label: "depth-culled clustering"
            });

            clusteringPass.setPipeline(this.cullingPipeline);
            clusteringPass.setBindGroup(0, this.lights.clusteringComputeBindGroup);
            clusteringPass.setBindGroup(1, this.cullingBindGroup);
            clusteringPass.dispatchWorkgroups(
                Math.ceil(
                    shaders.constants.clusterCount
                    / shaders.constants.clusteringWorkgroupSize
                )
            );
            clusteringPass.end();
        } else {
            this.lights.doLightClustering(encoder);
        }

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const lightingPass = encoder.beginRenderPass({
            label: "forward+ lighting pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthReadOnly: true
            }
        });
        lightingPass.setPipeline(this.lightingPipeline);

        lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        lightingPass.setBindGroup(3, this.lightingDepthBindGroup);

        this.scene.iterate(node => {
            lightingPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            lightingPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            lightingPass.setVertexBuffer(0, primitive.vertexBuffer);
            lightingPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            lightingPass.drawIndexed(primitive.numIndices);
        });

        lightingPass.end();

        this.drawClusterHeatmap(encoder, canvasTextureView,
            this.sceneUniformsBindGroupLayout, this.sceneUniformsBindGroup, this.depthTextureView);

        renderer.device.queue.submit([encoder.finish()]);
    }
}
