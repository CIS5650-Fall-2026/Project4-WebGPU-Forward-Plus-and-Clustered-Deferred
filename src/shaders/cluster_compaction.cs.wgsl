struct DispatchArgs {
    x: atomic<u32>,
    y: u32,
    z: u32,
}

@group(0) @binding(0) var<storage, read_write> occupied: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> activeClusters: ActiveClusters;
@group(0) @binding(2) var<storage, read_write> dispatchArgs: DispatchArgs;
@group(0) @binding(3) var<storage, read_write> clusterSet: ClusterSet;

@compute @workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u) {
    let clusterIndex = id.x;
    if (clusterIndex >= ${clusterCountX}u * ${clusterCountY}u * ${clusterCountZ}u) {
        return;
    }

    // Reset even clusters that became empty since the previous frame.
    clusterSet.clusters[clusterIndex].header = vec4u(0u);
    if (atomicLoad(&occupied[clusterIndex]) == 0u) {
        return;
    }

    // One invocation per cluster guarantees unique IDs in the compact list.
    let slot = atomicAdd(&activeClusters.count, 1u);
    activeClusters.indices[slot] = clusterIndex;
    atomicMax(&dispatchArgs.x, (slot + ${clusterWorkgroupSize}u) / ${clusterWorkgroupSize}u);
}
