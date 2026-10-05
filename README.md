# 🛡️ DrowsiGuard - Smart Edge Driver Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20ESP32-green.svg)](#)
[![MediaPipe FaceMesh](https://img.shields.io/badge/AI-MediaPipe%20FaceMesh%20(WASM)-orange.svg)](https://developers.google.com/mediapipe)
[![IoT Protocol](https://img.shields.io/badge/IoT-MQTT%20via%20WebSockets-purple.svg)](https://mqtt.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B%20(Zero--Dependency)-brightgreen.svg)](https://nodejs.org/)

**DrowsiGuard** is a real-time, privacy-preserving, edge-computed **Driver Monitoring System (DMS)**. It runs on any modern browser (laptop or mounted smartphone) using **Google MediaPipe FaceMesh (468 landmarks)** accelerated by **WebAssembly and WebGL**. 

DrowsiGuard computes biometric metrics—such as **Eye Aspect Ratio (EAR)**, **Mouth Aspect Ratio (MAR)** for yawning, **PERCLOS** (Percentage of Eye Closure), and **Blink Frequency**—entirely locally on-device. When fatigue or distraction is detected, it triggers synchronized multi-tier alerts: an in-browser audio siren, visual cockpit indicators, and an optional **ESP32 IoT hardware alert unit** equipped with an OLED display, alert buzzer, and status LEDs over MQTT.

---

## 📑 Table of Contents
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Biometric Detection Algorithms](#-biometric-detection-algorithms)
- [Prerequisites](#-prerequisites)
- [Quick Start: Running on Your Laptop](#-quick-start-running-on-your-laptop)
- [Testing on Mobile (Android Smartphone as In-Car Dashcam)](#-testing-on-mobile-android-smartphone-as-in-car-dashcam)
- [ESP32 Embedded Alert Receiver Setup](#-esp32-embedded-alert-receiver-setup)
  - [Option A: 1-Click Wokwi Online Simulation (No Hardware Needed)](#option-a-1-click-wokwi-online-simulation-no-hardware-needed)
  - [Option B: Physical ESP32 Hardware Wiring & Flashing](#option-b-physical-esp32-hardware-wiring--flashing)
- [Project Directory Structure](#-project-directory-structure)
- [Telemetry & Settings Customization](#-telemetry--settings-customization)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [License](#-license)

---

## ✨ Key Features

- **🚀 100% On-Device Edge Computing**: Video frames never leave your device. All computer vision inference executes locally via WebAssembly/WebGL with sub-30ms latency.
- **👁️ Real-Time Eye & Mouth Tracking**:
  - **EAR (Eye Aspect Ratio)**: Detects micro-sleeps, drowsiness, and blinks based on 6 landmark pairs per eye.
  - **MAR (Mouth Aspect Ratio)**: Detects yawning episodes.
  - **PERCLOS (Percentage of Eye Closure)**: Sliding-window evaluation of driver alertness over time.
  - **Head Pose & Tilt Estimation**: Warns if the driver turns away or looks down for prolonged periods.
- **🔊 Multi-Tiered Alert System**:
  - Web Audio API synthesizer for customizable alarms and voice announcements.
  - Visual heads-up warnings (SAFE, WARNING, DROWSY, CRITICAL).
- **📡 Real-Time IoT Bridge (MQTT over WebSockets)**:
  - Publishes live telemetry and state changes to external microcontrollers (ESP32, Arduino, Raspberry Pi).
- **📟 Embedded Hardware Emulator**:
  - Built-in virtual OLED screen and LED indicators in the UI so you can test hardware behavior without physical boards.
- **📈 Live Telemetry Dashboard**:
  - Real-time Chart.js graphs displaying EAR, MAR, and status history with CSV export capabilities.
- **📱 Progressive Web App (PWA)**:
  - Installable on mobile home screens with offline caching capability.

---

## 🏛️ System Architecture

```text
       [ Driver's Face ]
               │
               ▼
      [ Device Camera ]
               │
       (Video Stream)
               │
               ▼
 ┌───────────────────────────────────────────────┐
 │            DrowsiGuard Web Client             │
 │                                               │
 │  ┌─────────────────────────────────────────┐  │
 │  │      MediaPipe 468 FaceMesh (WASM)      │  │
 │  └────────────────────┬────────────────────┘  │
 │                       ▼                       │
 │  ┌─────────────────────────────────────────┐  │
 │  │        EAR / MAR / PERCLOS Engine       │  │
 │  └────────────────────┬────────────────────┘  │
 │                       ▼                       │
 │  ┌─────────────────────────────────────────┐  │
 │  │       Finite State Machine (FSM)        │  │
 │  └───────┬─────────────────────────┬───────┘  │
 └──────────┼─────────────────────────┼──────────┘
            │                         │
            ▼                         ▼
   [ Web Audio Siren ]       [ MQTT Client (WSS) ]
                                      │
                         (broker.emqx.io / Mosquitto)
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │    ESP32 Alert Station    │
                        │ ───────────────────────── │
                        │  • 0.96" SSD1306 OLED     │
                        │  • Green / Red LEDs       │
                        │  • 5V Active Buzzer       │
                        └───────────────────────────┘
```

---

## 📐 Biometric Detection Algorithms

### 1. Eye Aspect Ratio (EAR)
Calculated using high-precision 3-point vertical eyelid aperture (including center pupil deflection lines) with aspect-corrected pixel geometry:

$$\text{EAR} = \frac{\|p_{\text{top1}} - p_{\text{bot1}}\| + 2 \cdot \|p_{\text{top\_mid}} - p_{\text{bot\_mid}}\| + \|p_{\text{top2}} - p_{\text{bot2}}\|}{4 \cdot \|p_{\text{outer}} - p_{\text{inner}}\|}$$

- **Normal Alert / Relaxed State**: $\text{EAR} \approx 0.22 - 0.32$
- **Calibrated Closure Threshold**: $\text{EAR} < 0.17$ (auto-calibrates to $65\%$ of personal baseline)
- **Normal Blink**: Temporary closure ($70\text{ ms} - 450\text{ ms}$), smoothly debounced to prevent false alarms
- **Prolonged Eye Closure / Drowsiness**: Continuous closure $\ge 3.5\text{ seconds}$ or $>5$ closures exceeding $3.0\text{ seconds}$

### 2. Mouth Aspect Ratio (MAR)
Monitors 3-point vertical inner/outer lip apertures to detect authentic yawning while preventing false positives during speaking:

$$\text{MAR} = \frac{\|m_{\text{top1}} - m_{\text{bot1}}\| + 2 \cdot \|m_{\text{top\_center}} - m_{\text{bot\_center}}\| + \|m_{\text{top2}} - m_{\text{bot2}}\|}{4 \cdot \|m_{\text{left}} - m_{\text{right}}\|}$$

- **Yawn Threshold**: $\text{MAR} > 0.65$ sustained for $\ge 2.0\text{ seconds}$

### 3. PERCLOS
The proportion of time within a rolling 60-second window during which the eyes are closed at least 80%. A PERCLOS reading above 15% indicates significant operator fatigue.

---

## 💻 Prerequisites

To run DrowsiGuard locally, you only need:
- **Node.js** (v16.0 or higher) - [Download Node.js](https://nodejs.org/)
- A **Webcam** (built-in laptop camera, USB webcam, or smartphone camera)
- A modern browser: **Google Chrome**, **Microsoft Edge**, or **Brave** (supports WebAssembly & WebGL)

> **Note**: No third-party `npm` modules are required! `server.js` uses standard, built-in Node.js libraries (`http`, `https`, `fs`, `path`, `os`).

---

## 🚀 Quick Start: Running on Your Laptop

Follow these 4 simple steps to run DrowsiGuard on your computer:

### 1. Clone the Repository
```bash
git clone https://github.com/Adityaaaaa7/drowsiguard.git
cd drowsiguard
```

### 2. Start the Local Server
```bash
node server.js
```
You will see the console banner:
```text
=============================================================
  DROWSIGUARD - LOCAL DEVELOPMENT SERVER RUNNING
=============================================================

> Local Access (Laptop Browser):
  http://localhost:8080

> Android Mobile Access (Same Wi-Fi Network):
  http://192.168.x.x:8080
```

### 3. Open the Application
Open your browser and navigate to:
```text
http://localhost:8080
```

### 4. Enable Camera & Calibrate
1. Click **Start Detection** on the cockpit dashboard.
2. Grant camera permissions when prompted by your browser.
3. Keep your head upright facing the camera. The face mesh overlay will appear, and live EAR/MAR telemetry will populate the metrics panel.

---

## 📱 Testing on Mobile (Android Smartphone as In-Car Dashcam)

Browsers strictly enforce camera access only in **Secure Contexts** (`https://` or `http://localhost`). Accessing plain `http://192.168.x.x:8080` over Wi-Fi will block the camera on mobile Chrome.

Here are the best ways to test on a smartphone:

### Method 1: ADB Port Forwarding (Recommended / Zero-Certificate)
1. Connect your Android phone to your laptop via USB cable.
2. Enable **Developer Options** and **USB Debugging** on your phone.
3. On your laptop terminal, run:
   ```bash
   adb reverse tcp:8080 tcp:8080
   ```
4. Start the server on your laptop: `node server.js`
5. On your phone's Chrome browser, open:
   ```text
   http://localhost:8080
   ```
   *Chrome treats `localhost` on mobile as a secure context, giving you direct, high-speed camera access without certificate warnings.*

### Method 2: Wireless LAN via Trusted Certificate (`mkcert`)
1. Install `mkcert` on your PC (`choco install mkcert` on Windows or `brew install mkcert` on macOS).
2. Generate certificates:
   ```bash
   mkcert -install
   mkcert -cert-file cert.pem -key-file key.pem 192.168.x.x localhost 127.0.0.1
   ```
3. Transfer the generated `rootCA.pem` (`mkcert -CAROOT`) to your phone and install it under Android **Security -> Install CA Certificate**.
4. Run `node server.js` and open `https://192.168.x.x:8443` on your phone.

*(For detailed step-by-step instructions, see [`LAN_MOBILE_SETUP.md`](LAN_MOBILE_SETUP.md)).*

---

## 🔌 ESP32 Embedded Alert Receiver Setup

DrowsiGuard publishes live telemetry JSON payloads to the MQTT topic:
```text
drowsiguard/telemetry
```

### Payload Structure:
```json
{
  "state": "WARNING",
  "ear": 0.18,
  "mar": 0.22,
  "blinkCount": 14,
  "alert": true,
  "timestamp": 1728053640
}
```

---

### Option A: 1-Click Wokwi Online Simulation (No Hardware Needed)

You can run the simulated circuit in your browser without any physical components!

1. Open the [Wokwi ESP32 Simulator](https://wokwi.com/projects/new/esp32).
2. Replace `sketch.ino` with the code from [`firmware/esp32_drowsiguard.ino`](firmware/esp32_drowsiguard.ino).
3. Replace `diagram.json` with the contents of [`firmware/wokwi_diagram.json`](firmware/wokwi_diagram.json).
4. In the Wokwi **Library Manager** (`libraries.txt`), add:
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
   - `PubSubClient`
   - `ArduinoJson`
5. Click **Start Simulation**.
6. In your DrowsiGuard web app, go to **Settings** and ensure the broker is set to `wss://broker.emqx.io:8084/mqtt`.
7. As you close your eyes in front of the camera, watch the simulated OLED screen display "DROWSINESS DETECTED" and the buzzer/red LED flash in Wokwi!

---

### Option B: Physical ESP32 Hardware Wiring & Flashing

#### Bill of Materials (BOM)
| Component | Quantity | Connection to ESP32 Pin |
|---|---|---|
| **ESP32 DevKit V1** | 1 | Micro-USB to PC / Power Supply |
| **0.96" SSD1306 OLED (I2C)** | 1 | VCC: 3.3V, GND: GND, SCL: GPIO 22, SDA: GPIO 21 |
| **Green Status LED** | 1 | Anode: GPIO 19 (via 220Ω), Cathode: GND |
| **Red Alert LED** | 1 | Anode: GPIO 18 (via 220Ω), Cathode: GND |
| **5V Active Buzzer** | 1 | Positive (+): GPIO 23, Negative (-): GND |
| **220Ω Resistors** | 2 | Current limiting for LEDs |

#### Flashing via Arduino IDE:
1. Open the Arduino IDE.
2. Install the **ESP32 Board Package** via `Tools -> Board -> Boards Manager`.
3. Install dependencies from Library Manager: `Adafruit SSD1306`, `Adafruit GFX`, `PubSubClient`, `ArduinoJson`.
4. Open [`firmware/esp32_drowsiguard.ino`](firmware/esp32_drowsiguard.ino).
5. Update your Wi-Fi credentials:
   ```cpp
   const char* ssid = "YOUR_WIFI_NAME";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```
6. Select your ESP32 board and COM port, then click **Upload**.
7. Open the Serial Monitor at **115200 baud** to verify network connectivity.

*(For full wiring diagrams and troubleshooting, refer to [`firmware/WOKWI_SETUP.md`](firmware/WOKWI_SETUP.md)).*

---

## 📂 Project Directory Structure

```text
drowsiguard/
├── .gitignore                     # Git ignore rules for node, env, and OS artifacts
├── LAN_MOBILE_SETUP.md            # Mobile testing & secure context guide
├── README.md                      # Comprehensive project documentation
├── index.html                     # Cockpit UI, HUD overlays, telemetry graphs, and controls
├── manifest.json                  # PWA web application manifest
├── server.js                      # Zero-dependency local Node.js development server
├── sw.js                          # Service Worker for offline asset caching
├── css/
│   └── styles.css                 # Dark-mode dashboard theme, glassmorphism & responsive layout
├── firmware/
│   ├── WOKWI_SETUP.md             # Wokwi simulation guide & physical pinout details
│   ├── esp32_drowsiguard.ino      # ESP32 firmware (MQTT, SSD1306 OLED driver, LEDs, Buzzer)
│   └── wokwi_diagram.json         # Wokwi circuit diagram specification
└── js/
    ├── app.js                     # Main application orchestrator & state machine
    ├── audioAlert.js              # Web Audio API alert sound generator
    ├── earMarCalculator.js        # Mathematical formulas for EAR, MAR, and PERCLOS
    ├── faceLandmarkEngine.js      # MediaPipe FaceMesh initialization & canvas rendering
    ├── hardwareBridge.js          # WebSockets MQTT client & Virtual Hardware Emulator
    ├── remoteBridge.js            # LAN remote device pairing & stream synchronization
    ├── settingsManager.js         # Threshold configuration & localStorage persistence
    └── telemetryChart.js          # Real-time Chart.js telemetry charts & CSV export
```

---

## ⚙️ Telemetry & Settings Customization

Under the **Settings** tab in the web interface, you can adjust:
- **Personal Eye Auto-Calibration**: 1-click calibration tool that calculates your natural resting baseline without forcing eyes wide open.
- **EAR Sensitivity**: Adjust the eye closure threshold (default calibrated: `0.17`).
- **Closure Duration**: Time in seconds before triggering alarms (default: `3.5s`).
- **Driver HUD Mode**: Anti-distraction, low-glare cockpit mode for safe night driving.
- **Yawn Detection**: Toggle MAR calculations and sensitivity threshold (default: `0.65`).
- **Buzzer & Siren Pitch**: Customize alarm frequency and audio tone patterns.
- **MQTT Broker URL**: Switch between public test brokers (`broker.emqx.io`) or your local Mosquitto LAN broker.

---

## ❓ Troubleshooting & FAQ

<details>
<summary><b>1. Camera does not start or says "getUserMedia is not supported"</b></summary>
Browsers require a <i>Secure Context</i> to access cameras. Ensure you are visiting <code>http://localhost:8080</code> (on PC) or using ADB reverse port forwarding (on mobile). Plain HTTP on external IP addresses (e.g. <code>http://192.168.x.x:8080</code>) will be blocked by modern browser security policies.
</details>

<details>
<summary><b>2. Low FPS or laggy detection</b></summary>
DrowsiGuard relies on WebGL hardware acceleration. Ensure hardware acceleration is enabled in your browser settings (<code>chrome://settings/system</code> -> <i>Use graphics acceleration when available</i>).
</details>

<details>
<summary><b>3. MQTT is not receiving messages on ESP32</b></summary>
Check that both the browser (in the Settings tab) and the ESP32 (in <code>esp32_drowsiguard.ino</code>) are configured with the same MQTT topic (<code>drowsiguard/telemetry</code>) and broker host (e.g. <code>broker.emqx.io</code>).
</details>

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to use, modify, and distribute for academic, personal, or commercial IoT projects.

---

**Developed with ❤️ by [Aditya Verma (Adityaaaaa7)](https://github.com/Adityaaaaa7)**
