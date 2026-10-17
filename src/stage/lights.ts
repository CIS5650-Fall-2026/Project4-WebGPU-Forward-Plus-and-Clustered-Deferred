import { vec3 } from "wgpu-matrix";
import { canvas, device } from "../renderer";

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
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    clusterDataBuffer: GPUBuffer;
    readonly allActiveClusterMaskBuffer: GPUBuffer;
    readonly forwardPlusClusterMaskBuffer: GPUBuffer;
    private clusteringBindGroup: GPUBindGroup;
    private clusteringPipeline: GPUComputePipeline;
    private forwardPlusClusteringBindGroup: GPUBindGroup;
    private clusterCount: number;

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

        const tileSize = shaders.constants.clusterTileSize;
        const gridX = Math.ceil(canvas.width / tileSize);
        const gridY = Math.ceil(canvas.height / tileSize);
        this.clusterCount = gridX * gridY * shaders.constants.clusterDepthSlices;
        const clusterStride = shaders.constants.maxLightsPerCluster + 1;
        this.clusterDataBuffer = device.createBuffer({
            label: "cluster light lists",
            size: this.clusterCount * clusterStride * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE
        });
        const maskBufferSize = this.clusterCount * Uint32Array.BYTES_PER_ELEMENT;
        this.allActiveClusterMaskBuffer = device.createBuffer({
            label: "all-active cluster mask",
            size: maskBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.forwardPlusClusterMaskBuffer = device.createBuffer({
            label: "depth-culled Forward+ cluster mask",
            size: maskBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        const allActiveMask = new Uint32Array(this.clusterCount);
        allActiveMask.fill(1);
        device.queue.writeBuffer(this.allActiveClusterMaskBuffer, 0, allActiveMask);

        const clusteringBindGroupLayout = device.createBindGroupLayout({
            label: "light clustering bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        const createClusteringBindGroup = (clusterMaskBuffer: GPUBuffer) => device.createBindGroup({
            label: "light clustering bind group",
            layout: clusteringBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.lightSetStorageBuffer } },
                { binding: 1, resource: { buffer: this.camera.uniformsBuffer } },
                { binding: 2, resource: { buffer: this.clusterDataBuffer } },
                { binding: 3, resource: { buffer: clusterMaskBuffer } }
            ]
        });
        this.clusteringBindGroup = createClusteringBindGroup(this.allActiveClusterMaskBuffer);
        this.forwardPlusClusteringBindGroup = createClusteringBindGroup(this.forwardPlusClusterMaskBuffer);

        this.clusteringPipeline = device.createComputePipeline({
            label: "light clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "light clustering compute pipeline layout",
                bindGroupLayouts: [clusteringBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "light clustering compute shader",
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

    doLightClustering(encoder: GPUCommandEncoder, useForwardPlusMask = false) {
        const computePass = encoder.beginComputePass({ label: "light clustering pass" });
        computePass.setPipeline(this.clusteringPipeline);
        computePass.setBindGroup(
            0,
            useForwardPlusMask ? this.forwardPlusClusteringBindGroup : this.clusteringBindGroup
        );
        computePass.dispatchWorkgroups(
            Math.ceil(this.clusterCount / shaders.constants.clusteringWorkgroupSize)
        );
        computePass.end();
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
