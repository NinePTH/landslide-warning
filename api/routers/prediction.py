from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from database import engine, sensor_readings, row_to_dict
from ml.predict import predict_risk

router = APIRouter()


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

    humidity      = data.get("humidity")
    soil_moisture = data.get("soil_moisture")
    rainfall      = data.get("rainfall")

    if any(v is None for v in [humidity, soil_moisture, rainfall]):
        raise HTTPException(status_code=422, detail="Latest reading has missing sensor values.")

    data["risk_level"] = predict_risk(humidity, soil_moisture, rainfall)
    return data


@router.get("/predict")
def get_predict(
    station_id: Optional[str] = Query(None, description="Station to predict for"),
):
    """Run ML model on the latest reading and return predicted risk level."""
    return get_latest_prediction(station_id)
