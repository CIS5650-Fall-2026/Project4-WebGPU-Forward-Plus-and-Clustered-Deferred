import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { gpuTimer } from '../gpu_timer';
import { RenderSettings } from '../renderer';

export class NaiveRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    renderBundleEncoder: GPURenderBundleEncoder;
    renderBundle: GPURenderBundle;

    constructor(stage: Stage, settings: RenderSettings) {
        super(stage, settings);

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {type: "uniform" }
                },
                { // lightSet
                    binding: 1,
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
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "naive pipeline layout",
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
                    label: "naive frag shader",
                    code: shaders.naiveFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

        this.renderBundleEncoder = renderer.device.createRenderBundleEncoder({
            label: "naive render bundle encoder",
            colorFormats: [renderer.canvasFormat],
            depthReadOnly: false,
            stencilReadOnly: false,
            depthStencilFormat: "depth24plus"
        });

        this.encodeRenderCommands(this.renderBundleEncoder);

        this.renderBundle = this.renderBundleEncoder.finish();
    }

    private encodeRenderCommands(encoder: GPURenderPassEncoder | GPURenderBundleEncoder) {
        encoder.setPipeline(this.pipeline);

        encoder.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            encoder.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            encoder.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            encoder.setVertexBuffer(0, primitive.vertexBuffer);
            encoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
            encoder.drawIndexed(primitive.numIndices);
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "naive render pass",
            timestampWrites: gpuTimer.both(),
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
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        if(this.renderSettings.bUseRenderBundles){
            renderPass.executeBundles([this.renderBundle]);
        }
        else{
            this.encodeRenderCommands(renderPass);
        }

        renderPass.end();

        gpuTimer.resolve(encoder);
        renderer.device.queue.submit([encoder.finish()]);
        gpuTimer.read();
    }
}
