// Landslide Warning System — NodeMCU Sensor Sketch
// Sensors: DHT22 (humidity), capacitive soil moisture, rain gauge (YL-83)
// Publishes JSON payload via MQTT

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// WiFi & MQTT config
const char* WIFI_SSID     = "your_wifi_ssid";
const char* WIFI_PASSWORD = "your_wifi_password";
const char* MQTT_BROKER   = "your_raspberry_pi_ip";
const int   MQTT_PORT     = 1883;
const char* MQTT_TOPIC    = "landslide/sensors";
const char* STATION_ID    = "station_01";

// Pin definitions
#define DHT_PIN        D4
#define DHT_TYPE       DHT22
#define SOIL_PIN       A0
#define RAIN_PIN       D5

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

void setupWifi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void reconnectMqtt() {
  while (!mqttClient.connected()) {
    if (mqttClient.connect(STATION_ID)) {
      // connected
    } else {
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  setupWifi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
}

void loop() {
  if (!mqttClient.connected()) reconnectMqtt();
  mqttClient.loop();

  float humidity     = dht.readHumidity();
  float soilRaw      = analogRead(SOIL_PIN);
  float soilMoisture = map(soilRaw, 1023, 0, 0, 100);  // calibrate as needed
  int   rainDigital  = digitalRead(RAIN_PIN);
  float rainfall     = rainDigital == LOW ? 1.0 : 0.0;  // placeholder logic

  StaticJsonDocument<200> doc;
  doc["station_id"]    = STATION_ID;
  doc["humidity"]      = humidity;
  doc["soil_moisture"] = soilMoisture;
  doc["rainfall"]      = rainfall;

  char payload[200];
  serializeJson(doc, payload);
  mqttClient.publish(MQTT_TOPIC, payload);

  delay(10000);  // publish every 10 seconds
}
