# Development Guide

This guide covers everything needed to run the Landslide Warning System locally without physical hardware.

---

## Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Python | 3.9+ | API backend, MQTT subscriber, ML training |
| Node.js | 18+ | Next.js dashboard |
| Docker + Docker Compose | Latest stable | PostgreSQL (TimescaleDB) + Mosquitto broker |
| mosquitto-clients | Any | `mosquitto_pub` / `mosquitto_sub` for MQTT simulation |
| Arduino IDE | 2.x | NodeMCU firmware (only needed for real hardware) |

**Installing mosquitto-clients (without running the full broker):**

```bash
# Ubuntu / Debian / Raspberry Pi OS
sudo apt install mosquitto-clients

# macOS
brew install mosquitto

# Windows — install the full Mosquitto package from mosquitto.org
# then add C:\Program Files\mosquitto to PATH
```

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone <repo-url>
cd landslide-warning
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in values. For local development the defaults work as-is except for Telegram:

```
DATABASE_URL=postgresql://landslide:landslide@localhost:5432/landslide_db
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_TOPIC=landslide/sensors
TELEGRAM_BOT_TOKEN=          # optional — leave blank to skip alerts
TELEGRAM_CHAT_ID=            # optional
API_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000
```

### 3. Start Docker services

```bash
docker compose up -d
```

This starts:
- **TimescaleDB** on `localhost:5432`
- **Mosquitto MQTT broker** on `localhost:1883`

### 4. Verify services are running

```bash
docker compose ps
```

Expected output: both `postgres` and `mosquitto` show status `Up`.

Check the DB is reachable:

```bash
docker exec -it landslide-warning-postgres-1 psql -U landslide -d landslide_db -c "\dt"
# Returns "Did not find any relations." — that is correct, tables are created on first run
```

Check the broker is reachable:

```bash
mosquitto_sub -h localhost -t landslide/# -v &
mosquitto_pub -h localhost -t landslide/test -m "ping"
# Should print: landslide/test ping
```

---

## Running the MQTT Subscriber

The MQTT subscriber listens for sensor payloads and writes them to TimescaleDB. It also creates the `sensor_readings` table and hypertable on first run.

```bash
cd api
python -m venv .venv

# Activate virtual environment
source .venv/bin/activate         # Linux / macOS
.venv\Scripts\activate            # Windows

pip install -r requirements.txt
python mqtt_subscriber.py
```

Expected startup output:

```
[DB] Table, hypertable, and retention policy ready.
[MQTT] Connecting to localhost:1883...
[MQTT] Connected to localhost:1883
[MQTT] Subscribed to topic: landslide/sensors
```

When a message arrives:

```
[DB] Inserted — station=station_01 time=2026-03-23T10:00:00+00:00 humidity=85.0 soil=72.0 rain=12.5
```

Stop with `Ctrl+C` — the subscriber shuts down gracefully.

---

## Training the ML Model

The training script fetches labeled rows from the database. If fewer than 50 labeled rows exist (the case on a fresh installation), it generates synthetic training data using domain rules.

```bash
cd api
# Ensure virtual environment is activated
python train_model.py
```

Example output:

```
[Data] Fetching labeled rows from database...
[Data] Found 0 labeled rows.
[Data] Insufficient labeled data (< 50 rows). Using synthetic data.
[Data] Generated 900 synthetic rows.

──────────────────────────────────────────────────
Training: KNN (k=5)
Accuracy: 0.9222
              precision    recall  f1-score   support
        high       0.91      0.94      0.93        60
         low       0.94      0.91      0.93        60
      medium       0.92      0.92      0.92        60

──────────────────────────────────────────────────
Training: Random Forest (n=100)
Accuracy: 0.9556
              precision    recall  f1-score   support
        ...

══════════════════════════════════════════════════
  KNN (k=5): accuracy=0.9222
  Random Forest (n=100): accuracy=0.9556 ← SELECTED
══════════════════════════════════════════════════

[Model] Saving 'Random Forest (n=100)' to .../api/model.pkl
[Model] Saved successfully.
```

The better-performing model is saved as `api/model.pkl`. Re-run this script any time you want to retrain (e.g., after accumulating real labeled data in the database).

To test a prediction directly:

```bash
python predict.py 85.0 72.0 15.0    # → Risk level: high
python predict.py 40.0 20.0 1.0     # → Risk level: low
```

---

## Running the FastAPI Backend

```bash
cd api
# Ensure virtual environment is activated and model.pkl exists
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API is available at `http://localhost:8000`.
Interactive docs (Swagger UI): `http://localhost:8000/docs`

### Testing endpoints with curl

```bash
# Latest sensor readings (newest first)
curl "http://localhost:8000/readings?limit=10"

# Latest reading with ML risk prediction
curl "http://localhost:8000/predict"

# Historical data for the past 24 hours
curl "http://localhost:8000/history?from=2026-03-22T00:00:00Z&to=2026-03-23T23:59:59Z"

# Send Telegram alert (requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env)
curl -X POST "http://localhost:8000/alert"

# Send alert with custom message
curl -X POST "http://localhost:8000/alert" \
  -H "Content-Type: application/json" \
  -d '{"message": "Test alert from dev environment"}'
```

---

## Running the Next.js Dashboard

```bash
cd dashboard
npm install          # first time only
npm run dev
```

The dashboard is available at `http://localhost:3000`.

If you need to point the dashboard at a different API URL, edit `dashboard/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Other available commands:

```bash
npm run build    # production build
npm run start    # serve production build (run build first)
npm run lint     # run ESLint
```

---

## Simulating MQTT Sensor Data (no hardware)

Use these commands to inject test data without a NodeMCU. Ensure the MQTT subscriber is running first.

### Single publish (one-shot)

```bash
# Low risk scenario
mosquitto_pub -h localhost -t landslide/sensors -m \
  '{"station_id":"station_01","timestamp":"2026-03-23T10:00:00Z","humidity":40.0,"soil_moisture":20.0,"rainfall":1.0}'

# Medium risk scenario
mosquitto_pub -h localhost -t landslide/sensors -m \
  '{"station_id":"station_01","timestamp":"2026-03-23T10:00:00Z","humidity":68.0,"soil_moisture":50.0,"rainfall":10.0}'

# High risk scenario
mosquitto_pub -h localhost -t landslide/sensors -m \
  '{"station_id":"station_01","timestamp":"2026-03-23T10:00:00Z","humidity":90.0,"soil_moisture":80.0,"rainfall":30.0}'
```

### Continuous simulation (Python script)

Run this to simulate a sensor publishing readings every 30 seconds with gradually increasing values:

```python
import json
import random
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT   = 1883
TOPIC  = "landslide/sensors"

client = mqtt.Client()
client.connect(BROKER, PORT)
client.loop_start()

print(f"Simulating sensor data on {TOPIC} — Ctrl+C to stop")

try:
    while True:
        payload = {
            "station_id": "station_01",
            "timestamp": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
            "humidity":      round(random.uniform(40, 95), 1),
            "soil_moisture": round(random.uniform(10, 90), 1),
            "rainfall":      round(random.uniform(0, 40), 1),
        }
        client.publish(TOPIC, json.dumps(payload))
        print(f"Published: {payload}")
        time.sleep(30)
except KeyboardInterrupt:
    client.loop_stop()
    client.disconnect()
    print("Stopped.")
```

Save this as `simulate.py` and run it with the activated virtual environment:

```bash
python simulate.py
```

---

## Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `connection refused` on port 5432 | PostgreSQL container not running | `docker compose up -d` |
| `connection refused` on port 1883 | Mosquitto container not running | `docker compose up -d` |
| `FileNotFoundError: model.pkl not found` | Training script not run yet | `cd api && python train_model.py` |
| `ModuleNotFoundError: No module named 'fastapi'` | Virtual environment not activated or deps not installed | `source .venv/bin/activate && pip install -r requirements.txt` |
| `503 Telegram credentials not configured` | `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` missing in `.env` | Add the values to `.env`; leave blank to skip Telegram |
| CORS error in browser | `CORS_ORIGINS` in `.env` does not include the frontend origin | Add `http://localhost:3000` to `CORS_ORIGINS` in `.env` and restart the API |
| `ENOTEMPTY: directory not empty` during `npm install` | Windows filesystem timing issue with concurrent npm operations | Re-run `npm install` — it completes cleanly on retry |
| `[DB] Table, hypertable, and retention policy ready.` but subscriber crashes immediately | `DATABASE_URL` in `.env` is wrong or DB is not yet ready | Verify `.env` values; wait ~5s after `docker compose up` and retry |
| `[DHT] Read error — skipping publish` in subscriber | Subscriber received a payload where `humidity` is NaN or null | Normal for malformed payloads; fix the sensor sketch or simulation data |
| `psycopg2.OperationalError: could not connect to server` | PostgreSQL container not ready or wrong credentials | Check `docker compose ps`; credentials must match `.env` defaults |
| `paho.mqtt.client: Disconnected` loop | Mosquitto not running or wrong `MQTT_BROKER` address | Ensure Mosquitto is up; check `MQTT_BROKER=localhost` in `.env` |
