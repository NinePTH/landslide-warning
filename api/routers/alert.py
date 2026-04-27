import os
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from routers.prediction import get_latest_prediction

router = APIRouter()

DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

# Embed sidebar colors — match the dashboard's earth palette.
RISK_COLORS = {
    "low":    0x7D9B76,  # sage
    "medium": 0xD9A441,  # amber
    "high":   0xC4633A,  # terracotta
}


class AlertBody(BaseModel):
    message: Optional[str] = None


@router.post("/alert")
async def post_alert(body: AlertBody = AlertBody()):
    """Send a Discord webhook notification.

    If `message` is omitted, auto-generates a rich embed from the latest prediction.
    """
    if not DISCORD_WEBHOOK_URL:
        raise HTTPException(status_code=503, detail="DISCORD_WEBHOOK_URL not configured.")

    if body.message:
        payload: dict = {"content": body.message}
    else:
        try:
            latest = get_latest_prediction()
        except HTTPException as e:
            raise HTTPException(
                status_code=e.status_code,
                detail=f"Cannot auto-generate alert: {e.detail}",
            )

        risk    = (latest.get("risk_level") or "unknown").lower()
        station = latest.get("station_id", "—")
        ts      = latest.get("time", "—")

        payload = {
            "embeds": [
                {
                    "title":       "Landslide Warning",
                    "description": f"Risk level: **{risk.upper()}**",
                    "color":       RISK_COLORS.get(risk, 0x5E8AA6),
                    "fields": [
                        {"name": "Station",       "value": str(station), "inline": True},
                        {"name": "Time",          "value": str(ts),      "inline": True},
                        {"name": "​",        "value": "​",     "inline": True},
                        {"name": "Humidity",      "value": f"{latest.get('humidity')} %",      "inline": True},
                        {"name": "Soil Moisture", "value": f"{latest.get('soil_moisture')} %", "inline": True},
                        {"name": "Rainfall",      "value": f"{latest.get('rainfall')} mm",     "inline": True},
                    ],
                    "footer": {"text": "Landslide Warning · Field Station"},
                }
            ]
        }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(DISCORD_WEBHOOK_URL, json=payload)

    if not resp.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"Discord webhook error ({resp.status_code}): {resp.text}",
        )

    return {"ok": True, "detail": "Alert sent.", "discord_status": resp.status_code}
