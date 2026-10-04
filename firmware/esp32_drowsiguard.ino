/*
  ========================================================================================
  DROWSIGUARD - ESP32 EMBEDDED AUTOMOTIVE ALERT CONTROLLER
  3rd-Year ECE Project: Smartphone Edge Driver Monitoring & Embedded Alert System
  ========================================================================================

  HARDWARE PERIPHERALS:
  - ESP32 Development Board (NodeMCU / DOIT DevKit V1)
  - 0.96" I2C OLED Display (SSD1306, 128x64 pixels) -> SDA: GPIO 21, SCL: GPIO 22
  - Green Alert LED (Normal/Awake Indicator)        -> Anode: GPIO 19
  - Red Alert LED (Drowsiness Warning Indicator)     -> Anode: GPIO 18
  - Active Buzzer (Auditory Alert System)           -> Positive: GPIO 23

  COMMUNICATION LAYER:
  - Wi-Fi 802.11 b/g/n connecting to vehicle hotspot or local router
  - MQTT over TCP (Port 1883) connecting to Local or Public MQTT Broker
  - Topics:
      Subscribed: "drowsiguard/alert"       -> Receives immediate drowsiness warning states
      Subscribed: "drowsiguard/telemetry"   -> Receives EAR, MAR, PERCLOS, blinks, yawns
      Published:  "drowsiguard/hardware/status" -> Periodic heartbeat & acknowledgment
  ========================================================================================
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h> // ArduinoJson v6 or v7

// ---------- PIN DEFINITIONS ----------
#define PIN_LED_GREEN  19
#define PIN_LED_RED    18
#define PIN_BUZZER     23
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT  64
#define OLED_RESET     -1
#define SCREEN_ADDRESS 0x3C

// ---------- WI-FI & MQTT CREDENTIALS ----------
// Replace with your local Wi-Fi / Hotspot credentials
const char* ssid = "Wokwi-GUEST";       // Use "Wokwi-GUEST" for Wokwi Simulator, or your home/hotspot SSID
const char* password = "";              // Wi-Fi Password

// MQTT Broker (Use your Laptop IP e.g. "192.168.1.100" for local Mosquitto, or public broker for testing)
const char* mqtt_server = "broker.emqx.io"; // or "192.168.x.x"
const int   mqtt_port   = 1883;             // Standard TCP MQTT port for ESP32

// Topics
const char* topic_alert     = "drowsiguard/alert";
const char* topic_telemetry = "drowsiguard/telemetry";
const char* topic_status    = "drowsiguard/hardware/status";

// ---------- GLOBAL OBJECTS ----------
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
WiFiClient espClient;
PubSubClient client(espClient);

// ---------- SYSTEM STATE VARIABLES ----------
bool isDrowsyAlert = false;
String currentDriverState = "AWAKE";
float currentEar = 0.32;
float currentMar = 0.22;
int currentPerclos = 0;
float currentClosureSec = 0.0;
unsigned long lastHeartbeatTime = 0;
unsigned long buzzerToggleTime = 0;
bool buzzerState = false;

// Function declarations
void setupWiFi();
void reconnectMQTT();
void mqttCallback(char* topic, byte* message, unsigned int length);
void updateOLED();
void updateActuators();

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[DrowsiGuard] Initializing Embedded Alert Controller...");

  // Initialize GPIO pins
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Initial State: Green ON, Red OFF, Buzzer OFF
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // Initialize I2C OLED Display
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("[Error] SSD1306 allocation failed!"));
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(10, 10);
    display.println("DROWSIGUARD ECE");
    display.setCursor(10, 26);
    display.println("Connecting Wi-Fi...");
    display.display();
  }

  // Connect to Network & MQTT
  setupWiFi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);

  Serial.println("[DrowsiGuard] Embedded Controller Ready.");
}

void loop() {
  // Maintain MQTT Connection
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  // Update physical actuators (LEDs & Buzzer)
  updateActuators();

  // Send periodic heartbeat to Smartphone every 5 seconds
  if (millis() - lastHeartbeatTime > 5000) {
    lastHeartbeatTime = millis();
    char statusPayload[128];
    snprintf(statusPayload, sizeof(statusPayload), 
             "{\"esp32\":\"online\",\"uptime\":%lu,\"alert\":%s,\"freeHeap\":%u}", 
             millis() / 1000, isDrowsyAlert ? "true" : "false", ESP.getFreeHeap());
    client.publish(topic_status, statusPayload);
  }
}

void setupWiFi() {
  Serial.print("[Wi-Fi] Connecting to: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(400);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected! IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[Wi-Fi] Warning: Wi-Fi connection timed out. Controller will retry.");
  }
}

void reconnectMQTT() {
  static unsigned long lastReconnectAttempt = 0;
  if (millis() - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = millis();

  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
    return;
  }

  Serial.print("[MQTT] Attempting connection to broker...");
  String clientId = "ESP32_DrowsiGuard_" + String(random(0xffff), HEX);

  if (client.connect(clientId.c_str())) {
    Serial.println(" connected!");
    client.subscribe(topic_alert);
    client.subscribe(topic_telemetry);
    Serial.printf("[MQTT] Subscribed to %s and %s\n", topic_alert, topic_telemetry);
    updateOLED();
  } else {
    Serial.printf(" failed, rc=%d. Retrying in 5 seconds...\n", client.state());
  }
}

void mqttCallback(char* topic, byte* message, unsigned int length) {
  char jsonBuffer[512];
  if (length >= sizeof(jsonBuffer)) length = sizeof(jsonBuffer) - 1;
  memcpy(jsonBuffer, message, length);
  jsonBuffer[length] = '\0';

  Serial.printf("[MQTT RX][%s] %s\n", topic, jsonBuffer);

  // Parse incoming JSON using ArduinoJson
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, jsonBuffer);
  if (error) {
    Serial.print(F("[JSON] deserializeJson() failed: "));
    Serial.println(error.f_str());
    return;
  }

  // 1. ALERT TOPIC ("drowsiguard/alert")
  if (strcmp(topic, topic_alert) == 0) {
    if (doc.containsKey("alert")) {
      isDrowsyAlert = doc["alert"].as<bool>();
    }
    if (doc.containsKey("state")) {
      currentDriverState = doc["state"].as<String>();
    }
    if (doc.containsKey("durationSec")) {
      currentClosureSec = doc["durationSec"].as<float>();
    }
    if (doc.containsKey("ear")) {
      currentEar = doc["ear"].as<float>();
    }
    if (doc.containsKey("perclos")) {
      currentPerclos = doc["perclos"].as<int>();
    }
    updateOLED();
  }
  // 2. TELEMETRY TOPIC ("drowsiguard/telemetry")
  else if (strcmp(topic, topic_telemetry) == 0) {
    if (doc.containsKey("ear")) currentEar = doc["ear"].as<float>();
    if (doc.containsKey("mar")) currentMar = doc["mar"].as<float>();
    if (doc.containsKey("perclos")) currentPerclos = doc["perclos"].as<int>();
    if (!isDrowsyAlert && doc.containsKey("state")) {
      currentDriverState = doc["state"].as<String>();
    }
    updateOLED();
  }
}

void updateActuators() {
  if (isDrowsyAlert) {
    // DROWSINESS WARNING STATE:
    // Green LED OFF, Red LED Flashing, Buzzer Pulsing
    digitalWrite(PIN_LED_GREEN, LOW);

    // Pulse buzzer & Red LED at 350ms cadence
    if (millis() - buzzerToggleTime > 350) {
      buzzerToggleTime = millis();
      buzzerState = !buzzerState;
      digitalWrite(PIN_LED_RED, buzzerState ? HIGH : LOW);
      digitalWrite(PIN_BUZZER, buzzerState ? HIGH : LOW);
    }
  } else {
    // NORMAL / AWAKE STATE:
    // Green LED ON, Red LED OFF, Buzzer OFF
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
  }
}

void updateOLED() {
  display.clearDisplay();

  if (isDrowsyAlert) {
    // Invert header bar for high-priority warning
    display.fillRect(0, 0, SCREEN_WIDTH, 14, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(4, 3);
    display.println("! DROWSINESS WARNING !");

    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(6, 20);
    display.println("WAKE UP!");

    display.setTextSize(1);
    display.setCursor(6, 42);
    display.printf("EYES CLOSED: %.1fs\n", currentClosureSec);

    display.setCursor(6, 54);
    display.printf("EAR:%.2f PERC:%d%%\n", currentEar, currentPerclos);
  } else {
    // Normal / Awake State Display
    display.fillRect(0, 0, SCREEN_WIDTH, 14, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(8, 3);
    display.println("DROWSIGUARD ECE");

    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(6, 20);
    display.print("STATUS: ");
    display.println(currentDriverState);

    display.setCursor(6, 34);
    display.println("DRIVER ATTENTIVE");

    display.setCursor(6, 48);
    display.printf("EAR: %.2f  MAR: %.2f\n", currentEar, currentMar);

    display.setCursor(6, 56);
    display.printf("PERCLOS: %d%%\n", currentPerclos);
  }

  display.display();
}
