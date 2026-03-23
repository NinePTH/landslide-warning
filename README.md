# Landslide Early Warning System

An IoT-based landslide prediction system using edge computing and machine learning. Sensors collect environmental data on a NodeMCU microcontroller, which publishes readings via MQTT to a Raspberry Pi running a FastAPI server, a TimescaleDB time-series database, and a scikit-learn ML model. A Next.js dashboard displays live data and risk levels. Telegram notifications are sent when risk is elevated.

---

## Problem Statement

Landslides cause significant loss of life and infrastructure damage, particularly in mountainous and high-rainfall regions. Early warning systems that monitor soil saturation, humidity, and rainfall can give communities minutes to hours of advance notice. This project is a proof-of-concept for a low-cost, self-hosted early warning station built on commodity IoT hardware.

---

## System Architecture

```
[NodeMCU + Sensors]
        |
        | MQTT (JSON payload, every 30s)
        v
[Mosquitto Broker]
        |
        v
[FastAPI Server]  <---  [ML Model (KNN / Random Forest)]
        |
        v
[TimescaleDB (PostgreSQL)]
        |
        +---> [Next.js Dashboard]  (polls every 30s)
        |
        +---> [Telegram Bot]       (on POST /alert)
```

| Layer | Description |
|---|---|
| Sensors | NodeMCU reads DHT22, soil moisture, and rain gauge; publishes JSON to MQTT |
| MQTT Broker | Mosquitto receives and routes sensor messages |
| Ingestor | `mqtt_subscriber.py` subscribes and writes readings to TimescaleDB |
| API | FastAPI exposes `/readings`, `/predict`, `/history`, `/alert` endpoints |
| ML Model | KNN and Random Forest trained on sensor features; best saved as `model.pkl` |
| Dashboard | Next.js app shows live risk level, sensor values, and 24-hour charts |
| Notifications | Telegram Bot API sends alerts when risk is high |

---

## Hardware Requirements

| Component | Purpose |
|---|---|
| NodeMCU (ESP8266) | Microcontroller — reads sensors and publishes via WiFi/MQTT |
| DHT22 | Measures air temperature and relative humidity |
| Capacitive soil moisture sensor | Measures volumetric soil water content (analog output) |
| Rain gauge YL-83 | Detects rainfall (digital output, LOW = rain detected) |
| Raspberry Pi (any model with WiFi) | Edge server — runs MQTT broker, FastAPI, TimescaleDB, and ML model |

Wiring (default pins, configurable in `sensor/config.h`):

| Sensor | NodeMCU Pin |
|---|---|
| DHT22 data | D4 |
| Soil moisture (analog) | A0 |
| Rain gauge (digital) | D5 |

---

## Software Requirements and Tech Stack

| Component | Technology |
|---|---|
| Microcontroller firmware | Arduino C++ (ESP8266WiFi, PubSubClient, DHT, ArduinoJson, NTPClient) |
| MQTT broker | Eclipse Mosquitto |
| Backend API | Python 3, FastAPI, Uvicorn |
| ORM / DB driver | SQLAlchemy, psycopg2-binary |
| Database | PostgreSQL 15 + TimescaleDB |
| ML | scikit-learn (KNN, Random Forest), joblib, pandas |
| Notifications | Telegram Bot API via httpx |
| Dashboard | Next.js 15, TypeScript, Tailwind CSS, Recharts |
| Tunnel (optional) | Cloudflare Tunnel — exposes Pi API to the internet |
| Local dev environment | Docker + Docker Compose |

---

## Folder Structure

```
landslide-warning/
├── sensor/
│   ├── sensor.ino          Main Arduino sketch — reads sensors, publishes MQTT
│   └── config.example.h    WiFi/MQTT/pin config template (copy to config.h)
│
├── api/
│   ├── database.py         SQLAlchemy engine, sensor_readings table, init_db()
│   ├── mqtt_subscriber.py  MQTT client — subscribes and inserts readings into DB
│   ├── train_model.py      Trains KNN + Random Forest, saves best model as model.pkl
│   ├── predict.py          Loads model.pkl, exposes predict_risk() function
│   ├── main.py             FastAPI app — /readings, /predict, /history, /alert
│   └── requirements.txt    Python dependencies
│
├── dashboard/
│   ├── src/
│   │   ├── app/page.tsx            Main dashboard page (polls every 30s)
│   │   ├── components/
│   │   │   ├── RiskBanner.tsx      Current risk level with color indicator
│   │   │   ├── ReadingsTable.tsx   Latest sensor readings table
│   │   │   ├── HistoryChart.tsx    24-hour Recharts line chart
│   │   │   └── AlertButton.tsx     Telegram alert trigger button
│   │   ├── lib/api.ts              API client (fetch wrappers)
│   │   └── types.ts                Shared TypeScript types
│   └── .env.local                  NEXT_PUBLIC_API_URL
│
├── docker-compose.yml      TimescaleDB + Mosquitto for local development
├── mosquitto.conf          Mosquitto listener config
├── .env.example            Environment variable template
└── .gitignore
```

---

## Quick Start (Local Development with Docker)

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd landslide-warning
cp .env.example .env
# Edit .env — fill in TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID if needed
```

### 2. Start PostgreSQL (TimescaleDB) and Mosquitto

```bash
docker compose up -d
```

### 3. Set up Python environment and install dependencies

```bash
cd api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Train the ML model

```bash
python train_model.py
# Prints accuracy for KNN and Random Forest, saves best model as model.pkl
```

### 5. Start the MQTT subscriber (data ingestor)

```bash
python mqtt_subscriber.py
# Connects to Mosquitto, creates DB table/hypertable, waits for sensor data
```

### 6. Start the FastAPI server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# API docs available at http://localhost:8000/docs
```

### 7. Start the dashboard

```bash
cd ../dashboard
npm install
npm run dev
# Dashboard at http://localhost:3000
```

### 8. (Optional) Publish a test MQTT message

```bash
mosquitto_pub -h localhost -t landslide/sensors \
  -m '{"station_id":"test","timestamp":"2026-03-23T10:00:00Z","humidity":85.0,"soil_moisture":72.0,"rainfall":12.5}'
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://landslide:landslide@localhost:5432/landslide_db` |
| `MQTT_BROKER` | Hostname or IP of the MQTT broker | `localhost` |
| `MQTT_PORT` | MQTT broker port | `1883` |
| `MQTT_TOPIC` | MQTT topic to subscribe/publish to | `landslide/sensors` |
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather | `123456:ABC-DEF...` |
| `TELEGRAM_CHAT_ID` | Chat or group ID to send alerts to | `-100123456789` |
| `API_URL` | Public URL of the FastAPI server (Cloudflare Tunnel URL when deployed) | `https://your-tunnel.trycloudflare.com` |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:3000,https://your-app.vercel.app` |

For the dashboard, also set in `dashboard/.env.local`:

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the FastAPI server (accessible from the browser) | `http://localhost:8000` |

---

## Known Limitations and Future Improvements

### Current Limitations

- **Sensor coverage is limited.** The system uses only three inputs: air humidity, soil moisture, and rainfall. Real-world landslide monitoring also requires tilt sensors, pore water pressure sensors, and seismic sensors for reliable prediction.
- **Rainfall measurement is binary.** The YL-83 rain gauge outputs a digital on/off signal. It does not measure rainfall accumulation in mm/h. A tipping-bucket rain gauge would provide quantitative data.
- **ML model trained on synthetic data by default.** Without a deployed installation collecting labeled data over time, the model trains on rule-based synthetic samples. Accuracy will improve significantly once real labeled readings are available.
- **Single-station support in the dashboard.** The API supports multiple stations via `station_id` filtering, but the dashboard displays data for one station at a time.
- **No authentication.** The API has no authentication layer. It should not be exposed to the public internet without adding API key or OAuth protection.

### Potential Improvements

- Add a tipping-bucket rain gauge for quantitative rainfall measurement
- Add tilt sensors and pore water pressure sensors for more reliable predictions
- Implement multi-station selection in the dashboard
- Add API key authentication to the FastAPI server
- Store ML model metadata (training date, accuracy, feature importance) in the database
- Set up automated retraining when sufficient new labeled data accumulates
- Add push notifications (PWA) in addition to Telegram alerts
- Deploy a Grafana dashboard connected directly to TimescaleDB as an alternative to the Next.js app
