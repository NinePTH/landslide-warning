# Deployment Guide

This guide covers deploying the Landslide Warning System to real hardware: a Raspberry Pi as the edge server, a NodeMCU with sensors in the field, the Next.js dashboard on Vercel, and a Cloudflare Tunnel to expose the API to the internet.

> For a project overview see [README.md](README.md). For local Docker-based development without hardware see [DEVELOPMENT.md](DEVELOPMENT.md).

**Recommended order:**
1. Set up Raspberry Pi (OS, DB, Mosquitto)
2. Clone repo and configure `.env`
3. Train the ML model
4. Configure systemd services
5. Set up Cloudflare Tunnel → get public URL
6. Deploy dashboard to Vercel → get Vercel domain
7. Update `.env` with tunnel URL and Vercel domain, restart services
8. Flash NodeMCU
9. Set up Discord webhook

---

## 1. Raspberry Pi Setup

### 1.1 Operating System

Install **Raspberry Pi OS Lite (64-bit)** using Raspberry Pi Imager. Enable SSH during imaging (Advanced Options → Enable SSH). After first boot:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git python3 python3-pip python3-venv python3-dev build-essential
```

### 1.2 PostgreSQL + TimescaleDB

Install PostgreSQL 15 and the TimescaleDB extension using the official TimescaleDB apt repository:

```bash
sudo apt install -y gnupg postgresql-common apt-transport-https lsb-release wget

sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

echo "deb https://packagecloud.io/timescale/timescaledb/debian/ $(lsb_release -c -s) main" \
  | sudo tee /etc/apt/sources.list.d/timescaledb.list

wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo apt-key add -

sudo apt update
sudo apt install -y timescaledb-2-postgresql-15

sudo timescaledb-tune --quiet --yes
sudo systemctl restart postgresql
```

Create the database and user:

```bash
sudo -u postgres psql <<EOF
CREATE USER landslide WITH PASSWORD 'landslide';
CREATE DATABASE landslide_db OWNER landslide;
GRANT ALL PRIVILEGES ON DATABASE landslide_db TO landslide;
EOF
```

### 1.3 Mosquitto MQTT Broker

```bash
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

Copy the project's Mosquitto config:

```bash
# After cloning the repo (step 2), run:
sudo cp ~/landslide-warning/mosquitto.conf /etc/mosquitto/conf.d/landslide.conf
sudo systemctl restart mosquitto
```

---

## 2. Clone Repository and Configure .env

```bash
cd ~
git clone <your-repo-url> landslide-warning
cd landslide-warning
cp .env.example .env
nano .env
```

Fill in the following values. Use `localhost` for DB and MQTT since both run on the Pi:

```
DATABASE_URL=postgresql://landslide:landslide@localhost:5432/landslide_db

MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_TOPIC=landslide/sensors

DISCORD_WEBHOOK_URL=       # fill in after step 9

API_URL=                   # fill in after step 5 (Cloudflare Tunnel URL)
CORS_ORIGINS=http://localhost:3000   # update after step 6 (add Vercel domain)

# Station config (fixed geographic properties per station)
# Format: <STATION_ID_UPPERCASE>_SLOPE_ANGLE / <STATION_ID_UPPERCASE>_PROXIMITY_TO_WATER
# Add one pair per deployed station. Without these, predictions fall back to defaults
# (slope_angle=30.0, proximity_to_water=1.0), which won't reflect real station geography.
STATION_01_SLOPE_ANGLE=35.0
STATION_01_PROXIMITY_TO_WATER=0.5
STATION_02_SLOPE_ANGLE=42.0
STATION_02_PROXIMITY_TO_WATER=0.3
```

> **Adding a new station later:** append a new pair (e.g. `STATION_03_SLOPE_ANGLE=...`,
> `STATION_03_PROXIMITY_TO_WATER=...`) to `.env`, restart the API service
> (`sudo systemctl restart landslide-api`) so the new env vars load, then flash that
> NodeMCU's `sensor/config.h` with the matching `STATION_ID`. The dashboard discovers
> the new station automatically via `GET /stations` once it publishes its first reading.

---

## 3. Python Environment and ML Model

```bash
cd ~/landslide-warning/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Train the ML model (this generates `api/ml/model.pkl`):

```bash
python train_model.py
# Data source priority: api/ml/landslide_dataset.csv > DB labeled rows (>= 50) > synthetic.
# The CSV is committed in the repo, so a fresh clone trains on it by default.
```

Verify the prediction works:

```bash
python ml/predict.py 150.0 0.7 35.0 0.5 85.0
# Risk level: high
#   rainfall=150.0, soil_moisture=0.7, slope_angle=35.0, proximity_to_water=0.5, humidity=85.0
```

---

## 4. Systemd Services (auto-start on boot)

Create two service files so the API and MQTT subscriber start automatically when the Pi boots.

### 4.1 FastAPI service

```bash
sudo nano /etc/systemd/system/landslide-api.service
```

Paste the following (replace `pi` with your username if different):

```ini
[Unit]
Description=Landslide Warning System — FastAPI
After=network.target postgresql.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/landslide-warning/api
EnvironmentFile=/home/pi/landslide-warning/.env
ExecStart=/home/pi/landslide-warning/api/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 4.2 MQTT subscriber service

```bash
sudo nano /etc/systemd/system/landslide-mqtt.service
```

```ini
[Unit]
Description=Landslide Warning System — MQTT Subscriber
After=network.target mosquitto.service postgresql.service landslide-api.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/landslide-warning/api
EnvironmentFile=/home/pi/landslide-warning/.env
ExecStart=/home/pi/landslide-warning/api/.venv/bin/python mqtt_subscriber.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 4.3 Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable landslide-api landslide-mqtt
sudo systemctl start landslide-api landslide-mqtt
```

Check status:

```bash
sudo systemctl status landslide-api
sudo systemctl status landslide-mqtt

# Follow logs in real time
sudo journalctl -u landslide-api -f
sudo journalctl -u landslide-mqtt -f
```

---

## 5. Cloudflare Tunnel

Cloudflare Tunnel exposes the FastAPI server (port 8000) to the internet without opening a port on your router.

### 5.1 Install cloudflared

```bash
# For Raspberry Pi (arm64)
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared-linux-arm64.deb
```

### 5.2 Authenticate and create tunnel

```bash
cloudflared tunnel login
# Opens a browser link — visit it and authorize your Cloudflare account

cloudflared tunnel create landslide
# Note the tunnel UUID printed — you will need it in the config
```

### 5.3 Create tunnel config

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: <your-tunnel-uuid>
credentials-file: /home/pi/.cloudflared/<your-tunnel-uuid>.json

ingress:
  - service: http://localhost:8000
```

Test the tunnel manually:

```bash
cloudflared tunnel run landslide
# Look for: "Registered tunnel connection" and note the public URL (*.trycloudflare.com or your domain)
```

### 5.4 Install as a system service

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 5.5 Update .env with the tunnel URL

```bash
nano ~/landslide-warning/.env
```

Set:

```
API_URL=https://<your-tunnel-subdomain>.trycloudflare.com
```

Restart the API service to reload the env:

```bash
sudo systemctl restart landslide-api
```

---

## 6. Deploy Next.js Dashboard to Vercel

### 6.1 Push the repository to GitHub

Ensure your repo is pushed to GitHub (or GitLab / Bitbucket). The `dashboard/` directory must be present.

### 6.2 Create a new Vercel project

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New Project** → import your GitHub repository
3. When asked for the **Root Directory**, set it to `dashboard`
4. Framework preset will auto-detect as **Next.js**

### 6.3 Set environment variables

In the Vercel project settings under **Environment Variables**, add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Cloudflare Tunnel URL (e.g. `https://xxx.trycloudflare.com`) |

### 6.4 Deploy

Click **Deploy**. Vercel will build and publish the dashboard. Note the assigned Vercel domain (e.g. `your-app.vercel.app`).

### 6.5 Update CORS on the Pi

Add the Vercel domain to `CORS_ORIGINS` in `.env`:

```bash
nano ~/landslide-warning/.env
```

```
CORS_ORIGINS=https://your-app.vercel.app
```

Restart the API:

```bash
sudo systemctl restart landslide-api
```

---

## 7. Flash NodeMCU with Arduino IDE

### 7.1 Install Arduino IDE

Download and install [Arduino IDE 2.x](https://www.arduino.cc/en/software) on your development machine (not the Pi).

### 7.2 Add ESP8266 board support

1. Open Arduino IDE → **File** → **Preferences**
2. In **Additional boards manager URLs**, add:
   ```
   http://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Open **Tools** → **Board** → **Boards Manager**, search for `esp8266`, install **esp8266 by ESP8266 Community**

### 7.3 Install required libraries

Open **Tools** → **Manage Libraries** and install:

| Library | Author |
|---|---|
| PubSubClient | Nick O'Leary |
| DHT sensor library | Adafruit |
| ArduinoJson | Benoit Blanchon |
| NTPClient | Fabrice Weinberg |

### 7.4 Configure the sketch

Copy the config template and fill in your values:

```bash
# In the sensor/ directory on your development machine:
cp sensor/config.example.h sensor/config.h
```

Edit `sensor/config.h`:

```cpp
#define WIFI_SSID      "your_wifi_network_name"
#define WIFI_PASSWORD  "your_wifi_password"
#define MQTT_BROKER    "192.168.1.x"    // Pi's local IP address
#define MQTT_PORT      1883
#define MQTT_TOPIC     "landslide/sensors"
#define STATION_ID     "station_01"     // unique name for this station
```

To find the Pi's local IP:

```bash
# On the Pi:
hostname -I
```

**Soil moisture calibration** — measure your sensor's raw ADC values:
- Place sensor in dry air → read `analogRead(A0)` → set as `SOIL_DRY_RAW`
- Submerge sensor in water → read `analogRead(A0)` → set as `SOIL_WET_RAW`

Default values (adjust for your sensor):

```cpp
#define SOIL_DRY_RAW   1023
#define SOIL_WET_RAW   300
```

### 7.5 Upload to NodeMCU

1. Connect NodeMCU via USB
2. **Tools** → **Board** → **ESP8266 Boards** → **NodeMCU 1.0 (ESP-12E Module)**
3. **Tools** → **Port** → select the COM port (Windows: `COM3`, macOS/Linux: `/dev/ttyUSB0`)
4. Open `sensor/sensor.ino`
5. Click **Upload** (right arrow button)

### 7.6 Verify with Serial Monitor

1. **Tools** → **Serial Monitor** → set baud rate to **115200**
2. Expected output after successful connection:

```
[WiFi] Connecting to your_wifi_network_name
......
[WiFi] Connected, IP: 192.168.1.xxx
[MQTT] Connecting to 192.168.1.x... connected.
[System] Ready.
[MQTT] Published: {"station_id":"station_01","timestamp":"2026-03-23T10:00:00Z","humidity":65.3,"soil_moisture":42.0,"rainfall":0.0}
```

---

## 8. Discord Webhook Setup

### 8.1 Create a webhook in your Discord server

1. Open the Discord server (or create one) where alerts should land.
2. Choose the channel that should receive alerts → **Edit Channel** (gear icon).
3. **Integrations** → **Webhooks** → **New Webhook**.
4. Give it a name (e.g. `Landslide Warning`) and optionally an avatar.
5. Click **Copy Webhook URL** — keep it secret; anyone with the URL can post to that channel.

The URL looks like `https://discord.com/api/webhooks/<id>/<token>`.

### 8.2 Update .env on the Pi

```bash
nano ~/landslide-warning/.env
```

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789/abcdef...
```

Restart the API service:

```bash
sudo systemctl restart landslide-api
```

### 8.3 Test the alert

```bash
curl -X POST https://<your-tunnel-url>/alert
# Expected: {"ok":true,"detail":"Alert sent.","discord_status":204}
```

A rich-embed card should appear in the Discord channel with the current risk level, station ID, timestamp, and the latest sensor values (humidity, soil moisture, rainfall). The embed sidebar is colour-coded — sage for low, amber for medium, terracotta for high.

---

## Post-Deployment Checklist

- [ ] `sudo systemctl status landslide-api` shows `active (running)`
- [ ] `sudo systemctl status landslide-mqtt` shows `active (running)`
- [ ] `sudo systemctl status cloudflared` shows `active (running)`
- [ ] NodeMCU Serial Monitor shows successful MQTT publishes
- [ ] `https://<tunnel-url>/readings` returns JSON data
- [ ] Vercel dashboard loads and shows live sensor data
- [ ] `POST /alert` delivers a Discord embed

## Updating the Deployment

To pull new code and restart services:

```bash
cd ~/landslide-warning
git pull
source api/.venv/bin/activate
pip install -r api/requirements.txt   # if requirements changed
cd api && python train_model.py       # if model needs retraining
sudo systemctl restart landslide-api landslide-mqtt
```

For dashboard changes, Vercel auto-deploys on every push to the connected GitHub branch.
