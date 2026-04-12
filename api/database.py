import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, MetaData, Table, Column, Text, Float
from sqlalchemy.dialects.postgresql import TIMESTAMP

load_dotenv(Path(__file__).parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
metadata = MetaData()

sensor_readings = Table(
    "sensor_readings",
    metadata,
    Column("time",          TIMESTAMP(timezone=True), nullable=False),
    Column("station_id",    Text,  nullable=False),
    Column("humidity",      Float, nullable=True),
    Column("soil_moisture", Float, nullable=True),
    Column("rainfall",      Float, nullable=True),
    Column("risk_level",    Text,  nullable=True),
)


def init_db():
    with engine.connect() as conn:
        # Enable TimescaleDB extension
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
        conn.commit()

        # Create table
        metadata.create_all(engine)

        # Convert to hypertable (no-op if already a hypertable)
        conn.execute(text(
            "SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);"
        ))
        conn.commit()

        # Add 90-day retention policy (ignore if already set)
        try:
            conn.execute(text(
                "SELECT add_retention_policy('sensor_readings', INTERVAL '90 days');"
            ))
            conn.commit()
        except Exception:
            conn.rollback()

    print("[DB] Table, hypertable, and retention policy ready.")
