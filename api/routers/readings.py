import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from database import engine, sensor_readings, row_to_dict
from ml.predict import batch_predict_risk

router = APIRouter()

_station_config_cache: dict = {}


def get_station_config(station_id: str) -> dict:
    if station_id not in _station_config_cache:
        prefix = station_id.upper().replace("-", "_")
        _station_config_cache[station_id] = {
            "slope_angle":        float(os.getenv(f"{prefix}_SLOPE_ANGLE", "30.0")),
            "proximity_to_water": float(os.getenv(f"{prefix}_PROXIMITY_TO_WATER", "1.0")),
        }
    return _station_config_cache[station_id]


def attach_risk_batch(rows: list[dict]) -> list[dict]:
    """Recompute risk_level for all rows in one model.predict() call."""
    predictable = []
    indices = []
    for i, row in enumerate(rows):
        if row.get("rainfall") is None or row.get("soil_moisture") is None:
            continue
        config = get_station_config(row.get("station_id", "station_01"))
        row["slope_angle"]        = config["slope_angle"]
        row["proximity_to_water"] = config["proximity_to_water"]
        predictable.append({
            "rainfall":            row["rainfall"],
            "soil_moisture":       row["soil_moisture"] / 100.0,
            "slope_angle":         config["slope_angle"],
            "proximity_to_water":  config["proximity_to_water"],
            "humidity":            row.get("humidity"),
        })
        indices.append(i)

    if predictable:
        risk_levels = batch_predict_risk(predictable)
        for i, risk in zip(indices, risk_levels):
            rows[i]["risk_level"] = risk

    return rows


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

    return attach_risk_batch([row_to_dict(r) for r in rows])


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

    return attach_risk_batch([row_to_dict(r) for r in rows])
