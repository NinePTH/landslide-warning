from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from database import engine, sensor_readings, row_to_dict

router = APIRouter()


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

    return [row_to_dict(r) for r in rows]


@router.get("/history")
def get_history(
    from_: Optional[str] = Query(None, alias="from", description="Start datetime (ISO 8601)"),
    to: Optional[str] = Query(None, description="End datetime (ISO 8601)"),
    station_id: Optional[str] = Query(None, description="Filter by station ID"),
):
    """Return sensor readings within a time range, oldest first."""
    query = select(sensor_readings).order_by(sensor_readings.c.time.asc())

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

    return [row_to_dict(r) for r in rows]
