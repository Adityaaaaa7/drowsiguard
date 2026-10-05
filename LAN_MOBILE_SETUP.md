# DrowsiGuard - Mobile Phone & LAN Testing Guide

This guide explains how to run DrowsiGuard on your development laptop and access it from an Android smartphone connected to the same Wi-Fi network with full camera permissions.

---

## The Android Browser Camera Security Rule
Modern mobile browsers (Google Chrome, Samsung Internet, Edge on Android) strictly require a **Secure Context** to access `navigator.mediaDevices.getUserMedia()`.

- `http://localhost:...` is **ALWAYS** treated as a Secure Context.
- `http://192.168.x.x:...` over plain HTTP is treated as an **Insecure Context**, causing the browser to disable camera access (`getUserMedia is undefined`).
- Untrusted self-signed HTTPS certificates will cause Android Chrome to block camera access even if you bypass the SSL warning.

Below are the **two authentic solutions** and one optional temporary test workaround:

---

## Solution 1: ADB USB Port Forwarding (Recommended / Zero Certificate Hassle)

This is the cleanest, fastest method used by professional mobile web engineers:

1. Connect your Android phone to your laptop using a USB cable.
2. Enable **Developer Options** and **USB Debugging** on your Android phone.
3. In a terminal on your laptop, run:
   ```bash
   adb reverse tcp:8080 tcp:8080
   ```
4. Start your local server on the laptop:
   ```bash
   node server.js
   ```
5. Open Chrome on your Android phone and navigate to:
   ```
   http://localhost:8080
   ```
6. **Result**: Android Chrome recognizes `localhost` as a genuine Secure Context!
   - Camera permission prompt appears immediately.
   - Zero certificate warnings.
   - PWA installation works.
   - On-device MediaPipe landmark detection runs smoothly.

---

## Solution 2: Wireless LAN with `mkcert` (Trusted Root CA)

If you want to mount the phone in a vehicle wirelessly without any cables:

1. Install `mkcert` on your laptop (e.g. `choco install mkcert` or download from GitHub).
2. Install the local CA in your laptop system store:
   ```bash
   mkcert -install
   ```
3. Generate a certificate for your laptop's Wi-Fi IP (e.g., `192.168.1.50`) and localhost:
   ```bash
   mkcert -cert-file cert.pem -key-file key.pem 192.168.1.50 localhost 127.0.0.1
   ```
4. Find your local CA root directory:
   ```bash
   mkcert -CAROOT
   ```
5. Send the `rootCA.pem` file to your Android phone (via WhatsApp, email, or Google Drive).
6. On Android:
   - Go to **Settings -> Security -> Encryption & Credentials -> Install from storage -> CA Certificate**.
   - Select `rootCA.pem` and confirm.
7. Start your server:
   ```bash
   node server.js
   ```
8. On your phone browser, open:
   ```
   https://192.168.1.50:8443
   ```
9. **Result**: Android completely trusts the HTTPS connection with a green lock and grants camera permissions over Wi-Fi!

---

## Temporary Testing Workaround: Chrome Flag

For quick 1-minute testing without certificates or ADB:

1. Open **Chrome** on your Android phone.
2. In the address bar, type:
   ```
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```
3. Enable the flag and enter your laptop's LAN IP and port:
   ```
   http://192.168.x.x:8080
   ```
4. Tap **Relaunch** at the bottom of Chrome.
5. Navigate to `http://192.168.x.x:8080` — Chrome will treat that specific LAN IP as secure and allow camera access.
*(Note: This flag is intended for local development testing only).*

---

## Testing Verification Checklist
1. **Camera Starts**: Green "Camera Active" pill appears.
2. **Face Mesh Overlays**: Landmarks align with your face in the preview.
3. **EAR Updates**: Displays ~0.24 - 0.32 when eyes are naturally open; drops below 0.17 when closed.
4. **Blink Counter**: Short closures (70–450 ms) increment the blink count without flickering the AWAKE state.
5. **Drowsiness Warning**: Closing eyes for >= 3.5s triggers `WARNING`, siren sounds, and virtual ESP32 Red LED/Buzzer activate.
6. **MQTT Sync**: If connected to ESP32 / Wokwi, the physical or simulated OLED displays the warning text instantly.
