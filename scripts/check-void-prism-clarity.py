from pathlib import Path
import sys

from PIL import Image, ImageFilter, ImageStat


screenshot = Path(
    sys.argv[1] if len(sys.argv) > 1 else "artifacts/void-prism-mirror-only-1440x900.png"
)
image = Image.open(screenshot).convert("RGB")
width, height = image.size
mirror_region = image.crop(
    (int(width * 0.08), int(height * 0.12), int(width * 0.92), int(height * 0.92))
)
luminance = sorted(
    0.2126 * red + 0.7152 * green + 0.0722 * blue
    for red, green, blue in mirror_region.get_flattened_data()
)
mean = sum(luminance) / len(luminance)
p10 = luminance[int(len(luminance) * 0.10)]
p90 = luminance[int(len(luminance) * 0.90)]
p01 = luminance[int(len(luminance) * 0.01)]
p99 = luminance[int(len(luminance) * 0.99)]
span = p90 - p10
pixels = list(mirror_region.get_flattened_data())
chroma = sorted(max(pixel) - min(pixel) for pixel in pixels)
chroma_mean = sum(chroma) / len(chroma)
chroma_p90 = chroma[int(len(chroma) * 0.90)]
chroma_high_ratio = sum(value > 12 for value in chroma) / len(chroma)
near_black_ratio = sum(value < 35 for value in luminance) / len(luminance)
white_clip_ratio = sum(value > 248 for value in luminance) / len(luminance)
shadow_ratio = sum(value < 110 for value in luminance) / len(luminance)
highlight_ratio = sum(value > 190 for value in luminance) / len(luminance)
edge_values = list(mirror_region.convert("L").filter(ImageFilter.FIND_EDGES).get_flattened_data())
edge_high_ratio = sum(value > 20 for value in edge_values) / len(edge_values)
silver_panel_regions = 0
bright_panel_regions = 0
dark_panel_regions = 0
for left, top, right, bottom in (
    (0.10, 0.12, 0.38, 0.34),
    (0.62, 0.12, 0.90, 0.34),
    (0.08, 0.66, 0.38, 0.90),
    (0.62, 0.64, 0.92, 0.88),
):
    panel = image.crop(
        (int(width * left), int(height * top), int(width * right), int(height * bottom))
    ).convert("L")
    values = sorted(panel.get_flattened_data())
    panel_p05 = values[int(len(values) * 0.05)]
    panel_p95 = values[int(len(values) * 0.95)]
    panel_span = panel_p95 - panel_p05
    panel_stddev = ImageStat.Stat(panel).stddev[0]
    silver_panel_regions += 25 <= panel_span <= 115 and 8 <= panel_stddev <= 38
    bright_panel_regions += panel_p95 >= 185
    dark_panel_regions += panel_p05 <= 125

lyric_reflection_regions = 0
for left, top, right, bottom in (
    (0.40, 0.18, 0.60, 0.32),
    (0.15, 0.42, 0.39, 0.57),
    (0.61, 0.42, 0.85, 0.57),
    (0.39, 0.68, 0.61, 0.82),
):
    lyric_panel = image.crop(
        (int(width * left), int(height * top), int(width * right), int(height * bottom))
    ).convert("L")
    values = sorted(lyric_panel.get_flattened_data())
    lyric_stddev = ImageStat.Stat(lyric_panel).stddev[0]
    lyric_contrast = values[int(len(values) * 0.90)] - values[int(len(values) * 0.02)]
    lyric_reflection_regions += lyric_contrast >= 25 and lyric_stddev >= 7

back_panel = image.crop(
    (int(width * 0.45), int(height * 0.44), int(width * 0.55), int(height * 0.56))
).convert("L")
back_mean = ImageStat.Stat(back_panel).mean[0]
back_delta = abs(back_mean - mean)

passed = (
    110 <= mean <= 185
    and p10 <= 125
    and p90 >= 190
    and 60 <= span <= 125
    and p99 <= 242
    and chroma_mean <= 10
    and chroma_p90 <= 12
    and chroma_high_ratio <= 0.01
    and near_black_ratio <= 0.001
    and white_clip_ratio <= 0.001
    and 0.02 <= shadow_ratio <= 0.35
    and 0.03 <= highlight_ratio <= 0.40
    and 0.008 <= edge_high_ratio <= 0.030
    and silver_panel_regions == 4
    and bright_panel_regions >= 1
    and dark_panel_regions >= 3
    and lyric_reflection_regions == 4
    and back_delta <= 12
)

print(
    f"mean={mean:.2f} p01={p01:.2f} p10={p10:.2f} p90={p90:.2f} p99={p99:.2f} span={span:.2f} "
    f"chroma_mean={chroma_mean:.2f} chroma_p90={chroma_p90:.2f} "
    f"chroma_high={chroma_high_ratio:.4f} near_black={near_black_ratio:.4f} "
    f"white_clip={white_clip_ratio:.4f} shadow={shadow_ratio:.4f} "
    f"highlight={highlight_ratio:.4f} edge_high={edge_high_ratio:.4f} "
    f"silver_panels={silver_panel_regions}/4 bright_panels={bright_panel_regions}/4 "
    f"dark_panels={dark_panel_regions}/4 "
    f"lyric_reflections={lyric_reflection_regions}/4 "
    f"back_mean={back_mean:.2f} back_delta={back_delta:.2f} "
    f"result={'PASS' if passed else 'FAIL'}"
)
raise SystemExit(0 if passed else 1)
