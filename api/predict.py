"""
Prediction utility — loads model.pkl and classifies sensor readings.

As a module:
    from predict import predict_risk
    risk = predict_risk(humidity=85.0, soil_moisture=72.0, rainfall=15.0)

From the command line:
    python predict.py <humidity> <soil_moisture> <rainfall>
    python predict.py 85.0 72.0 15.0
"""

import sys
from pathlib import Path

import joblib
import numpy as np

MODEL_PATH = Path(__file__).parent / "model.pkl"

_model = None


def load_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. Run train_model.py first."
            )
        _model = joblib.load(MODEL_PATH)
    return _model


def predict_risk(humidity: float, soil_moisture: float, rainfall: float) -> str:
    """Return risk level: 'low', 'medium', or 'high'."""
    model = load_model()
    features = np.array([[humidity, soil_moisture, rainfall]])
    return model.predict(features)[0]


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python predict.py <humidity> <soil_moisture> <rainfall>")
        print("Example: python predict.py 85.0 72.0 15.0")
        sys.exit(1)

    try:
        humidity      = float(sys.argv[1])
        soil_moisture = float(sys.argv[2])
        rainfall      = float(sys.argv[3])
    except ValueError:
        print("Error: all arguments must be numbers.")
        sys.exit(1)

    risk = predict_risk(humidity, soil_moisture, rainfall)
    print(f"Risk level: {risk}")
    print(f"  humidity={humidity}, soil_moisture={soil_moisture}, rainfall={rainfall}")
