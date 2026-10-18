import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    gbufferMatBindGroupLayout: GPUBindGroupLayout;
    gbufferMatBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    nordepthTexture: GPUTexture;
    nordepthTextureView: GPUTextureView;
    norDepthTextureSampler: GPUSampler;

    colorTexture: GPUTexture;
    colorTextureView: GPUTextureView;
    colorTextureSampler: GPUSampler;

    positionTexture: GPUTexture;
    positionTextureView: GPUTextureView;
    positionTextureSampler: GPUSampler;

    pipeline: GPURenderPipeline;
    finalPassPipeline: GPURenderPipeline;

    finalPassVertexBuffer: GPUBuffer;
    finalPassIndexBuffer: GPUBuffer;

    finalPassVertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 12,
    attributes: [
        { // pos
            format: "float32x3",
            offset: 0,
            shaderLocation: 0
        }
    ]
};

    finalPassVertexData = new Float32Array([
        0, 1, 1,
        -1, -1, 1,
        1, -1, 1
    ]);

    finalPassIndexData = new Uint32Array([
        0, 1, 2
    ]);

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.finalPassVertexBuffer = renderer.device.createBuffer({
            label: "final pass screen vertices",
            size: this.finalPassVertexData.byteLength, 
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        renderer.device.queue.writeBuffer(this.finalPassVertexBuffer, 0, this.finalPassVertexData);

        this.finalPassIndexBuffer = renderer.device.createBuffer({
            label: "final pass screen vertex indices",
            size: this.finalPassIndexData.byteLength, 
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST | GPUBufferUsage.INDEX
        });
        renderer.device.queue.writeBuffer(this.finalPassIndexBuffer, 0, this.finalPassIndexData);

        this.colorTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "bgra8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.colorTextureView = this.colorTexture.createView();
        this.colorTextureSampler = renderer.device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter:"linear",
            mipmapFilter: "linear"
        });

        this.positionTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.positionTextureView = this.positionTexture.createView();
        this.positionTextureSampler = renderer.device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter:"linear",
            mipmapFilter: "linear"
        });

        this.nordepthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.nordepthTextureView = this.nordepthTexture.createView();
        this.norDepthTextureSampler = renderer.device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter:"linear",
            mipmapFilter: "linear"
        });

        this.gbufferMatBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "gbuffer material bind group layout",
            entries: [
                { // normal and depth
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // normal and depth sampler
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                { // color 
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // color sampler
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                { // position 
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                { // position sampler
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });

        this.gbufferMatBindGroup = renderer.device.createBindGroup({
            label: "material bind group",
            layout: this.gbufferMatBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.nordepthTextureView
                },
                {
                    binding: 1,
                    resource: this.norDepthTextureSampler
                },
                {
                    binding: 2,
                    resource: this.colorTextureView
                },
                {
                    binding: 3,
                    resource: this.colorTextureSampler
                },
                {
                    binding: 4,
                    resource: this.positionTextureView
                },
                {
                    binding: 5,
                    resource: this.positionTextureSampler
                }
            ]
        });

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // camera uniforms
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // cluster height
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // cluster width
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // num clusters in row
                    binding: 6,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0
                // you can access the camera using `this.camera`
                // if you run into TypeScript errors, you're probably trying to upload the host buffer instead
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
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.lights.heightUniformBuffer }
                },
                {
                    binding: 5,
                    resource: { buffer: this.lights.widthUniformBuffer }
                },
                {
                    binding: 6,
                    resource: { buffer: this.lights.clusterRowLengthUniformBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();

        this.finalPassPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "naive pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gbufferMatBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "deferred final pass vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                buffers: [ this.finalPassVertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward plus frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });

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
                    label: "forward plus frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                    {
                        format: "rgba16float",
                    },
                    {
                        format: "rgba16float",
                    }
                ]
            }
        });
    }

    doRenderingPrePass(encoder: GPUCommandEncoder) {
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        

        const renderPass = encoder.beginRenderPass({
            label: "deferred render pre pass",
            colorAttachments: [
                {
                    view: this.colorTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.nordepthTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.positionTextureView,
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

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
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

        renderer.device.queue.submit([encoder.finish()]);
    }

    doRendering(encoder: GPUCommandEncoder) {
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        

        const renderPass = encoder.beginRenderPass({
            label: "deferred render final pass",
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
        renderPass.setPipeline(this.finalPassPipeline);

        // TODO-1.2: bind `this.sceneUniformsBindGroup` to index `shaders.constants.bindGroup_scene`
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        renderPass.setBindGroup(1, this.gbufferMatBindGroup);
        // this.scene.iterate(node => {
        //     renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        // }, material => {
        //     renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        // }, primitive => {
        //     renderPass.setVertexBuffer(0, primitive.vertexBuffer);
        //     renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
        //     renderPass.drawIndexed(primitive.numIndices);
        // });
        renderPass.setVertexBuffer(0, this.finalPassVertexBuffer);
        renderPass.draw(3);

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();

        const prepassEncoder = renderer.device.createCommandEncoder();

        const newencoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(newencoder);

        this.doRenderingPrePass(prepassEncoder);

        this.doRendering(encoder);

    }
}
