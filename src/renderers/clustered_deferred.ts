import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;
    gBufferTextures: GPUTexture[];
    gBufferViews: GPUTextureView[];
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    gBufferPipeline: GPURenderPipeline;
    lightingPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "deferred scene bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
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
            label: "deferred scene bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterSetStorageBuffer } }
            ]
        });


        // Position, normal, albedo
        const formats: GPUTextureFormat[] = ["rgba16float", "rgba16float", "rgba8unorm"];
        const labels = ["position", "normal", "albedo"];
        this.gBufferTextures = formats.map((format, i) => renderer.device.createTexture({
            label: `G-buffer ${labels[i]}`,
            size: [renderer.canvas.width, renderer.canvas.height],
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        }));
        this.gBufferViews = this.gBufferTextures.map(texture => texture.createView());

        // Depth
        this.depthTexture = renderer.device.createTexture({
            label: "deferred depth",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();


        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer texture bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "unfilterable-float" }
                }
            ]
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer texture bind group",
            layout: this.gBufferBindGroupLayout,
            entries: this.gBufferViews.map((view, binding) => ({ binding, resource: view }))
        });


        // Geometry pipeline
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            label: "G-buffer pipeline",
            layout: renderer.device.createPipelineLayout({
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
                module: renderer.device.createShaderModule({ code: shaders.naiveVertSrc }),
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: formats.map(format => ({ format }))
            }
        });

        // Lighting pipeline
        this.lightingPipeline = renderer.device.createRenderPipeline({
            label: "deferred lighting pipeline",
            layout: renderer.device.createPipelineLayout({
                bindGroupLayouts: [this.sceneUniformsBindGroupLayout, this.gBufferBindGroupLayout]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "deferred lighting fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [{ format: renderer.canvasFormat }]
            }
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();

        // Cluster lights
        this.lights.doLightClustering(encoder, this.passTimestamps());

        // Geometry pass
        const geometryPass = encoder.beginRenderPass({
            label: "G-buffer render pass",
            timestampWrites: this.passTimestamps(),
            colorAttachments: this.gBufferViews.map((view): GPURenderPassColorAttachment => ({
                view,
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            })),
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "discard"
            }
        });
        geometryPass.setPipeline(this.gBufferPipeline);
        geometryPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        // Copied from naive.ts
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

        // Lighting pass reads the G-buffers
        const lightingPass = encoder.beginRenderPass({
            label: "deferred lighting pass",
            timestampWrites: this.passTimestamps(),
            colorAttachments: [{
                view: renderer.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        lightingPass.setPipeline(this.lightingPipeline);
        lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        lightingPass.setBindGroup(shaders.constants.bindGroup_gBuffer, this.gBufferBindGroup);
        lightingPass.draw(3); // fullscreen triangle
        lightingPass.end();

        // clustering + G-buffer + fullscreen lighting time
        this.submitWithTiming(encoder);
    }
}
