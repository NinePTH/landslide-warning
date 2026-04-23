"""
Train KNN and Random Forest models on landslide sensor data.
Saves the better-performing model as ml/model.pkl.

Data priority:
  1. api/ml/landslide_dataset.csv  (real labeled data)
  2. sensor_readings table in DB   (if >= 50 labeled rows)
  3. Synthetic data                (fallback)

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
from sqlalchemy import select

from database import engine, sensor_readings

load_dotenv(Path(__file__).parent.parent / ".env")

CSV_PATH   = Path(__file__).parent / "ml" / "landslide_dataset.csv"
MODEL_PATH = Path(__file__).parent / "ml" / "model.pkl"

FEATURES         = ["rainfall", "soil_moisture", "slope_angle", "proximity_to_water"]
MIN_LABELED_ROWS = 50
RANDOM_STATE     = 42


# --- Data Loading -------------------------------------------------

def load_from_csv() -> pd.DataFrame:
    df = pd.read_csv(CSV_PATH)
    df = df.rename(columns={
        "Rainfall_mm":        "rainfall",
        "Soil_Saturation":    "soil_moisture",
        "Slope_Angle":        "slope_angle",
        "Proximity_to_Water": "proximity_to_water",
        "Landslide":          "risk_level",
    })
    return df[FEATURES + ["risk_level"]].dropna()


def load_from_db() -> pd.DataFrame:
    query = (
        select(
            sensor_readings.c.rainfall,
            sensor_readings.c.soil_moisture,
            sensor_readings.c.risk_level,
        )
        .where(sensor_readings.c.risk_level.isnot(None))
    )
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()

    df = pd.DataFrame(rows, columns=["rainfall", "soil_moisture", "risk_level"])
    # DB data has no slope_angle / proximity_to_water — fill with neutral defaults
    df["slope_angle"]         = 30.0
    df["proximity_to_water"]  = 1.0
    return df[FEATURES + ["risk_level"]].dropna()


def generate_synthetic_data(n_per_class: int = 300) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_STATE)

    def sample(ranges, n):
        return {k: rng.uniform(lo, hi, n) for k, (lo, hi) in ranges.items()}

    no_slide = sample({
        "rainfall": (0, 100), "soil_moisture": (0, 0.4),
        "slope_angle": (0, 25), "proximity_to_water": (1, 3),
    }, n_per_class)
    slide = sample({
        "rainfall": (120, 300), "soil_moisture": (0.5, 1.0),
        "slope_angle": (30, 70), "proximity_to_water": (0, 0.8),
    }, n_per_class)

    frames = []
    for data, label in [(no_slide, 0), (slide, 1)]:
        df = pd.DataFrame(data)
        df["risk_level"] = label
        frames.append(df)

    return pd.concat(frames, ignore_index=True).sample(frac=1, random_state=RANDOM_STATE)


def get_training_data() -> pd.DataFrame:
    if CSV_PATH.exists():
        df = load_from_csv()
        print(f"[Data] Loaded {len(df)} rows from CSV.")
        return df

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
        "KNN (k=5)": KNeighborsClassifier(n_neighbors=5),
        "Random Forest (n=100)": RandomForestClassifier(n_estimators=100, random_state=RANDOM_STATE),
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
