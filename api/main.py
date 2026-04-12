"""
Landslide Warning System — FastAPI Application

Endpoints:
    GET  /readings?station_id=&limit=
    GET  /predict
    GET  /history?from=&to=
    POST /alert

Run:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select

from database import engine, init_db, sensor_readings
from predict import predict_risk

load_dotenv(Path(__file__).parent.parent / ".env")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")]
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")

# ─── App ──────────────────────────────────────────────────

app = FastAPI(title="Landslide Warning API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# ─── Helpers ──────────────────────────────────────────────

def row_to_dict(row) -> dict:
    d = dict(row._mapping)
    if isinstance(d.get("time"), datetime):
        d["time"] = d["time"].isoformat()
    return d


# ─── GET /readings ─────────────────────────────────────────

@app.get("/readings")
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


# ─── GET /predict ──────────────────────────────────────────

@app.get("/predict")
def get_predict(
    station_id: Optional[str] = Query(None, description="Station to predict for"),
):
    """Run ML model on the latest reading and return predicted risk level."""
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

    risk = predict_risk(humidity, soil_moisture, rainfall)
    data["risk_level"] = risk
    return data


# ─── GET /history ──────────────────────────────────────────

@app.get("/history")
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


# ─── POST /alert ───────────────────────────────────────────

class AlertBody(BaseModel):
    message: Optional[str] = None


@app.post("/alert")
async def post_alert(body: AlertBody = AlertBody()):
    """Send a Telegram notification. Auto-generates message from latest prediction if not provided."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise HTTPException(status_code=503, detail="Telegram credentials not configured.")

    message = body.message
    if not message:
        # Auto-generate from latest prediction
        try:
            latest = get_predict()
            risk    = latest.get("risk_level", "unknown")
            station = latest.get("station_id", "unknown")
            ts      = latest.get("time", "")
            message = (
                f"[Landslide Warning]\n"
                f"Station: {station}\n"
                f"Risk Level: {risk.upper()}\n"
                f"Time: {ts}\n"
                f"Humidity: {latest.get('humidity')}%\n"
                f"Soil Moisture: {latest.get('soil_moisture')}%\n"
                f"Rainfall: {latest.get('rainfall')} mm"
            )
        except HTTPException as e:
            raise HTTPException(status_code=e.status_code, detail=f"Cannot auto-generate alert: {e.detail}")

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json=payload)

    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"Telegram API error: {resp.text}")

    return {"ok": True, "detail": "Alert sent.", "telegram_response": resp.json()}
