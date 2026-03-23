#pragma once

// ─── WiFi ────────────────────────────────────────────────
#define WIFI_SSID      "your_wifi_ssid"
#define WIFI_PASSWORD  "your_wifi_password"

// ─── MQTT ────────────────────────────────────────────────
#define MQTT_BROKER    "192.168.1.x"   // Raspberry Pi IP
#define MQTT_PORT      1883
#define MQTT_TOPIC     "landslide/sensors"
#define STATION_ID     "station_01"

// ─── Pin Definitions ─────────────────────────────────────
#define DHT_PIN        D4   // DHT22 data pin
#define DHT_TYPE       DHT22
#define SOIL_PIN       A0   // Capacitive soil moisture (analog)
#define RAIN_PIN       D5   // Rain gauge YL-83 (digital, LOW = rain)

// ─── Soil Moisture Calibration ───────────────────────────
// Read raw ADC value in dry air and submerged in water, set below
#define SOIL_DRY_RAW   1023
#define SOIL_WET_RAW   300

// ─── Timing ──────────────────────────────────────────────
#define PUBLISH_INTERVAL_MS  30000  // 30 seconds

// ─── NTP ─────────────────────────────────────────────────
#define NTP_SERVER     "pool.ntp.org"
#define NTP_UTC_OFFSET 0  // UTC; adjust for local timezone if needed (seconds)
