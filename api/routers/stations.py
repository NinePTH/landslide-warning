from fastapi import APIRouter
from sqlalchemy import select

from database import engine, sensor_readings

router = APIRouter()


@router.get("/stations")
def list_stations() -> list[dict]:
    """Return the distinct station IDs that have ever published a reading.

    Auto-discovers new stations as soon as they hit the DB — no dashboard redeploy needed.
    """
    query = (
        select(sensor_readings.c.station_id)
        .distinct()
        .order_by(sensor_readings.c.station_id.asc())
    )
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()

    return [{"station_id": r[0]} for r in rows]
