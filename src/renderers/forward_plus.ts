import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { GPUTimer } from '../gpu_timer';

import { benchmarkCollector } from '../benchmark';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;



    screenUniformBuffer: GPUBuffer;



    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;


    pipeline: GPURenderPipeline;


    gpuTimer: GPUTimer;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here


        this.gpuTimer = new GPUTimer();

        // Fragment shader uses this to determine the XY cluster from the fragment's screen-space position
        this.screenUniformBuffer = renderer.device.createBuffer({
            label: "Forward+ screen resolution uniform",
            size: 8, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Scene bindings:
        // 0: camera uniforms (vertex and fragment)
        // 1: lights
        // 2: computed cluster light lists
        // 3: screen resolution

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
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
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });



        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "Forward+ scene uniforms bind group",
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
                    resource: { buffer: this.screenUniformBuffer }
                }
            ]
        });


        // Same depth texture configuration as Naive
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });



        this.depthTextureView = this.depthTexture.createView();



        // Same geometry pipeline as Naive, but use the Forward+ fragment shader and scene bind group
        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "Forward+ pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Forward+ vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Forward+ fragment shader",
                    code: shaders.forwardPlusFragSrc
                }),
                targets: [
                    {
                        format: renderer.canvasFormat
                    }
                ]
            },
            primitive: {
                topology: "triangle-list"
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting


        // Update the resolution used by the fragment shader to calculate its screen-space cluster coordinates
        renderer.device.queue.writeBuffer(this.screenUniformBuffer, 0, new Float32Array([renderer.canvas.width, renderer.canvas.height]));


        const encoder = renderer.device.createCommandEncoder();

        const measureThisFrame = this.gpuTimer.beginSample();

        const benchmarkSessionId = benchmarkCollector.getSessionId();


        // Run clustering before main rendering pass

        this.lights.doLightClustering(encoder, measureThisFrame ? {
            querySet: this.gpuTimer.querySet,
            beginningOfPassWriteIndex: 0
            } : undefined
        );

        const canvasTextureView = renderer.context.getCurrentTexture().createView();


        // Same render pass setup as Naive
        const renderPass = encoder.beginRenderPass({
            label: "Forward+ render pass",
            timestampWrites: measureThisFrame ? {
                querySet: this.gpuTimer.querySet,
                endOfPassWriteIndex: 1
            } : undefined,
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
        

        renderPass.setPipeline(this.pipeline);


        // Bind camera, lights, clusters, and screen resolution
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);


        // Draw the scene using the same model and material iteration as the Naive renderer
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



        if (measureThisFrame) {
            this.gpuTimer.resolve(encoder);
        }




        renderer.device.queue.submit([encoder.finish()]);




        if (measureThisFrame) {

            void this.gpuTimer.readMilliseconds().then(milliseconds => {

                if (milliseconds !== null) {
                    // console.log(`Forward+ GPU Time: ${milliseconds.toFixed(3)} ms`);

                    benchmarkCollector.recordForSession(milliseconds, benchmarkSessionId, 'forward+');
                }
            })
            .catch(error => {
                console.error("Error reading Forward+ GPU time:", error);
            });
        }
    }
}
