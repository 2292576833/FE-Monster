import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


SCREENSHOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('artifacts/storm-ocean-stability.png')
MAX_VERTICAL_STRIPE_SCORE = 0.005


image = np.asarray(Image.open(SCREENSHOT).convert('RGB'), dtype=np.float32) / 255.0
height, width = image.shape[:2]
water = image[
    int(height * 0.583):int(height * 0.972),
    int(width * 0.609):int(width * 0.969),
]
luminance = water @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
radius = 3
dark_line_response = np.maximum(
    (luminance[:, :-radius * 2] + luminance[:, radius * 2:]) * 0.5
    - luminance[:, radius:-radius],
    0.0,
)
vertical_sample_count = max(1, int(dark_line_response.shape[0] * 0.3))
vertical_scores = np.partition(
    dark_line_response,
    -vertical_sample_count,
    axis=0,
)[-vertical_sample_count:].mean(axis=0)
vertical_stripe_score = float(vertical_scores.max())
passed = vertical_stripe_score <= MAX_VERTICAL_STRIPE_SCORE

print(json.dumps({
    'screenshot': str(SCREENSHOT),
    'verticalStripeScore': round(vertical_stripe_score, 6),
    'maximumAllowed': MAX_VERTICAL_STRIPE_SCORE,
    'passed': passed,
}, indent=2))

if not passed:
    raise SystemExit(1)
