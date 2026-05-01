// Landslide Early Warning System — ESP32-WROOM-32
// Sensors: DHT22 (humidity), capacitive soil moisture (ADC), water-level sensor (ADC, mm)
// Publishes JSON to MQTT broker every 30 seconds
//
// Setup: copy config.example.h → config.h and fill in your values.
//
// Required libraries (install via Arduino Library Manager):
//   - PubSubClient      (Nick O'Leary)
//   - DHT sensor library (Adafruit)
//   - ArduinoJson       (Benoit Blanchon)
//   - NTPClient         (Fabrice Weinberg)
#include <WiFi.h>
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

// ─── Timestamp ────────────────────────────────────────────
String getTimestamp() {
  timeClient.update();
  unsigned long epoch = timeClient.getEpochTime();

  int sec = epoch % 60; epoch /= 60;
  int min = epoch % 60; epoch /= 60;
  int hr  = epoch % 24; epoch /= 24;

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
  snprintf(buf, sizeof(buf),
           "%04d-%02d-%02dT%02d:%02d:%02dZ",
           year, month, day, hr, min, sec);

  return String(buf);
}

// ─── Sensors ─────────────────────────────────────────────

// ESP32 ADC (important fix)
float readSoilMoisture() {
  int raw = analogRead(SOIL_PIN);
  

  float pct = (float)(SOIL_DRY_RAW_MOISTURE_SENSOR - raw) * 100.0 /
              (SOIL_DRY_RAW_MOISTURE_SENSOR - SOIL_WET_RAW_MOISTURE_SENSOR);

  // clamp
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;

  return pct;
}

float readHumidity() {
  return dht.readHumidity();
}

float readWaterLevel() {
  int raw = analogRead(WATER_PIN);

  // clamp
  if (raw > SOIL_WET_RAW_WATER_SENSOR) raw = SOIL_WET_RAW_WATER_SENSOR;
  if (raw < SOIL_DRY_RAW_WATER_SENSOR) raw = SOIL_DRY_RAW_WATER_SENSOR;

  // map เป็น 0 - 300 mm
  float mm = (float)(raw - SOIL_DRY_RAW_WATER_SENSOR) * 300.0 / (SOIL_WET_RAW_WATER_SENSOR - SOIL_DRY_RAW_WATER_SENSOR);

  return mm;
}

// ─── Publish ─────────────────────────────────────────────
void publishReadings() {
  float humidity = readHumidity();
  float soilMoisture = readSoilMoisture();
  float rainfall = readWaterLevel();

  if (isnan(humidity)) {
    Serial.println("[DHT] Read error — skip");
    return;
  }

  String timestamp = getTimestamp();

  StaticJsonDocument<256> doc;
  doc["station_id"] = STATION_ID;
  doc["timestamp"] = timestamp;
  doc["humidity"] = round(humidity * 10) / 10.0;
  doc["soil_moisture"] = round(soilMoisture * 10) / 10.0;
  doc["rainfall"] = rainfall;

  char payload[256];
  serializeJson(doc, payload);

  mqttClient.publish(MQTT_TOPIC, payload);

  Serial.print("[MQTT] Published: ");
  Serial.println(payload);
}

// ─── Setup ───────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  pinMode(WATER_PIN, INPUT);

  dht.begin();
  setupWifi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  timeClient.begin();
  timeClient.update();

  Serial.println("[System] Ready (ESP32)");
}

// ─── Loop ────────────────────────────────────────────────
void loop() {
  if (!mqttClient.connected()) reconnectMqtt();
  mqttClient.loop();

  unsigned long now = millis();

  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishReadings();
  }
}
