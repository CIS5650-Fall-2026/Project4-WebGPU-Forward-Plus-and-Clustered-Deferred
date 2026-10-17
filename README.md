WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Nico Kong
   [LinkedIn](https://www.linkedin.com/in/nicola-kong/), Email: nebfinn@gmail.com
* Tested on: Windows 11, AMD Ryzen AI 9 HX 370 @ 2.0GHz 32GB, RTX 4060 8GB (Personal Laptop)
  
### Live Demo

[![](img/thumb.png)](http://neb-create.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred)

### Demo Video/GIF

!! High quality video available inside of <img/demo.mp4>

https://github.com/user-attachments/assets/f1057d2e-e0fd-4a7c-90d4-5be6be3db110

## Overview

We compare different implementations for rendering a scene with a large number of dynamic, moving lights.

### Implemented Features

- Naive forward rendering
- Forward+ Rendering with light clustering
- Deferred rendering with light clustering

## Performance Analysis

### Forward+ vs. Clustered Deferred

Describe how the two renderers perform and compare them.

| Workload or configuration | Naive | Forward+ time | Clustered Deferred time |
|---|---:|---:|---|
| 50 Lights | 11 ms | 6 ms | 6 ms |
| 500 Lights | 103 ms | 8 ms | 6 ms |
| 5000 Lights | 1320 ms | 71 ms | 18 ms |

- **Render time**: Clustered Deferred consistently performs the best, and Naive consistently performs the worst.
- **Workload differences**: Deferred and Forward+ use more memory, and there is overhead from setting up the cluster data. Deferred uses even more memory with the extra G-buffers.
- **Analysis**: Clustering obviously improves runtime, as the number of lights checked per pixel no longer scales logarithmically with the number of lights. Deferred rendering likely performs even better due to better utilization of parallelism in the second pass and color calculation.

### Credits 

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
