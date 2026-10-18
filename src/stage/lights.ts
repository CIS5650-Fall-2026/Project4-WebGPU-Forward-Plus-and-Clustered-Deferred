import { vec3 } from "wgpu-matrix";
import { device, canvas } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class Lights {
    private camera: Camera;

    numLights = 500;
    static readonly maxNumLights = 5000;
    // colors are different for 8 and it still works?
    static readonly numFloatsPerLight = 11; // 2 vec3f aligned at 16 byte boundaries + vec2f + float

    
    static readonly clusterCubeZNum = 1; // how many clusters in depth direction stacked in each cell
    static readonly maxNumLightsPerCluster = 1001;
    static readonly numFloatsPerCluster = 10 + Lights.maxNumLightsPerCluster; 
    static readonly maxNumClusters = ((shaders.constants.numClustersInRow+2)*(shaders.constants.numClustersInRow+2))*Lights.clusterCubeZNum;

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    clustersArray = new Float32Array(Lights.numFloatsPerCluster * Lights.maxNumClusters );
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    clusterSetStorageBuffer: GPUBuffer;
    clusterRowLengthUniformBuffer: GPUBuffer;
    widthUniformBuffer: GPUBuffer;
    heightUniformBuffer: GPUBuffer;
    screenWidthUniformBuffer: GPUBuffer;
    screenHeightUniformBuffer: GPUBuffer;
    nearPlaneUniformBuffer: GPUBuffer;
    farPlaneUniformBuffer: GPUBuffer;
    lightRadiusBuffer: GPUBuffer;
    clusterRadiusBuffer: GPUBuffer;

    createClustersComputeBindGroupLayout: GPUBindGroupLayout;
    createClustersComputeBindGroup: GPUBindGroup;
    createClustersComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numClusters + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.clusterSetStorageBuffer = device.createBuffer({
            label: "clusters",
            size: 16 + this.clustersArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, new Uint32Array([this.numLights]));

        this.widthUniformBuffer = device.createBuffer({
            label: "width uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.heightUniformBuffer = device.createBuffer({
            label: "height uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.screenWidthUniformBuffer = device.createBuffer({
            label: "screen width uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.screenHeightUniformBuffer = device.createBuffer({
            label: "screen height uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.clusterRowLengthUniformBuffer = device.createBuffer({
            label: "cluster row length uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.nearPlaneUniformBuffer = device.createBuffer({
            label: "near plane uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.farPlaneUniformBuffer = device.createBuffer({
            label: "far plane uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.lightRadiusBuffer = device.createBuffer({
            label: "light radius uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.clusterRadiusBuffer = device.createBuffer({
            label: "far plane uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.moveLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "move lights compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // time
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // camera uniforms
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // screen height
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // screen width
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // light radius
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.moveLightsComputeBindGroup = device.createBindGroup({
            label: "move lights compute bind group",
            layout: this.moveLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.timeUniformBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.screenHeightUniformBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.screenWidthUniformBuffer }
                },
                {
                    binding: 5,
                    resource: { buffer: this.lightRadiusBuffer }
                }
            ]
        });

        this.moveLightsComputePipeline = device.createComputePipeline({
            label: "move lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "move lights compute pipeline layout",
                bindGroupLayouts: [ this.moveLightsComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for light clustering here
        this.createClustersComputeBindGroupLayout = device.createBindGroupLayout({
            label: "create clusters compute bind group layout",
            entries: [
                { // cluster set
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // width
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // height
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // num clusters in a row
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // near plane
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // far plane
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // camera uniforms
                    binding: 6,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 7,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // cluster radius
                    binding: 8,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.createClustersComputeBindGroup = device.createBindGroup({
            label: "create clusters compute bind group",
            layout: this.createClustersComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.clusterSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.widthUniformBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.heightUniformBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.clusterRowLengthUniformBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.nearPlaneUniformBuffer }
                },
                {
                    binding: 5,
                    resource: { buffer: this.farPlaneUniformBuffer }
                },
                {
                    binding: 6,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 7,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 8,
                    resource: { buffer: this.clusterRadiusBuffer}
                }
            ]
        });

        this.createClustersComputePipeline = device.createComputePipeline({
            label: "create clusters compute pipeline",
            layout: device.createPipelineLayout({
                label: "create clusters compute pipeline layout",
                bindGroupLayouts: [ this.createClustersComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "create clusters compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "main"
            }
        });
    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        let clusterWidth = Math.floor(canvas.width/shaders.constants.numClustersInRow);
        let clusterHeight = Math.floor(canvas.height/shaders.constants.numClustersInRow);
        device.queue.writeBuffer(this.widthUniformBuffer, 0, new Float32Array([clusterWidth]));
        device.queue.writeBuffer(this.heightUniformBuffer, 0, new Float32Array([clusterHeight]));
        device.queue.writeBuffer(this.screenWidthUniformBuffer, 0, new Float32Array([canvas.width]));
        device.queue.writeBuffer(this.screenHeightUniformBuffer, 0, new Float32Array([canvas.height]));
        device.queue.writeBuffer(this.clusterRowLengthUniformBuffer, 0, new Float32Array([shaders.constants.numClustersInRow]));
        device.queue.writeBuffer(this.nearPlaneUniformBuffer, 0, new Float32Array([Camera.nearPlane]));
        device.queue.writeBuffer(this.farPlaneUniformBuffer, 0, new Float32Array([Camera.farPlane]));
        device.queue.writeBuffer(this.lightRadiusBuffer, 0, new Float32Array([shaders.constants.lightRadius]));
        device.queue.writeBuffer(this.clusterRadiusBuffer, 0, new Float32Array([Math.sqrt(clusterWidth*clusterWidth + clusterHeight*clusterHeight)/2]));
        
        
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.createClustersComputePipeline);

        computePass.setBindGroup(0, this.createClustersComputeBindGroup);

        const workgroupCount = Math.ceil(Lights.maxNumClusters / shaders.constants.createClustersWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        device.queue.submit([encoder.finish()]);
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);

        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        device.queue.submit([encoder.finish()]);
    }
}
