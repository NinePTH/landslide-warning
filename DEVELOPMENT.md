# Development Guide

This guide covers everything needed to run the Landslide Warning System locally without physical hardware.

> For a project overview see [README.md](README.md). To deploy on a Raspberry Pi instead, see [DEPLOYMENT.md](DEPLOYMENT.md).

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

The fastest way is the bundled storm-cycle simulator, which also backfills 24 h of history:

```bash
cd api && source .venv/Scripts/activate
python simulate.py
```

It backfills 288 points across the last 24 hours with 3 storm events, then keeps streaming
live readings that cycle through CALM → ESCALATE → STORM → CALMING phases every few
minutes — so the dashboard's risk banner visibly toggles between sage / amber / terracotta.

For one-off publishes (single readings) or alternative recipes, see the
[Simulating MQTT Sensor Data](#simulating-mqtt-sensor-data-no-hardware) section below.

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

Edit `.env` and fill in values. For local development the defaults work as-is — the Discord webhook is optional unless you want `/alert` to actually deliver a message:

```
DATABASE_URL=postgresql://landslide:landslide@localhost:5432/landslide_db
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_TOPIC=landslide/sensors
DISCORD_WEBHOOK_URL=         # optional — leave blank to skip alerts
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

### Features and labels

| Role | Column (CSV) | Internal name | Source at prediction time |
|---|---|---|---|
| Feature | `Rainfall_mm` | `rainfall` | Sensor (rain gauge) |
| Feature | `Soil_Saturation` | `soil_moisture` | Sensor (capacitive) |
| Feature | `Slope_Angle` | `slope_angle` | Fixed in `.env` per station |
| Feature | `Proximity_to_Water` | `proximity_to_water` | Fixed in `.env` per station |
| Label | `Landslide` | `risk_level` | 0 = no landslide, 1 = landslide |

Columns **not** used: `Vegetation_Cover`, `Earthquake_Activity`, `Soil_Type_*`.

**Humidity (DHT22)** is not an ML feature — it is applied as a rule-based layer after the model
predicts 0/1, mapping the combined result to `low / medium / high`:

| ML result | humidity | Final risk level |
|---|---|---|
| 0 | < 80 % | `low` |
| 0 | ≥ 80 % | `medium` |
| 1 | < 80 % | `medium` |
| 1 | ≥ 80 % | `high` |

Data priority when running `train_model.py`:
1. `api/ml/landslide_dataset.csv` — real labeled CSV (used if file exists)
2. `sensor_readings` table in DB — if ≥ 50 labeled rows
3. Synthetic data — fallback

The training script fetches labeled rows from the database. If fewer than 50 labeled rows exist (the case on a fresh installation), it generates synthetic training data using domain rules.

```bash
cd api
# Ensure virtual environment is activated
python train_model.py
```

Example output:

```
[Data] Loaded 2000 rows from CSV.

--------------------------------------------------
Training: KNN (k=5)
Accuracy: 0.9825
...

--------------------------------------------------
Training: Random Forest (n=100)
Accuracy: 1.0000
...

==================================================
  KNN (k=5): accuracy=0.9825
  Random Forest (n=100): accuracy=1.0000 <- SELECTED
==================================================

[Model] Saving 'Random Forest (n=100)' to .../api/ml/model.pkl
[Model] Saved successfully.
```

The better-performing model is saved as `api/ml/model.pkl`. Re-run this script any time you want to retrain (e.g., after accumulating real labeled data in the database).

To test a prediction directly:

```bash
# Args: <rainfall> <soil_moisture> <slope_angle> <proximity_to_water> <humidity>
python ml/predict.py 150.0 0.7 35.0 0.5 85.0
# Risk level: high
#   rainfall=150.0, soil_moisture=0.7, slope_angle=35.0, proximity_to_water=0.5, humidity=85.0

python ml/predict.py 50.0 0.2 10.0 2.0 40.0
# Risk level: low
#   rainfall=50.0, soil_moisture=0.2, slope_angle=10.0, proximity_to_water=2.0, humidity=40.0
```

> **Station config** — `slope_angle` and `proximity_to_water` are fixed geographic properties
> stored in `.env` (e.g. `STATION_01_SLOPE_ANGLE=35.0`). The API looks them up automatically
> by station ID when calling `/predict`.

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

# Send Discord alert (requires DISCORD_WEBHOOK_URL in .env)
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

### Multi-station end-to-end test runbook

The repo ships a ready-to-run simulator at `api/simulate.py`. It first **backfills the
last 24 hours** with 288 points (one every 5 minutes), seeded with 3 storm events spread
across the window so the dashboard's history chart has visible peaks at startup. It then
**live-streams every 5 seconds**, cycling through weather phases:

| Phase      | Duration   | Risk it produces |
|------------|-----------:|------------------|
| `CALM`     | 90–180 s   | low              |
| `ESCALATE` | 30 s       | low -> medium    |
| `STORM`    | 30–60 s    | high             |
| `CALMING`  | 30 s       | medium -> low    |

The redesigned dashboard's risk banner visibly toggles between sage / amber / terracotta
as the storm cycle progresses — useful for demos and for confirming the ML pipeline
reacts end-to-end.

#### Pre-flight (one-time)

- Docker Desktop is running (Windows).
- `api/.venv` exists with deps installed (`pip install -r requirements.txt`).
- `dashboard/node_modules` exists (`npm install`) and `dashboard/.env.local` contains
  `NEXT_PUBLIC_API_URL=http://localhost:8000`.

#### Boot sequence — 6 terminals

```bash
# T1 — services (one-shot, exits after starting containers)
docker compose up -d

# T2 — MQTT subscriber (writes incoming messages into the DB)
cd api && source .venv/Scripts/activate    # Windows; use .venv/bin/activate on Linux/macOS
python mqtt_subscriber.py

# T3 — FastAPI backend
cd api && source .venv/Scripts/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# T4 — simulator for station_01 (default)
cd api && source .venv/Scripts/activate
python simulate.py

# T5 — simulator for station_02
cd api && source .venv/Scripts/activate
python simulate.py station_02

# T6 — dashboard
cd dashboard
npm run dev
```

Each simulator invocation runs an independent state machine, so the dashboard's
regional bar shows `Critical (1 of 2)` whenever one station is in its `STORM` phase
while the other is calm.

#### Sanity check — curl before opening the browser

```bash
curl -s http://localhost:8000/stations
# Expected: [{"station_id":"station_01"},{"station_id":"station_02"}]

curl -s "http://localhost:8000/predict?station_id=station_01" | python -m json.tool
# Expected: JSON with humidity, soil_moisture, rainfall, slope_angle=35.0,
# proximity_to_water=0.5, and a risk_level that changes as the storm cycle advances.
```

#### Expected simulator output

```
[Sim] Station: station_01
[Sim] Connecting to localhost:1883...
[Sim] Backfilled 288 points across 3 storm event(s).
[Sim] -> CALM (live, every 5s)
[Sim] -> ESCALATE
[Sim] -> STORM
[Sim] -> CALMING
```

#### What you should see at http://localhost:3000

- Regional bar at the top: `Critical (1 of 2)` (or `Stable (2 of 2)` between storms).
- Two side-by-side risk banners with station accent stripes (mineral-blue for
  `station_01`, copper for `station_02`).
- History chart with both station overlays plus a metric toggle
  (`Soil Moisture · Rainfall · Humidity`).
- Ledger interleaving rows from both stations with colour-coded badges.

#### Gotchas

1. **Dashboard renders but every panel is empty.** Means the dashboard isn't on port
   3000 — Next.js silently rolls over to 3001 / 3002 if 3000 is already bound (common
   culprits: an IDE preview server, or a zombie from an earlier `npm run dev`). The
   API's `CORS_ORIGINS` defaults to `http://localhost:3000` only, so fetches from
   3001 / 3002 are blocked. Free port 3000 and restart the dashboard:
   ```bash
   netstat -ano | grep -E "LISTEN.*:3000"      # find the PID in the last column
   powershell "Stop-Process -Id <PID> -Force"  # kill it
   cd dashboard && npm run dev                 # should now grab 3000
   ```

2. **Simulator crashes on Windows with `UnicodeEncodeError: 'charmap' codec`.** If the
   simulator was last updated before commit `<this commit>`, its state-transition
   prints used `→` which the Windows `cp1252` console can't encode. The current code
   prints `->` instead. `git pull` and retry.

#### Shutdown

```bash
# In each Tn terminal: Ctrl+C
# Then from the repo root:
docker compose down

# Optional cleanup check:
netstat -ano | grep -E "LISTEN.*:(3000|8000|1883|5433)"
# Expected: no output.
```

#### Adding more stations later

The simulator accepts the station ID as the first positional argument (defaults to
`station_01`). For each new station:

1. Append `STATION_<ID>_SLOPE_ANGLE` and `STATION_<ID>_PROXIMITY_TO_WATER` to `.env`.
2. Restart `uvicorn` (the API reads env vars at request time, but a clean restart
   avoids any stale-cache surprises).
3. Run another `python simulate.py station_<id>` in its own terminal.

The dashboard auto-discovers new stations on its next 30 s poll via `GET /stations`.

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
| `503 DISCORD_WEBHOOK_URL not configured` | `DISCORD_WEBHOOK_URL` missing in `.env` | Add a webhook URL to `.env` (Server Settings → Integrations → Webhooks → New Webhook), or leave blank to skip alerts |
| CORS error in browser | `CORS_ORIGINS` in `.env` does not include the frontend origin | Add `http://localhost:3000` to `CORS_ORIGINS` in `.env` and restart the API |
| `ENOTEMPTY: directory not empty` during `npm install` | Windows filesystem timing issue with concurrent npm operations | Re-run `npm install` — it completes cleanly on retry |
| `[DB] Table, hypertable, and retention policy ready.` but subscriber crashes immediately | `DATABASE_URL` in `.env` is wrong or DB is not yet ready | Verify `.env` values; wait ~5s after `docker compose up` and retry |
| `[DHT] Read error — skipping publish` in subscriber | Subscriber received a payload where `humidity` is NaN or null | Normal for malformed payloads; fix the sensor sketch or simulation data |
| `psycopg2.OperationalError: could not connect to server` | PostgreSQL container not ready or wrong credentials | Check `docker compose ps`; credentials must match `.env` defaults |
| `paho.mqtt.client: Disconnected` loop | Mosquitto not running or wrong `MQTT_BROKER` address | Ensure Mosquitto is up; check `MQTT_BROKER=localhost` in `.env` |
