/**
 * DrowsiGuard - Settings Manager
 * Centralized configuration store with localStorage persistence.
 * Provides live updates to FaceLandmarkEngine, HardwareBridge, and AudioAlert.
 */
class SettingsManager {
    constructor() {
        this.STORAGE_KEY = 'drowsiguard_settings_v4';
        this.defaults = {
            // Detection Thresholds
            earThreshold: 0.17,       // Calibrated for natural relaxed open eyes without straining
            marThreshold: 0.65,
            drowsyTimeThreshold: 3.5, // seconds (default 3.5s as requested)
            prolongedBlinkDuration: 3.0, // seconds: duration exceeding this counts as prolonged closure (>3s)
            prolongedBlinkCountThreshold: 5, // triggers drowsiness if prolonged closures > 5
            perclosThreshold: 20,     // percentage (20%)
            perclosWindowSeconds: 30, // seconds

            // Audio & Feedback
            alarmVolume: 0.8,
            audioAlertEnabled: true,
            vibrationEnabled: true,

            // Camera & Computer Vision
            facingMode: 'user',       // 'user' (front/driver-facing) or 'environment'
            multiFaceMode: 'primary', // 'primary' (focus closest) or 'strict' (pause detection)
            showLandmarks: true,
            autoTrackingEnabled: true, // Dynamic digital motion tracking & auto-framing
            trackingSensitivity: 0.12, // Interpolation speed for smooth PTZ panning
            baseDigitalZoom: 1.25,     // Digital crop margin for pan/tilt without edge clipping
            driverHudMode: false,      // Driver HUD / Stealth mode to prevent night glare
            baselineEar: 0.26          // Driver natural open-eye baseline
        };

        this.settings = this.load();
        this.listeners = [];
    }

    /**
     * Load settings from localStorage with fallback to defaults
     */
    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return Object.assign({}, this.defaults, parsed);
            }
        } catch (e) {
            console.warn('Could not read settings from localStorage, using defaults', e);
        }
        return Object.assign({}, this.defaults);
    }

    /**
     * Save settings to localStorage
     */
    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.settings));
        } catch (e) {
            console.warn('Could not save settings to localStorage', e);
        }
        this.notifyListeners();
    }

    /**
     * Update one or more settings keys
     */
    set(updates) {
        Object.assign(this.settings, updates);
        this.save();
    }

    /**
     * Get a setting by key
     */
    get(key) {
        return this.settings[key] !== undefined ? this.settings[key] : this.defaults[key];
    }

    /**
     * Reset all settings to default values
     */
    resetToDefaults() {
        this.settings = Object.assign({}, this.defaults);
        this.save();
    }

    /**
     * Register a callback listener triggered when settings change
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        this.listeners.forEach(cb => {
            try {
                cb(this.settings);
            } catch (e) {
                console.error('Settings listener error:', e);
            }
        });
    }
}

window.settingsMgr = new SettingsManager();
