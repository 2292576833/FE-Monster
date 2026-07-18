import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


SCREENSHOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('artifacts/storm-ocean-stability.png')
MAX_BLUE_BIAS = 0.045
MAX_MEAN_CHROMA = 0.056
MIN_DETAIL_ENERGY = 0.001
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


image = np.asarray(Image.open(SCREENSHOT).convert('RGB'), dtype=np.float32) / 255.0
height, width = image.shape[:2]
regions = [
    image[int(height * 0.569):int(height * 0.972), int(width * 0.031):int(width * 0.367)],
    image[int(height * 0.597):int(height * 0.972), int(width * 0.617):int(width * 0.969)],
    image[int(height * 0.722):int(height * 0.972), int(width * 0.367):int(width * 0.617)],
]
pixels = np.concatenate([region.reshape(-1, 3) for region in regions], axis=0)
blue_bias = pixels[:, 2] - (pixels[:, 0] + pixels[:, 1]) * 0.5
chroma = pixels.max(axis=1) - pixels.min(axis=1)

detail_samples = []
for region in regions:
    luminance = region @ LUMA
    high_pass = luminance[1:-1, 1:-1] - (
        luminance[1:-1, :-2]
        + luminance[1:-1, 2:]
        + luminance[:-2, 1:-1]
        + luminance[2:, 1:-1]
    ) * 0.25
    detail_samples.append(np.abs(high_pass).reshape(-1))

mean_blue_bias = float(blue_bias.mean())
mean_chroma = float(chroma.mean())
detail_energy = float(np.concatenate(detail_samples).mean())
passed = (
    mean_blue_bias <= MAX_BLUE_BIAS
    and mean_chroma <= MAX_MEAN_CHROMA
    and detail_energy >= MIN_DETAIL_ENERGY
)

print(json.dumps({
    'screenshot': str(SCREENSHOT),
    'meanBlueBias': round(mean_blue_bias, 6),
    'maximumBlueBias': MAX_BLUE_BIAS,
    'meanChroma': round(mean_chroma, 6),
    'maximumMeanChroma': MAX_MEAN_CHROMA,
    'detailEnergy': round(detail_energy, 6),
    'minimumDetailEnergy': MIN_DETAIL_ENERGY,
    'passed': passed,
}, indent=2))

if not passed:
    raise SystemExit(1)
