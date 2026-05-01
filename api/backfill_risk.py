"""One-time script: compute risk_level for every DB row where it is NULL."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select, update

load_dotenv(Path(__file__).parent.parent / ".env")

from database import engine, sensor_readings  # noqa: E402 — must load .env first
from ml.predict import predict_risk            # noqa: E402


def get_station_config(station_id: str) -> tuple[float, float]:
    prefix = station_id.upper().replace("-", "_")
    slope = float(os.getenv(f"{prefix}_SLOPE_ANGLE", "30.0"))
    prox  = float(os.getenv(f"{prefix}_PROXIMITY_TO_WATER", "1.0"))
    return slope, prox


def main():
    query = select(sensor_readings).where(sensor_readings.c.risk_level == None)  # noqa: E711
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()

    print(f"Found {len(rows)} rows with null risk_level")
    updated = 0

    with engine.connect() as conn:
        for row in rows:
            d = dict(row._mapping)
            rainfall      = d.get("rainfall")
            soil_moisture = d.get("soil_moisture")
            humidity      = d.get("humidity")

            if any(v is None for v in [rainfall, soil_moisture, humidity]):
                continue

            slope, prox = get_station_config(d["station_id"])
            risk = predict_risk(rainfall, soil_moisture / 100.0, slope, prox, humidity)

            conn.execute(
                update(sensor_readings)
                .where(sensor_readings.c.time == d["time"])
                .where(sensor_readings.c.station_id == d["station_id"])
                .values(risk_level=risk)
            )
            updated += 1

        conn.commit()

    print(f"Backfilled {updated} rows")


if __name__ == "__main__":
    main()
