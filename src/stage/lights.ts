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

    clusterLightListsStorageBuffer: GPUBuffer;
    pixelClustersStorageBuffer: GPUBuffer;
    private occupiedClustersBuffer: GPUBuffer;
    private activeClustersBuffer: GPUBuffer;
    private clusterDispatchBuffer: GPUBuffer;
    private clusterAssignmentPipeline: GPUComputePipeline;
    private clusterCompactionPipeline: GPUComputePipeline;
    private clusterCompactionBindGroup: GPUBindGroup;
    private depthBindGroups = new WeakMap<GPUTextureView, GPUBindGroup>();
    clusteringComputeBindGroup: GPUBindGroup;
    clusteringComputePipeline: GPUComputePipeline;

    readonly clusterCount: number;

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

        this.clusterCount =
            shaders.constants.clusterCountX *
            shaders.constants.clusterCountY *
            shaders.constants.clusterCountZ;

        const bytesPerCluster = 16 + 4 * shaders.constants.maxLightsPerCluster;
        this.clusterLightListsStorageBuffer = device.createBuffer({
            label: "per-cluster light lists",
            size: this.clusterCount * bytesPerCluster,
            usage: GPUBufferUsage.STORAGE
        });

        this.pixelClustersStorageBuffer = device.createBuffer({
            label: "depth-derived cluster ID per pixel",
            size: canvas.width * canvas.height * 4,
            usage: GPUBufferUsage.STORAGE,
        });
        this.occupiedClustersBuffer = device.createBuffer({
            label: "cluster occupancy flags",
            size: this.clusterCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.activeClustersBuffer = device.createBuffer({
            label: "non-empty cluster count and IDs",
            size: 4 + this.clusterCount * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.clusterDispatchBuffer = device.createBuffer({
            label: "non-empty cluster indirect dispatch",
            size: 12,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Uint32Array(this.clusterDispatchBuffer.getMappedRange()).set([0, 1, 1]);
        this.clusterDispatchBuffer.unmap();

        this.clusterAssignmentPipeline = device.createComputePipeline({
            label: "depth to pixel cluster assignment",
            layout: "auto",
            compute: {
                module: device.createShaderModule({ code: shaders.clusterAssignmentComputeSrc }),
                entryPoint: "main",
            },
        });
        this.clusterCompactionPipeline = device.createComputePipeline({
            label: "compact non-empty clusters",
            layout: "auto",
            compute: {
                module: device.createShaderModule({ code: shaders.clusterCompactionComputeSrc }),
                entryPoint: "main",
            },
        });
        this.clusterCompactionBindGroup = device.createBindGroup({
            layout: this.clusterCompactionPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.occupiedClustersBuffer } },
                { binding: 1, resource: { buffer: this.activeClustersBuffer } },
                { binding: 2, resource: { buffer: this.clusterDispatchBuffer } },
                { binding: 3, resource: { buffer: this.clusterLightListsStorageBuffer } },
            ],
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "light clustering compute pipeline",
            layout: "auto",
            compute: {
                module: device.createShaderModule({
                    label: "light clustering compute shader",
                    code: shaders.clusteringComputeSrc
                }),
                entryPoint: "main"
            }
        });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "light clustering compute bind group",
            layout: this.clusteringComputePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.clusterLightListsStorageBuffer }
                },
                { binding: 3, resource: { buffer: this.activeClustersBuffer } },
            ]
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

    doLightClustering(encoder: GPUCommandEncoder, depthView: GPUTextureView) {
        let assignmentBindGroup = this.depthBindGroups.get(depthView);
        if (!assignmentBindGroup) {
            assignmentBindGroup = device.createBindGroup({
                label: "depth-based cluster assignment bind group",
                layout: this.clusterAssignmentPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.camera.uniformsBuffer } },
                    { binding: 1, resource: depthView },
                    { binding: 2, resource: { buffer: this.occupiedClustersBuffer } },
                    { binding: 3, resource: { buffer: this.pixelClustersStorageBuffer } },
                ],
            });
            this.depthBindGroups.set(depthView, assignmentBindGroup);
        }

        // GPU-ordered resets ensure camera motion and renderer switches cannot
        // leave stale occupancy, counts, or indirect dispatch dimensions.
        encoder.clearBuffer(this.occupiedClustersBuffer);
        encoder.clearBuffer(this.activeClustersBuffer, 0, 4);
        encoder.clearBuffer(this.clusterDispatchBuffer, 0, 4);

        const assignmentPass = encoder.beginComputePass({ label: "1. assign depth pixels to clusters" });
        assignmentPass.setPipeline(this.clusterAssignmentPipeline);
        assignmentPass.setBindGroup(0, assignmentBindGroup);
        assignmentPass.dispatchWorkgroups(
            Math.ceil(canvas.width / shaders.constants.clusterAssignmentWorkgroupSize),
            Math.ceil(canvas.height / shaders.constants.clusterAssignmentWorkgroupSize),
        );
        assignmentPass.end();

        const compactionPass = encoder.beginComputePass({ label: "2. find unique non-empty clusters" });
        compactionPass.setPipeline(this.clusterCompactionPipeline);
        compactionPass.setBindGroup(0, this.clusterCompactionBindGroup);
        compactionPass.dispatchWorkgroups(Math.ceil(this.clusterCount / shaders.constants.clusterWorkgroupSize));
        compactionPass.end();

        const computePass = encoder.beginComputePass({ label: "3. cull lights for non-empty clusters" });
        computePass.setPipeline(this.clusteringComputePipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.clusteringComputeBindGroup);
        computePass.dispatchWorkgroupsIndirect(this.clusterDispatchBuffer, 0);
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
