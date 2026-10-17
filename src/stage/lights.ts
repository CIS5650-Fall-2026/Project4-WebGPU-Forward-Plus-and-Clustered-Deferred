import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

// class ClusterUniforms {
//     readonly buffer = new ArrayBuffer(4 * 4);
//     private readonly floatView = new Float32Array(this.buffer);

//     set clusterDim(val: Uint32Array) {
//         for(let i = 0; i < 3; i++) {
//             this.floatView[i] = val[i];
//         }
//     }
// };

// class Clusters {
//     uniforms: ClusterUniforms = new ClusterUniforms();
//     uniformsBuffer: GPUBuffer;
//     static readonly clusterDim = new Uint32Array([20,20,10]);

//     constructor() {
//         this.uniforms.clusterDim = Clusters.clusterDim;

//         this.uniformsBuffer = device.createBuffer({
//             label: "cluster uniform buffer",
//             size: this.uniforms.buffer.byteLength,
//             usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
//         });
//     }

//     updateClusterUniforms() {

//     }
// };

export class Lights {
    // private clusters: Clusters = new Clusters();
    static readonly clusterDim = new Uint32Array([20,20,10]);
    maxLightsPerCluster = 400;

    private camera: Camera;

    numLights = 500;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries
    static readonly numFloatsPerCluster = 8;
    static readonly clusterCount = Lights.clusterDim[0]*Lights.clusterDim[1]*Lights.clusterDim[2];

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;
    clusterSetStorageBuffer: GPUBuffer;
    clusterLightIDsStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    clusterComputeBindGroupLayout: GPUBindGroupLayout;
    clusterComputeBindGroup: GPUBindGroup;
    clusterComputePipeline: GPUComputePipeline;

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
            size: 16 + (Lights.clusterCount * Lights.numFloatsPerCluster * 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.updateClusterSetUniforms();

        this.clusterLightIDsStorageBuffer = device.createBuffer({
            label: "cluster light IDs",
            size: 16 + (this.maxLightsPerCluster * Lights.clusterCount * 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.resetClusterLightIDs();

        this.clusterComputeBindGroupLayout = device.createBindGroupLayout({
            label: "cluster compute bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "read-only-storage"}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "storage"}   
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "uniform"}
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {type: "storage"}   
                }
            ]
        });

        this.clusterComputeBindGroup = device.createBindGroup({
            label: "cluster compute bind group",
            layout: this.clusterComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: {buffer: this.clusterSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: {buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 3,
                    resource: {buffer: this.clusterLightIDsStorageBuffer}
                }
            ]
        });
      
        this.clusterComputePipeline = device.createComputePipeline({
            label: "cluster lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "cluster lights compute pipeline layout",
                bindGroupLayouts: [this.clusterComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "cluster lights compute shader",
                    code: shaders.clusteringComputeSrc,
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

    updateClusterSetUniforms() {
        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, Lights.clusterDim);
    }

    updateMaxLightsPerCluster() {
        this.clusterLightIDsStorageBuffer = device.createBuffer({
            label: "cluster light IDs",
            size: 16 + (this.maxLightsPerCluster * Lights.clusterCount * 4),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.resetClusterLightIDs();
    }

    resetClusterLightIDs() {
        device.queue.writeBuffer(this.clusterLightIDsStorageBuffer, 0, new Uint32Array([0]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        this.resetClusterLightIDs();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusterComputePipeline);
        computePass.setBindGroup(0, this.clusterComputeBindGroup);

        const workGroupCount = Math.ceil(Lights.clusterCount / shaders.constants.clusterWorkGroupSize);
        computePass.dispatchWorkgroups(workGroupCount);

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
