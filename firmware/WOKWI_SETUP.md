# DrowsiGuard ESP32 Embedded Alert Controller Setup Guide

This guide explains how to run the embedded alert system either using the **Wokwi Online Simulator** or on a **physical ESP32 Development Board**.

---

## Architecture Role
- **Smartphone / Laptop**: Edge AI processor running MediaPipe FaceMesh, computing EAR/MAR/PERCLOS, and publishing states via MQTT.
- **ESP32**: Embedded alert hardware receiver controlling the SSD1306 OLED display, Green/Red status LEDs, and Alert Buzzer.

---

## Option 1: 1-Click Browser Simulation on Wokwi

You can run the full ESP32 embedded controller directly in your browser without any physical hardware!

1. Open [https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32)
2. In the code tab (`sketch.ino`), copy and paste the contents of `firmware/esp32_drowsiguard.ino`.
3. In the diagram tab (`diagram.json`), copy and paste the contents of `firmware/wokwi_diagram.json`.
4. In the Library Manager tab (`libraries.txt`), ensure these libraries are listed:
   ```
   Adafruit SSD1306
   Adafruit GFX Library
   PubSubClient
   ArduinoJson
   ```
5. Click **Start Simulation** (Green Play button).
   - Wokwi will connect to `Wokwi-GUEST` simulated Wi-Fi.
   - It will connect to the MQTT broker (e.g. `broker.emqx.io`).
   - Open your DrowsiGuard web application (Monitor tab).
   - Select the Public Test Broker (`wss://broker.emqx.io:8084/mqtt`) in Settings.
   - You will see the simulated OLED screen on Wokwi mirror the live driver status from your phone/laptop, the Green LED will light up when awake, and the Red LED + Buzzer will flash/sound when drowsiness is detected!

---

## Option 2: Physical ESP32 Hardware Wiring & Flashing

### Bill of Materials (BOM)
| Component | Quantity | Connection to ESP32 |
|---|---|---|
| ESP32 DevKit V1 | 1 | USB to PC |
| 0.96" SSD1306 OLED (I2C) | 1 | VCC: 3.3V, GND: GND, SCL: GPIO 22, SDA: GPIO 21 |
| Green 5mm LED | 1 | Anode: GPIO 19 via 220Ω resistor, Cathode: GND |
| Red 5mm LED | 1 | Anode: GPIO 18 via 220Ω resistor, Cathode: GND |
| 5V Active Buzzer | 1 | Positive: GPIO 23, Negative: GND |
| 220Ω Resistors | 2 | In series with LED anodes |

### Arduino IDE Setup
1. Install **ESP32 Board Package** in Arduino IDE:
   `Tools -> Board -> Boards Manager -> ESP32 by Espressif Systems`
2. Install required libraries via Library Manager (`Sketch -> Include Library -> Manage Libraries`):
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
   - `PubSubClient`
   - `ArduinoJson` (v6 or v7)
3. Open `esp32_drowsiguard.ino`.
4. Configure your Wi-Fi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
5. Configure your MQTT broker:
   - For **Local Offline Operation** (laptop running Mosquitto):
     ```cpp
     const char* mqtt_server = "192.168.x.x"; // Your laptop's LAN IP
     const int mqtt_port = 1883;
     ```
   - For **Public Cloud Test**:
     ```cpp
     const char* mqtt_server = "broker.emqx.io";
     const int mqtt_port = 1883;
     ```
6. Select your ESP32 board and COM port, then click **Upload**.
7. Open Serial Monitor at **115200 baud** to see connection logs and telemetry messages.
