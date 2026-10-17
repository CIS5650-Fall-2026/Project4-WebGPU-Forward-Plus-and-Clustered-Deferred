import { device } from '../renderer';
import { constants } from '../shaders/shaders';
import { Stage } from '../stage/stage';
import { ForwardPlusRenderer } from './forward_plus';

export class ClusterDebugRenderer extends ForwardPlusRenderer {
    constructor(stage: Stage) {
        super(stage, false, true);
    }

    async captureStats() {
        const buffer = this.lights.clusterSetStorageBuffer;
        const readback = device.createBuffer({
            label: 'cluster debug readback',
            size: buffer.size,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        const lightCount = this.lights.numLights;
        try {
            const encoder = device.createCommandEncoder();
            this.lights.doLightClustering(encoder);
            encoder.copyBufferToBuffer(buffer, 0, readback, 0, buffer.size);
            device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const data = new Uint32Array(readback.getMappedRange());
            const stride = 2 + constants.maxLightsPerCluster;
            let overflow = 0;
            let maxStored = 0;
            for (let i = 0; i < data.length; i += stride) {
                maxStored = Math.max(maxStored, data[i]);
                if (data[i + 1] !== 0) overflow++;
            }
            return { lightCount, clusterCount: data.length / stride, overflow, maxStored };
        } finally {
            if (readback.mapState === 'mapped') readback.unmap();
            readback.destroy();
        }
    }
}
