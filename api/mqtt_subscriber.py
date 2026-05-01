import json
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from sqlalchemy import insert

from database import engine, init_db, sensor_readings
from ml.predict import predict_risk

load_dotenv(Path(__file__).parent.parent / ".env")

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC  = os.getenv("MQTT_TOPIC", "landslide/sensors")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

# Discord embed colors
RISK_COLORS = {
    "low":      0x7D9B76,  # sage
    "medium":   0xD9A441,  # amber
    "high":     0xC4633A,  # terracotta
    "critical": 0x8B0000,  # dark red
}


def get_station_config(station_id: str) -> tuple[float, float]:
    prefix = station_id.upper().replace("-", "_")
    slope_angle = float(os.getenv(f"{prefix}_SLOPE_ANGLE", "30.0"))
    proximity_to_water = float(os.getenv(f"{prefix}_PROXIMITY_TO_WATER", "1.0"))
    return slope_angle, proximity_to_water


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(MQTT_TOPIC)
        print(f"[MQTT] Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"[MQTT] Connection failed, rc={rc}")


def send_discord_alert(risk_level: str, row: dict):
    """Send critical alert to Discord webhook."""
    if not DISCORD_WEBHOOK_URL or risk_level != "critical":
        return

    try:
        mention = "@here "
        payload = {
            "content": mention,
            "embeds": [
                {
                    "title":       "🚨 CRITICAL LANDSLIDE ALERT 🚨",
                    "description": f"Risk level: **{risk_level.upper()}**",
                    "color":       RISK_COLORS.get(risk_level, 0x5E8AA6),
                    "fields": [
                        {"name": "Station",       "value": str(row.get("station_id", "—")), "inline": True},
                        {"name": "Time",          "value": str(row.get("time", "—")),      "inline": True},
                        {"name": "​",             "value": "​",     "inline": True},
                        {"name": "Humidity",      "value": f"{row.get('humidity')} %",      "inline": True},
                        {"name": "Soil Moisture", "value": f"{row.get('soil_moisture')} %", "inline": True},
                        {"name": "Rainfall",      "value": f"{row.get('rainfall')} mm",     "inline": True},
                    ],
                    "footer": {"text": "Landslide Warning · Field Station"},
                }
            ]
        }

        with httpx.Client(timeout=10.0) as client:
            resp = client.post(DISCORD_WEBHOOK_URL, json=payload)
            if resp.is_success:
                print(f"[DISCORD] Critical alert sent ({resp.status_code})")
            else:
                print(f"[DISCORD] Alert failed ({resp.status_code}): {resp.text}")
    except Exception as e:
        print(f"[DISCORD] Error sending alert: {e}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except json.JSONDecodeError as e:
        print(f"[MQTT] Invalid JSON: {e} — raw: {msg.payload}")
        return

    try:
        ts_raw = payload.get("timestamp")
        if ts_raw:
            # Parse ISO 8601 string; ensure UTC
            ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        else:
            ts = datetime.now(tz=timezone.utc)

        row = {
            "time":          ts,
            "station_id":    payload["station_id"],
            "humidity":      payload.get("humidity"),
            "soil_moisture": payload.get("soil_moisture"),
            "rainfall":      payload.get("rainfall"),
            "risk_level":    None,
        }

        if all(v is not None for v in [row["rainfall"], row["soil_moisture"], row["humidity"]]):
            slope_angle, proximity_to_water = get_station_config(row["station_id"])
            row["risk_level"] = predict_risk(
                row["rainfall"],
                row["soil_moisture"] / 100.0,
                slope_angle,
                proximity_to_water,
                row["humidity"],
            )
    except (KeyError, ValueError) as e:
        print(f"[MQTT] Bad payload ({type(e).__name__}: {e}): {payload}")
        return

    with engine.connect() as conn:
        conn.execute(insert(sensor_readings).values(row))
        conn.commit()

    # Send Discord alert if risk is critical
    if row.get("risk_level") == "critical":
        send_discord_alert(row["risk_level"], row)

    print(
        f"[DB] Inserted — station={row['station_id']} "
        f"time={ts.isoformat()} "
        f"humidity={row['humidity']} "
        f"soil={row['soil_moisture']} "
        f"rain={row['rainfall']} "
        f"risk={row['risk_level']}"
    )


def main():
    init_db()

    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    def handle_shutdown(sig, frame):
        print("\n[MQTT] Shutting down...")
        client.disconnect()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    print(f"[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_forever()


if __name__ == "__main__":
    main()
