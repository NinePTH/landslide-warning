import os
from datetime import datetime
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


def attach_current_risk(row: dict) -> dict:
    """Recalculate risk from the stored sensor values so history stays current."""
    rainfall = row.get("rainfall")
    soil_moisture = row.get("soil_moisture")
    humidity = row.get("humidity")

    if rainfall is None or soil_moisture is None:
        return row

    config = get_station_config(row.get("station_id", "station_01"))
    row["slope_angle"] = config["slope_angle"]
    row["proximity_to_water"] = config["proximity_to_water"]
    row["risk_level"] = predict_risk(
        rainfall,
        soil_moisture / 100.0,
        config["slope_angle"],
        config["proximity_to_water"],
        humidity,
    )
    return row


@router.get("/readings")
def get_readings(
    station_id: Optional[str] = Query(None, description="Filter by station ID"),
    limit: int = Query(50, ge=1, le=1000, description="Max rows to return"),
):
    """Return the most recent sensor readings, newest first."""
    query = select(sensor_readings).order_by(sensor_readings.c.time.desc()).limit(limit)
    if station_id:
        query = query.where(sensor_readings.c.station_id == station_id)

    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()

    return [attach_current_risk(row_to_dict(r)) for r in rows]


@router.get("/history")
def get_history(
    from_: Optional[str] = Query(None, alias="from", description="Start datetime (ISO 8601)"),
    to: Optional[str] = Query(None, description="End datetime (ISO 8601)"),
    station_id: Optional[str] = Query(None, description="Filter by station ID"),
    limit: int = Query(10000, ge=1, le=100000, description="Max rows to return"),
):
    """Return sensor readings within a time range, oldest first."""
    query = select(sensor_readings).order_by(sensor_readings.c.time.asc()).limit(limit)

    if from_:
        try:
            dt_from = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid 'from' datetime: {from_}")
        query = query.where(sensor_readings.c.time >= dt_from)

    if to:
        try:
            dt_to = datetime.fromisoformat(to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid 'to' datetime: {to}")
        query = query.where(sensor_readings.c.time <= dt_to)

    if station_id:
        query = query.where(sensor_readings.c.station_id == station_id)

    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()

    return [attach_current_risk(row_to_dict(r)) for r in rows]
