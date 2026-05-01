#pragma once

// ─── WiFi ────────────────────────────────────────────────
#define WIFI_SSID      "your_wifi_ssid"
#define WIFI_PASSWORD  "your_wifi_password"

// ─── MQTT ────────────────────────────────────────────────
#define MQTT_BROKER    "192.168.1.x"   // Raspberry Pi IP
#define MQTT_PORT      1883
#define MQTT_TOPIC     "landslide/sensors"
#define STATION_ID     "station_01"

// ─── Pin Definitions (ESP32-WROOM-32) ────────────────────
// ESP32 GPIO numbers. ADC pins must be on ADC1 (GPIO 32–39) when WiFi is active —
// ADC2 is used by the WiFi radio and reads will fail.
#define DHT_PIN        4    // any digital GPIO
#define DHT_TYPE       DHT22
#define SOIL_PIN       34   // ADC1_CH6 — capacitive soil moisture (analog)
#define WATER_PIN      35   // ADC1_CH7 — water-level sensor (analog, mapped to 0–300 mm)

// ─── Soil Moisture Calibration ───────────────────────────
// ESP32 ADC is 12-bit (0–4095). Read raw analogRead() in dry air and submerged in
// water with the actual sensor wired up, then set the values below.
#define SOIL_DRY_RAW_MOISTURE_SENSOR   4095   // raw value in dry air
#define SOIL_WET_RAW_MOISTURE_SENSOR   1500   // raw value submerged in water

// ─── Water-Level Calibration ─────────────────────────────
// Raw analog values at the empty/full reservoir extremes. The sketch maps this
// linearly to 0–300 mm of standing water.
#define SOIL_DRY_RAW_WATER_SENSOR      0      // empty
#define SOIL_WET_RAW_WATER_SENSOR      4095   // fully submerged

// ─── Timing ──────────────────────────────────────────────
#define PUBLISH_INTERVAL_MS  30000  // 30 seconds

// ─── NTP ─────────────────────────────────────────────────
#define NTP_SERVER     "pool.ntp.org"
#define NTP_UTC_OFFSET 0  // UTC; adjust for local timezone if needed (seconds)
