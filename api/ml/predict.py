"""
Prediction utility — loads model.pkl and classifies sensor readings.

ML features: rainfall, soil_moisture, slope_angle, proximity_to_water
Rule-based:  humidity >= 80% elevates risk level

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

MODEL_PATH = Path(__file__).parent / "model.pkl"

_model = None

HUMIDITY_THRESHOLD = 80.0


def load_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model not found at {MODEL_PATH}. Run train_model.py first."
            )
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
    Return risk level: 'low', 'medium', or 'high'.

    ML predicts landslide (0/1) from rainfall, soil_moisture, slope_angle,
    proximity_to_water. Humidity >= 80% elevates the result one level.
    """
    model = load_model()
    ml_result = int(model.predict(np.array([[rainfall, soil_moisture, slope_angle, proximity_to_water]]))[0])

    if humidity is None:
        return "medium" if ml_result == 1 else "low"

    high_humidity = humidity >= HUMIDITY_THRESHOLD
    if ml_result == 1 and high_humidity:
        return "high"
    elif ml_result == 1 or high_humidity:
        return "medium"
    else:
        return "low"


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
