/**
 * DrowsiGuard - Application Main Controller
 * Connects 3 streamlined cockpit sections (Monitor, Telemetry, Settings),
 * camera auto-tracking (PTZ face following), drowsiness delay time (3.5s),
 * slow closure tracking (>5 blinks with duration >3s), and telemetry export.
 */
document.addEventListener('DOMContentLoaded', () => {

    // 1. Initialize Engines & Hardware Bridge
    const webcamVideo = document.getElementById('webcam-feed');
    const outputCanvas = document.getElementById('output-canvas');

    if (webcamVideo && outputCanvas && window.faceEngine) {
        window.faceEngine.init(webcamVideo, outputCanvas);
    }

    if (window.telemetryMgr) {
        window.telemetryMgr.initCharts();
    }

    if (window.hardwareBridge) {
        window.hardwareBridge.init();
    }

    // 2. Navigation Tab Switching (Desktop & Mobile 3 Core Sections)
    const allTabBtns = document.querySelectorAll('.nav-btn, .mobile-nav-btn');
    const allTabContents = document.querySelectorAll('.tab-content');

    allTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.getAttribute('data-tab');
            if (!targetTabId) return;

            // Remove active class from all buttons and tabs
            allTabBtns.forEach(b => b.classList.remove('active'));
            allTabContents.forEach(c => c.classList.remove('active'));

            // Activate target buttons matching data-tab
            document.querySelectorAll(`[data-tab="${targetTabId}"]`).forEach(b => b.classList.add('active'));
            const targetTab = document.getElementById(targetTabId);
            if (targetTab) targetTab.classList.add('active');

            // Scroll to top on tab change for mobile ease
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    // 3. Camera Controls & Smart Motion Tracking Toggle
    const btnStartCam = document.getElementById('btn-start-camera-main');
    const btnSwitchCam = document.getElementById('btn-switch-camera');
    const btnToggleLandmarks = document.getElementById('btn-toggle-landmarks');
    const btnToggleAutoTrack = document.getElementById('btn-toggle-autotrack');
    const trackingPill = document.getElementById('tracking-status-pill');

    if (btnStartCam) {
        btnStartCam.addEventListener('click', () => window.faceEngine.startCamera());
    }
    if (btnSwitchCam) {
        btnSwitchCam.addEventListener('click', () => window.faceEngine.switchCamera());
    }
    if (btnToggleLandmarks) {
        btnToggleLandmarks.addEventListener('click', () => {
            window.faceEngine.showLandmarks = !window.faceEngine.showLandmarks;
            btnToggleLandmarks.classList.toggle('active', window.faceEngine.showLandmarks);
            if (window.settingsMgr) {
                window.settingsMgr.set({ showLandmarks: window.faceEngine.showLandmarks });
            }
        });
    }

    if (btnToggleAutoTrack) {
        btnToggleAutoTrack.addEventListener('click', () => {
            window.faceEngine.autoTrackingEnabled = !window.faceEngine.autoTrackingEnabled;
            const isEnabled = window.faceEngine.autoTrackingEnabled;
            btnToggleAutoTrack.classList.toggle('active', isEnabled);
            btnToggleAutoTrack.innerHTML = isEnabled ? 
                '<i class="fa-solid fa-arrows-to-dot"></i> Auto-Track: ON' : 
                '<i class="fa-solid fa-arrows-to-dot"></i> Auto-Track: OFF';

            if (trackingPill) {
                trackingPill.className = isEnabled ? 'quick-pill badge-success' : 'quick-pill badge-neutral';
                trackingPill.innerHTML = isEnabled ? 
                    '<i class="fa-solid fa-arrows-to-dot"></i> Motion Auto-Track: ON' : 
                    '<i class="fa-solid fa-arrows-to-dot"></i> Motion Auto-Track: OFF';
            }

            const selectAutoTrack = document.getElementById('setting-autotrack-toggle');
            if (selectAutoTrack) selectAutoTrack.value = isEnabled ? 'true' : 'false';

            if (window.settingsMgr) {
                window.settingsMgr.set({ autoTrackingEnabled: isEnabled });
            }
        });
    }

    // 4. Audio Controls & Warning Dismissal
    const btnAudioToggle = document.getElementById('btn-audio-toggle');
    const btnDismissAlarm = document.getElementById('btn-dismiss-alarm');
    const btnTestAlarm = document.getElementById('btn-test-alarm');

    if (btnAudioToggle) {
        btnAudioToggle.addEventListener('click', () => {
            const isMuted = window.audioAlert.toggleMute();
            btnAudioToggle.innerHTML = isMuted ? 
                '<i class="fa-solid fa-volume-xmark"></i>' : 
                '<i class="fa-solid fa-volume-high"></i>';
        });
    }

    if (btnDismissAlarm) {
        btnDismissAlarm.addEventListener('click', () => {
            window.audioAlert.stopAlarm();
            const alarmOverlay = document.getElementById('alarm-overlay');
            if (alarmOverlay) alarmOverlay.classList.add('hidden');
        });
    }

    if (btnTestAlarm) {
        btnTestAlarm.addEventListener('click', () => {
            window.audioAlert.testAlarmSound();
        });
    }

    // 5. Settings Management & Form Binding
    populateSettingsForm();

    function populateSettingsForm() {
        if (!window.settingsMgr) return;

        const s = window.settingsMgr.settings;

        // Monitor sliders
        const inputEarThresh = document.getElementById('input-ear-thresh');
        const lblEarThresh = document.getElementById('lbl-ear-thresh');
        const inputTimeThresh = document.getElementById('input-time-thresh');
        const lblTimeThresh = document.getElementById('lbl-time-thresh');
        const lblStatusDelay = document.getElementById('lbl-status-delay');

        // Settings tab inputs
        const setEarThresh = document.getElementById('setting-ear-thresh');
        const setLblEar = document.getElementById('setting-lbl-ear');
        const setMarThresh = document.getElementById('setting-mar-thresh');
        const setLblMar = document.getElementById('setting-lbl-mar');
        const setTimeThresh = document.getElementById('setting-time-thresh');
        const setLblTime = document.getElementById('setting-lbl-time');
        const setPerclosThresh = document.getElementById('setting-perclos-thresh');
        const setLblPerclos = document.getElementById('setting-lbl-perclos');
        const setVolume = document.getElementById('setting-volume');
        const setLblVolume = document.getElementById('setting-lbl-volume');

        const setFacingMode = document.getElementById('setting-facing-mode');
        const setMultiFaceMode = document.getElementById('setting-multiface-mode');
        const setAutoTrack = document.getElementById('setting-autotrack-toggle');

        const drowsyTime = s.drowsyTimeThreshold || 3.5;

        if (inputEarThresh) inputEarThresh.value = s.earThreshold;
        if (lblEarThresh) lblEarThresh.innerText = s.earThreshold.toFixed(2);
        if (setEarThresh) setEarThresh.value = s.earThreshold;
        if (setLblEar) setLblEar.innerText = s.earThreshold.toFixed(2);

        if (inputTimeThresh) inputTimeThresh.value = drowsyTime;
        if (lblTimeThresh) lblTimeThresh.innerText = drowsyTime.toFixed(1) + 's';
        if (setTimeThresh) setTimeThresh.value = drowsyTime;
        if (setLblTime) setLblTime.innerText = drowsyTime.toFixed(1) + 's';
        if (lblStatusDelay) lblStatusDelay.innerText = drowsyTime.toFixed(1) + 's';

        if (setMarThresh) setMarThresh.value = s.marThreshold;
        if (setLblMar) setLblMar.innerText = s.marThreshold.toFixed(2);

        if (setPerclosThresh) setPerclosThresh.value = s.perclosThreshold;
        if (setLblPerclos) setLblPerclos.innerText = s.perclosThreshold + '%';

        if (setVolume) setVolume.value = s.alarmVolume;
        if (setLblVolume) setLblVolume.innerText = Math.round(s.alarmVolume * 100) + '%';
        if (window.audioAlert) window.audioAlert.setVolume(s.alarmVolume);

        if (setFacingMode) setFacingMode.value = s.facingMode;
        if (setMultiFaceMode) setMultiFaceMode.value = s.multiFaceMode;
        if (setAutoTrack) setAutoTrack.value = (s.autoTrackingEnabled !== false) ? 'true' : 'false';
    }

    // Dynamic slider listeners for instant feedback
    const bindSlider = (sliderId, labelId, suffix = '', cb) => {
        const slider = document.getElementById(sliderId);
        const label = document.getElementById(labelId);
        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                if (label) label.innerText = val + suffix;
                if (cb) cb(val);
            });
        }
    };

    bindSlider('input-ear-thresh', 'lbl-ear-thresh', '', (v) => {
        window.faceEngine.earThreshold = v;
        const setEar = document.getElementById('setting-ear-thresh');
        const setLbl = document.getElementById('setting-lbl-ear');
        if (setEar) setEar.value = v;
        if (setLbl) setLbl.innerText = v.toFixed(2);
        window.settingsMgr.set({ earThreshold: v });
    });

    bindSlider('setting-ear-thresh', 'setting-lbl-ear', '', (v) => {
        window.faceEngine.earThreshold = v;
        const inEar = document.getElementById('input-ear-thresh');
        const inLbl = document.getElementById('lbl-ear-thresh');
        if (inEar) inEar.value = v;
        if (inLbl) inLbl.innerText = v.toFixed(2);
        window.settingsMgr.set({ earThreshold: v });
    });

    bindSlider('input-time-thresh', 'lbl-time-thresh', 's', (v) => {
        window.faceEngine.drowsyTimeThreshold = v;
        const setTime = document.getElementById('setting-time-thresh');
        const setLbl = document.getElementById('setting-lbl-time');
        const lblStatusDelay = document.getElementById('lbl-status-delay');
        if (setTime) setTime.value = v;
        if (setLbl) setLbl.innerText = v.toFixed(1) + 's';
        if (lblStatusDelay) lblStatusDelay.innerText = v.toFixed(1) + 's';
        window.settingsMgr.set({ drowsyTimeThreshold: v });
    });

    bindSlider('setting-time-thresh', 'setting-lbl-time', 's', (v) => {
        window.faceEngine.drowsyTimeThreshold = v;
        const inTime = document.getElementById('input-time-thresh');
        const inLbl = document.getElementById('lbl-time-thresh');
        const lblStatusDelay = document.getElementById('lbl-status-delay');
        if (inTime) inTime.value = v;
        if (inLbl) inLbl.innerText = v.toFixed(1) + 's';
        if (lblStatusDelay) lblStatusDelay.innerText = v.toFixed(1) + 's';
        window.settingsMgr.set({ drowsyTimeThreshold: v });
    });

    bindSlider('setting-mar-thresh', 'setting-lbl-mar', '', (v) => {
        window.faceEngine.marThreshold = v;
        window.settingsMgr.set({ marThreshold: v });
    });

    bindSlider('setting-perclos-thresh', 'setting-lbl-perclos', '%', (v) => {
        window.faceEngine.perclosThreshold = v;
        window.settingsMgr.set({ perclosThreshold: v });
    });

    bindSlider('setting-volume', 'setting-lbl-volume', '', (v) => {
        const pct = Math.round(v * 100) + '%';
        const lbl = document.getElementById('setting-lbl-volume');
        if (lbl) lbl.innerText = pct;
        if (window.audioAlert) window.audioAlert.setVolume(v);
        window.settingsMgr.set({ alarmVolume: v });
    });

    // Save Settings Button
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            const facingMode = document.getElementById('setting-facing-mode')?.value || 'user';
            const multiFaceMode = document.getElementById('setting-multiface-mode')?.value || 'primary';
            const autoTrackVal = document.getElementById('setting-autotrack-toggle')?.value === 'true';

            window.settingsMgr.set({
                facingMode: facingMode,
                multiFaceMode: multiFaceMode,
                autoTrackingEnabled: autoTrackVal
            });

            window.faceEngine.autoTrackingEnabled = autoTrackVal;
            if (btnToggleAutoTrack) {
                btnToggleAutoTrack.classList.toggle('active', autoTrackVal);
                btnToggleAutoTrack.innerHTML = autoTrackVal ? 
                    '<i class="fa-solid fa-arrows-to-dot"></i> Auto-Track: ON' : 
                    '<i class="fa-solid fa-arrows-to-dot"></i> Auto-Track: OFF';
            }

            alert("Settings applied and saved successfully!");
        });
    }

    // Reset Settings Button
    const btnResetSettings = document.getElementById('btn-reset-settings');
    if (btnResetSettings) {
        btnResetSettings.addEventListener('click', () => {
            if (confirm("Reset all settings to default values?")) {
                window.settingsMgr.resetToDefaults();
                populateSettingsForm();
            }
        });
    }

    // 6. Telemetry Export Controls
    const btnExportCSV = document.getElementById('btn-export-csv');
    const btnExportJSON = document.getElementById('btn-export-json');
    const btnClearTelemetry = document.getElementById('btn-clear-telemetry');

    if (btnExportCSV) btnExportCSV.addEventListener('click', () => window.telemetryMgr.exportCSV());
    if (btnExportJSON) btnExportJSON.addEventListener('click', () => window.telemetryMgr.exportJSON());
    if (btnClearTelemetry) btnClearTelemetry.addEventListener('click', () => window.telemetryMgr.resetData());

    // 7. Simulated Driver Behavior Feeds
    let simInterval = null;
    const simBtns = document.querySelectorAll('.btn-sim-preset');

    simBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-sim');
            startDriverSimulation(mode);
        });
    });

    function startDriverSimulation(mode) {
        if (simInterval) clearInterval(simInterval);

        // Switch to main monitor tab
        document.querySelector('[data-tab="tab-detector"]').click();
        window.faceEngine.hidePlaceholder();
        const sourceVal = document.getElementById('val-source');
        if (sourceVal) sourceVal.innerText = `Simulation Test Mode (${mode.toUpperCase()})`;

        let frameCounter = 0;
        let slowBlinkSimulationCount = 0;
        let slowBlinkPhase = 0; // for slowblinks mode

        simInterval = setInterval(() => {
            frameCounter++;
            let simulatedEar = 0.32;
            let simulatedMar = 0.22;
            let isClosed = false;

            if (mode === 'awake') {
                // Normal alertness with normal blinks (every ~3 seconds, lasting only 200ms)
                // Proves that normal blinks NEVER trigger drowsiness!
                const cycle = frameCounter % 30;
                if (cycle >= 28) {
                    simulatedEar = 0.12; // brief 200ms blink
                    isClosed = true;
                } else {
                    simulatedEar = 0.31 + Math.sin(frameCounter * 0.15) * 0.03;
                    isClosed = false;
                }
                simulatedMar = 0.20 + Math.cos(frameCounter * 0.1) * 0.04;
            } 
            else if (mode === 'drowsy') {
                // Continuous sustained closure: eyes remain closed > 3.5s
                simulatedEar = 0.09;
                isClosed = true;
                simulatedMar = 0.24;
            } 
            else if (mode === 'slowblinks') {
                // Simulates repeated prolonged closures each lasting 3.2s (>3.0s threshold)
                // When 5 of these occur, it demonstrates the >5 prolonged closures drowsiness trigger!
                slowBlinkPhase++;
                const phaseInCycle = slowBlinkPhase % 45; // 4.5s cycle (3.2s closed, 1.3s open)
                if (phaseInCycle < 32) {
                    simulatedEar = 0.10; // closed for 3.2 seconds
                    isClosed = true;
                } else {
                    simulatedEar = 0.30; // open
                    isClosed = false;
                }
                simulatedMar = 0.22;
            }
            else if (mode === 'yawning') {
                simulatedEar = 0.29;
                isClosed = false;
                // High mouth aspect ratio (> 0.65 threshold)
                simulatedMar = 0.74 + Math.sin(frameCounter * 0.2) * 0.12;
            }

            const perclos = window.earMarCalc.updatePerclos(isClosed);

            let simState = 'AWAKE';
            let durationSec = 0;

            if (isClosed) {
                if (!window.faceEngine.closedEyesStartTime) {
                    window.faceEngine.closedEyesStartTime = performance.now();
                    window.faceEngine.isEyeCurrentlyClosed = true;
                }
                durationSec = (performance.now() - window.faceEngine.closedEyesStartTime) / 1000;
                
                // Continuous closure >= 3.5s triggers WARNING
                if (durationSec >= window.faceEngine.drowsyTimeThreshold) {
                    simState = 'WARNING';
                } else if (durationSec >= 1.0) {
                    simState = 'EYES_CLOSING';
                } else {
                    simState = 'BLINKING';
                }
            } else {
                if (window.faceEngine.isEyeCurrentlyClosed && window.faceEngine.closedEyesStartTime) {
                    const dur = (performance.now() - window.faceEngine.closedEyesStartTime) / 1000;
                    if (dur >= 0.08 && dur < 0.80) {
                        window.faceEngine.blinkCount++;
                        window.faceEngine.recentBlinks.push(Date.now());
                    } else if (dur >= window.faceEngine.prolongedBlinkDuration) {
                        window.faceEngine.prolongedBlinkCount++;
                        window.faceEngine.recentProlongedBlinks.push(Date.now());
                    }
                    window.faceEngine.closedEyesStartTime = null;
                    window.faceEngine.isEyeCurrentlyClosed = false;
                }

                if (simulatedMar > window.faceEngine.marThreshold) {
                    simState = 'YAWNING';
                } else {
                    simState = 'AWAKE';
                }
            }

            // Check condition: >5 prolonged closures (>3s)
            if (window.faceEngine.recentProlongedBlinks.length >= window.faceEngine.prolongedBlinkCountThreshold) {
                simState = 'WARNING';
            }

            // Trigger prediction state, UI, and virtual actuators
            window.faceEngine.triggerPredictionState(simState, simulatedEar, simulatedMar, perclos, durationSec);

            // Record Telemetry
            window.telemetryMgr.addRecord(
                simulatedEar, 
                simulatedMar, 
                perclos, 
                simState, 
                window.faceEngine.earThreshold, 
                window.faceEngine.marThreshold
            );

        }, 100);
    }

    // 8. Service Worker Registration (PWA Support)
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope);
        }).catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
        });
    }

});
