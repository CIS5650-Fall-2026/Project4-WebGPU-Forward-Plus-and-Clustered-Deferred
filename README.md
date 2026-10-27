WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

  Veer Kakar
  * [LinkedIn](www.linkedin.com/in/VeerKakar), [personal website](https://veerkakar17.github.io/PortfolioWebsite)
* Tested on: Linux Fedora 44 (Dual Boot from Windows 11 Laptop), Intel Ultra 9 275HX, NVIDIA 5070 laptop

### Live Demo

[Demo Link](https://veerkakar17.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

### Demo Video/GIF

![](/compressed.gif)

# Overview

This project renders moving, colored lights in a 3D scene using webgpu. The way this works is by spawning a number of lights (which is specified via slider on the UI) at random positions that move in random directions over time. These are all point lights which contain a constant radius of effect for each light. This project outlines a few different rendering techniques for achieving this, and then performs a performance comparison between all 3.

## Naive

This is the most basic Forward rendering implementation. This works by using a single render pass and shader which, for every fragment in our fragment shader, iterates over all lights and adds their contribution to this fragment. This gives us the right output but, as we iterate over all lights in every single fragment, this scales very poorly with respect to light count and is very inefficient.

## Forward+ 

This is the same as the naive forward implementation, but it instead introduces the idea of Clustering, where the screen is split up into several uniform cubes in the x, y, and z direction. This creates an initial compute pass before the render pass which, for each of these clusters, iterates over all lights and appends them to a list if their range of influence reaches this cluster.
Now in our fragment shader of the render pass, instead of iterating over each light, we can determine which cluster our fragment is in and then only iterate over lights in this specific cluster.
While this is more efficient, as we cannot store dynamic lists of lights for our clusters on the GPU, we statically allocate buffers of size 1000 lights for each cluster. This means that, if we have more than 1000 lights affecting a single cluster, we have some culling and may have lines between different clusters. This does not have an affect at lower light counts, but as you approach 5000 lights, it becomes more noticable.

## Clustered Deferred

This implementation is the same as the Forward+ with the same clustering compute pass, but instead uses 2 render passes afterwards.
The first render pass is a Geometry pass, which has the same vertex shader as the Forward implementations, but then does nothing in the fragment shader other than store the normal, albedo, and position values for each fragment into textures. These textures are then passed into the second render pass, which then only looks at the lighting contribution for each light in each fragment's corresponding cluster, and then applies that ontop of the G-Buffer textures computed in the previous pass.
By doing these 2 passes, we are able to do the quicker geometry calculations in a single pass, and then save the more expensive light shading pass for only the fragments that actually get rendered on the screen, which gives us a more optimal runtime.

# Performance Analysis

The following table has a list of frames per second (higher is better) against number of lights for all 3 different implementations. Note that 165 is the max FPS that my monitor can support, so we see this as the cap here.

| Number of Lights | Naive (FPS) | Forward+ (FPS) | Clustered Deferred (FPS) |
|-----------------:|------------:|---------------:|-------------------------:|
| 50               | 165         | 165            | 165                      |
| 250              | 65          | 150            | 165                      |
| 500              | 33          | 84             | 165                      |
| 1000             | 17          | 44             | 165                      |
| 2500             | 7           | 19             | 86                       |
| 5000             | 3           | 14             | 66                       |

As we see in all cases, Naive performs worse than Forward+ which performs worse than Clustered Deferred. 
For Naive, this performs the worst and scales badly because it has to iterate over every light for every fragment.

With Forward+ (adding clustering), this has some overhead with an additional compute pass to determine which cluster each light affects, but then we are able to greatly reduce the number of lights each fragment has to check (only ones associated with this cluster) which makes it much more efficient.

Even with clustering, we have a lot of fragments which have to iterate over lights (an expensive operation) which may not be rendered to the screen. By using deferred rendering, we first do the geometry pass to make sure our later shading pass (computing effect of lighting) only has to be done for fragments actually rendered to the screen, which is why it ends up much more efficient.

### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
