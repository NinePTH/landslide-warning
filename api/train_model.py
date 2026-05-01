"""
Train KNN and Random Forest models on landslide sensor data.
Saves the better-performing model as ml/model.pkl.

Data priority:
  1. api/ml/landslide_dataset_v2.csv  (5 features + 4-class labels)
  2. api/ml/landslide_dataset.csv     (4 features + binary, humidity imputed)
  3. sensor_readings table in DB      (if >= 50 labeled rows)
  4. Synthetic data                   (fallback)

Usage:
    python train_model.py
"""

import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select

from database import engine, sensor_readings

load_dotenv(Path(__file__).parent.parent / ".env")

CSV_V2_PATH = Path(__file__).parent / "ml" / "landslide_dataset_v2.csv"
CSV_V1_PATH = Path(__file__).parent / "ml" / "landslide_dataset.csv"
MODEL_PATH  = Path(__file__).parent / "ml" / "model.pkl"

FEATURES         = ["rainfall", "soil_moisture", "slope_angle", "proximity_to_water", "humidity"]
HUMIDITY_DEFAULT = 65.0
MIN_LABELED_ROWS = 50
RANDOM_STATE     = 42

RISK_MAP = {0: "low", 1: "high"}   # v1 binary → string


# --- Data Loading -------------------------------------------------

def load_from_csv() -> pd.DataFrame:
    if CSV_V2_PATH.exists():
        df = pd.read_csv(CSV_V2_PATH)
        print(f"[Data] Loaded {len(df)} rows from v2 CSV (5 features, 4-class).")
        return df[FEATURES + ["risk_level"]].dropna()

    print("[Data] v2 CSV not found, falling back to v1 CSV.")
    df = pd.read_csv(CSV_V1_PATH)
    df = df.rename(columns={
        "Rainfall_mm":        "rainfall",
        "Soil_Saturation":    "soil_moisture",
        "Slope_Angle":        "slope_angle",
        "Proximity_to_Water": "proximity_to_water",
        "Landslide":          "risk_level",
    })
    df["humidity"]    = HUMIDITY_DEFAULT
    df["risk_level"]  = df["risk_level"].map(RISK_MAP)
    print(f"[Data] Loaded {len(df)} rows from v1 CSV (humidity imputed at {HUMIDITY_DEFAULT}%).")
    return df[FEATURES + ["risk_level"]].dropna()


def load_from_db() -> pd.DataFrame:
    query = (
        select(
            sensor_readings.c.rainfall,
            sensor_readings.c.soil_moisture,
            sensor_readings.c.humidity,
            sensor_readings.c.risk_level,
        )
        .where(sensor_readings.c.risk_level.isnot(None))
    )
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()

    df = pd.DataFrame(rows, columns=["rainfall", "soil_moisture", "humidity", "risk_level"])
    df["humidity"]           = df["humidity"].fillna(HUMIDITY_DEFAULT)
    df["slope_angle"]        = 30.0
    df["proximity_to_water"] = 1.0
    return df[FEATURES + ["risk_level"]].dropna()


def generate_synthetic_data(n_per_class: int = 500) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_STATE)

    def sample(ranges, n):
        return {k: rng.uniform(lo, hi, n) for k, (lo, hi) in ranges.items()}

    classes = {
        "low": {
            "rainfall": (50, 120), "soil_moisture": (0.0, 0.35),
            "slope_angle": (5, 22), "proximity_to_water": (0.8, 2.0), "humidity": (30, 65),
        },
        "medium": {
            "rainfall": (80, 180), "soil_moisture": (0.25, 0.60),
            "slope_angle": (15, 38), "proximity_to_water": (0.4, 1.5), "humidity": (70, 90),
        },
        "high": {
            "rainfall": (150, 260), "soil_moisture": (0.55, 0.85),
            "slope_angle": (28, 52), "proximity_to_water": (0.1, 1.0), "humidity": (75, 94),
        },
        "critical": {
            "rainfall": (230, 300), "soil_moisture": (0.78, 1.0),
            "slope_angle": (38, 60), "proximity_to_water": (0.0, 0.6), "humidity": (85, 100),
        },
    }

    frames = []
    for label, ranges in classes.items():
        df = pd.DataFrame(sample(ranges, n_per_class))
        df["risk_level"] = label
        frames.append(df)

    return pd.concat(frames, ignore_index=True).sample(frac=1, random_state=RANDOM_STATE)


def get_training_data() -> pd.DataFrame:
    if CSV_V2_PATH.exists() or CSV_V1_PATH.exists():
        return load_from_csv()

    print("[Data] CSV not found. Fetching labeled rows from database...")
    try:
        df = load_from_db()
        print(f"[Data] Found {len(df)} labeled rows.")
    except Exception as e:
        print(f"[Data] DB fetch failed: {e}")
        df = pd.DataFrame()

    if len(df) < MIN_LABELED_ROWS:
        print(f"[Data] Insufficient labeled data (< {MIN_LABELED_ROWS} rows). Using synthetic data.")
        df = generate_synthetic_data()
        print(f"[Data] Generated {len(df)} synthetic rows.")
    else:
        print("[Data] Using database data for training.")

    return df


# --- Training -----------------------------------------------------

def train_and_evaluate(df: pd.DataFrame):
    X = df[FEATURES].values
    y = df["risk_level"].values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )

    models = {
        "KNN (k=5)": Pipeline([
            ("scaler", StandardScaler()),
            ("clf",    KNeighborsClassifier(n_neighbors=5)),
        ]),
        "Random Forest (n=100)": Pipeline([
            ("scaler", StandardScaler()),
            ("clf",    RandomForestClassifier(n_estimators=100, random_state=RANDOM_STATE)),
        ]),
    }

    results = {}
    for name, model in models.items():
        print(f"\n{'-' * 50}")
        print(f"Training: {name}")
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        print(f"Accuracy: {acc:.4f}")
        print(classification_report(y_test, y_pred))
        results[name] = (acc, model)

    return results


def select_and_save(results: dict):
    best_name, (best_acc, best_model) = max(results.items(), key=lambda x: x[1][0])

    print(f"\n{'=' * 50}")
    for name, (acc, _) in results.items():
        marker = " <- SELECTED" if name == best_name else ""
        print(f"  {name}: accuracy={acc:.4f}{marker}")
    print(f"{'=' * 50}")
    print(f"\n[Model] Saving '{best_name}' to {MODEL_PATH}")

    joblib.dump(best_model, MODEL_PATH)
    print("[Model] Saved successfully.")


# --- Main ---------------------------------------------------------

if __name__ == "__main__":
    df = get_training_data()
    results = train_and_evaluate(df)
    select_and_save(results)
