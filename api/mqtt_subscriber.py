import json
import os
import signal
import sys
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from sqlalchemy import insert

from database import engine, init_db, sensor_readings

load_dotenv()

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
MQTT_TOPIC  = os.getenv("MQTT_TOPIC", "landslide/sensors")


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(MQTT_TOPIC)
        print(f"[MQTT] Subscribed to topic: {MQTT_TOPIC}")
    else:
        print(f"[MQTT] Connection failed, rc={rc}")


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
            "risk_level":    None,  # filled later by ML model
        }
    except KeyError as e:
        print(f"[MQTT] Missing required field {e} in payload: {payload}")
        return

    with engine.connect() as conn:
        conn.execute(insert(sensor_readings).values(row))
        conn.commit()

    print(
        f"[DB] Inserted — station={row['station_id']} "
        f"time={ts.isoformat()} "
        f"humidity={row['humidity']} "
        f"soil={row['soil_moisture']} "
        f"rain={row['rainfall']}"
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
