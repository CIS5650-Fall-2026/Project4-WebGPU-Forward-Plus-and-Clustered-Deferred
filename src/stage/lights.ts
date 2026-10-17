import { vec3 } from "wgpu-matrix";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// info from camera
import {canvas, device, fovYDegrees} from '../renderer'

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

function createClusterArray(screenW, screenH, tileSize, numSlices) {
    const numTilesX = Math.ceil(screenW / tileSize);
    const numTilesY = Math.ceil(screenH / tileSize);

    // how big is one light cluster? 
    // 2 vec3fs = 8 floats (read one cluster aabb as 2 vec3fs!!)
    const v = new Float32Array(numTilesX * numTilesY * numSlices * 8);
    v.fill(0);

    return {clusterArray: v, numTilesX, numTilesY};
}

function createLightClusterArray(numClusters, maxLightsPerCluster) {
    const lightClusterArray = new Uint32Array(numClusters * (maxLightsPerCluster + 1));
    lightClusterArray.fill(0);

    return lightClusterArray;
}

export class Lights {
    private camera: Camera;

    numLights = 500;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // for light clustering 
    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here

    static readonly tileSize = 64;
    static readonly numSlices = 32;
    static readonly maxLightsPerCluster = 256;

    numTilesX;
    numTilesY;

    aabbClusterBuffer: GPUBuffer;
    lightClusterBuffer: GPUBuffer;

    canvasDimsBuffer: GPUBuffer;
    clusterInfoBuffer: GPUBuffer;

    clusteringComputeBindGroupLayout: GPUBindGroupLayout;
    clusteringComputeBindGroup: GPUBindGroup;
    clusteringComputePipeline: GPUComputePipeline;

    lightingComputeBindGroupLayout: GPUBindGroupLayout;
    lightingComputeBindGroup: GPUBindGroup;
    lightingComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
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

        // for aabb calculation compute pass

        // create buffer on GPU for canvas resolution
        const canvasDimsSize = 2 * Uint32Array.BYTES_PER_ELEMENT;
        this.canvasDimsBuffer = device.createBuffer({
            label: "canvas dims buffer",
            size: canvasDimsSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        const canvasDims = new Uint32Array([canvas.width, canvas.height]);
        device.queue.writeBuffer(this.canvasDimsBuffer, 0, canvasDims);

        // first get cluster info 
        const clusterResult = createClusterArray(
            canvas.width,
            canvas.height,
            Lights.tileSize, 
            Lights.numSlices
        );
    
        const clusterInfoSize = 5 * 4; // 5 32-bit pieces of data
        const clusterInfo = new ArrayBuffer(clusterInfoSize);
        const counts = new Uint32Array(clusterInfo);
        const values = new Float32Array(clusterInfo);
        this.clusterInfoBuffer = device.createBuffer({
            label: "cluster info buffer",
            size: clusterInfoSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.numTilesX = clusterResult.numTilesX;
        this.numTilesY = clusterResult.numTilesY;
        counts[0] = this.numTilesX;
        counts[1] = this.numTilesY;
        counts[2] = Lights.numSlices;
        values[3] = Camera.nearPlane;
        values[4] = Camera.farPlane;
        device.queue.writeBuffer(this.clusterInfoBuffer, 0, clusterInfo);

        // camera uniforms already written to GPUBuffer 

        // create buffer on GPU for cluster aabbs
        const clusterArray = clusterResult.clusterArray;
        this.aabbClusterBuffer = device.createBuffer({
            label: "cluster aabbs buffer",
            size: clusterArray.byteLength,
            usage: GPUBufferUsage.STORAGE
        });

        this.clusteringComputeBindGroupLayout = device.createBindGroupLayout({
            label: "cluster aabbs compute shader bind group layout",
            entries: [
                { // camera uniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "uniform"}
                },
                { // screen dimensions
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "uniform"}
                },
                { // cluster info
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "uniform"}
                },
                { // cluster aabbs buffer
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "storage"}
                }
            ]
        });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "cluster aabbs compute shader bind group",
            layout: this.clusteringComputeBindGroupLayout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                },
                { // screen dimensions
                    binding: 1,
                    resource: {buffer: this.canvasDimsBuffer}
                },
                { // cluster info
                    binding: 2,
                    resource: {buffer: this.clusterInfoBuffer}
                },
                { // cluster aabbs buffer
                    binding: 3,
                    resource: {buffer: this.aabbClusterBuffer}
                }
            ]
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "cluster aabbs compute shader pipeline",
            layout: device.createPipelineLayout({
                label: "cluster aabbs compute shader pipeline layout",
                bindGroupLayouts: [this.clusteringComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "cluster aabbs compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "build_clusters"
            }
        });

        // for light assignment compute pass 

        const lightInfoSize = 4 * 4; // 4 32-bit pieces of data
        const lightInfoBuffer = device.createBuffer({
            label: "cluster info buffer",
            size: lightInfoSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        const lightInfo = new Uint32Array([this.numTilesX, this.numTilesY, Lights.numSlices, Lights.maxLightsPerCluster]);
        device.queue.writeBuffer(lightInfoBuffer, 0, lightInfo);

        const lightClusterArray = createLightClusterArray(
            this.numTilesX * this.numTilesY * Lights.numSlices,
            Lights.maxLightsPerCluster
        );
        this.lightClusterBuffer = device.createBuffer({
            label: "light cluster buffer",
            size: lightClusterArray.byteLength,
            usage: GPUBufferUsage.STORAGE
        });

        this.lightingComputeBindGroupLayout = device.createBindGroupLayout({
            label: "cluster lights assignment compute shader bind group layout",
            entries: [
                { // camera uniforms 
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "uniform"}
                },
                { // light info
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "uniform"}
                },
                { // lights
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "read-only-storage"}
                },
                { // cluster aabbs
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "read-only-storage"}
                },
                { // cluster lights buffer
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "storage"}
                }
            ]
        });

        this.lightingComputeBindGroup = device.createBindGroup({
            label: "cluster lights assignment compute shader bind group",
            layout: this.lightingComputeBindGroupLayout,
            entries: [
                { // camera uniforms
                    binding: 0,
                    resource: {buffer: this.camera.uniformsBuffer}
                },
                { // cluster info
                    binding: 1,
                    resource: {buffer: lightInfoBuffer}
                },
                { // lights
                    binding: 2,
                    resource: {buffer: this.lightSetStorageBuffer}
                },
                { // cluster aabbs
                    binding: 3,
                    resource: {buffer: this.aabbClusterBuffer}
                },
                { // light cluster buffer
                    binding: 4,
                    resource: {buffer: this.lightClusterBuffer}
                }
            ]
        });

        this.lightingComputePipeline = device.createComputePipeline({
            label: "cluster lights assignment compute shader pipeline",
            layout: device.createPipelineLayout({
                label: "cluster lights assignment compute shader pipeline layout",
                bindGroupLayouts: [this.lightingComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "cluster lights compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "assign_lights"
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

        const computeAABBPass = encoder.beginComputePass();
        computeAABBPass.setPipeline(this.clusteringComputePipeline);

        computeAABBPass.setBindGroup(0, this.clusteringComputeBindGroup);

        // per cluster
        computeAABBPass.dispatchWorkgroups(
            Math.ceil(this.numTilesX / 4), 
            Math.ceil(this.numTilesY / 4), 
            Math.ceil(Lights.numSlices / 4)
        );

        computeAABBPass.end();

        const computeLightsPass = encoder.beginComputePass();
        computeLightsPass.setPipeline(this.lightingComputePipeline);

        computeLightsPass.setBindGroup(0, this.lightingComputeBindGroup);

        computeLightsPass.dispatchWorkgroups(
            Math.ceil(this.numTilesX / 4), 
            Math.ceil(this.numTilesY / 4), 
            Math.ceil(Lights.numSlices / 4)
        );

        computeLightsPass.end();
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
