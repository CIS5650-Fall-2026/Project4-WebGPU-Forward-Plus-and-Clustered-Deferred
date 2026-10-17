import { Scene } from '../stage/scene';
import { device } from '../renderer';

interface SceneDrawEncoder {
    setPipeline(pipeline: GPURenderPipeline): void;
    setBindGroup(index: number, bindGroup: GPUBindGroup): void;
    setVertexBuffer(slot: number, buffer: GPUBuffer): void;
    setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat): void;
    drawIndexed(indexCount: number): void;
}

export function encodeSceneDraws(
    encoder: SceneDrawEncoder,
    scene: Scene,
    pipeline: GPURenderPipeline,
    sceneBindGroup: GPUBindGroup
) {
    encoder.setPipeline(pipeline);
    encoder.setBindGroup(0, sceneBindGroup);
    scene.iterate(node => {
        encoder.setBindGroup(1, node.modelBindGroup);
    }, material => {
        encoder.setBindGroup(2, material.materialBindGroup);
    }, primitive => {
        encoder.setVertexBuffer(0, primitive.vertexBuffer);
        encoder.setIndexBuffer(primitive.indexBuffer, 'uint32');
        encoder.drawIndexed(primitive.numIndices);
    });
}

export function createSceneRenderBundle(
    scene: Scene,
    pipeline: GPURenderPipeline,
    sceneBindGroup: GPUBindGroup,
    colorFormat: GPUTextureFormat | null
): GPURenderBundle {
    const encoder = device.createRenderBundleEncoder({
        label: "static scene draw bundle",
        colorFormats: colorFormat === null ? [] : [colorFormat],
        depthStencilFormat: "depth24plus"
    });
    encodeSceneDraws(encoder, scene, pipeline, sceneBindGroup);
    return encoder.finish({ label: "static scene draw bundle" });
}
