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

    private checkingOverflow = false;
    private overflowReported = false;
    private nextOverflowCheck = 0;

    numLights = 500;
    static readonly maxNumLights = shaders.constants.maxNumLights;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    clusterGridBuffer: GPUBuffer;
    lightIndexBuffer: GPUBuffer;
    lightIndexCounterBuffer: GPUBuffer;

    clusteringComputeBindGroupLayout: GPUBindGroupLayout;
    clusteringComputeBindGroup: GPUBindGroup;

    clusteringComputePipeline: GPUComputePipeline;

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
        const clusterCount =
            shaders.constants.clusterCountX *
            shaders.constants.clusterCountY *
            shaders.constants.clusterCountZ;

        const clusterGridBytes = clusterCount * 8;

        const lightIndexCapacity = shaders.constants.lightIndexCapacity;
        const lightIndexBytes = lightIndexCapacity * 4;

        this.clusterGridBuffer = device.createBuffer({
            label: "cluster grid",
            size: clusterGridBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        this.lightIndexBuffer = device.createBuffer({
            label: "global light index list",
            size: lightIndexBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        this.lightIndexCounterBuffer = device.createBuffer({
            label: "global light index counter",
            size: 8,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });

        this.clusteringComputeBindGroupLayout =
            device.createBindGroupLayout({
                label: "clustering compute bind group layout",
                entries: [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "uniform" },
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "read-only-storage" },
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "storage" },
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "storage" },
                    },
                    {
                        binding: 4,
                        visibility: GPUShaderStage.COMPUTE,
                        buffer: { type: "storage" },
                    },
                ],
            });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "clustering compute bind group",
            layout: this.clusteringComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lightSetStorageBuffer },
                },
                {
                    binding: 2,
                    resource: { buffer: this.clusterGridBuffer },
                },
                {
                    binding: 3,
                    resource: { buffer: this.lightIndexBuffer },
                },
                {
                    binding: 4,
                    resource: { buffer: this.lightIndexCounterBuffer },
                },
            ],
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "clustering compute pipeline layout",
                bindGroupLayouts: [this.clusteringComputeBindGroupLayout],
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
                    code: shaders.clusteringComputeSrc,
                }),
                entryPoint: "main",
            },
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
            encoder.clearBuffer(this.lightIndexCounterBuffer, 0, 4);

            const computePass = encoder.beginComputePass({label: "light clustering pass",});
            computePass.setPipeline(this.clusteringComputePipeline);
            computePass.setBindGroup(0, this.clusteringComputeBindGroup);
            computePass.dispatchWorkgroups(
                shaders.constants.clusterCountX,
                shaders.constants.clusterCountY,
                shaders.constants.clusterCountZ
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

    async checkOverflow(): Promise<void> {
        if (
            this.checkingOverflow ||
            this.overflowReported ||
            performance.now() < this.nextOverflowCheck
        ) {
            return;
        }

        this.checkingOverflow = true;
        this.nextOverflowCheck = performance.now() + 1000;

        const readback = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        try {
            const encoder = device.createCommandEncoder();

            encoder.copyBufferToBuffer(
                this.lightIndexCounterBuffer,
                4,
                readback,
                0,
                4
            );

            device.queue.submit([encoder.finish()]);

            await readback.mapAsync(GPUMapMode.READ);

            const overflow = new Uint32Array(readback.getMappedRange())[0];

            if (overflow !== 0) {
                this.overflowReported = true;
                console.error("Light index buffer capacity exceeded.");
            }
        } catch (error) {
            console.error("Failed to check light index buffer.", error);
        } finally {
            readback.destroy();
            this.checkingOverflow = false;
        }
    }
}
