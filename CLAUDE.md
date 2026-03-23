# Landslide Early Warning System

## Project Overview
IoT-based landslide prediction system using edge computing + machine learning.
Sensors collect environmental data → Raspberry Pi processes and predicts risk → Web dashboard displays results → Telegram alerts when risk is high.

## Hardware
- NodeMCU / Arduino — reads sensors, publishes via MQTT
- Sensors: DHT22 (air humidity), capacitive soil moisture sensor, rain gauge (YL-83)
- Raspberry Pi — edge server, runs all software

## System Architecture
Sensors → MQTT (Mosquitto) → FastAPI → TimescaleDB
                                      ↓
                              ML Model (KNN / Random Forest)
                                      ↓
                         Web Dashboard + Telegram Bot

- Cloudflare Tunnel exposes Raspberry Pi FastAPI to the internet
- Web Dashboard deployed on Vercel (Next.js) or Grafana Cloud

## Folder Structure
```
landslide-warning/
├── CLAUDE.md
├── sensor/             ← Arduino sketch (.ino) สำหรับ NodeMCU
├── api/                ← FastAPI + ML model
├── dashboard/          ← Next.js
└── docker-compose.yml  ← รัน PostgreSQL + Mosquitto ใน local dev
```

## Tech Stack
- Language: Python
- MQTT: Paho-MQTT, Mosquitto broker
- Backend API: FastAPI + SQLAlchemy
- Database: PostgreSQL + TimescaleDB (local on Pi)
- ML: Scikit-learn — KNN (baseline) and Random Forest (comparison)
- Notification: Telegram Bot API
- Dashboard: Next.js on Vercel OR Grafana connected to TimescaleDB
- Tunnel: Cloudflare Tunnel

## Docker (Local Development)
ใช้ Docker แทน Pi ระหว่าง dev ไม่ต้องมี hardware จริง
```yaml
# docker-compose.yml
services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_USER: landslide
      POSTGRES_PASSWORD: landslide
      POSTGRES_DB: landslide_db
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  mosquitto:
    image: eclipse-mosquitto:latest
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf

volumes:
  pgdata:
```

mosquitto.conf:
```
listener 1883
allow_anonymous true
```

รัน dev environment:
```bash
docker compose up -d
```

## Environment Variables (.env)
```
# Database
DATABASE_URL=postgresql://landslide:landslide@localhost:5432/landslide_db

# MQTT
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_TOPIC=landslide/sensors

# Telegram
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# API
API_URL=https://your-cloudflare-tunnel-url.com  ← เปลี่ยนตอน deploy จริง
CORS_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app
```

## Database Schema
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE sensor_readings (
  time          TIMESTAMPTZ   NOT NULL,
  station_id    TEXT          NOT NULL,
  humidity      FLOAT,
  soil_moisture FLOAT,
  rainfall      FLOAT,
  risk_level    TEXT          -- 'low' / 'medium' / 'high'
);

SELECT create_hypertable('sensor_readings', 'time');
```

TimescaleDB retention policy (ป้องกัน SD card เต็ม):
```sql
SELECT add_retention_policy('sensor_readings', INTERVAL '90 days');
```

## MQTT Payload Format
```json
{
  "station_id": "station_01",
  "timestamp": "2026-03-23T10:00:00Z",
  "humidity": 85.2,
  "soil_moisture": 72.4,
  "rainfall": 12.5
}
```

## ML Model
- Input features: humidity, soil_moisture, rainfall
- Output: risk_level — low / medium / high
- Train KNN first as baseline, then Random Forest for comparison
- Save model ที่ดีกว่าเป็น .pkl ไว้ใช้ใน FastAPI

## FastAPI Endpoints
- GET  /readings?station_id=&limit=   ← ดึงข้อมูล sensor ล่าสุด
- GET  /predict                        ← รัน ML และคืน risk level ปัจจุบัน
- GET  /history?from=&to=             ← ดึงข้อมูลย้อนหลัง
- POST /alert                          ← trigger Telegram notification

CORS ต้องรองรับทั้ง localhost และ Vercel domain
URL ทั้งหมดให้อ่านจาก .env

## Dashboard (Next.js)
- แสดง real-time sensor readings ของแต่ละ station
- แสดง risk level ปัจจุบันพร้อม color indicator (green/yellow/red)
- แสดง graph ข้อมูลย้อนหลัง 24 ชั่วโมง
- API URL อ่านจาก .env (NEXT_PUBLIC_API_URL)

## Deployment Flow
1. dev → ทำทุกอย่างในเครื่องตัวเองก่อน ใช้ Docker แทน Pi
2. Pi  → git clone repo ลงบน Pi แล้วรัน FastAPI + TimescaleDB จริง
3. NodeMCU → เปิดไฟล์ใน sensor/ ด้วย Arduino IDE แล้ว upload ลง NodeMCU
4. Vercel → push ขึ้น GitHub แล้ว connect กับ Vercel ตั้ง API URL ใน environment variables

## Key Constraints
- ระบบต้องทำงาน offline ได้: MQTT + DB + ML ทุกอย่างอยู่บน Pi
- Pi SD card wear: ตั้ง retention policy สูงสุด 90 วัน
- Cloudflare Tunnel ใช้เฉพาะตอนต้องการเข้าถึงจากอินเทอร์เน็ต

## Project Scope Notes
- This is a proof of concept / student project
- Sensor set (3 sensors) is a subset of real-world landslide monitoring
- Limitation: no tilt sensor, pore water pressure, or seismic sensor