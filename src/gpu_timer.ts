
import { device } from './renderer';

export class GPUTimer {
    readonly querySet: GPUQuerySet;
    readonly resolveBuffer: GPUBuffer;
    readonly readBuffer: GPUBuffer;



    // Only one GPU timing sample may be in progress at a time
    private pending = false;

    constructor() {
        // Two timestamps: beginning and end of the measured GPU work
        this.querySet = device.createQuerySet({
            type: 'timestamp',
            count: 2
        });



        // GPU buffer used to resolve timestamp query results
        this.resolveBuffer = device.createBuffer({
            label: 'GPU timestamp resolve buffer',
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
        });




        // CPU-readable buffer used to retrieve one completed sample
        this.readBuffer = device.createBuffer({
            label: 'GPU timestamp readback buffer',
            size: 16,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    }




    // Begin a new measurement only if the previous one has finished.

    beginSample(): boolean {
        if (this.pending) {
            return false;
        }

        this.pending = true;
        return true;
    }




    // Resolve and copy the timestamps for the selected frame
    // Call this only when beginSample() returned true
    resolve(encoder: GPUCommandEncoder): void {
        if (!this.pending) {
            return;
        }

        encoder.resolveQuerySet(this.querySet, 0, 2, this.resolveBuffer, 0);

        encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, 16);
    }



    // Read the selected GPU timing sample after command submission
    async readMilliseconds(): Promise<number | null> {
       
       
        if (!this.pending) {
            return null;
        }

        try {
            await this.readBuffer.mapAsync(GPUMapMode.READ);

            const timestamps = new BigUint64Array(
                this.readBuffer.getMappedRange()
            );

            const elapsedNanoseconds = timestamps[1] - timestamps[0];

            const elapsedMilliseconds = Number(elapsedNanoseconds) / 1_000_000;



            this.readBuffer.unmap();



            return elapsedMilliseconds;


        } finally {
            if (this.readBuffer.mapState === 'mapped') {
                this.readBuffer.unmap();
            }

            // The next sample can now be recorded
            this.pending = false;
        }
    }
}
