// Landslide Early Warning System — NodeMCU Sensor Sketch
// Sensors: DHT22 (humidity), capacitive soil moisture, rain gauge (YL-83)
// Publishes JSON to MQTT broker every 30 seconds
//
// Setup: copy config.example.h → config.h and fill in your values.
//
// Required libraries (install via Arduino Library Manager):
//   - PubSubClient      (Nick O'Leary)
//   - DHT sensor library (Adafruit)
//   - ArduinoJson       (Benoit Blanchon)
//   - NTPClient         (Fabrice Weinberg)

#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include "config.h"

// ─── Globals ─────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, NTP_SERVER, NTP_UTC_OFFSET, 60000);

unsigned long lastPublish = 0;

// ─── WiFi ─────────────────────────────────────────────────
void setupWifi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.print("\n[WiFi] Connected, IP: ");
  Serial.println(WiFi.localIP());
}

// ─── MQTT ─────────────────────────────────────────────────
void reconnectMqtt() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connecting to ");
    Serial.print(MQTT_BROKER);
    Serial.print("...");
    if (mqttClient.connect(STATION_ID)) {
      Serial.println(" connected.");
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" — retrying in 5s");
      delay(5000);
    }
  }
}

// ─── Timestamp (ISO 8601 UTC) ─────────────────────────────
String getTimestamp() {
  timeClient.update();
  unsigned long epoch = timeClient.getEpochTime();

  // Convert epoch to Y-M-D H:M:S
  int sec  = epoch % 60;        epoch /= 60;
  int min  = epoch % 60;        epoch /= 60;
  int hr   = epoch % 24;        epoch /= 24;

  // Days since Unix epoch (Jan 1, 1970)
  long days = epoch;
  int year = 1970;
  while (true) {
    int diy = (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) ? 366 : 365;
    if (days < diy) break;
    days -= diy;
    year++;
  }
  int month = 1;
  const int dim[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  bool leap = (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
  for (month = 1; month <= 12; month++) {
    int d = dim[month - 1] + (month == 2 && leap ? 1 : 0);
    if (days < d) break;
    days -= d;
  }
  int day = days + 1;

  char buf[25];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
           year, month, day, hr, min, sec);
  return String(buf);
}

// ─── Sensor Reads ─────────────────────────────────────────
float readHumidity() {
  return dht.readHumidity();
}

float readSoilMoisture() {
  int raw = analogRead(SOIL_PIN);
  // Map raw ADC to 0–100% (clamp to valid range)
  float pct = (float)(SOIL_DRY_RAW - raw) / (float)(SOIL_DRY_RAW - SOIL_WET_RAW) * 100.0;
  if (pct < 0.0)   pct = 0.0;
  if (pct > 100.0) pct = 100.0;
  return pct;
}

float readRainfall() {
  // YL-83: LOW signal = rain detected
  // Returns 1.0 (rain) or 0.0 (no rain) — extend with a tipping bucket counter for mm/h
  return (digitalRead(RAIN_PIN) == LOW) ? 1.0 : 0.0;
}

// ─── Publish ──────────────────────────────────────────────
void publishReadings() {
  float humidity     = readHumidity();
  float soilMoisture = readSoilMoisture();
  float rainfall     = readRainfall();

  if (isnan(humidity)) {
    Serial.println("[DHT] Read error — skipping publish");
    return;
  }

  String timestamp = getTimestamp();

  StaticJsonDocument<256> doc;
  doc["station_id"]    = STATION_ID;
  doc["timestamp"]     = timestamp;
  doc["humidity"]      = round(humidity * 10.0) / 10.0;
  doc["soil_moisture"] = round(soilMoisture * 10.0) / 10.0;
  doc["rainfall"]      = rainfall;

  char payload[256];
  serializeJson(doc, payload);

  mqttClient.publish(MQTT_TOPIC, payload);

  Serial.print("[MQTT] Published: ");
  Serial.println(payload);
}

// ─── Setup / Loop ─────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(RAIN_PIN, INPUT);
  dht.begin();
  setupWifi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  timeClient.begin();
  timeClient.update();
  Serial.println("[System] Ready.");
}

void loop() {
  if (!mqttClient.connected()) reconnectMqtt();
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishReadings();
  }
}
