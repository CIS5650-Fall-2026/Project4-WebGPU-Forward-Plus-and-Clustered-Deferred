import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    forwardLayout: GPUBindGroupLayout;
    forwardBindingGroup: GPUBindGroup;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    forwardPlusPipeline: GPURenderPipeline;
    

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        this.forwardLayout = renderer.device.createBindGroupLayout({
            label: "forward plus layout",
            entries: [
                { // vertex and fragment can read
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lights
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // cells
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });


        this.forwardBindingGroup = renderer.device.createBindGroup({
            label: "forward plus group",
            layout: this.forwardLayout,
            entries: [
                {binding: 0, resource: {buffer:this.camera.uniformsBuffer}},
                {binding: 1, resource: {buffer: this.lights.lightSetStorageBuffer}},
                {binding: 2, resource: {buffer:this.lights.cellsBuffer}}
            ]
        });


        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });


        this.depthTextureView = this.depthTexture.createView();



        this.forwardPlusPipeline = renderer.device.createRenderPipeline({

            layout: renderer.device.createPipelineLayout({
                label: "forward pipeline layout",
                bindGroupLayouts: [this.forwardLayout, renderer.modelBindGroupLayout, renderer.materialBindGroupLayout]
            }),

            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },

            vertex: {
                module: renderer.device.createShaderModule({label: "forward plus vert shader", code: shaders.naiveVertSrc}),
                buffers: [ renderer.vertexBufferLayout ]
            },

            fragment: {
                module: renderer.device.createShaderModule({label: "forward plus frag shader", code: shaders.forwardPlusFragSrc}),
                targets: [{format: renderer.canvasFormat}]
            }
        });



    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting
        const encoder = renderer.device.createCommandEncoder();

        // fill the cells before drawing
        this.lights.doLightClustering(encoder);
        
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        
        const renderPass = encoder.beginRenderPass({
            label: "forward plus render pass",
            colorAttachments: [{view: canvasTextureView, clearValue: [0,0,0,0], loadOp:"clear", storeOp:"store"}],

            depthStencilAttachment: {view: this.depthTextureView, depthClearValue: 1.0, depthLoadOp:"clear",depthStoreOp:"store"}
        });


        renderPass.setPipeline(this.forwardPlusPipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.forwardBindingGroup);
        

        // each mesh part, then texture, then triangles
        this.scene.iterate(
        node => {renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup)}, 

        material => {renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup)}, 
        
        primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer)
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32')
            renderPass.drawIndexed(primitive.numIndices)
        });

        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
