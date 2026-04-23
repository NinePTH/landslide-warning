import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.prediction import get_latest_prediction

router = APIRouter()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")


class AlertBody(BaseModel):
    message: Optional[str] = None


@router.post("/alert")
async def post_alert(body: AlertBody = AlertBody()):
    """Send a Telegram notification. Auto-generates message from latest prediction if not provided."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise HTTPException(status_code=503, detail="Telegram credentials not configured.")

    message = body.message
    if not message:
        try:
            latest  = get_latest_prediction()
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
