#!/usr/bin/env python3
"""Summarize and plot CSV files exported by the in-app renderer benchmark."""

import argparse
import csv
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path


METRICS = (
    ("frame_interval_ms", "RAF frame interval (ms)"),
    ("cpu_submit_ms", "CPU draw/submit time (ms)"),
)


def percentile(values, fraction):
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def read_files(paths):
    groups = defaultdict(lambda: defaultdict(list))
    for path in paths:
        with path.open(newline="", encoding="utf-8-sig") as csv_file:
            reader = csv.DictReader(csv_file)
            required = {"version", "mode", *(metric for metric, _ in METRICS)}
            missing = required - set(reader.fieldnames or ())
            if missing:
                raise ValueError(f"{path}: missing required columns: {', '.join(sorted(missing))}")

            for line_number, row in enumerate(reader, start=2):
                version = (row.get("version") or "").strip()
                mode = (row.get("mode") or "").strip()
                if not version or not mode:
                    raise ValueError(f"{path}:{line_number}: version and mode cannot be blank")
                bundle_state = (row.get("render_bundles") or "unspecified").strip() or "unspecified"
                depth_state = (row.get("forward_plus_depth") or "unspecified").strip() or "unspecified"
                num_lights = (row.get("num_lights") or "unspecified").strip() or "unspecified"
                key = (version, mode, bundle_state, depth_state, num_lights)
                for metric, _ in METRICS:
                    try:
                        value = float(row[metric])
                    except (TypeError, ValueError) as error:
                        raise ValueError(f"{path}:{line_number}: invalid {metric}") from error
                    if not math.isfinite(value) or value < 0:
                        raise ValueError(f"{path}:{line_number}: {metric} must be finite and nonnegative")
                    groups[key][metric].append(value)
    if not groups:
        raise ValueError("No benchmark samples found in the supplied CSV files")
    return groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_files", nargs="+", type=Path, help="one or more benchmark CSV exports")
    parser.add_argument(
        "-o", "--output", type=Path, default=Path("benchmark-results.png"),
        help="output chart path (default: benchmark-results.png)",
    )
    args = parser.parse_args()

    try:
        groups = read_files(args.csv_files)
    except (OSError, csv.Error, ValueError) as error:
        parser.error(str(error))

    print("Version | Renderer | Lights | Bundles | Forward+ depth | Metric | Samples | Mean | Median | P95 (ms)")
    for version, mode, bundle_state, depth_state, num_lights in sorted(groups):
        for metric, label in METRICS:
            values = groups[(version, mode, bundle_state, depth_state, num_lights)][metric]
            print(
                f"{version} | {mode} | {num_lights} | {bundle_state} | {depth_state} | "
                f"{label} | {len(values)} | "
                f"{statistics.fmean(values):.3f} | {statistics.median(values):.3f} | "
                f"{percentile(values, 0.95):.3f}"
            )

    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("Install matplotlib to create the plot: python -m pip install matplotlib", file=sys.stderr)
        return 2

    versions = sorted({version for version, _, _, _, _ in groups})
    combinations = sorted(groups)
    labels = [
        f"{version}\n{mode}\n{num_lights} lights\nBundles: {bundle_state}\nDepth: {depth_state}"
        for version, mode, bundle_state, depth_state, num_lights in combinations
    ]
    colors_by_version = {version: f"C{index % 10}" for index, version in enumerate(versions)}
    hatches = {"enabled": "", "disabled": "///", "unsupported": "..."}

    figure, axes = plt.subplots(1, len(METRICS), figsize=(7 * len(METRICS), 5), squeeze=False)
    for axis, (metric, title) in zip(axes[0], METRICS):
        medians = []
        lower_errors = []
        upper_errors = []
        colors = []
        metric_hatches = []
        for version, mode, bundle_state, depth_state, num_lights in combinations:
            values = groups[(version, mode, bundle_state, depth_state, num_lights)][metric]
            q1 = percentile(values, 0.25)
            median = statistics.median(values)
            q3 = percentile(values, 0.75)
            medians.append(median)
            lower_errors.append(median - q1)
            upper_errors.append(q3 - median)
            colors.append(colors_by_version[version])
            metric_hatches.append(hatches.get(bundle_state, ""))

        bars = axis.bar(range(len(combinations)), medians, color=colors)
        for bar, hatch in zip(bars, metric_hatches):
            bar.set_hatch(hatch)
        axis.errorbar(
            range(len(combinations)), medians, yerr=[lower_errors, upper_errors],
            fmt="none", ecolor="black", capsize=3,
        )
        axis.set_title(title)
        axis.set_ylabel("Milliseconds (lower is better)")
        axis.set_xticks(range(len(labels)), labels, rotation=30, ha="right")
        axis.grid(axis="y", alpha=0.25)

    figure.suptitle("Renderer benchmark (median and interquartile range)")
    figure.text(
        0.5, 0.01,
        "Frame interval includes browser scheduling/vsync; CPU draw/submit is not GPU execution time.",
        ha="center", fontsize=9,
    )
    figure.tight_layout(rect=(0, 0.05, 1, 0.93))
    figure.savefig(args.output, dpi=160)
    print(f"Saved chart: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
