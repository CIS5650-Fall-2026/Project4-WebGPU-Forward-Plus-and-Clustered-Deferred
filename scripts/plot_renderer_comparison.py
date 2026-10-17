#!/usr/bin/env python3
"""Plot aggregated Forward+ vs clustered deferred benchmark results."""

import argparse
import csv
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", type=Path, help="aggregated renderer comparison CSV")
    parser.add_argument(
        "-o", "--output", type=Path, default=Path("renderer-comparison.png"),
        help="output chart path (default: renderer-comparison.png)",
    )
    args = parser.parse_args()

    try:
        import matplotlib.pyplot as plt
    except ImportError:
        parser.error("Install matplotlib with: py -3.12 -m pip install matplotlib")

    with args.csv_file.open(newline="", encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))
    required = {
        "renderer", "num_lights", "frame_interval_mean_ms", "frame_interval_median_ms",
        "cpu_submit_mean_ms", "cpu_submit_median_ms",
    }
    missing = required - set(rows[0] if rows else ())
    if not rows or missing:
        parser.error(f"CSV is empty or missing columns: {', '.join(sorted(missing))}")

    renderers = sorted({row["renderer"] for row in rows})
    figure, axes = plt.subplots(1, 2, figsize=(12, 5))
    metrics = (
        ("frame_interval_mean_ms", "frame_interval_median_ms", "Frame interval (ms)"),
        ("cpu_submit_mean_ms", "cpu_submit_median_ms", "CPU draw/submit (ms)"),
    )
    colors = {"forward+": "tab:blue", "clustered deferred": "tab:orange"}

    for axis, (mean_key, median_key, title) in zip(axes, metrics):
        for renderer in renderers:
            samples = sorted(
                (row for row in rows if row["renderer"] == renderer),
                key=lambda row: int(row["num_lights"]),
            )
            lights = [int(row["num_lights"]) for row in samples]
            means = [float(row[mean_key]) for row in samples]
            medians = [float(row[median_key]) for row in samples]
            color = colors.get(renderer)
            axis.plot(lights, means, marker="x", linestyle="--", color=color, alpha=0.65,
                      label=f"{renderer} mean")
            axis.plot(lights, medians, marker="o", color=color, label=f"{renderer} median")
        axis.set_title(title)
        axis.set_xlabel("Active point lights")
        axis.set_ylabel("Milliseconds (lower is better)")
        axis.set_xticks(sorted({int(row["num_lights"]) for row in rows}))
        axis.grid(alpha=0.25)
        axis.legend()

    figure.suptitle("Forward+ vs clustered deferred — same scene and settings")
    figure.text(
        0.5, 0.01,
        "RAF frame interval includes browser scheduling; it is not GPU timestamp time.",
        ha="center", fontsize=9,
    )
    figure.tight_layout(rect=(0, 0.05, 1, 0.93))
    figure.savefig(args.output, dpi=160)
    print(f"Saved chart: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
