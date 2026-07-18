import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


SCREENSHOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('artifacts/storm-ocean-stability.png')
MIN_FINE_ENERGY = 0.00195
MIN_MID_TO_COARSE_RATIO = 0.452
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


image = np.asarray(Image.open(SCREENSHOT).convert('RGB'), dtype=np.float32) / 255.0
height, width = image.shape[:2]
regions = [
    image[int(height * 0.569):int(height * 0.972), int(width * 0.031):int(width * 0.367)],
    image[int(height * 0.597):int(height * 0.972), int(width * 0.617):int(width * 0.969)],
    image[int(height * 0.722):int(height * 0.972), int(width * 0.367):int(width * 0.617)],
]


def scale_energy(distance):
    samples = []
    for region in regions:
        luminance = region @ LUMA
        samples.append(np.abs(luminance[:, distance:] - luminance[:, :-distance]).reshape(-1))
        samples.append(np.abs(luminance[distance:] - luminance[:-distance]).reshape(-1))
    return float(np.concatenate(samples).mean())


fine_energy = scale_energy(1)
mid_energy = scale_energy(4)
coarse_energy = scale_energy(16)
mid_to_coarse_ratio = mid_energy / max(coarse_energy, 1e-6)
passed = fine_energy >= MIN_FINE_ENERGY and mid_to_coarse_ratio >= MIN_MID_TO_COARSE_RATIO

print(json.dumps({
    'screenshot': str(SCREENSHOT),
    'fineEnergy': round(fine_energy, 6),
    'minimumFineEnergy': MIN_FINE_ENERGY,
    'midEnergy': round(mid_energy, 6),
    'coarseEnergy': round(coarse_energy, 6),
    'midToCoarseRatio': round(mid_to_coarse_ratio, 6),
    'minimumMidToCoarseRatio': MIN_MID_TO_COARSE_RATIO,
    'passed': passed,
}, indent=2))

if not passed:
    raise SystemExit(1)
