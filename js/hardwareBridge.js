/**
 * DrowsiGuard - Hardware & MQTT Bridge
 * Manages communication between Smartphone/Laptop (Edge Processor) and ESP32 (Alert Controller).
 * Provides clean Paho MQTT abstraction over WebSockets and drives the Virtual ESP32 Hardware Emulator.
 */
class HardwareBridge {
    constructor() {
        this.client = null;
        this.connectionState = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'
        this.isEsp32Online = false;
        this.lastEsp32Heartbeat = 0;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 15000;

        // Last published alert state to avoid redundant flooding
        this.lastPublishedAlert = null;
        this.lastTelemetryPublishTime = 0;
        this.telemetryPublishInterval = 1000; // 1 second

        // Virtual Hardware State
        this.virtualState = {
            greenLed: true,
            redLed: false,
            buzzer: false,
            oledHeader: 'DROWSIGUARD ECE',
            oledLine1: 'STATUS: READY',
            oledLine2: 'AWAITING CAM FEED',
            oledLine3: 'EAR: 0.00  PERC: 0%'
        };

        // Listen for heartbeat timeouts every 3 seconds
        setInterval(() => this.checkEsp32Timeout(), 3000);
    }

    init() {
        this.updateVirtualHardwareUI();
        // Auto-connect using saved settings if available
        if (window.settingsMgr) {
            const host = window.settingsMgr.get('mqttHost');
            const port = window.settingsMgr.get('mqttPort');
            const brokerType = window.settingsMgr.get('mqttBrokerType');
            // If local host or public broker configured, attempt initial connection
            if (host && port) {
                console.log(`[HardwareBridge] Initializing MQTT client for ${brokerType} broker: ${host}:${port}`);
                this.connect();
            }
        }
    }

    /**
     * Connect to MQTT Broker over WebSockets
     */
    connect() {
        if (this.connectionState === 'CONNECTING' || this.connectionState === 'CONNECTED') {
            return;
        }

        if (typeof Paho === 'undefined' || !Paho.MQTT || !Paho.MQTT.Client) {
            console.warn('[HardwareBridge] Paho MQTT client library not loaded. Virtual hardware will still operate.');
            this.setConnectionState('ERROR', 'MQTT Library Unavailable');
            return;
        }

        const host = window.settingsMgr ? window.settingsMgr.get('mqttHost') : '127.0.0.1';
        const port = Number(window.settingsMgr ? window.settingsMgr.get('mqttPort') : 9001);
        const path = window.settingsMgr ? window.settingsMgr.get('mqttPath') : '';
        const useSSL = window.settingsMgr ? window.settingsMgr.get('mqttUseSSL') : false;
        const clientId = 'drowsiguard_' + Math.floor(Math.random() * 100000);

        this.setConnectionState('CONNECTING', `Connecting to ${host}:${port}...`);

        try {
            this.client = new Paho.MQTT.Client(host, port, path, clientId);

            this.client.onConnectionLost = (responseObject) => {
                console.warn('[HardwareBridge] Connection lost:', responseObject.errorMessage);
                this.isEsp32Online = false;
                this.setConnectionState('DISCONNECTED', 'Connection lost: ' + responseObject.errorMessage);
                this.scheduleReconnect();
            };

            this.client.onMessageArrived = (message) => {
                this.handleIncomingMessage(message.destinationName, message.payloadString);
            };

            const connectOptions = {
                useSSL: useSSL,
                timeout: 5,
                keepAliveInterval: 30,
                cleanSession: true,
                onSuccess: () => {
                    console.log(`[HardwareBridge] Successfully connected to MQTT broker (${host}:${port})`);
                    this.reconnectAttempts = 0;
                    this.setConnectionState('CONNECTED', 'Connected');
                    
                    // Subscribe to ESP32 hardware status
                    const topicStatus = window.settingsMgr ? window.settingsMgr.get('topicStatus') : 'drowsiguard/hardware/status';
                    try {
                        this.client.subscribe(topicStatus);
                        console.log(`[HardwareBridge] Subscribed to topic: ${topicStatus}`);
                    } catch (subErr) {
                        console.warn('[HardwareBridge] Subscription error:', subErr);
                    }

                    // Send initial normal state
                    this.publishAlert(false, 'AWAKE', 0, 0.30, 0);
                },
                onFailure: (err) => {
                    console.warn('[HardwareBridge] Connection failed:', err.errorMessage);
                    this.setConnectionState('DISCONNECTED', err.errorMessage || 'Failed to connect');
                    this.scheduleReconnect();
                }
            };

            this.client.connect(connectOptions);

        } catch (e) {
            console.error('[HardwareBridge] MQTT connect exception:', e);
            this.setConnectionState('ERROR', e.message);
            this.scheduleReconnect();
        }
    }

    /**
     * Disconnect cleanly from broker
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.client && this.connectionState === 'CONNECTED') {
            try {
                this.client.disconnect();
            } catch (e) {
                console.warn('[HardwareBridge] Disconnect error:', e);
            }
        }
        this.isEsp32Online = false;
        this.setConnectionState('DISCONNECTED', 'Manual Disconnect');
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectAttempts++;
        const delay = Math.min(this.maxReconnectDelay, 2000 * Math.pow(1.5, this.reconnectAttempts - 1));
        console.log(`[HardwareBridge] Scheduling reconnect attempt #${this.reconnectAttempts} in ${Math.round(delay / 1000)}s`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    /**
     * Handle inbound messages from ESP32
     */
    handleIncomingMessage(topic, payloadStr) {
        try {
            const data = JSON.parse(payloadStr);
            this.lastEsp32Heartbeat = Date.now();
            this.isEsp32Online = true;
            this.updateHardwareBadges();

            // Log incoming payload to monitor if available
            this.logMqttTraffic('INBOUND', topic, data);
        } catch (e) {
            // Non-JSON status
            this.lastEsp32Heartbeat = Date.now();
            this.isEsp32Online = true;
            this.updateHardwareBadges();
            this.logMqttTraffic('INBOUND', topic, payloadStr);
        }
    }

    checkEsp32Timeout() {
        if (this.isEsp32Online && (Date.now() - this.lastEsp32Heartbeat > 12000)) {
            this.isEsp32Online = false;
            this.updateHardwareBadges();
        }
    }

    /**
     * Publish Driver Alert State to ESP32
     * @param {boolean} isAlert - true if drowsy/warning, false if normal
     * @param {string} state - "AWAKE" | "WARNING" | "YAWNING" | "CLOSING_EYES"
     * @param {number} durationSec - Eye closure duration
     * @param {number} ear - Current EAR
     * @param {number} perclos - Current PERCLOS percentage
     */
    publishAlert(isAlert, state, durationSec, ear, perclos) {
        // Synchronize Virtual Hardware Emulator immediately
        this.syncVirtualHardware(isAlert, state, durationSec, ear, perclos);

        // Deduplicate rapid identical alerts unless state or alert flag changed
        const alertSignature = `${isAlert}_${state}`;
        if (this.lastPublishedAlert === alertSignature && Date.now() - this.lastAlertPublishTime < 2000) {
            return;
        }

        this.lastPublishedAlert = alertSignature;
        this.lastAlertPublishTime = Date.now();

        const topicAlert = window.settingsMgr ? window.settingsMgr.get('topicAlert') : 'drowsiguard/alert';

        const payload = {
            alert: isAlert,
            state: state,
            redLed: isAlert ? 1 : 0,
            greenLed: isAlert ? 0 : 1,
            buzzer: isAlert ? 1 : 0,
            durationSec: Number(durationSec.toFixed(1)),
            ear: Number(ear.toFixed(3)),
            perclos: Math.round(perclos),
            oled: isAlert ? 'DROWSINESS WARNING' : 'AWAKE / NORMAL',
            timestamp: Math.floor(Date.now() / 1000)
        };

        this.sendMqttMessage(topicAlert, payload);
    }

    /**
     * Publish Periodic Telemetry to MQTT
     */
    publishTelemetry(payload) {
        const now = Date.now();
        if (now - this.lastTelemetryPublishTime < this.telemetryPublishInterval) {
            return;
        }
        this.lastTelemetryPublishTime = now;

        const topicTelemetry = window.settingsMgr ? window.settingsMgr.get('topicTelemetry') : 'drowsiguard/telemetry';
        this.sendMqttMessage(topicTelemetry, payload);
    }

    sendMqttMessage(topic, objPayload) {
        if (!this.client || this.connectionState !== 'CONNECTED') {
            return; // Fail-safe: No crash if disconnected
        }

        try {
            const messageStr = JSON.stringify(objPayload);
            const message = new Paho.MQTT.Message(messageStr);
            message.destinationName = topic;
            message.qos = 0;
            this.client.send(message);

            this.logMqttTraffic('OUTBOUND', topic, objPayload);
        } catch (e) {
            console.warn('[HardwareBridge] Failed to send MQTT message:', e);
        }
    }

    /**
     * Update the Virtual ESP32 Hardware Emulator UI
     */
    syncVirtualHardware(isAlert, state, durationSec, ear, perclos) {
        if (isAlert) {
            this.virtualState.greenLed = false;
            this.virtualState.redLed = true;
            this.virtualState.buzzer = true;
            this.virtualState.oledHeader = '! DROWSINESS WARNING !';
            this.virtualState.oledLine1 = 'DRIVER ASLEEP / DROWSY';
            this.virtualState.oledLine2 = `CLOSED: ${durationSec.toFixed(1)}s (EAR ${ear.toFixed(2)})`;
            this.virtualState.oledLine3 = `PERCLOS: ${perclos}% | WAKE UP!`;
        } else if (state === 'YAWNING') {
            this.virtualState.greenLed = true;
            this.virtualState.redLed = false;
            this.virtualState.buzzer = false;
            this.virtualState.oledHeader = 'DROWSIGUARD MONITOR';
            this.virtualState.oledLine1 = 'STATUS: YAWN DETECTED';
            this.virtualState.oledLine2 = `FATIGUE SIGN DETECTED`;
            this.virtualState.oledLine3 = `EAR: ${ear.toFixed(2)}  PERC: ${perclos}%`;
        } else {
            this.virtualState.greenLed = true;
            this.virtualState.redLed = false;
            this.virtualState.buzzer = false;
            this.virtualState.oledHeader = 'DROWSIGUARD ECE';
            this.virtualState.oledLine1 = 'STATUS: AWAKE / NORMAL';
            this.virtualState.oledLine2 = 'DRIVER ALERT & ATTENTIVE';
            this.virtualState.oledLine3 = `EAR: ${ear.toFixed(2)}  PERC: ${perclos}%`;
        }

        this.updateVirtualHardwareUI();
    }

    updateVirtualHardwareUI() {
        const vLedGreen = document.getElementById('virt-led-green');
        const vLedRed = document.getElementById('virt-led-red');
        const vBuzzer = document.getElementById('virt-buzzer-indicator');
        const vOledHeader = document.getElementById('virt-oled-header');
        const vOledLine1 = document.getElementById('virt-oled-line1');
        const vOledLine2 = document.getElementById('virt-oled-line2');
        const vOledLine3 = document.getElementById('virt-oled-line3');

        if (vLedGreen) {
            vLedGreen.className = 'virt-led led-green ' + (this.virtualState.greenLed ? 'on' : 'off');
        }
        if (vLedRed) {
            vLedRed.className = 'virt-led led-red ' + (this.virtualState.redLed ? 'on flashing' : 'off');
        }
        if (vBuzzer) {
            vBuzzer.className = 'virt-buzzer ' + (this.virtualState.buzzer ? 'active' : 'idle');
        }
        if (vOledHeader) vOledHeader.innerText = this.virtualState.oledHeader;
        if (vOledLine1) vOledLine1.innerText = this.virtualState.oledLine1;
        if (vOledLine2) vOledLine2.innerText = this.virtualState.oledLine2;
        if (vOledLine3) vOledLine3.innerText = this.virtualState.oledLine3;
    }

    setConnectionState(state, detail) {
        this.connectionState = state;
        this.updateHardwareBadges(detail);
    }

    updateHardwareBadges(detail = '') {
        const mqttBadge = document.getElementById('badge-mqtt-status');
        const esp32Badge = document.getElementById('badge-esp32-status');
        const monitorMqttBadge = document.getElementById('monitor-mqtt-pill');
        const monitorEsp32Badge = document.getElementById('monitor-esp32-pill');

        const stateClassMap = {
            'CONNECTED': 'badge-success',
            'CONNECTING': 'badge-warning',
            'DISCONNECTED': 'badge-danger',
            'ERROR': 'badge-danger'
        };

        const className = stateClassMap[this.connectionState] || 'badge-neutral';

        if (mqttBadge) {
            mqttBadge.className = `status-pill ${className}`;
            mqttBadge.innerHTML = `<span class="pulse-dot"></span> MQTT: ${this.connectionState}`;
        }
        if (monitorMqttBadge) {
            monitorMqttBadge.className = `quick-pill ${className}`;
            monitorMqttBadge.innerHTML = `<i class="fa-solid fa-tower-broadcast"></i> MQTT: ${this.connectionState}`;
        }

        if (esp32Badge) {
            const espClass = this.isEsp32Online ? 'badge-success' : 'badge-danger';
            const espText = this.isEsp32Online ? 'ESP32: ONLINE' : 'ESP32: OFFLINE';
            esp32Badge.className = `status-pill ${espClass}`;
            esp32Badge.innerHTML = `<span class="pulse-dot"></span> ${espText}`;
        }
        if (monitorEsp32Badge) {
            const espClass = this.isEsp32Online ? 'badge-success' : 'badge-danger';
            const espText = this.isEsp32Online ? 'ESP32: ONLINE' : 'ESP32: OFFLINE';
            monitorEsp32Badge.className = `quick-pill ${espClass}`;
            monitorEsp32Badge.innerHTML = `<i class="fa-solid fa-microchip"></i> ${espText}`;
        }
    }

    logMqttTraffic(direction, topic, data) {
        const logBox = document.getElementById('mqtt-traffic-log');
        if (!logBox) return;

        const timeStr = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = `traffic-entry ${direction.toLowerCase()}`;
        
        const payloadFormatted = typeof data === 'object' ? JSON.stringify(data) : data;
        entry.innerHTML = `
            <span class="traffic-time">[${timeStr}]</span>
            <span class="traffic-tag ${direction.toLowerCase()}">${direction}</span>
            <span class="traffic-topic">${topic}</span>
            <span class="traffic-payload">${payloadFormatted}</span>
        `;

        logBox.insertBefore(entry, logBox.firstChild);
        while (logBox.children.length > 25) {
            logBox.removeChild(logBox.lastChild);
        }
    }
}

window.hardwareBridge = new HardwareBridge();
