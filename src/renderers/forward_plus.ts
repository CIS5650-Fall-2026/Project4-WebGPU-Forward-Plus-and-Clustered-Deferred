import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { CpuTimer } from '../cpu_timer';

export class ForwardPlusRenderer extends renderer.Renderer {
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    private bundle?: GPURenderBundle;
    private cpuTimer: CpuTimer;

    constructor(stage: Stage, useBundles = false, debugClusters = false) {
        super(stage, debugClusters ? 'cluster debug' : (useBundles ? 'forward+ bundles' : 'forward+'), ['clustering', 'render']);
        this.cpuTimer = new CpuTimer(debugClusters ? 'cluster debug' : (useBundles ? 'forward+ bundles' : 'forward+'));

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ scene bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility:
                        GPUShaderStage.VERTEX |
                        GPUShaderStage.FRAGMENT,
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
            label: "forward+ scene bind group",
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
            label: "forward+ depth",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.depthTextureView = this.depthTexture.createView();

        this.pipeline = renderer.device.createRenderPipeline({
            label: "forward+ render pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "forward+ pipeline layout",
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
                    label: "forward+ vertex shader",
                    code: shaders.naiveVertSrc
                }),
                entryPoint: "main",
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ fragment shader",
                    code: shaders.forwardPlusFragSrc
                }),
                entryPoint: "main",
                constants: { debugClusters: debugClusters ? 1 : 0 },
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            }
        });

        if (useBundles) {
            const start = performance.now();
            const bundleEncoder = renderer.device.createRenderBundleEncoder({
                label: 'forward+ scene bundle',
                colorFormats: [renderer.canvasFormat],
                depthStencilFormat: 'depth24plus'
            });
            this.encodeScene(bundleEncoder);
            this.bundle = bundleEncoder.finish();
            console.log('Render bundle recording ms:', performance.now() - start);
        }
    }

    override measureGpu() {
        super.measureGpu();
        this.cpuTimer.reset();
    }

    private encodeScene(pass: GPURenderPassEncoder | GPURenderBundleEncoder) {
        pass.setPipeline(this.pipeline);

        pass.setBindGroup(
            shaders.constants.bindGroup_scene,
            this.sceneUniformsBindGroup
        );

        this.scene.iterate(
            node => {
                pass.setBindGroup(
                    shaders.constants.bindGroup_model,
                    node.modelBindGroup
                );
            },
            material => {
                pass.setBindGroup(
                    shaders.constants.bindGroup_material,
                    material.materialBindGroup
                );
            },
            primitive => {
                pass.setVertexBuffer(0, primitive.vertexBuffer);
                pass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                pass.drawIndexed(primitive.numIndices);
            }
        );

    }

    override stop() {
        super.stop();
        this.depthTexture.destroy();
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder, this.timer.timestamps(0));

        const canvasTextureView =
            renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            timestampWrites: this.timer.timestamps(1),
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

        // Measure CPU draw encoding only, excluding clustering and GPU execution.
        this.cpuTimer.beginFrame(JSON.stringify({
            lights: this.lights.numLights,
            width: renderer.canvas.width,
            height: renderer.canvas.height,
            frozen: this.lights.freezeLights,
            camera: this.camera.cameraPos.join(','),
            direction: this.camera.cameraFront.join(',')
        }));
        const start = performance.now();
        if (this.bundle) {
            renderPass.executeBundles([this.bundle]);
        } else {
            this.encodeScene(renderPass);
        }
        this.cpuTimer.record(performance.now() - start);

        renderPass.end();

        this.timer.submit(encoder);
    }
}
