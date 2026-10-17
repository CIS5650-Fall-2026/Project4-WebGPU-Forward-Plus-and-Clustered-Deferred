export const gpuTiming = { ms: '--', samples: 0 };

export class GpuTimer {
    private querySet?: GPUQuerySet;
    private resolveBuffer?: GPUBuffer;
    private readBuffer?: GPUBuffer;
    private sums: number[];
    private count = 0;
    private warmup = 30;
    private pending = false;
    private recording = false;
    private stopped = false;
    private generation = 0;
    private settings = '';

    constructor(
        private device: GPUDevice,
        private mode: string,
        private passNames: string[]
    ) {
        this.sums = passNames.map(() => 0);
        if (device.features.has('timestamp-query')) {
            this.querySet = device.createQuerySet({
                type: 'timestamp', count: passNames.length * 2
            });
            this.resolveBuffer = device.createBuffer({
                size: passNames.length * 16,
                usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
            });
            this.readBuffer = device.createBuffer({
                size: passNames.length * 16,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
            });
        }
        this.reset();
    }

    reset() {
        this.generation++;
        this.count = 0;
        this.warmup = 30;
        this.sums.fill(0);
        gpuTiming.ms = this.querySet ? 'Warming up' : 'Unsupported';
        gpuTiming.samples = 0;
    }

    beginFrame(settings: string) {
        if (settings !== this.settings) {
            this.settings = settings;
            this.reset();
        }
        this.recording = false;
        if (!this.querySet || this.stopped || this.count >= 120) return;
        if (this.warmup > 0) {
            this.warmup--;
            return;
        }
        this.recording = !this.pending;
    }

    timestamps(pass: number): GPURenderPassTimestampWrites | undefined {
        if (!this.recording || !this.querySet) return undefined;
        return {
            querySet: this.querySet,
            beginningOfPassWriteIndex: pass * 2,
            endOfPassWriteIndex: pass * 2 + 1
        };
    }

    submit(encoder: GPUCommandEncoder) {
        if (this.recording) {
            encoder.resolveQuerySet(
                this.querySet!, 0, this.passNames.length * 2,
                this.resolveBuffer!, 0
            );
            encoder.copyBufferToBuffer(
                this.resolveBuffer!, 0, this.readBuffer!, 0,
                this.passNames.length * 16
            );
        }
        this.device.queue.submit([encoder.finish()]);
        if (this.recording) void this.read(this.generation);
    }

    private async read(generation: number) {
        const buffer = this.readBuffer!;
        this.pending = true;
        try {
            await buffer.mapAsync(GPUMapMode.READ);
            if (this.stopped || generation !== this.generation) return;
            const times = new BigUint64Array(buffer.getMappedRange());
            const milliseconds = this.passNames.map((_, i) =>
                Number(times[i * 2 + 1] - times[i * 2]) / 1_000_000
            );
            if (milliseconds.some(ms => !Number.isFinite(ms) || ms < 0)) return;

            milliseconds.forEach((ms, i) => this.sums[i] += ms);
            this.count++;
            gpuTiming.samples = this.count;
            gpuTiming.ms = (
                this.sums.reduce((a, b) => a + b, 0) / this.count
            ).toFixed(3);

            if (this.count === 120) {
                if (this.sums.every(ms => ms === 0)) {
                    gpuTiming.ms = 'No valid timing';
                    console.warn('All GPU times are zero. Check WebGPU errors before using this result.');
                    return;
                }
                const result: Record<string, string | number> = {
                    mode: this.mode,
                    ...JSON.parse(this.settings),
                    samples: this.count
                };
                this.passNames.forEach((name, i) => {
                    result[name + ' ms'] = this.sums[i] / this.count;
                });
                result['GPU pass sum ms'] =
                    this.sums.reduce((a, b) => a + b, 0) / this.count;
                console.table([result]);
            }
        } catch (error) {
            if (!this.stopped && generation === this.generation) {
                gpuTiming.ms = 'Read failed';
                console.error('GPU timing:', error);
            }
        } finally {
            if (buffer.mapState === 'mapped') buffer.unmap();
            this.pending = false;
        }
    }

    destroy() {
        this.stopped = true;
        this.querySet?.destroy();
        this.resolveBuffer?.destroy();
        this.readBuffer?.destroy();
    }
}
