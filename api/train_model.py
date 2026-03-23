"""
Train KNN and Random Forest models on sensor_readings data.
Saves the better-performing model as model.pkl.

Usage:
    python train_model.py

If fewer than 50 labeled rows exist in the DB, synthetic data is used for training.
"""

import os
import sys
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

load_dotenv()

MODEL_PATH = Path(__file__).parent / "model.pkl"
MIN_LABELED_ROWS = 50
RANDOM_STATE = 42


# ─── Data Loading ─────────────────────────────────────────

def load_from_db() -> pd.DataFrame:
    """Fetch labeled rows from sensor_readings."""
    query = (
        select(
            sensor_readings.c.humidity,
            sensor_readings.c.soil_moisture,
            sensor_readings.c.rainfall,
            sensor_readings.c.risk_level,
        )
        .where(sensor_readings.c.risk_level.isnot(None))
    )
    with engine.connect() as conn:
        result = conn.execute(query)
        rows = result.fetchall()

    df = pd.DataFrame(rows, columns=["humidity", "soil_moisture", "rainfall", "risk_level"])
    return df.dropna()


def generate_synthetic_data(n_per_class: int = 300) -> pd.DataFrame:
    """Generate synthetic labeled data using domain knowledge."""
    rng = np.random.default_rng(RANDOM_STATE)

    def sample(ranges, n):
        return {
            k: rng.uniform(lo, hi, n) for k, (lo, hi) in ranges.items()
        }

    low = sample({"humidity": (30, 60), "soil_moisture": (10, 40), "rainfall": (0, 5)}, n_per_class)
    med = sample({"humidity": (55, 80), "soil_moisture": (35, 65), "rainfall": (5, 20)}, n_per_class)
    high = sample({"humidity": (75, 100), "soil_moisture": (60, 100), "rainfall": (15, 50)}, n_per_class)

    frames = []
    for data, label in [(low, "low"), (med, "medium"), (high, "high")]:
        df = pd.DataFrame(data)
        df["risk_level"] = label
        frames.append(df)

    return pd.concat(frames, ignore_index=True).sample(frac=1, random_state=RANDOM_STATE)


def get_training_data() -> pd.DataFrame:
    print("[Data] Fetching labeled rows from database...")
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
        print("[Data] Using real database data for training.")

    return df


# ─── Training ─────────────────────────────────────────────

def train_and_evaluate(df: pd.DataFrame):
    X = df[["humidity", "soil_moisture", "rainfall"]].values
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
        print(f"\n{'─' * 50}")
        print(f"Training: {name}")
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        print(f"Accuracy: {acc:.4f}")
        print(classification_report(y_test, y_pred, target_names=["high", "low", "medium"]))
        results[name] = (acc, model)

    return results


def select_and_save(results: dict):
    best_name, (best_acc, best_model) = max(results.items(), key=lambda x: x[1][0])

    print(f"\n{'═' * 50}")
    for name, (acc, _) in results.items():
        marker = " ← SELECTED" if name == best_name else ""
        print(f"  {name}: accuracy={acc:.4f}{marker}")
    print(f"{'═' * 50}")
    print(f"\n[Model] Saving '{best_name}' to {MODEL_PATH}")

    joblib.dump(best_model, MODEL_PATH)
    print("[Model] Saved successfully.")


# ─── Main ─────────────────────────────────────────────────

if __name__ == "__main__":
    df = get_training_data()
    results = train_and_evaluate(df)
    select_and_save(results)
