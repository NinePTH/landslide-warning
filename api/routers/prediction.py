import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from database import engine, sensor_readings, row_to_dict
from ml.predict import predict_risk

router = APIRouter()


def get_station_config(station_id: str) -> dict:
    prefix = station_id.upper().replace("-", "_")
    return {
        "slope_angle":        float(os.getenv(f"{prefix}_SLOPE_ANGLE", "30.0")),
        "proximity_to_water": float(os.getenv(f"{prefix}_PROXIMITY_TO_WATER", "1.0")),
    }


def get_latest_prediction(station_id: Optional[str] = None) -> dict:
    """Fetch the latest reading and return it with a predicted risk_level."""
    query = (
        select(sensor_readings)
        .order_by(sensor_readings.c.time.desc())
        .limit(1)
    )
    if station_id:
        query = query.where(sensor_readings.c.station_id == station_id)

    with engine.connect() as conn:
        row = conn.execute(query).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No sensor readings found.")

    data = row_to_dict(row)

    rainfall      = data.get("rainfall")
    soil_moisture = data.get("soil_moisture")
    humidity      = data.get("humidity")

    if any(v is None for v in [rainfall, soil_moisture]):
        raise HTTPException(status_code=422, detail="Latest reading has missing sensor values.")

    sid = data.get("station_id", "station_01")
    config = get_station_config(sid)

    data["slope_angle"]        = config["slope_angle"]
    data["proximity_to_water"] = config["proximity_to_water"]
    data["risk_level"]         = predict_risk(
        rainfall, soil_moisture,
        config["slope_angle"], config["proximity_to_water"],
        humidity,
    )
    return data


@router.get("/predict")
def get_predict(
    station_id: Optional[str] = Query(None, description="Station to predict for"),
):
    """Run ML model on the latest reading and return predicted risk level."""
    return get_latest_prediction(station_id)
