"""
Prediction utility — loads model.pkl and classifies sensor readings.

ML features: rainfall, soil_moisture, slope_angle, proximity_to_water, humidity
Output: risk_level — 'low' / 'medium' / 'high' / 'critical'

The model is a sklearn Pipeline (StandardScaler + classifier), so feature
scaling is applied automatically. No rule-based layer — the model decides.

As a module:
    from ml.predict import predict_risk
    risk = predict_risk(150.0, 0.7, 35.0, 0.5, humidity=85.0)

From the command line (run from api/):
    python ml/predict.py <rainfall> <soil_moisture> <slope_angle> <proximity_to_water> <humidity>
    python ml/predict.py 150.0 0.7 35.0 0.5 85.0
"""

import sys
from pathlib import Path
from typing import Optional

import joblib
import numpy as np

MODEL_PATH       = Path(__file__).parent / "model.pkl"
HUMIDITY_DEFAULT = 65.0   # used when sensor value is absent

_model = None


def load_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            class _FallbackModel:
                def predict(self, X):
                    return np.array(["low"] * np.asarray(X).shape[0])

            print(f"[WARN] Model not found at {MODEL_PATH}. Using fallback (always 'low'). Run train_model.py.")
            _model = _FallbackModel()
        else:
            _model = joblib.load(MODEL_PATH)
    return _model


def predict_risk(
    rainfall: float,
    soil_moisture: float,
    slope_angle: float,
    proximity_to_water: float,
    humidity: Optional[float] = None,
) -> str:
    """
    Return risk level: 'low', 'medium', 'high', or 'critical'.

    humidity=None is allowed — falls back to a neutral default (65%).
    """
    model = load_model()
    hum = humidity if humidity is not None else HUMIDITY_DEFAULT
    result = model.predict(np.array([[rainfall, soil_moisture, slope_angle, proximity_to_water, hum]]))[0]
    return str(result)


if __name__ == "__main__":
    if len(sys.argv) != 6:
        print("Usage: python ml/predict.py <rainfall> <soil_moisture> <slope_angle> <proximity_to_water> <humidity>")
        print("Example: python ml/predict.py 150.0 0.7 35.0 0.5 85.0")
        sys.exit(1)

    try:
        rainfall, soil_moisture, slope_angle, proximity_to_water, humidity = (
            float(a) for a in sys.argv[1:]
        )
    except ValueError:
        print("Error: all arguments must be numbers.")
        sys.exit(1)

    risk = predict_risk(rainfall, soil_moisture, slope_angle, proximity_to_water, humidity)
    print(f"Risk level: {risk}")
    print(f"  rainfall={rainfall}, soil_moisture={soil_moisture}, slope_angle={slope_angle}, proximity_to_water={proximity_to_water}, humidity={humidity}")
