// Performance timing used for the README analysis.
//
// FrameTimer: wall-clock time between frames (requestAnimationFrame deltas). Launch Chrome
//             with --disable-gpu-vsync --disable-frame-rate-limit for meaningful timings.
//
// GpuTimer:   GPU time of each named pass, from timestamp queries. Be sure to deactivate vsync and launch
//             chrome with --enable-webgpu-developer-features to get accurate timings.
//
// Open the page with ?timing to log both to the console every TIMING_LOG_INTERVAL_MS.

export interface Stats {
    mean: number;
    median: number;
    p95: number;
    count: number;
}

export function computeStats(samples: number[]): Stats {
    if (samples.length === 0) {
        return { mean: NaN, median: NaN, p95: NaN, count: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return {
        mean: samples.reduce((a, b) => a + b, 0) / samples.length,
        median: at(0.5),
        p95: at(0.95),
        count: samples.length
    };
}

export class FrameTimer {
    private samples: number[] = [];

    addFrame(deltaMs: number) {
        if (deltaMs > 0) {
            this.samples.push(deltaMs);
        }
    }

    reset() {
        this.samples = [];
    }

    stats(): Stats {
        return computeStats(this.samples);
    }
}

export class GpuTimer {
    private static readonly maxPasses = 8;
    private static readonly maxReadBuffers = 64;

    private device: GPUDevice;
    private querySet: GPUQuerySet;
    private resolveBuffer: GPUBuffer;
    private freeReadBuffers: GPUBuffer[] = [];

    private frameNames: string[] = [];
    private pendingCopy: { buffer: GPUBuffer, names: string[] } | undefined;

    private samples = new Map<string, number[]>();

    constructor(device: GPUDevice) {
        this.device = device;
        this.querySet = device.createQuerySet({
            label: "gpu timer queries",
            type: "timestamp",
            count: GpuTimer.maxPasses * 2
        });
        this.resolveBuffer = device.createBuffer({
            label: "gpu timer resolve",
            size: GpuTimer.maxPasses * 2 * 8,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
        });
    }

    // Pass the result as `timestampWrites` in a render or compute pass descriptor.
    passWrites(name: string): GPURenderPassTimestampWrites & GPUComputePassTimestampWrites | undefined {
        const passIdx = this.frameNames.length;
        if (passIdx >= GpuTimer.maxPasses) {
            return undefined;
        }
        this.frameNames.push(name);
        return {
            querySet: this.querySet,
            beginningOfPassWriteIndex: passIdx * 2,
            endOfPassWriteIndex: passIdx * 2 + 1
        };
    }

    // Call once per frame after the last timed pass ends (but before encoder.finish())
    resolve(encoder: GPUCommandEncoder) {
        const names = this.frameNames;
        this.frameNames = [];
        if (names.length === 0) {
            return;
        }

        // skip this frame's readback if every staging buffer is still waiting to be mapped
        // (mapAsync round trips take many frames, so keep a decent pool in flight)
        const buffer = this.freeReadBuffers.pop() ?? (this.liveReadBuffers < GpuTimer.maxReadBuffers ? this.createReadBuffer() : undefined);
        if (!buffer) {
            return;
        }

        encoder.resolveQuerySet(this.querySet, 0, names.length * 2, this.resolveBuffer, 0);
        encoder.copyBufferToBuffer(this.resolveBuffer, 0, buffer, 0, names.length * 2 * 8);
        this.pendingCopy = { buffer, names };
    }

    // Call once per frame after queue.submit().
    afterSubmit() {
        const pending = this.pendingCopy;
        this.pendingCopy = undefined;
        if (!pending) {
            return;
        }

        pending.buffer.mapAsync(GPUMapMode.READ).then(() => {
            const times = new BigUint64Array(pending.buffer.getMappedRange());
            pending.names.forEach((name, i) => {
                const begin = times[i * 2];
                const end = times[i * 2 + 1];
                if (end >= begin) {
                    const list = this.samples.get(name) ?? [];
                    list.push(Number(end - begin) / 1e6);
                    this.samples.set(name, list);
                }
            });
            pending.buffer.unmap();
            this.freeReadBuffers.push(pending.buffer);
        }).catch(() => { /* device lost or buffer destroyed, so we drop the sample */ });
    }

    reset() {
        this.samples.clear();
    }

    stats(): Record<string, Stats> {
        const result: Record<string, Stats> = {};
        for (const [name, list] of this.samples) {
            result[name] = computeStats(list);
        }
        return result;
    }

    private liveReadBuffers = 0;

    private createReadBuffer(): GPUBuffer {
        this.liveReadBuffers++;
        return this.device.createBuffer({
            label: "gpu timer readback",
            size: GpuTimer.maxPasses * 2 * 8,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
    }
}

export const TIMING_LOG_INTERVAL_MS = 2000;
