import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

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

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    static readonly numClusters = shaders.constants.clusterX * shaders.constants.clusterY * shaders.constants.clusterZ;

    clusterSetStorageBuffer: GPUBuffer;
    clusterFlagsStorageBuffer: GPUBuffer; // set by the forward+ depth prepass
    activeClustersStorageBuffer: GPUBuffer;

    clusteringComputeBindGroupLayout: GPUBindGroupLayout;
    clusteringComputeBindGroup: GPUBindGroup;
    clusteringComputePipeline: GPUComputePipeline;
    activeClusteringComputePipeline: GPUComputePipeline;

    compactClustersComputeBindGroupLayout: GPUBindGroupLayout;
    compactClustersComputeBindGroup: GPUBindGroup;
    compactClustersComputePipeline: GPUComputePipeline;

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

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for light clustering here
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "clusters",
            size: Lights.numClusters * (1 + shaders.constants.maxLightsPerCluster) * 4, // numLights + light indices
            usage: GPUBufferUsage.STORAGE
        });

        this.clusterFlagsStorageBuffer = device.createBuffer({
            label: "cluster flags",
            size: Lights.numClusters * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.activeClustersStorageBuffer = device.createBuffer({
            label: "active clusters",
            size: 16 + Lights.numClusters * 4, // dispatch args + count, then cluster indices
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
        });

        this.clusteringComputeBindGroupLayout = device.createBindGroupLayout({
            label: "clustering compute bind group layout",
            entries: [
                { // camera
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // activeClusters
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "clustering compute bind group",
            layout: this.clusteringComputeBindGroupLayout,
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
                    resource: { buffer: this.clusterSetStorageBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.activeClustersStorageBuffer }
                }
            ]
        });

        const clusteringLayout = device.createPipelineLayout({
            label: "clustering compute pipeline layout",
            bindGroupLayouts: [ this.clusteringComputeBindGroupLayout ]
        });
        const clusteringModule = device.createShaderModule({
            label: "clustering compute shader",
            code: shaders.clusteringComputeSrc
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "clustering compute pipeline",
            layout: clusteringLayout,
            compute: { module: clusteringModule, entryPoint: "main" }
        });

        this.activeClusteringComputePipeline = device.createComputePipeline({
            label: "active clustering compute pipeline",
            layout: clusteringLayout,
            compute: { module: clusteringModule, entryPoint: "main", constants: { onlyActiveClusters: 1 } }
        });

        this.compactClustersComputeBindGroupLayout = device.createBindGroupLayout({
            label: "compact clusters compute bind group layout",
            entries: [
                { // clusterFlags
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // activeClusters
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.compactClustersComputeBindGroup = device.createBindGroup({
            label: "compact clusters compute bind group",
            layout: this.compactClustersComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.clusterFlagsStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.activeClustersStorageBuffer }
                }
            ]
        });

        this.compactClustersComputePipeline = device.createComputePipeline({
            label: "compact clusters compute pipeline",
            layout: device.createPipelineLayout({
                label: "compact clusters compute pipeline layout",
                bindGroupLayouts: [ this.compactClustersComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "compact clusters compute shader",
                    code: shaders.compactClustersComputeSrc
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

    // onlyActiveClusters: only the clusters marked in clusterFlagsStorageBuffer get lights
    doLightClustering(encoder: GPUCommandEncoder, onlyActiveClusters = false) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        const workgroupCount = Math.ceil(Lights.numClusters / shaders.constants.clusteringWorkgroupSize);
        if (onlyActiveClusters) {
            encoder.clearBuffer(this.activeClustersStorageBuffer, 0, 16);
        }

        const computePass = encoder.beginComputePass({ label: "clustering compute pass" });
        if (onlyActiveClusters) {
            computePass.setPipeline(this.compactClustersComputePipeline);
            computePass.setBindGroup(shaders.constants.bindGroup_scene, this.compactClustersComputeBindGroup);
            computePass.dispatchWorkgroups(workgroupCount);

            computePass.setPipeline(this.activeClusteringComputePipeline);
            computePass.setBindGroup(shaders.constants.bindGroup_scene, this.clusteringComputeBindGroup);
            computePass.dispatchWorkgroupsIndirect(this.activeClustersStorageBuffer, 0);
        } else {
            computePass.setPipeline(this.clusteringComputePipeline);
            computePass.setBindGroup(shaders.constants.bindGroup_scene, this.clusteringComputeBindGroup);
            computePass.dispatchWorkgroups(workgroupCount);
        }
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
