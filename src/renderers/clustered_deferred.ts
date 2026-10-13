import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

import { GPUTimer } from '../gpu_timer';


import { benchmarkCollector } from '../benchmark';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution


    gBufferSceneBindGroupLayout: GPUBindGroupLayout;
    gBufferSceneBindGroup: GPUBindGroup;



    fullscreenSceneBindGroupLayout: GPUBindGroupLayout;
    fullscreenSceneBindGroup: GPUBindGroup;


    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;


    screenUniformBuffer: GPUBuffer;


    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;


    // normalTexture: GPUTexture;
    // normalTextureView: GPUTextureView;


    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;



    gBufferPipeline: GPURenderPipeline;
    fullscreenPipeline: GPURenderPipeline;


    // Extra Credit: compute-based deferred lighting
    computeLightingPipeline: GPUComputePipeline;

    directCanvasOutput: boolean;
    directCanvasComputePipeline?: GPUComputePipeline;
    directCanvasOutputBindGroupLayout?: GPUBindGroupLayout;


    computeOutputTexture: GPUTexture;
    computeOutputTextureView: GPUTextureView;


    computeOutputBindGroupLayout: GPUBindGroupLayout;
    computeOutputBindGroup: GPUBindGroup;


    presentationPipeline: GPURenderPipeline;
    presentationBindGroupLayout: GPUBindGroupLayout;
    presentationBindGroup: GPUBindGroup;


    gpuTimer: GPUTimer;


    constructor(stage: Stage) {
        super(stage);

        this.gpuTimer = new GPUTimer();


        this.directCanvasOutput = renderer.canvasFormat === "bgra8unorm" && renderer.device.features.has("bgra8unorm-storage");

        // console.log("Direct canvas compute output:", this.directCanvasOutput);
        // console.log("Canvas format:", renderer.canvasFormat);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass



        // Screen resolution used for position reconstruction and cluster lookup in the fullscreen fragment shader
        this.screenUniformBuffer = renderer.device.createBuffer({
            label: "Clustered Deferred screen resolution uniform",
            size: 8, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });



        // G-buffer textures



        // this.albedoTexture = renderer.device.createTexture({
        //     label: "G-buffer albedo texture",
        //     size: [renderer.canvas.width, renderer.canvas.height],
        //     format: "rgba8unorm",
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        // });
        // this.albedoTextureView = this.albedoTexture.createView();

        // // World-space normals require a format that supports negative values
        // this.normalTexture = renderer.device.createTexture({
        //     label: "G-buffer normals",
        //     size: [renderer.canvas.width, renderer.canvas.height],
        //     format: "rgba16float",
        //     usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        // });
        // this.normalTextureView = this.normalTexture.createView();


        // Extra Credit: compact single-color G-buffer
        // RGB stores albedo; alpha stores an 11-bit octahedral normal (6 bits X, 5 bits Y)
        // The packed integer fits exactly in the rgba16float alpha channel
        this.albedoTexture = renderer.device.createTexture({
            label: "G-buffer packed albedo and normal",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albedoTextureView = this.albedoTexture.createView();




        // Depth is written during the G-buffer pass and read during the fullscreen lighting pass
        this.depthTexture = renderer.device.createTexture({
            label: "G-buffer depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        // Extra Credit: compute lighting output
        // Compute shader writes here; presentation pass reads from it
        this.computeOutputTexture = renderer.device.createTexture({
            label: "Clustered Deferred compute lighting output",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        })

        this.computeOutputTextureView = this.computeOutputTexture.createView();




        // G-buffer geometry pass bindings




        // Naive vertex shader needs the camera at scene group 0, binding 0
        this.gBufferSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer scene bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                }
            ]
        });


        this.gBufferSceneBindGroup = renderer.device.createBindGroup({
            label: "G-buffer scene bind group",
            layout: this.gBufferSceneBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                }
            ]
        });


        // Fullscreen lighting pass bindings



        // Matches clustered_deferred_fullscreen.fs.wgsl:
        // 0: camera
        // 1: lights
        // 2: clusters
        // 3: screen resolution
        this.fullscreenSceneBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Clustered Deferred fullscreen scene layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });


        this.fullscreenSceneBindGroup = renderer.device.createBindGroup({
            label: "Clustered Deferred fullscreen scene bind group",
            layout: this.fullscreenSceneBindGroupLayout,
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




        // // Group 1 of fullscreen fragment shader:
        // // 0: albedo texture
        // // 1: normal texture
        // // 2: depth texture
        // this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
        //     label: "G-buffer texture bind group layout",
        //     entries: [
        //         {
        //             binding: 0,
        //             visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        //             texture: { sampleType: "float" }
        //         },
        //         {
        //             binding: 1,
        //             visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        //             texture: { sampleType: "unfilterable-float" }
        //         },
        //         {
        //             binding: 2,
        //             visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        //             texture: { sampleType: "depth" }
        //         }
        //     ]
        // });


        // Extra Credit: one packed color texture and one depth texture
        // Group 1:
        // binding 0: packed albedo and normal
        // binding 1: depth
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Packed G-buffer texture bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    texture: { sampleType: "unfilterable-float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    texture: { sampleType: "depth" }
                }
            ]
        });




        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "Packed G-buffer texture bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.albedoTextureView
                },
                {
                    binding: 1,
                    resource: this.depthTextureView
                }
            ]
        });


        // G-buffer geometry pipeline





        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer pipeline layout",
                bindGroupLayouts: [
                    this.gBufferSceneBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer vertex shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer fragment shader",
                    code: shaders.clusteredDeferredFragSrc
                }),
                targets: [
                    // { format: "rgba8unorm" },
                    { format: "rgba16float" }
                ]
            },
            primitive: {
                topology: "triangle-list",
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            }
        });




        // Fullscreen lighting pipeline





        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "Clustered Deferred fullscreen pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenSceneBindGroupLayout,
                    this.gBufferBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred fullscreen vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred fullscreen fragment shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc
                }),
                targets: [
                    { format: renderer.canvasFormat }
                ]
            },
            primitive: {
                topology: "triangle-list",
            }
        });


        if (this.directCanvasOutput) {
            this.directCanvasOutputBindGroupLayout = renderer.device.createBindGroupLayout({
                label: "Clustered Deferred direct canvas output layout",
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        storageTexture: {
                            access: "write-only",
                            format: "bgra8unorm",
                            viewDimension: "2d"
                        }
                    }
                ]
            });
        }


        // Extra credit: writable lighting output for the compute pass
        this.computeOutputBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Clustered Deferred compute output layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "rgba8unorm",
                        viewDimension: "2d"
                    }
                }
            ]
        });






        this.computeOutputBindGroup = renderer.device.createBindGroup({
            label: "Clustered Deferred compute output bind group",
            layout: this.computeOutputBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.computeOutputTextureView
                }
            ]
        });





        this.computeLightingPipeline = renderer.device.createComputePipeline({
            label: "Clustered Deferred compute lighting pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "Clustered Deferred compute lighting pipeline layout",
                bindGroupLayouts: [
                    this.fullscreenSceneBindGroupLayout,
                    this.gBufferBindGroupLayout,
                    this.computeOutputBindGroupLayout
                ]
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred compute lighting shader",
                    code: shaders.clusteredDeferredLightingComputeSrc
                }),
                entryPoint: "main"
            }
        });


        if (this.directCanvasOutput) {
            this.directCanvasComputePipeline = renderer.device.createComputePipeline({
                label: "Clustered Deferred direct canvas compute pipeline",
                layout: renderer.device.createPipelineLayout({
                    label: "Clustered Deferred direct canvas compute pipeline layout",
                    bindGroupLayouts: [
                        this.fullscreenSceneBindGroupLayout,
                        this.gBufferBindGroupLayout,
                        this.directCanvasOutputBindGroupLayout!
                    ]
                }),
                compute: {
                    module: renderer.device.createShaderModule({
                        label: "Clustered Deferred direct canvas compute shader",
                        code: shaders.getClusteredDeferredLightingComputeSrc("bgra8unorm")
                    }),
                    entryPoint: "main"
                }
            });
        }


        // Extra Credit: present compute lighting results to the canvas.
        this.presentationBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Clustered Deferred presentation layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                }
            ]
        });



        this.presentationBindGroup = renderer.device.createBindGroup({
            label: "Clustered Deferred presentation bind group",
            layout: this.presentationBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.computeOutputTextureView
                }
            ]
        });






        this.presentationPipeline = renderer.device.createRenderPipeline({
            label: "Clustered Deferred compute presentation pipeline",
            layout: renderer.device.createPipelineLayout({
                label: "Clustered Deferred presentation pipeline layout",
                bindGroupLayouts: [
                    this.presentationBindGroupLayout
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred presentation vertex shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: "main"
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Clustered Deferred presentation fragment shader",
                    code: shaders.clusteredDeferredPresentFragSrc
                }),
                entryPoint: "main",
                targets: [
                    { format: renderer.canvasFormat }
                ]
            },
            primitive: {
                topology: "triangle-list"
            }
        });
    }







    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations





        renderer.device.queue.writeBuffer(this.screenUniformBuffer, 0, new Float32Array([renderer.canvas.width, renderer.canvas.height]));


        const encoder = renderer.device.createCommandEncoder();


        const measureThisFrame = this.gpuTimer.beginSample();


        const benchmarkSessionId = benchmarkCollector.getSessionId();


        // Pass 1: Light clustering




        // Reuse existing TODO-2 clustering implementation
        this.lights.doLightClustering(encoder, measureThisFrame ? {
            querySet: this.gpuTimer.querySet,
            beginningOfPassWriteIndex: 0
            } : undefined
        );


        // Pass 2: G-buffer geometry rendering


        const gBufferPass = encoder.beginRenderPass({
            label: "Clustered Deferred G-buffer pass",
            colorAttachments: [
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


        gBufferPass.setPipeline(this.gBufferPipeline);

        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.gBufferSceneBindGroup);


        // Same geometry iteration as the Naive renderer
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


        // Extra Credit: compute-based deferred lighting
        const useComputeLighting = true;

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const directCanvasBindGroup = this.directCanvasOutput
            ? renderer.device.createBindGroup({
                label: "Clustered Deferred direct canvas output bind group",
                layout: this.directCanvasOutputBindGroupLayout!,
                entries: [
                    {
                        binding: 0,
                        resource: canvasTextureView
                    }
                ]
            })
            : undefined;

        if (useComputeLighting) {
            const computePass = encoder.beginComputePass({
                label: "Clustered Deferred compute lighting pass",
                timestampWrites: measureThisFrame && this.directCanvasOutput
                    ? {
                        querySet: this.gpuTimer.querySet,
                        endOfPassWriteIndex: 1
                    }
                    : undefined
            });




            // computePass.setPipeline(this.computeLightingPipeline);
            // computePass.setBindGroup(0, this.fullscreenSceneBindGroup);
            // computePass.setBindGroup(1, this.gBufferBindGroup);
            // computePass.setBindGroup(2, this.computeOutputBindGroup);


            computePass.setPipeline(
                this.directCanvasOutput
                    ? this.directCanvasComputePipeline!
                    : this.computeLightingPipeline
            );

            computePass.setBindGroup(0, this.fullscreenSceneBindGroup);
            computePass.setBindGroup(1, this.gBufferBindGroup);

            computePass.setBindGroup(
                2,
                this.directCanvasOutput
                    ? directCanvasBindGroup!
                    : this.computeOutputBindGroup
            );



            computePass.dispatchWorkgroups(
                Math.ceil(renderer.canvas.width / 8),
                Math.ceil(renderer.canvas.height / 8)
            );



            computePass.end();
        }




        // Pass 3: Fullscreen lighting


    if (!useComputeLighting || !this.directCanvasOutput) {

        // const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const fullscreenPass = encoder.beginRenderPass({
            label: "Clustered Deferred fullscreen lighting pass",
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
            ]
        });

        if (useComputeLighting) {


        // Only display the lighting texture; no lighting calculations here
        fullscreenPass.setPipeline(this.presentationPipeline);


        fullscreenPass.setBindGroup(0, this.presentationBindGroup);


        } else {


            // Preserve the original fragment-based deferred lighting path

            fullscreenPass.setPipeline(this.fullscreenPipeline);


            fullscreenPass.setBindGroup(0, this.fullscreenSceneBindGroup);


            fullscreenPass.setBindGroup(1, this.gBufferBindGroup);
        }

        // Fullscreen triangle generated by vertex_index
        fullscreenPass.draw(3);


        fullscreenPass.end();
    }

        if (measureThisFrame) {
            this.gpuTimer.resolve(encoder);
        }




        renderer.device.queue.submit([encoder.finish()]);





        if (measureThisFrame) {
            void this.gpuTimer.readMilliseconds().then(milliseconds => {
                if (milliseconds !== null) {
                    // console.log(`Clustered Deferred GPU Time: ${milliseconds.toFixed(3)} ms`);

                    benchmarkCollector.recordForSession(milliseconds, benchmarkSessionId, 'clustered deferred');
                }
            })
            .catch(error => {
                console.error("Error reading Clustered Deferred GPU time:", error);
            });
        }
    }
}
