"""Simulator: 24h backfill + live MQTT stream with periodic storm events.

Phases (live mode):
  CALM     → 90-180 s of low rainfall / dry soil / moderate humidity
  ESCALATE → 30 s ramp into storm conditions
  STORM    → 30-60 s of high rainfall / saturated soil / high humidity
  CALMING  → 30 s ramp back to calm

Backfill seeds the last 24 h with 288 points (one every 5 minutes) and 3 storm events
spaced across the window so the dashboard's history chart has visible peaks at startup.

Usage (run from api/ with the venv activated):
    python simulate.py
"""

import json
import os
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BROKER  = os.getenv("MQTT_BROKER", "localhost")
PORT    = int(os.getenv("MQTT_PORT", 1883))
TOPIC   = os.getenv("MQTT_TOPIC", "landslide/sensors")
STATION = "station_01"

BACKFILL_POINTS    = 288   # 24 h at 5-min intervals
BACKFILL_STORMS    = 3
LIVE_INTERVAL_SECS = 5


def calm_values() -> tuple[float, float, float]:
    """rainfall (mm), soil_moisture (%), humidity (%) — all firmly in low-risk territory."""
    return (
        random.uniform(0, 25),
        random.uniform(10, 35),
        random.uniform(50, 70),
    )


def storm_values() -> tuple[float, float, float]:
    """rainfall (mm), soil_moisture (%), humidity (%) — high-risk spike."""
    return (
        random.uniform(200, 280),
        random.uniform(75, 95),
        random.uniform(85, 98),
    )


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def publish(client: mqtt.Client, ts: datetime, rain: float, soil: float, hum: float) -> None:
    payload = {
        "station_id":    STATION,
        "timestamp":     ts.isoformat(),
        "humidity":      round(hum, 1),
        "soil_moisture": round(soil, 1),
        "rainfall":      round(rain, 1),
    }
    client.publish(TOPIC, json.dumps(payload))


def backfill(client: mqtt.Client) -> None:
    """Send 24 h of synthetic history with a few storm events spaced across the window."""
    now = datetime.now(timezone.utc)
    storm_centers = sorted(random.sample(range(20, BACKFILL_POINTS - 20), BACKFILL_STORMS))

    for i in range(BACKFILL_POINTS, 0, -1):
        t_idx   = BACKFILL_POINTS - i
        nearest = min(storm_centers, key=lambda c: abs(c - t_idx))
        d       = abs(nearest - t_idx)

        if d <= 2:
            rain, soil, hum = storm_values()
        elif d <= 6:
            # smooth ramp into / out of the storm centre
            t = 1 - d / 6
            calm  = calm_values()
            storm = storm_values()
            rain  = lerp(calm[0], storm[0], t)
            soil  = lerp(calm[1], storm[1], t)
            hum   = lerp(calm[2], storm[2], t)
        else:
            rain, soil, hum = calm_values()

        ts = now - timedelta(minutes=5 * i)
        publish(client, ts, rain, soil, hum)
        time.sleep(0.005)  # let mosquitto + subscriber keep up

    print(f"[Sim] Backfilled {BACKFILL_POINTS} points across {len(storm_centers)} storm event(s).")


def live(client: mqtt.Client) -> None:
    """Cycle through CALM → ESCALATE → STORM → CALMING → CALM forever."""
    state         = "CALM"
    ticks_left    = random.randint(18, 36)
    transitions   = {
        "CALM":     ("ESCALATE", 6),
        "ESCALATE": ("STORM",    random.randint(6, 12)),
        "STORM":    ("CALMING",  6),
        "CALMING":  ("CALM",     random.randint(18, 36)),
    }

    print(f"[Sim] → {state} (live, every {LIVE_INTERVAL_SECS}s)")

    while True:
        if state == "CALM":
            rain, soil, hum = calm_values()
        elif state == "ESCALATE":
            t = 1 - ticks_left / 6
            rain = lerp(25, 220, t) + random.uniform(-5, 5)
            soil = lerp(35, 85, t)  + random.uniform(-3, 3)
            hum  = lerp(70, 92, t)  + random.uniform(-2, 2)
        elif state == "STORM":
            rain, soil, hum = storm_values()
        else:  # CALMING
            t = 1 - ticks_left / 6
            rain = lerp(220, 25, t) + random.uniform(-5, 5)
            soil = lerp(85, 35, t)  + random.uniform(-3, 3)
            hum  = lerp(92, 70, t)  + random.uniform(-2, 2)

        publish(client, datetime.now(timezone.utc), max(0, rain), max(0, soil), max(0, hum))
        ticks_left -= 1

        if ticks_left <= 0:
            next_state, next_ticks = transitions[state]
            state, ticks_left = next_state, next_ticks
            # Refresh the random duration for the new state if applicable
            if state == "STORM":
                ticks_left = random.randint(6, 12)
            elif state == "CALM":
                ticks_left = random.randint(18, 36)
            print(f"[Sim] → {state}")

        time.sleep(LIVE_INTERVAL_SECS)


def main() -> None:
    client = mqtt.Client()
    print(f"[Sim] Connecting to {BROKER}:{PORT}...")
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()

    try:
        backfill(client)
        live(client)
    except KeyboardInterrupt:
        print("\n[Sim] Stopped.")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
