from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def inspect_texture(path: Path) -> tuple[dict[str, float | tuple[int, int]], list[str]]:
    with Image.open(path) as source:
        size = source.size
        image = source.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)

    pixels = np.asarray(image, dtype=np.float32) / 255.0
    tangent_xy = pixels[:, :, :2] * 2.0 - 1.0
    difference_x = np.mean(np.abs(np.diff(tangent_xy, axis=1)), axis=(0, 1))
    difference_y = np.mean(np.abs(np.diff(tangent_xy, axis=0)), axis=(0, 1))
    axis_ratio = float(
        (difference_x[0] + difference_y[1])
        / (difference_x[1] + difference_y[0] + 1e-9)
    )
    one_pixel_energy = float(difference_x.sum() + difference_y.sum())
    wrap_x = float(np.mean(np.abs(tangent_xy[:, 0] - tangent_xy[:, -1])))
    wrap_y = float(np.mean(np.abs(tangent_xy[0] - tangent_xy[-1])))
    neighbor_x = float(np.mean(np.abs(np.diff(tangent_xy, axis=1))))
    neighbor_y = float(np.mean(np.abs(np.diff(tangent_xy, axis=0))))
    seam_ratio = max(
        wrap_x / max(neighbor_x, 1e-9),
        wrap_y / max(neighbor_y, 1e-9),
    )
    normal_std = float(np.mean(np.std(tangent_xy, axis=(0, 1))))
    percentile_low, percentile_high = np.percentile(tangent_xy, [1, 99])

    metrics: dict[str, float | tuple[int, int]] = {
        "size": size,
        "normal_std": normal_std,
        "axis_ratio": axis_ratio,
        "one_pixel_energy": one_pixel_energy,
        "seam_ratio": seam_ratio,
        "percentile_low": float(percentile_low),
        "percentile_high": float(percentile_high),
    }
    failures: list[str] = []
    if min(size) < 4096:
        failures.append(f"resolution {size[0]}x{size[1]} is below 4K")
    if not 0.075 <= normal_std <= 0.18:
        failures.append(f"normal deviation {normal_std:.3f} is outside 0.075..0.180")
    if axis_ratio > 1.34:
        failures.append(f"axis-locked grid ratio {axis_ratio:.3f} exceeds 1.340")
    if not 0.045 <= one_pixel_energy <= 0.14:
        failures.append(f"micro-detail energy {one_pixel_energy:.3f} is outside 0.045..0.140")
    if seam_ratio > 1.35:
        failures.append(f"wrap seam ratio {seam_ratio:.3f} exceeds 1.350")
    if percentile_low < -0.62 or percentile_high > 0.62:
        failures.append(
            f"normal extremes {percentile_low:.3f}..{percentile_high:.3f} exceed -0.620..0.620"
        )
    return metrics, failures


def inspect_roughness(path: Path) -> tuple[dict[str, float | tuple[int, int]], list[str]]:
    with Image.open(path) as source:
        size = source.size
        image = source.convert("L").resize((1024, 1024), Image.Resampling.LANCZOS)

    pixels = np.asarray(image, dtype=np.float32) / 255.0
    neighbor_x = float(np.mean(np.abs(np.diff(pixels, axis=1))))
    neighbor_y = float(np.mean(np.abs(np.diff(pixels, axis=0))))
    wrap_x = float(np.mean(np.abs(pixels[:, 0] - pixels[:, -1])))
    wrap_y = float(np.mean(np.abs(pixels[0] - pixels[-1])))
    seam_ratio = max(
        wrap_x / max(neighbor_x, 1e-9),
        wrap_y / max(neighbor_y, 1e-9),
    )
    percentile_low, percentile_high = np.percentile(pixels, [1, 99])
    metrics: dict[str, float | tuple[int, int]] = {
        "roughness_size": size,
        "roughness_mean": float(np.mean(pixels)),
        "roughness_std": float(np.std(pixels)),
        "roughness_low": float(percentile_low),
        "roughness_high": float(percentile_high),
        "roughness_detail": neighbor_x + neighbor_y,
        "roughness_seam_ratio": seam_ratio,
    }
    failures: list[str] = []
    if min(size) < 4096:
        failures.append(f"roughness resolution {size[0]}x{size[1]} is below 4K")
    if not 0.025 <= metrics["roughness_std"] <= 0.13:
        failures.append(
            f"roughness deviation {metrics['roughness_std']:.3f} is outside 0.025..0.130"
        )
    if metrics["roughness_low"] < 0.48 or metrics["roughness_high"] > 0.97:
        failures.append(
            "roughness range "
            f"{metrics['roughness_low']:.3f}..{metrics['roughness_high']:.3f} "
            "exceeds 0.480..0.970"
        )
    if seam_ratio > 1.35:
        failures.append(f"roughness wrap seam ratio {seam_ratio:.3f} exceeds 1.350")
    return metrics, failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the storm-ocean realtime normal map.")
    parser.add_argument("texture", type=Path)
    parser.add_argument("roughness", type=Path, nargs="?")
    args = parser.parse_args()

    if not args.texture.is_file():
        print(f"WATER_TEXTURE_RED missing texture: {args.texture}")
        return 1

    metrics, failures = inspect_texture(args.texture)
    print(
        "WATER_TEXTURE_METRICS "
        + " ".join(f"{key}={value}" for key, value in metrics.items())
    )
    if args.roughness is not None:
        if not args.roughness.is_file():
            print(f"WATER_TEXTURE_RED missing roughness texture: {args.roughness}")
            return 1
        roughness_metrics, roughness_failures = inspect_roughness(args.roughness)
        print(
            "WATER_ROUGHNESS_METRICS "
            + " ".join(f"{key}={value}" for key, value in roughness_metrics.items())
        )
        failures.extend(roughness_failures)
    if failures:
        print("WATER_TEXTURE_RED " + "; ".join(failures))
        return 1
    print("WATER_TEXTURE_GREEN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
