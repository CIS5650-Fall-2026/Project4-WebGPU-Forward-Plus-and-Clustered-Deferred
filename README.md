WebGPU Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Luke (Hyuk Che) Kwon
  * [LinkedIn](https://www.linkedin.com/in/hyukchekwon/), [Personal Website](https://lukekwon98.github.io/), [Github](https://github.com/lukekwon98)
* Tested on: Windows 11, AMD Ryzen 5 5600X 6-Core Processor @ ~3.7GHz 16GB, Nvidia GeForce RTX 3060 (Compute Capability 8.6)

### Live Demo / Video

https://github.com/user-attachments/assets/97f192ca-f856-4765-93db-ce94009e87df

[Live Demo Link](https://lukekwon98.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

This project implements and compares three real-time lighting pipelines written in TypeScript and WGSL: Naive Forward, Forward+, and Clustered Deferred. The project renders the Sponza scene with animated point lights and uses a shared 3D light-clustering pass to reduce lighting work.

## Implementation Details

### Naive

The naive renderer draws the scene in a single geometry pass. Each shaded fragment evaluates the point lights directly. This provides a simple baseline without a clustering pass or G-buffer, but lighting work increases with both the number of lights and the number of shaded fragments.

### Forward+

Forward+ divides the camera frustum into a 3D grid. A compute pass assigns lights to clusters, storing a light count and a fixed-capacity list of light indices for each cluster. During rendering, each fragment identifies its cluster and evaluates only the lights in that list.

This trades the cost of constructing the cluster lists for reduced fragment-shader lighting work. Grid resolution, workgroup size, and list capacity are configurable.

### Clustered Deferred

Clustered Deferred reuses the same clustering pass, then separates geometry processing from lighting:

1. The geometry pass writes world-space position, normal, and albedo to a G-buffer while performing depth testing.
2. A fullscreen triangle reads the G-buffer and computes lighting using the corresponding cluster's light list.

Deferred shading adds G-buffer storage and bandwidth costs, but moves expensive lighting out of the geometry pass. Geometry overdraw can still occur, as it no longer repeats the full lighting calculation for each shaded geometry fragment.

## Performance

### Measurement Method

GPU timestamp queries measure the duration of each instrumented pass. After a five-second warmup, samples are collected over a ten-second window. The reported value is the sum of the mean pass durations in milliseconds, so lower is better.

| Renderer | Included passes |
| :--- | :--- |
| Naive | Forward rendering |
| Forward+ | Clustering + forward rendering |
| Clustered Deferred | Clustering + G-buffer + fullscreen lighting |

The measurements exclude CPU submission, browser scheduling, and the separate light-animation pass. 

| Setting | Baseline |
| :--- | :--- |
| Scene | Sponza |
| Render resolution | 1920 × 997 |
| Cluster grid | 32 × 18 × 24 |
| Clustering workgroup | 4 × 4 × 4 = 64 invocations |
| Maximum lights per cluster | 100 |
| Warmup / sampling window | 5 seconds / 10 seconds |

The light-count, grid-resolution, and workgroup tests below use a maximum of 100 lights per cluster, but visual observations indicate that higher light counts require larger capacities to avoid missing illumination.

### Number of Lights

Grid resolution, workgroup size, and list capacity remain at their baseline values.

<img width="600" height="371" alt="chart (1)" src="https://github.com/user-attachments/assets/7bc92392-5d21-4ca9-8af8-19076de2274b" />

| Lights | Naive (ms) | Forward+ (ms) | Clustered Deferred (ms) |
| ---: | ---: | ---: | ---: |
| 1 | 1.989 | 2.511 | 2.321 |
| 10 | 2.477 | 2.563 | 2.358 |
| 100 | 12.643 | 4.134 | 2.564 |
| 200 | 24.751 | 6.466 | 2.699 |
| 500 | 61.074 | 15.395 | 4.617 |
| 1,000 | 121.252 | 26.458 | 7.384 |
| 2,000 | 242.745 | 38.239 | 10.292 |
| 3,000 | 358.862 | 41.387 | 10.946 |
| 4,000 | 483.017 | 42.841 | 11.481 |
| 5,000 | 607.332 | 44.155 | 11.775 |

Naive rendering is fastest at one light, where its single-pass pipeline avoids clustering and G-buffer overhead. Its cost then grows approximately linearly with light count, reaching 607 ms at 5,000 lights.

Both clustered approaches reduce the measured lighting cost substantially. Clustered Deferred is faster than Forward+ throughout this sweep. Separating lighting from geometry processing is a plausible contributor, particularly when geometry overdraw causes Forward+ to evaluate lighting multiple times for a pixel.

Above roughly 2,000 lights, the clustered curves flatten considerably. This should likely be interpreted alongside the 100-light capacity where once lists fill, additional lights may be omitted rather than shaded.

### Cluster-Grid Resolution

This test varies all three grid dimensions, keeping 3,000 lights, 64 invocations per workgroup, and capacity 100 fixed.

<img width="600" height="371" alt="chart (6)" src="https://github.com/user-attachments/assets/f634dada-a15d-4fe3-9c4a-4a9276815dc9" />

| Grid | Total clusters | Forward+ (ms) | Clustered Deferred (ms) |
| :---: | ---: | ---: | ---: |
| 8 × 4 × 6 | 192 | 45.171 | 10.923 |
| 16 × 9 × 12 | 1,728 | 45.277 | 10.987 |
| 32 × 18 × 24 | 13,824 | 41.353 | 11.041 |
| 48 × 27 × 36 | 46,656 | 39.347 | 11.964 |
| 64 × 36 × 48 | 110,592 | 40.528 | 13.847 |

Increasing cluster-grid resolution produced a small increase in performance between 1,728 and 13,824 clusters for Forward+, while Clustered Deferred became slower at finer resolutions. However, finer grids did not consistently improve performance overall. This maybe because reduced lighting work was likely offset by increased clustering cost. The fixed 100-light capacity may also have limited the benefit of finer grids by already capping shading work in crowded clusters.

### Clustering Workgroup Size

This test uses 3,000 lights, the baseline grid, and capacity 100. The workgroup-size column counts total invocations, not the length of one axis.

<img width="600" height="371" alt="chart (3)" src="https://github.com/user-attachments/assets/10651ad0-3390-4fd3-b4c9-d3b74e1f2fe0" />

| Workgroup dimensions | Invocations | Forward+ (ms) | Clustered Deferred (ms) |
| :---: | ---: | ---: | ---: |
| 1 × 1 × 1 | 1 | 53.242 | 23.052 |
| 2 × 2 × 2 | 8 | 43.402 | 12.778 |
| 3 × 3 × 3 | 27 | 42.257 | 12.054 |
| 4 × 4 × 4 | 64 | 41.194 | 10.883 |
| 5 × 5 × 5 | 125 | 41.180 | 10.902 |
| 6 × 6 × 6 | 216 | 41.151 | 10.879 |

Increasing from one invocation to 64 reduces total time by approximately 22.6% for Forward+ and 52.8% for Clustered Deferred. Beyond 64 invocations, the measured totals are nearly unchanged. The difference between 64 and 216 is only 0.043 ms for Forward+ and 0.004 ms for Deferred. Without variability measurements, these small differences do not establish a meaningful winner.

### Maximum Lights per Cluster

This test uses 3,000 lights, the baseline grid, and 64 invocations per workgroup.

<img width="600" height="371" alt="chart (4)" src="https://github.com/user-attachments/assets/6ef7961e-0981-4f19-bf99-833196ddd59f" />

| Capacity | Forward+ (ms) | Clustered Deferred (ms) |
| ---: | ---: | ---: |
| 32 | 8.347 | 3.541 |
| 64 | 19.984 | 5.914 |
| 128 | 31.483 | 8.596 |
| 256 | 56.762 | 14.043 |
| 512 | 127.926 | 28.346 |
| 1,024 | 279.629 | 59.476 |

Increasing capacity allows longer light lists and increases allocated storage. When lists previously overflowed, it also restores lighting work that smaller capacities omitted. The large timing increase therefore represents an exchange between quality and workload.

### Minimum Max Lights per Cluster for No Artifacts

The following capacities were visually estimated to largely remove missing-light artifacts.

<img width="600" height="371" alt="chart (5)" src="https://github.com/user-attachments/assets/20008d22-4841-4452-81ad-d627eba0eef1" />

| Scene lights | Approximate capacity |
| ---: | ---: |
| 500 | 100 |
| 1,000 | 200 |
| 2,000 | 400 |
| 3,000 | 600 |

These are visual observations for the tested view, not mathematically proven overflow-free limits, but they do show a linear relationship between the required number of maximum lights per cluster and the number of lights in the scene.

### Performance at Higher Light-List Capacity

With 3,000 scene lights and a capacity of 600 lights per cluster (visually sufficient to avoid missing light artifacts in the tested view) Clustered Deferred achieved an 11.1× GPU speedup over Naive Forward.

| Scene lights | Maximum lights per cluster | Naive (ms) | Clustered Deferred (ms) | Speedup |
| ---: | ---: | ---: | ---: | ---: |
| 3,000 | 600 | 373.850 | 33.682 | 11.1× |

## Linear vs Logarithmic

Depth slicing determines how the frustum is divided along the view direction. Both schemes can use the same number of clusters while assigning different depth ranges to each slice.

| Linear - Visible Artifacts | Logarithmic - No Visible Artifacts |
| :---: | :---: |
| <img src="https://github.com/user-attachments/assets/0f6d2309-94b4-4344-b221-cbfb4152c5e2" alt="Linear slicing artifacts" width="400" /> | <img src="https://github.com/user-attachments/assets/b6f9f074-9a6c-4634-8b3b-973e590a7d2e" alt="Logarithmic slicing without visible artifacts" width="400" /> |

Both images use a 32 × 18 × 24 cluster grid, 4 × 4 × 4 workgroups, and a maximum of 100 lights per cluster.

With identical settings, logarithmic depth slicing produced no visible artifacts, while linear slicing did. This likely relates to the large depth range. camera.ts sets the far plane to 1,000, while move_lights.cs.wgsl distributes lights around a much smaller box, from (-10, 0, -5) to (10, 8, 5). Linear slicing concentrates these nearby lights into a few thick slices, increasing the risk of exceeding the per-cluster light capacity. Logarithmic slicing allocates finer slices near the camera, reducing that pressure.


### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
