# Development Guide

This guide covers everything needed to run the Landslide Warning System locally without physical hardware.

---

## Quick Start

Complete these steps in order. Each section below explains them in more detail.

### One-time setup

**Phase 1 — no Docker needed:**

```bash
# 1. Copy environment configs
cp .env.example .env
cp dashboard/.env.example dashboard/.env.local

# 2. Set up Python virtual environment and install dependencies
cd api
python -m venv .venv
source .venv/Scripts/activate   # Windows (Git Bash)
# source .venv/bin/activate     # Linux / macOS
pip install -r requirements.txt
cd ..

# 3. Install dashboard dependencies
cd dashboard
npm install
cd ..
```

**Phase 2 — requires Docker (start Docker Desktop first):**

```bash
# 4. Start containers temporarily to initialise the database
docker compose up -d

# 5. Train the ML model
cd api
source .venv/Scripts/activate   # Windows (Git Bash)
python train_model.py
cd ..

# 6. Stop containers — they will be restarted properly in Terminal 1
docker compose down
```

### Running the project (4 terminals)

Start each in a separate terminal window from the project root:

**Terminal 1 — Infrastructure**
```bash
docker compose up
```
Wait until both `postgres` and `mosquitto` show `Started`.

**Terminal 2 — MQTT Subscriber** (writes sensor data to DB)
```bash
cd api
source .venv/Scripts/activate   # Windows (Git Bash)
python mqtt_subscriber.py
```
Wait for: `[MQTT] Subscribed to topic: landslide/sensors`

**Terminal 3 — FastAPI backend**
```bash
cd api
source .venv/Scripts/activate   # Windows (Git Bash)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
Wait for: `Application startup complete.`

**Terminal 4 — Next.js dashboard**
```bash
cd dashboard
npm run dev
```
Wait for: `Ready in ...ms`

Open **http://localhost:3000** to see the dashboard.
Open **http://localhost:8000/docs** for the interactive API docs.

### Inject test data (no NodeMCU needed)

With all 4 services running, publish some readings using Python (no extra tools needed):

```bash
cd api
source .venv/Scripts/activate   # Windows (Git Bash)
python -c "
import paho.mqtt.client as mqtt, json, time
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect('localhost', 1883)
client.loop_start()
msgs = [
    {'station_id':'station_01','timestamp':'2026-04-12T10:00:00Z','humidity':85.0,'soil_moisture':72.0,'rainfall':15.0},
    {'station_id':'station_01','timestamp':'2026-04-12T10:00:30Z','humidity':40.0,'soil_moisture':20.0,'rainfall':1.0},
    {'station_id':'station_01','timestamp':'2026-04-12T10:01:00Z','humidity':68.0,'soil_moisture':50.0,'rainfall':10.0},
]
for m in msgs: client.publish('landslide/sensors', json.dumps(m)); print('Published:', m['humidity'])
time.sleep(1); client.disconnect()
"
```

The dashboard refreshes every 30 seconds automatically, or reload the page to see data immediately.

### Stopping everything

`Ctrl+C` in each terminal, then stop the containers:

```bash
docker compose down
```

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

### 3. Create dashboard environment file

```bash
cp dashboard/.env.example dashboard/.env.local
```

The default value (`NEXT_PUBLIC_API_URL=http://localhost:8000`) works for local development as-is.

### 4. Start Docker services

```bash
docker compose up
```

This starts:
- **TimescaleDB** on `localhost:5432`
- **Mosquitto MQTT broker** on `localhost:1883`

> Add `-d` (`docker compose up -d`) to run containers in the background without log output.

### 5. Verify services are running

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

> If you completed the Quick Start setup, the venv and dependencies already exist — skip the creation steps below and just activate then run.

```bash
cd api
python -m venv .venv              # skip if already created
source .venv/Scripts/activate     # Windows (Git Bash)
# source .venv/bin/activate       # Linux / macOS
pip install -r requirements.txt   # skip if already installed
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

--------------------------------------------------
Training: KNN (k=5)
Accuracy: 0.9222
              precision    recall  f1-score   support
        high       0.91      0.94      0.93        60
         low       0.94      0.91      0.93        60
      medium       0.92      0.92      0.92        60

--------------------------------------------------
Training: Random Forest (n=100)
Accuracy: 0.9556
              precision    recall  f1-score   support
        ...

==================================================
  KNN (k=5): accuracy=0.9222
  Random Forest (n=100): accuracy=0.9556 <- SELECTED
==================================================

[Model] Saving 'Random Forest (n=100)' to .../api/model.pkl
[Model] Saved successfully.
```

> **Note:** On a fresh install with synthetic data, both models may score 1.0000 accuracy because the generated ranges are non-overlapping. This is expected — accuracy will drop to a more realistic level once real sensor data is used for training.

The better-performing model is saved as `api/model.pkl`. Re-run this script any time you want to retrain (e.g., after accumulating real labeled data in the database).

To test a prediction directly:

```bash
python ml/predict.py 85.0 72.0 15.0
# Risk level: high
#   humidity=85.0, soil_moisture=72.0, rainfall=15.0

python ml/predict.py 40.0 20.0 1.0
# Risk level: low
#   humidity=40.0, soil_moisture=20.0, rainfall=1.0
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
cp .env.example .env.local   # first time only — if not already created
npm install                  # first time only
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

**Option A — using mosquitto_pub** (requires mosquitto-clients installed):

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

**Option B — using Python** (no extra tools needed, works on Windows):

```bash
cd api
source .venv/Scripts/activate   # Windows (Git Bash)
# source .venv/bin/activate     # Linux / macOS
python -c "
import paho.mqtt.client as mqtt, json, time
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.connect('localhost', 1883)
client.loop_start()
msgs = [
    {'station_id':'station_01','timestamp':'2026-03-23T10:00:00Z','humidity':40.0,'soil_moisture':20.0,'rainfall':1.0},
    {'station_id':'station_01','timestamp':'2026-03-23T10:00:30Z','humidity':68.0,'soil_moisture':50.0,'rainfall':10.0},
    {'station_id':'station_01','timestamp':'2026-03-23T10:01:00Z','humidity':90.0,'soil_moisture':80.0,'rainfall':30.0},
]
for m in msgs: client.publish('landslide/sensors', json.dumps(m)); print('Published:', m['humidity'])
time.sleep(1); client.disconnect()
"
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

# paho-mqtt 2.x requires CallbackAPIVersion to avoid a DeprecationWarning
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
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
| `FATAL: password authentication failed` on port 5432 | Another PostgreSQL instance is already running on port 5432 (e.g. a native install) | Change the port mapping in `docker-compose.yml` to `"5433:5432"` and update `DATABASE_URL` in `.env` to use port `5433` |
| `connection refused` on port 1883 | Mosquitto container not running | `docker compose up -d` |
| `DeprecationWarning: Callback API version 1 is deprecated` | paho-mqtt 2.x changed its client API | Harmless warning; the subscriber still works. Suppress with `mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)` if needed |
| `[WinError 10013] An attempt was made to access a socket in a way forbidden by its access permissions` on port 8000 | Port 8000 already in use by a previous uvicorn process | Find the PID: `powershell "Get-NetTCPConnection -LocalPort 8000 \| Select-Object -ExpandProperty OwningProcess"` then kill it: `powershell "Stop-Process -Id <PID> -Force"` |
| `⨯ Another next dev server is already running` on port 3000 | Port 3000 already occupied by a previous `npm run dev` | Next.js prints the exact command to run — e.g. `taskkill /PID 22060 /F` — copy and run it, then retry `npm run dev` |
| `FileNotFoundError: model.pkl not found` | Training script not run yet | `cd api && python train_model.py` |
| `ModuleNotFoundError: No module named 'fastapi'` | Virtual environment not activated or deps not installed | `source .venv/bin/activate && pip install -r requirements.txt` |
| `503 Telegram credentials not configured` | `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` missing in `.env` | Add the values to `.env`; leave blank to skip Telegram |
| CORS error in browser | `CORS_ORIGINS` in `.env` does not include the frontend origin | Add `http://localhost:3000` to `CORS_ORIGINS` in `.env` and restart the API |
| `ENOTEMPTY: directory not empty` during `npm install` | Windows filesystem timing issue with concurrent npm operations | Re-run `npm install` — it completes cleanly on retry |
| `[DB] Table, hypertable, and retention policy ready.` but subscriber crashes immediately | `DATABASE_URL` in `.env` is wrong or DB is not yet ready | Verify `.env` values; wait ~5s after `docker compose up` and retry |
| `[DHT] Read error — skipping publish` in subscriber | Subscriber received a payload where `humidity` is NaN or null | Normal for malformed payloads; fix the sensor sketch or simulation data |
| `psycopg2.OperationalError: could not connect to server` | PostgreSQL container not ready or wrong credentials | Check `docker compose ps`; credentials must match `.env` defaults |
| `paho.mqtt.client: Disconnected` loop | Mosquitto not running or wrong `MQTT_BROKER` address | Ensure Mosquitto is up; check `MQTT_BROKER=localhost` in `.env` |
