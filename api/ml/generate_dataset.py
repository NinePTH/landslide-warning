"""
Generate synthetic landslide training data (v2).

Adds humidity as a feature and replaces binary 0/1 labels with
four risk levels: low / medium / high / critical.

Feature ranges are grounded in the original landslide_dataset.csv:
  rainfall        50–300 mm
  soil_moisture    0–1    (saturation fraction)
  slope_angle      5–60°
  proximity_to_water 0–2  km
  humidity        30–100 %

Usage (run from api/):
    python ml/generate_dataset.py
"""

import numpy as np
import pandas as pd
from pathlib import Path

OUTPUT = Path(__file__).parent / "landslide_dataset_v2.csv"
SEED = 42
N_PER_CLASS = 500   # 2000 rows total, balanced

rng = np.random.default_rng(SEED)


def sample(ranges: dict, n: int) -> dict:
    return {k: rng.uniform(lo, hi, n) for k, (lo, hi) in ranges.items()}


CLASSES = {
    "low": {
        "rainfall":            (50,  120),
        "soil_moisture":       (0.0, 0.35),
        "slope_angle":         (5,   22),
        "proximity_to_water":  (0.8, 2.0),
        "humidity":            (30,  65),
    },
    "medium": {
        "rainfall":            (80,  180),
        "soil_moisture":       (0.25, 0.60),
        "slope_angle":         (15,  38),
        "proximity_to_water":  (0.4, 1.5),
        "humidity":            (70,  90),
    },
    "high": {
        "rainfall":            (150, 260),
        "soil_moisture":       (0.55, 0.85),
        "slope_angle":         (28,  52),
        "proximity_to_water":  (0.1, 1.0),
        "humidity":            (75,  94),
    },
    "critical": {
        "rainfall":            (230, 300),
        "soil_moisture":       (0.78, 1.0),
        "slope_angle":         (35,  60),
        "proximity_to_water":  (0.0, 0.6),
        "humidity":            (81, 100),
    },
}

COLUMNS = ["rainfall", "soil_moisture", "slope_angle", "proximity_to_water", "humidity", "risk_level"]


def generate() -> pd.DataFrame:
    frames = []
    for label, ranges in CLASSES.items():
        df = pd.DataFrame(sample(ranges, N_PER_CLASS))
        df["risk_level"] = label
        frames.append(df)

    df = pd.concat(frames, ignore_index=True).sample(frac=1, random_state=SEED)
    return df[COLUMNS].round(4)


if __name__ == "__main__":
    df = generate()
    df.to_csv(OUTPUT, index=False)
    print(f"Saved {len(df)} rows to {OUTPUT}")
    for label, count in df["risk_level"].value_counts().sort_index().items():
        print(f"  {label}: {count}")
