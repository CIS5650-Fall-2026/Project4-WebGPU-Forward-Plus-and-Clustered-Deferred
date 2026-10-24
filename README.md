WebGPU Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Neel Shejwalkar
  * [LinkedIn](https://www.linkedin.com/in/neel-shejwalkar/), [twitter](https://x.com/neelshej)
* Tested on: **Google Chrome 155.0.8059.40** on
  Windows 11, i7-10510U @ 1.80GHz 16GB, MX250 (GP108) 2GB (Personal Computer)

### Live Demo

[![](img/thumb.png)](https://nshejwalkar.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

### Demo Video/GIF

![Demo](img/demo.gif)

### README
This is a render of the Sponza scene using three different rendering techniques: a regular forward rendering pipeline, a forward rendering pipeline with a light clustering optimization (which we call Forward+), and a deferred rendering strategy with the same clustering (Clustered Deferred Rendering). Below are descriptions, performance analyses, and debug views for the latter two.

#### Timing Methodology
The GPU timestamps were taken from WebGPU timestamp queries. Unless otherwise noted, the measurements were taken for a 1920x1080 resolution with default settings (no movement, 1000 lights with radius 2, and a 16x9x24 cluster grid). The measurements are a median of between 8 to 20 frames. As the lights move throughout the scene, we should expect some noise even beyond this in these measurements.

#### Forward+ Rendering
Forward+ rendering works by spatially grouping the scene into clusters (across the screen and depth), then calculating the total number of lights that interact with that cluster using a separate compute pass before any of the rendering begins. The fragment shader then uses this information to loop over only the smaller number of lights for that cluster, rather than every light in the scene as we did with the naive (regular forward rendering) pipeline.

The best case scenario for Forward+ rendering here is when there are many small lights all spread across the scene. In this case, each cluster must only calculate lighting only a small number of lights, resulting in an especially pronounced benefit in performance over naive rendering, which must still loop over all of those many lights.

The worst case scenarios are when some properties of the scene degenerate the algorithm to naive rendering, meaning we pay for the overhead with no benefit. For example, if the radius of the lights are very large (so every cluster contains most of the lights), the fragment shader still has to loop through every light anyway. Similarly, if there are very few lights in the scene, the naive fragment loop becomes cheap, and the Forward+ pipeline pays for its overhead while not being able to exercise its benefits at such a low scale.

The tradeoff for using Forward+ rendering is the overhead of the compute pass and the cluster buffer. This cluster buffer, at a size of clusters × (1 + maxLightsPerCluster) × 4 bytes, has to be reserved in advance regardless of how full the clusters actually are. This makes the maximum lights per cluster parameter a tradeoff in scenes with lots of lights: a high cap reserves more memory, but a lower one risks clusters being incorrectly lighted or visible artifacts. Separately, finding optimal grid parameters for the clusters requires extra tuning effort.

![Naive vs. Forward+](img/charts/naive_vs_forward_plus.png)
Forward+ is clearly far more performant than naive rendering. Note: for 1000 lights and above, naive rendering on my laptop took over 2 seconds (!) per frame, causing my Windows GPU watchdog to kill the rendering.

![Forward+ vs. number of lights](img/charts/lights_forward_plus.png)
Forward+ scales approximately linearly with the number of lights. This makes sense, as each fragment only loops over its cluster lights. Note that linear scaling would also be expected regardless of whether our scene was closer to the best case "spread out" scenario above or has clumped lights (some fragments doing far more work), just with a higher slope. This is because the cost of naive rendering is also O(lights*fragments).

![Forward+ vs. cluster grid](img/charts/grid_forward_plus.png)
When fixing the number of Z slices and testing different X and Y grid configurations, I tested different layouts matching my Chrome window's aspect ratio. 16x9 seems to be the fastest, striking the best balance between large clusters with many lights (putting more work into each loop of the fragment shader) and smaller clusters with fewer lights (offloading more work onto the compute pass). It seems like the dimension of the Z grid matters far more, however, whose clusters are laid out not linearly like with the X/Y dimensions, but exponentially bigger the farther away from the screen they are. This is done because of the nature of the view frustum's shape: farther away, each pixel projects to a larger volume, so we use a larger z to ensure the cluster is approximately a cube. A large number of Z slices resulted in 3.8x faster frame times than smaller ones.

##### Debug images
Lights per cluster, radius 1 (left) vs. radius 4 (right):

<img src="img/debug/heatmap_radius1.jpg" width="49%"> <img src="img/debug/heatmap_radius4.jpg" width="49%">
These heatmaps represent the number of lights in a particular pixel's cluster. Cooler colors represent fewer lights, redder colors are more lights, and a white pixel is one where that cluster hit the maximum number of lights. The radius 1 heatmap is mostly cyan and green, with yellow in the middle where the lights are densest, meaning each cluster holds a couple dozen lights, resulting in 54 ms/frame. For the radius 4 heatmap, each light overlaps many more clusters, and so clusters are much redder and some hit the 511 light cap, resulting in 698 ms/frame. For the white regions, those pixels are dropping the extra lights, resulting in technically incorrect lighting in those regions.

Lights per cluster, 500 lights (left) vs. 5000 lights (right):

<img src="img/debug/heatmap_500lights.jpg" width="49%"> <img src="img/debug/heatmap_5000lights.jpg" width="49%">
Similar results can be shown for 500 lights vs 5000 lights, supporting the analysis above.


#### Clustered Deferred Rendering
Clustered deferred rendering works by splitting the calculation of the geometry and the lighting into two separate pipelines, decoupling the two. The geometry render pass decides what surface is visible at each pixel by writing each pixel's world position, normal, albedo into its G-buffer textures, and does no lighting. The later lighting render pass then only calculates the lighting using this information once per pixel, the same way forward+ did, over its cluster's lights.

The best case scenario for deferred rendering is when the scene has expensive lighting, like many lights with a large radius, or heavy overdraw. Here, the benefits of deferring the rendering versus forward are clearer, as the expensive per-fragment lighting loop becomes per-pixel.

The worst case scenario is when there are few lights, little overdraw (like the camera facing a flat wall), or when running the rendering on a low-bandwidth GPU. In the first case, the G-buffer pass, which costs a fixed amount of time regardless of the number of lights, takes up more of the frame time. For the second, the number of fragments are roughly equal to the number of pixels, resulting in the overhead of this method overtaking its benefits. For the third, the large amount of buffer read/writes means that the rendering is more likely to become bandwidth bound quickly.

The overhead for deferred rendering is most in the large memory bandwidth needed. Every pixel stores 8 bytes for position, 8 for normal, and 4 for albedo, resulting in resolution*20 bytes written and read every frame, which scales badly for high resolution or low-bandwidth GPUs. Materials with more attributes (like roughness, specularity, etc) require even more G-buffer channels (as the lighting is calculated for the entire screen at once), whereas with Forward+, these are easily handled by each material running its own fragment shader. The same problems for clustering in Forward+ are also inherited here.

![Naive vs. Clustered Deferred](img/charts/naive_vs_deferred.png)
Clustered deferred rendering performs far better than naive rendering, as well as forward+ rendering. Despite the theoretical limitation of deferred rendering being worse on low bandwidth GPUs, it seems as if for the default view in Sponza on my GPU (MX250, ~48GB/s), the benefits from the overdraw outweigh the cost of the bandwidth. As mentioned above, I was not able to benchmark any higher than 500 lights for naive rendering.

![Clustered Deferred vs. number of lights](img/charts/lights_deferred.png)
Similar to forward+ rendering, the performance of this method scales linearly with the number of lights, with the same logic as before: each pixel loops over the number of lights in its cluster. As the lighting fragment shader is run per-pixel and not per-fragment, it scales better than Forward+.

![Clustered Deferred per-pass breakdown](img/charts/deferred_breakdown.png)
Taking a closer look at the time spent between the three passes, its clear to see the fullscreen lighting pass dominates the other two at a high number of lights. Even with the optimization of deferring the lighting after clustering, we are still clearly lighting-pass-bound. The G-buffer pass time stays exactly the same throughout, visually explaining the fixed overhead explained above. The compute pass for finding the per-cluster lights is a trivially small part of the whole frame time, meaning that the overhead of the compute itself is a small price to pay for the lighting performance benefits in this setup.

![Clustered Deferred vs. cluster grid](img/charts/grid_deferred.png)
Interestingly, the X/Y layout of the cluster tiles seemed to matter even less for deferred rendering vs forward+, and the optimal configuration was different (slightly higher) than before. The tradeoffs are similar to before, where larger clusters result in more work for each pixel of the lighting pass, and smaller clusters make the clustering compute pass more expensive. Again, the Z dimension mattered more, with a smaller number of slices resulting in massive clusters farther away from the image plane (simply due to the exponential nature of the slicing). A larger number of slices was far better for performance.

##### Debug images
G-buffer albedo (left), normal (middle), and position (right):

<img src="img/debug/gbuffer_albedo.jpg" width="32%"> <img src="img/debug/gbuffer_normal.jpg" width="32%"> <img src="img/debug/gbuffer_position.jpg" width="32%">
These three images show exactly what the first deferred pass writes for every pixel (every frame). Importantly, it's clear to see that these do not change with the light count, light radius, or cluster grid, meaning the cost to write and read them every frame is constant (and potentially high, depending on the resolution and if more buffers are added for more complex materials).

Looking at the albedo of the leaves specifically, we can expose one more potential downside of deferred rendering. These leaves are supposed to be transparent in the scene, and yet, as deferred rendering draws one surface per pixel, it can't blend together transparent and opaque objects. Supporting transparency would require an entirely new forward pass, which would not be necessary with forward rendering. 


#### Overall Analysis
<img src="img/charts/lights_vs_ms.png" width="32%"> <img src="img/charts/radius_vs_ms.png" width="32%"> <img src="img/charts/resolution_vs_ms.png" width="32%">

Above are graphs from the same data as above more clearly laid out to compare the three rendering methods. Clustered deferred rendering was clearly faster than forward+ for me. It inherits many of the same benefits as the clustering from Forward+, with the added benefit of having the lighting decoupled from the geometry resulting in the performance scaling per-pixel. For higher number of lights and larger light radius, the deferred step pays off greatly and scales better, as each fragment lighting pass in the forward+ rendering does more work. Both methods scale similarly for higher resolution: more pixels mean both methods need to compute lighting over more pixels/fragments.  

While deferred rendering does add extra overhead and has specific performance downsides compared to forward, the default scene settings we ran hit none of these downsides. The main tradeoffs for each were also clear: deferred adds far more overhead via writing and reading to buffers and can't support multi-surface features like transparency easily, while forward needs to loop over every fragment during its lighting pass. These main differences are what implies their best and worst-case scenarios for the type of scenes that should be rendered using these two methods.

![Forward+ vs. Clustered Deferred at low light counts](img/charts/overdraw_crossover.png)
Theoretically, as mentioned above, forward+ rendering would be better for scenes with a small number of lights spread across the scene, on a low bandwidth GPU, or on a scene with little overdraw. Deferred rendering would shine in any case on a high bandwidth GPU, or where the number of fragments being higher than the number of pixels results in far more computation, like a scene with many high-radius lights. To test this, I benchmarked two scenarios: one staring at the floor (to exercise the low fragment case) and one at the default view, varying the number of lights across each. The results were interesting: despite Deferred dominating the results for practically all cases above, at low light levels, forward+ wins out. For the default view, the two cross over at around 30-40 lights, while for floor view, forward+ wins out until around 250 lights. Both results make sense and follow from their theoretical explanations. As a side note, these runs were done with the lights frozen in place, so both renderers saw identical lighting.


### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
- [Debug coloring](https://stackoverflow.com/a/46628410)