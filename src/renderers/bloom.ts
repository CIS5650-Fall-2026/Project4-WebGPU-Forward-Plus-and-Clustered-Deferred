import * as shaders from '../shaders/shaders';
import { GpuTimer } from '../gpu_timer';

export class Bloom {
    readonly sceneTexture: GPUTexture;
    readonly sceneView: GPUTextureView;
    private brightTexture: GPUTexture;
    private blurTexture: GPUTexture;
    private brightView: GPUTextureView;
    private sampler: GPUSampler;
    private halfWidth: number;
    private halfHeight: number;
    private extractPipeline: GPUComputePipeline;
    private horizontalPipeline: GPUComputePipeline;
    private verticalPipeline: GPUComputePipeline;
    private compositePipeline: GPUComputePipeline;
    private extractGroup: GPUBindGroup;
    private horizontalGroup: GPUBindGroup;
    private verticalGroup: GPUBindGroup;

    constructor(
        private device: GPUDevice,
        private width: number,
        private height: number,
        outputFormat: GPUTextureFormat
    ) {
        this.halfWidth = Math.ceil(width / 2);
        this.halfHeight = Math.ceil(height / 2);
        this.sceneTexture = this.createTexture('bloom HDR scene', width, height);
        this.brightTexture = this.createTexture('bloom highlights', this.halfWidth, this.halfHeight);
        this.blurTexture = this.createTexture('bloom blur temporary', this.halfWidth, this.halfHeight);
        this.sceneView = this.sceneTexture.createView();
        this.brightView = this.brightTexture.createView();
        const blurView = this.blurTexture.createView();
        this.sampler = device.createSampler({
            label: 'bloom upsample sampler',
            minFilter: 'linear', magFilter: 'linear',
            addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge'
        });

        this.extractPipeline = this.createPipeline('bloom extract', shaders.bloomExtractSrc);
        this.horizontalPipeline = this.createPipeline('bloom horizontal blur', shaders.bloomBlurSrc, { axis: 0 });
        this.verticalPipeline = this.createPipeline('bloom vertical blur', shaders.bloomBlurSrc, { axis: 1 });
        this.compositePipeline = this.createPipeline('bloom composite', shaders.bloomCompositeSrc(outputFormat));
        this.extractGroup = this.createGroup(this.extractPipeline, this.sceneView, this.brightView);
        this.horizontalGroup = this.createGroup(this.horizontalPipeline, this.brightView, blurView);
        this.verticalGroup = this.createGroup(this.verticalPipeline, blurView, this.brightView);
    }

    private createTexture(label: string, width: number, height: number): GPUTexture {
        return this.device.createTexture({
            label, size: [width, height], format: 'rgba16float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
    }

    private createPipeline(
        label: string, code: string, constants: Record<string, number> = {}
    ): GPUComputePipeline {
        return this.device.createComputePipeline({
            label, layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ label, code }),
                entryPoint: 'main', constants
            }
        });
    }

    private createGroup(
        pipeline: GPUComputePipeline, input: GPUTextureView, output: GPUTextureView
    ): GPUBindGroup {
        return this.device.createBindGroup({
            label: pipeline.label + ' textures',
            layout: pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: input }, { binding: 1, resource: output }]
        });
    }

    draw(encoder: GPUCommandEncoder, output: GPUTextureView, timer: GpuTimer) {
        const compositeGroup = this.device.createBindGroup({
            label: 'bloom composite textures',
            layout: this.compositePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sceneView },
                { binding: 1, resource: this.brightView },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: output }
            ]
        });
        const passes = [
            { pipeline: this.extractPipeline, group: this.extractGroup },
            { pipeline: this.horizontalPipeline, group: this.horizontalGroup },
            { pipeline: this.verticalPipeline, group: this.verticalGroup },
            { pipeline: this.compositePipeline, group: compositeGroup }
        ];
        passes.forEach(({ pipeline, group }, index) => {
            const pass = encoder.beginComputePass({
                label: pipeline.label, timestampWrites: timer.timestamps(index + 3)
            });
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, group);
            const width = index === 3 ? this.width : this.halfWidth;
            const height = index === 3 ? this.height : this.halfHeight;
            pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
            pass.end();
        });
    }

    destroy() {
        this.sceneTexture.destroy();
        this.brightTexture.destroy();
        this.blurTexture.destroy();
    }
}
