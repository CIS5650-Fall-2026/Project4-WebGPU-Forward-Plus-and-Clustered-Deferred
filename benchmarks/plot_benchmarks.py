
import csv
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

benchmark_dir = Path(__file__).resolve().parent
summary_path = benchmark_dir / "benchmark_summary.csv"
graphs_dir = benchmark_dir / "graphs"
graphs_dir.mkdir(exist_ok=True)

light_counts = [50, 100, 250, 500, 1000]
renderer_names = ["Naive", "Forward+", "Clustered Deferred"]

data = {}

with summary_path.open(newline="", encoding="utf-8-sig") as file:
    for row in csv.DictReader(file):
        data[(row["Renderer"], int(row["Lights"]))] = float(row["MedianMs"])

x = np.arange(len(light_counts))
width = 0.25

fig, ax = plt.subplots(figsize=(11, 6))

for i, name in enumerate(renderer_names):
    values = [data[(name, count)] for count in light_counts]
    ax.bar(x + (i - 1) * width, values, width, label=name)

ax.set_title("GPU Rendering Performance: Three Rendering Approaches")
ax.set_xlabel("Number of Lights")
ax.set_ylabel("Median GPU Time (ms)")
ax.set_xticks(x)
ax.set_xticklabels(light_counts)
ax.legend()
ax.grid(axis="y", alpha=0.25)
ax.set_axisbelow(True)

fig.tight_layout()
fig.savefig(graphs_dir / "gpu_time_all_renderers.png", dpi=200)
plt.close(fig)

fig, ax = plt.subplots(figsize=(11, 6))
width = 0.35

for i, name in enumerate(renderer_names[1:]):
    values = [data[(name, count)] for count in light_counts]
    ax.bar(x + (i - 0.5) * width, values, width, label=name)

ax.set_title("GPU Rendering Performance: Forward+ vs. Clustered Deferred")
ax.set_xlabel("Number of Lights")
ax.set_ylabel("Median GPU Time (ms)")
ax.set_xticks(x)
ax.set_xticklabels(light_counts)
ax.legend()
ax.grid(axis="y", alpha=0.25)
ax.set_axisbelow(True)

fig.tight_layout()
fig.savefig(graphs_dir / "gpu_time_optimized_renderers.png", dpi=200)
plt.close(fig)

print("Generated graphs:")
print(graphs_dir / "gpu_time_all_renderers.png")
print(graphs_dir / "gpu_time_optimized_renderers.png")




# Extra-credit comparison at 500 lights
extra_credit_names = [
    "Original G-buffer\nFragment lighting",
    "Original G-buffer\nCompute lighting",
    "Packed RGBA32Float\nCompute lighting",
    "Packed RGBA16Float\nCompute lighting",
]

extra_credit_times = [7.930, 13.599, 13.402, 12.648]

fig, ax = plt.subplots(figsize=(11, 6))

bars = ax.bar(
    np.arange(len(extra_credit_names)),
    extra_credit_times,
    width=0.65,
)

ax.set_title("Clustered Deferred Extra-Credit Performance (500 Lights)")
ax.set_xlabel("G-buffer and Lighting Configuration")
ax.set_ylabel("Median GPU Time (ms)")
ax.set_xticks(np.arange(len(extra_credit_names)))
ax.set_xticklabels(extra_credit_names)
ax.set_ylim(0, max(extra_credit_times) * 1.2)
ax.grid(axis="y", alpha=0.25)
ax.set_axisbelow(True)

for bar, value in zip(bars, extra_credit_times):
    ax.text(
        bar.get_x() + bar.get_width() / 2,
        bar.get_height() + 0.15,
        f"{value:.3f} ms",
        ha="center",
        va="bottom",
    )

fig.tight_layout()
fig.savefig(graphs_dir / "gpu_time_extra_credit.png", dpi=200)
plt.close(fig)

print(graphs_dir / "gpu_time_extra_credit.png")