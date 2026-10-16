import { device } from './renderer';

export const gpuTimer = {
    enabled: false, // Flag to early out of methods if we don't have timestamp queries available
    frameTimes: [] as number[],
    querySet: null as GPUQuerySet | null,
    resolveBuffer: null as GPUBuffer | null,
    readBuffer: null as GPUBuffer | null,

    init() {
        this.enabled = device.features.has('timestamp-query');
        if (!this.enabled) {
            return;
        }

        this.querySet = device.createQuerySet({
            type: 'timestamp',
            count: 2
        });

        this.resolveBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
        });

        this.readBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    },

    begin() {
        if (!this.enabled) {
            return undefined; // This won't write anything to the timestamp writes
        }

        return {
            querySet: this.querySet!,
            beginningOfPassWriteIndex: 0
        };
    },
    end() {
        if (!this.enabled) {
            return undefined;
        }

        return {
            querySet: this.querySet!,
            endOfPassWriteIndex: 1
        };
    },
    both() {
        if (!this.enabled) {
            return undefined;
        }

        return {
            querySet: this.querySet!,
            beginningOfPassWriteIndex: 0,
            endOfPassWriteIndex: 1
        };
    },
    resolve(encoder: GPUCommandEncoder) {
        if (!this.enabled) {
            return;
        }

        encoder.resolveQuerySet(
            this.querySet!,
            0,
            2,
            this.resolveBuffer!,
            0
        );
        // If the read buffer is currently being read, skip
        if (this.readBuffer!.mapState === 'unmapped') {
            encoder.copyBufferToBuffer(
                this.resolveBuffer!,
                0,
                this.readBuffer!,
                0,
                16
            );
        }
    },
    async read() {
        // If we are currently reading or don't have the timestamp query feature available, skip the read
        if (!this.enabled || this.readBuffer!.mapState !== 'unmapped') {
            return;
        }

        await this.readBuffer!.mapAsync(GPUMapMode.READ);
        const times = new BigUint64Array(this.readBuffer!.getMappedRange());
        const ms = Number(times[1] - times[0]) / 1e6;   // Convert to ms
        this.readBuffer!.unmap();
        if (ms > 0) {
            this.frameTimes.push(ms);
        }
    },
    reset() {
        this.frameTimes = [];
    }
};
