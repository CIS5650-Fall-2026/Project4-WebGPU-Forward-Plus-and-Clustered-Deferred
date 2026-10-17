export const cpuTiming = { ms: '--', samples: 0 };

export class CpuTimer {
    private sum = 0;
    private count = 0;
    private warmup = 30;
    private settings = '';

    constructor(private mode: string) {
        this.reset();
    }

    reset() {
        this.sum = 0;
        this.count = 0;
        this.warmup = 30;
        cpuTiming.ms = 'Warming up';
        cpuTiming.samples = 0;
    }

    beginFrame(settings: string) {
        if (settings !== this.settings) {
            this.settings = settings;
            this.reset();
        }
    }

    record(milliseconds: number) {
        if (this.count >= 120) return;
        if (this.warmup > 0) {
            this.warmup--;
            return;
        }
        this.sum += milliseconds;
        this.count++;
        cpuTiming.ms = (this.sum / this.count).toFixed(4);
        cpuTiming.samples = this.count;
        if (this.count === 120) {
            console.table([{
                mode: this.mode,
                ...JSON.parse(this.settings),
                samples: this.count,
                'CPU draw encoding ms': this.sum / this.count
            }]);
        }
    }
}
