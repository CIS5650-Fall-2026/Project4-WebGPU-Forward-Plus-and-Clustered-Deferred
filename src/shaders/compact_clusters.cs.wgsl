// stream compaction: packs the marked clusters into a list
// and writes the workgroup count for the indirect clustering dispatch

struct ActiveClusters {
    dispatchX: atomic<u32>,
    dispatchY: u32,
    dispatchZ: u32,
    count: atomic<u32>,
    indices: array<u32>
}

@group(${bindGroup_scene}) @binding(0) var<storage, read> clusterFlags: array<u32>;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> activeClusters: ActiveClusters;

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    if (clusterIdx == 0u) {
        activeClusters.dispatchY = 1u;
        activeClusters.dispatchZ = 1u;
    }
    if (clusterIdx >= ${clusterX} * ${clusterY} * ${clusterZ} || clusterFlags[clusterIdx] == 0u) {
        return;
    }

    let i = atomicAdd(&activeClusters.count, 1u);
    activeClusters.indices[i] = clusterIdx;
    // enough workgroups to reach index i
    atomicMax(&activeClusters.dispatchX, i / ${clusteringWorkgroupSize} + 1u);
}
