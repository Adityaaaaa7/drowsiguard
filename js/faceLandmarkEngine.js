/**
 * DrowsiGuard - MediaPipe Face Mesh Engine & Real-Time Computer Vision Core
 * Features:
 * - On-device 468-point 3D landmark tracking (100% local edge AI)
 * - Intelligent Camera Motion Auto-Tracking (Digital Pan-Tilt Face Centering)
 * - Accurate blink classification (normal blinks vs. prolonged eye closures)
 * - Drowsiness Delay Time (default 3.5s) & Repeated Slow Closure tracking (>5 blinks with duration >3s)
 * - Multi-face handling and MQTT hardware bridge synchronization
 */
class FaceLandmarkEngine {
    constructor() {
        this.faceMesh = null;
        this.camera = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.canvasCtx = null;

        this.isRunning = false;
        this.showLandmarks = true;
        this.facingMode = 'user'; // 'user' (front camera) or 'environment' (rear camera)
        this.localStream = null;

        // Dynamic Detection Parameters (Bound to SettingsManager)
        this.earThreshold = 0.21;
        this.marThreshold = 0.65;
        this.drowsyTimeThreshold = 3.5; // seconds (default 3.5s as requested)
        this.prolongedBlinkDuration = 3.0; // threshold in seconds for a closure to be "prolonged"
        this.prolongedBlinkCountThreshold = 5; // >5 prolonged closures of >3s triggers drowsiness
        this.perclosThreshold = 20;     // 20%

        // Motion Auto-Tracking & Virtual Pan-Tilt-Zoom (PTZ)
        this.autoTrackingEnabled = true;
        this.currentPanX = 0;
        this.currentPanY = 0;
        this.currentTilt = 0;
        this.targetPanX = 0;
        this.targetPanY = 0;
        this.targetTilt = 0;
        this.zoomLevel = 1.25; // Digital zoom to allow panning without black borders

        // State Machine States:
        // 'INITIALIZING' | 'NO_FACE' | 'AWAKE' | 'BLINKING' | 'EYES_CLOSING' | 'YAWNING' | 'DROWSY' | 'WARNING' | 'MULTIPLE_FACES'
        this.currentState = 'INITIALIZING';
        this.lastPredictionState = 'INITIALIZING';

        // Tracking Counters & Timing
        this.closedEyesStartTime = null;
        this.totalClosedSeconds = 0;
        this.isEyeCurrentlyClosed = false;
        
        // Blink Tracking: Normal brief blinks (80ms - 500ms)
        this.blinkCount = 0;
        this.recentBlinks = []; // Timestamps of normal blinks in last 60 seconds
        this.blinkRate = 0;     // Blinks per minute

        // Prolonged Eye Closures Tracking (>3s duration)
        this.prolongedBlinkCount = 0;
        this.recentProlongedBlinks = []; // Timestamps of closures lasting >3.0 seconds

        // Yawn Tracking
        this.yawnCount = 0;
        this.yawnStartTime = null;
        this.currentYawnDuration = 0;
        this.isYawnCurrentlyActive = false;

        // Warnings & Alerts
        this.warningCount = 0;
        this.wasWarningActive = false;

        // Multi-Face Detection
        this.multiFaceDetected = false;
        this.multiFaceCount = 0;

        // Performance tracking
        this.lastFrameTime = performance.now();
        this.fps = 0;

        // Wire to Settings Manager if loaded
        if (window.settingsMgr) {
            this.earThreshold = window.settingsMgr.get('earThreshold');
            this.marThreshold = window.settingsMgr.get('marThreshold');
            this.drowsyTimeThreshold = window.settingsMgr.get('drowsyTimeThreshold') || 3.5;
            this.prolongedBlinkDuration = window.settingsMgr.get('prolongedBlinkDuration') || 3.0;
            this.prolongedBlinkCountThreshold = window.settingsMgr.get('prolongedBlinkCountThreshold') || 5;
            this.perclosThreshold = window.settingsMgr.get('perclosThreshold') || 20;
            this.showLandmarks = window.settingsMgr.get('showLandmarks');
            this.facingMode = window.settingsMgr.get('facingMode');
            this.autoTrackingEnabled = window.settingsMgr.get('autoTrackingEnabled') !== false;

            window.settingsMgr.onChange(settings => {
                this.earThreshold = settings.earThreshold;
                this.marThreshold = settings.marThreshold;
                this.drowsyTimeThreshold = settings.drowsyTimeThreshold || 3.5;
                this.prolongedBlinkDuration = settings.prolongedBlinkDuration || 3.0;
                this.prolongedBlinkCountThreshold = settings.prolongedBlinkCountThreshold || 5;
                this.perclosThreshold = settings.perclosThreshold || 20;
                this.showLandmarks = settings.showLandmarks;
                if (settings.autoTrackingEnabled !== undefined) {
                    this.autoTrackingEnabled = settings.autoTrackingEnabled;
                }
            });
        }
    }

    init(videoEl, canvasEl) {
        this.videoElement = videoEl;
        this.canvasElement = canvasEl;
        this.canvasCtx = canvasEl.getContext('2d');

        if (typeof FaceMesh === 'undefined') {
            console.error('[FaceLandmarkEngine] MediaPipe FaceMesh library not loaded.');
            return;
        }

        // Instantiate MediaPipe FaceMesh (Runs locally on-device via WebAssembly/WebGL)
        this.faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        this.faceMesh.setOptions({
            maxNumFaces: 2, // Track up to 2 faces to detect interference
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults((results) => this.onResults(results));
    }

    async startCamera() {
        if (this.isRunning) return;

        try {
            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera API (getUserMedia) not supported in this context. Use HTTPS or localhost.");
            }

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.localStream;
            await this.videoElement.play();

            this.isRunning = true;
            this.hidePlaceholder();

            // Setup MediaPipe Camera Utility
            if (typeof Camera !== 'undefined') {
                this.camera = new Camera(this.videoElement, {
                    onFrame: async () => {
                        if (this.isRunning && this.videoElement && this.videoElement.readyState >= 2) {
                            await this.faceMesh.send({ image: this.videoElement });
                        }
                    },
                    width: 1280,
                    height: 720
                });
                this.camera.start();
            } else {
                this.processVideoLoop();
            }

            const sysStatus = document.getElementById('system-status-pill');
            if (sysStatus) {
                sysStatus.className = "status-pill status-ready";
                sysStatus.innerHTML = '<span class="pulse-dot"></span> Camera Active';
            }

        } catch (err) {
            console.error("[FaceLandmarkEngine] Camera access error:", err);
            const ph = document.getElementById('camera-placeholder');
            if (ph) {
                ph.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; font-size: 40px;"></i>
                    <p style="color: #ef4444; font-weight: 600;">Camera Access Failed</p>
                    <p style="font-size: 12px; max-width: 320px; opacity: 0.8;">${err.message}</p>
                    <button id="btn-start-camera-retry" class="btn-primary" style="margin-top: 8px;">
                        <i class="fa-solid fa-rotate-right"></i> Retry Camera
                    </button>
                `;
                const retryBtn = document.getElementById('btn-start-camera-retry');
                if (retryBtn) retryBtn.addEventListener('click', () => this.startCamera());
            }
        }
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        if (window.settingsMgr) {
            window.settingsMgr.set({ facingMode: this.facingMode });
        }
        this.stopCamera();
        await this.startCamera();
    }

    stopCamera() {
        this.isRunning = false;
        if (this.camera) {
            try { this.camera.stop(); } catch(e) {}
            this.camera = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
        this.showPlaceholder();
    }

    showPlaceholder() {
        const ph = document.getElementById('camera-placeholder');
        if (ph) ph.style.display = 'flex';
    }

    hidePlaceholder() {
        const ph = document.getElementById('camera-placeholder');
        if (ph) ph.style.display = 'none';
    }

    async processVideoLoop() {
        if (!this.isRunning) return;
        if (this.videoElement && this.videoElement.readyState >= 2) {
            await this.faceMesh.send({ image: this.videoElement });
        }
        requestAnimationFrame(() => this.processVideoLoop());
    }

    /**
     * Compute approximate 2D bounding box for a face landmark set
     */
    getFaceBounds(landmarks) {
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        landmarks.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        });
        return {
            minX, maxX, minY, maxY,
            width: maxX - minX,
            height: maxY - minY,
            area: (maxX - minX) * (maxY - minY),
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };
    }

    /**
     * Intelligent Camera Motion Auto-Tracking:
     * When the driver moves or tilts left/right/up/down, smoothly pan & rotate camera view
     * to keep driver's face centered in the frame.
     */
    updateMotionTracking(landmarks) {
        if (!this.autoTrackingEnabled || !landmarks) {
            // Smoothly return to center
            this.targetPanX = 0;
            this.targetPanY = 0;
            this.targetTilt = 0;
        } else {
            // Landmark points: 33 (left eye outer), 263 (right eye outer), 1 (nose tip)
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            const nose = landmarks[1];

            // Calculate driver face center (0.0 to 1.0)
            const faceCenterX = (leftEye.x + rightEye.x) / 2;
            const faceCenterY = nose.y;

            // Calculate head tilt angle (roll angle in degrees)
            const dx = rightEye.x - leftEye.x;
            const dy = rightEye.y - leftEye.y;
            const rollAngleRad = Math.atan2(dy, dx);
            const rollAngleDeg = (rollAngleRad * 180) / Math.PI;

            // Offset from frame center (0.5, 0.5)
            // Note: Camera feed has scaleX(-1) for mirror mode.
            // When driver moves left (their left), faceCenterX increases/decreases accordingly.
            const offsetFactorX = (faceCenterX - 0.5);
            const offsetFactorY = (faceCenterY - 0.5);

            // Calculate target Pan & Tilt percentages
            this.targetPanX = offsetFactorX * 36; // Range ~ -18% to +18%
            this.targetPanY = offsetFactorY * 26; // Range ~ -13% to +13%
            this.targetTilt = -rollAngleDeg * 0.75; // Compensate for head tilt
        }

        // Exponential smoothing (LERP) for robotic-smooth motion
        const lerpFactor = 0.14;
        this.currentPanX += (this.targetPanX - this.currentPanX) * lerpFactor;
        this.currentPanY += (this.targetPanY - this.currentPanY) * lerpFactor;
        this.currentTilt += (this.targetTilt - this.currentTilt) * lerpFactor;

        // Apply synchronized transform to BOTH video element and canvas overlay
        const transformStr = this.autoTrackingEnabled ? 
            `scaleX(-1) translate(${this.currentPanX.toFixed(2)}%, ${this.currentPanY.toFixed(2)}%) scale(${this.zoomLevel}) rotate(${this.currentTilt.toFixed(2)}deg)` :
            `scaleX(-1) translate(0%, 0%) scale(1) rotate(0deg)`;

        if (this.videoElement) {
            this.videoElement.style.transform = transformStr;
            this.videoElement.style.transformOrigin = 'center center';
        }
        if (this.canvasElement) {
            this.canvasElement.style.transform = transformStr;
            this.canvasElement.style.transformOrigin = 'center center';
        }
    }

    /**
     * Draw stylish smart tracking brackets on the canvas around the face
     */
    drawTrackingBrackets(bounds, width, height) {
        if (!this.autoTrackingEnabled || !bounds) return;

        const ctx = this.canvasCtx;
        const x = bounds.minX * width;
        const y = bounds.minY * height;
        const w = bounds.width * width;
        const h = bounds.height * height;
        const cornerLen = Math.min(24, w * 0.2);

        ctx.save();
        ctx.strokeStyle = '#06b6d4'; // Cyan tracking color
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;

        // Top-Left corner
        ctx.beginPath();
        ctx.moveTo(x, y + cornerLen);
        ctx.lineTo(x, y);
        ctx.lineTo(x + cornerLen, y);
        ctx.stroke();

        // Top-Right corner
        ctx.beginPath();
        ctx.moveTo(x + w - cornerLen, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + cornerLen);
        ctx.stroke();

        // Bottom-Left corner
        ctx.beginPath();
        ctx.moveTo(x, y + h - cornerLen);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + cornerLen, y + h);
        ctx.stroke();

        // Bottom-Right corner
        ctx.beginPath();
        ctx.moveTo(x + w - cornerLen, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - cornerLen);
        ctx.stroke();

        // Target Tag
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#06b6d4';
        ctx.fillText(`MOTION TRACKING: ACTIVE (${Math.round(this.currentTilt)}°)`, x, y - 8);

        ctx.restore();
    }

    /**
     * Results Callback from MediaPipe FaceMesh
     */
    onResults(results) {
        const now = performance.now();
        this.fps = Math.round(1000 / (now - this.lastFrameTime));
        this.lastFrameTime = now;
        const fpsEl = document.getElementById('val-fps');
        if (fpsEl) fpsEl.innerText = this.fps;

        // Resize Canvas to match Video
        if (this.canvasElement.width !== this.videoElement.videoWidth && this.videoElement.videoWidth > 0) {
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
        }

        this.canvasCtx.save();
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

        const faces = results.multiFaceLandmarks || [];
        this.multiFaceCount = faces.length;
        this.multiFaceDetected = faces.length > 1;

        const multiFaceBadge = document.getElementById('badge-multiface-alert');
        if (multiFaceBadge) {
            if (this.multiFaceDetected) {
                multiFaceBadge.classList.remove('hidden');
                multiFaceBadge.innerHTML = `<i class="fa-solid fa-users"></i> ${faces.length} Faces Detected (Tracking Driver)`;
            } else {
                multiFaceBadge.classList.add('hidden');
            }
        }

        if (faces.length > 0) {
            // Check Multi-face policy
            const multiFaceMode = window.settingsMgr ? window.settingsMgr.get('multiFaceMode') : 'primary';
            if (faces.length > 1 && multiFaceMode === 'strict') {
                this.triggerPredictionState('MULTIPLE_FACES', 0, 0, 0, 0);
                this.canvasCtx.restore();
                return;
            }

            // Pick the primary face (largest bounding box = driver in front)
            let primaryLandmarks = faces[0];
            let primaryBounds = this.getFaceBounds(faces[0]);

            if (faces.length > 1) {
                let maxArea = -1;
                faces.forEach(lms => {
                    const bounds = this.getFaceBounds(lms);
                    if (bounds.area > maxArea) {
                        maxArea = bounds.area;
                        primaryLandmarks = lms;
                        primaryBounds = bounds;
                    }
                });
            }

            // 1. Update Motion Auto-Tracking (Adjusts camera view to driver movements/tilts)
            this.updateMotionTracking(primaryLandmarks);

            // 2. Draw Mesh Overlay and Tracking Brackets
            if (this.showLandmarks && typeof drawConnectors !== 'undefined') {
                drawConnectors(this.canvasCtx, primaryLandmarks, FACEMESH_TESSELATION, { color: 'rgba(59, 130, 246, 0.20)', lineWidth: 1 });
                drawConnectors(this.canvasCtx, primaryLandmarks, FACEMESH_RIGHT_EYE, { color: '#10b981', lineWidth: 2 });
                drawConnectors(this.canvasCtx, primaryLandmarks, FACEMESH_LEFT_EYE, { color: '#10b981', lineWidth: 2 });
                drawConnectors(this.canvasCtx, primaryLandmarks, FACEMESH_LIPS, { color: '#f59e0b', lineWidth: 2 });
            }

            this.drawTrackingBrackets(primaryBounds, this.canvasElement.width, this.canvasElement.height);

            // 3. Compute Mathematical Ratios (Preserved formulas from earMarCalculator.js)
            const ear = window.earMarCalc.calculateEar(primaryLandmarks);
            const mar = window.earMarCalc.calculateMar(primaryLandmarks);

            // 4. Eye Closure, Blink & Drowsiness Evaluation
            const isClosed = ear < this.earThreshold;
            const perclos = window.earMarCalc.updatePerclos(isClosed);

            let calculatedState = 'AWAKE';
            let currentClosureDuration = 0;

            if (isClosed) {
                if (!this.closedEyesStartTime) {
                    this.closedEyesStartTime = performance.now();
                    this.isEyeCurrentlyClosed = true;
                }
                currentClosureDuration = (performance.now() - this.closedEyesStartTime) / 1000;
                this.totalClosedSeconds += 0.033;

                // Threshold Check A: Continuous eye closure >= Drowsiness Delay Time (default 3.5s)
                if (currentClosureDuration >= this.drowsyTimeThreshold) {
                    calculatedState = 'WARNING';
                } else if (currentClosureDuration >= 1.0) {
                    // Continuous closure in progress, not yet 3.5s
                    calculatedState = 'EYES_CLOSING';
                } else {
                    // Brief closure in progress (momentary blink)
                    calculatedState = 'BLINKING';
                }
            } else {
                // EYES ARE OPEN:
                // Check if they were previously closed to record completion of a blink or prolonged closure
                if (this.isEyeCurrentlyClosed && this.closedEyesStartTime) {
                    const closureDuration = (performance.now() - this.closedEyesStartTime) / 1000;

                    // Condition 1: Normal blink is between 80ms and 500ms
                    if (closureDuration >= 0.08 && closureDuration < 0.80) {
                        this.blinkCount++;
                        this.recentBlinks.push(Date.now());
                        // Normal blinks NEVER trigger drowsiness!
                    }
                    // Condition 2: Prolonged slow closure with duration > 3.0 seconds
                    else if (closureDuration >= this.prolongedBlinkDuration) {
                        this.prolongedBlinkCount++;
                        this.recentProlongedBlinks.push(Date.now());
                    }

                    this.closedEyesStartTime = null;
                    this.isEyeCurrentlyClosed = false;
                }
                currentClosureDuration = 0;

                // Yawn Evaluation
                if (mar > this.marThreshold) {
                    if (!this.isYawnCurrentlyActive) {
                        this.isYawnCurrentlyActive = true;
                        this.yawnCount++;
                        this.yawnStartTime = performance.now();
                        window.audioAlert.playYawnNotification();
                    }
                    this.currentYawnDuration = (performance.now() - this.yawnStartTime) / 1000;
                    calculatedState = 'YAWNING';
                } else {
                    this.isYawnCurrentlyActive = false;
                    this.yawnStartTime = null;
                    this.currentYawnDuration = 0;
                    calculatedState = 'AWAKE';
                }
            }

            // Clean rolling lists:
            // Keep normal blinks in last 60 seconds
            const oneMinuteAgo = Date.now() - 60000;
            this.recentBlinks = this.recentBlinks.filter(t => t > oneMinuteAgo);
            this.blinkRate = this.recentBlinks.length;

            // Keep prolonged closures in last 90 seconds
            const ninetySecAgo = Date.now() - 90000;
            this.recentProlongedBlinks = this.recentProlongedBlinks.filter(t => t > ninetySecAgo);

            // Condition Check B:
            // "if the user blinks for more than 5 times each with duration more than 3 seconds consider it as drowsiness"
            if (this.recentProlongedBlinks.length >= this.prolongedBlinkCountThreshold) {
                calculatedState = 'WARNING';
            }

            // Condition Check C (PERCLOS safeguard):
            // Only trigger PERCLOS alert if the buffer has gathered sufficient data (>= 150 samples)
            // AND perclos is sustained above threshold (25%), ensuring normal 3-4 blinks don't trigger alerts
            if (window.earMarCalc.perclosBuffer.length >= 150 && perclos >= this.perclosThreshold && calculatedState !== 'WARNING') {
                calculatedState = 'WARNING';
            }

            // 5. Trigger State Dispatcher
            this.triggerPredictionState(calculatedState, ear, mar, perclos, currentClosureDuration);

            // 6. Record Telemetry Data
            if (window.telemetryMgr) {
                window.telemetryMgr.addRecord(ear, mar, perclos, calculatedState, this.earThreshold, this.marThreshold);
            }

        } else {
            // No face detected
            this.closedEyesStartTime = null;
            this.isEyeCurrentlyClosed = false;
            this.updateMotionTracking(null);
            this.triggerPredictionState('NO_FACE', 0, 0, 0, 0);
        }

        this.canvasCtx.restore();
    }

    getPredictionLabel() {
        return this.lastPredictionState || 'AWAKE';
    }

    /**
     * Driver State Machine & UI Status Dispatcher
     */
    triggerPredictionState(state, ear, mar, perclos, durationSec) {
        this.lastPredictionState = state;
        this.currentState = state;

        // UI Element References
        const valEar = document.getElementById('val-ear');
        const barEar = document.getElementById('bar-ear');
        const valMar = document.getElementById('val-mar');
        const barMar = document.getElementById('bar-mar');
        const valPerclos = document.getElementById('val-perclos');
        const barPerclos = document.getElementById('bar-perclos');

        const valBlinks = document.getElementById('val-blinks');
        const valBlinkRate = document.getElementById('val-blink-rate');
        const valProlongedBlinks = document.getElementById('val-prolonged-blinks');
        const valYawns = document.getElementById('val-yawns');
        const valWarnings = document.getElementById('val-warnings');
        const valClosedTime = document.getElementById('val-closed-time');

        const badge = document.getElementById('prediction-badge');
        const predText = document.getElementById('pred-text');
        const predIcon = document.getElementById('pred-icon');

        const statusCardBody = document.getElementById('status-card-body');
        const stateHeroIcon = document.getElementById('state-hero-icon');
        const stateTitleText = document.getElementById('state-title-text');
        const stateDescText = document.getElementById('state-desc-text');

        const alarmOverlay = document.getElementById('alarm-overlay');

        // Update Live Gauges
        if (valEar) valEar.innerText = ear.toFixed(2);
        if (barEar) barEar.style.width = Math.min(100, (ear / 0.45) * 100) + '%';

        if (valMar) valMar.innerText = mar.toFixed(2);
        if (barMar) barMar.style.width = Math.min(100, (mar / 1.0) * 100) + '%';

        if (valPerclos) valPerclos.innerText = perclos + '%';
        if (barPerclos) barPerclos.style.width = Math.min(100, perclos) + '%';

        // Update Counters
        if (valBlinks) valBlinks.innerText = this.blinkCount;
        if (valBlinkRate) valBlinkRate.innerText = `${this.blinkRate} /min`;
        if (valProlongedBlinks) valProlongedBlinks.innerText = `${this.recentProlongedBlinks.length} / 5`;
        if (valYawns) valYawns.innerText = this.yawnCount;
        if (valWarnings) valWarnings.innerText = this.warningCount;
        if (valClosedTime) valClosedTime.innerText = durationSec.toFixed(1) + 's';

        const isWarning = (state === 'WARNING' || state === 'DROWSY');

        // STATE SPECIFIC UI LOGIC
        if (isWarning) {
            if (badge) {
                badge.className = 'prediction-badge state-warning-badge';
                predIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                predText.innerText = 'DROWSINESS WARNING';
            }

            let reason = `Eyes closed for ${durationSec.toFixed(1)}s (Threshold ${this.drowsyTimeThreshold}s)`;
            if (this.recentProlongedBlinks.length >= this.prolongedBlinkCountThreshold) {
                reason = `Fatigue: ${this.recentProlongedBlinks.length} prolonged closures (>3s) detected!`;
            } else if (perclos >= this.perclosThreshold) {
                reason = `High PERCLOS (${perclos}%) fatigue detected`;
            }

            if (statusCardBody) {
                statusCardBody.className = 'state-display state-warning-box';
                stateHeroIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                stateTitleText.innerText = 'DROWSINESS WARNING';
                stateDescText.innerText = reason;
            }

            // Trigger local phone audio alarm and visual overlay
            if (alarmOverlay) alarmOverlay.classList.remove('hidden');
            window.audioAlert.startAlarm();

            if (!this.wasWarningActive) {
                this.wasWarningActive = true;
                this.warningCount++;
            }

        } else {
            // Dismiss warning alarm if awake, blinking, or yawning
            window.audioAlert.stopAlarm();
            if (alarmOverlay) alarmOverlay.classList.add('hidden');
            this.wasWarningActive = false;

            if (state === 'AWAKE') {
                if (badge) {
                    badge.className = 'prediction-badge state-awake-badge';
                    predIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
                    predText.innerText = 'AWAKE';
                }
                if (statusCardBody) {
                    statusCardBody.className = 'state-display state-awake';
                    stateHeroIcon.innerHTML = '<i class="fa-solid fa-user-check"></i>';
                    stateTitleText.innerText = 'AWAKE';
                    stateDescText.innerText = 'Driver alert & attentive';
                }
            } else if (state === 'BLINKING') {
                if (badge) {
                    badge.className = 'prediction-badge state-neutral';
                    predIcon.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                    predText.innerText = 'BLINKING';
                }
            } else if (state === 'EYES_CLOSING') {
                if (badge) {
                    badge.className = 'prediction-badge state-neutral';
                    predIcon.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                    predText.innerText = `EYES CLOSED (${durationSec.toFixed(1)}s / ${this.drowsyTimeThreshold}s)`;
                }
                if (statusCardBody) {
                    statusCardBody.className = 'state-display state-yawn';
                    stateHeroIcon.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                    stateTitleText.innerText = 'EYES CLOSING';
                    stateDescText.innerText = `Continuous closure: ${durationSec.toFixed(1)}s (Alert at ${this.drowsyTimeThreshold}s)`;
                }
            } else if (state === 'YAWNING') {
                if (badge) {
                    badge.className = 'prediction-badge state-neutral';
                    predIcon.innerHTML = '<i class="fa-solid fa-face-tired"></i>';
                    predText.innerText = `YAWN (${this.currentYawnDuration.toFixed(1)}s)`;
                }
                if (statusCardBody) {
                    statusCardBody.className = 'state-display state-yawn';
                    stateHeroIcon.innerHTML = '<i class="fa-solid fa-face-tired"></i>';
                    stateTitleText.innerText = 'YAWNING DETECTED';
                    stateDescText.innerText = `Fatigue indication (MAR: ${mar.toFixed(2)})`;
                }
            } else if (state === 'MULTIPLE_FACES') {
                if (badge) {
                    badge.className = 'prediction-badge state-warning-badge';
                    predIcon.innerHTML = '<i class="fa-solid fa-users"></i>';
                    predText.innerText = 'MULTIPLE FACES';
                }
                if (statusCardBody) {
                    statusCardBody.className = 'state-display state-neutral';
                    stateHeroIcon.innerHTML = '<i class="fa-solid fa-users"></i>';
                    stateTitleText.innerText = 'MULTIPLE FACES';
                    stateDescText.innerText = 'Pause mode active: multiple occupants in view';
                }
            } else if (state === 'NO_FACE') {
                if (badge) {
                    badge.className = 'prediction-badge state-neutral';
                    predIcon.innerHTML = '<i class="fa-solid fa-user-slash"></i>';
                    predText.innerText = 'NO FACE DETECTED';
                }
                if (statusCardBody) {
                    statusCardBody.className = 'state-display state-neutral';
                    stateHeroIcon.innerHTML = '<i class="fa-solid fa-user-slash"></i>';
                    stateTitleText.innerText = 'NO FACE DETECTED';
                    stateDescText.innerText = 'Position camera to face driver';
                }
            }
        }

        // Bridge to Embedded ESP32 Controller via MQTT
        if (window.hardwareBridge) {
            window.hardwareBridge.publishAlert(isWarning, state, durationSec, ear, perclos);
            window.hardwareBridge.publishTelemetry({
                ear: Number(ear.toFixed(3)),
                mar: Number(mar.toFixed(3)),
                perclos: Math.round(perclos),
                state: state,
                blinks: this.blinkCount,
                blinkRate: this.blinkRate,
                prolongedBlinks: this.recentProlongedBlinks.length,
                yawns: this.yawnCount,
                durationSec: Number(durationSec.toFixed(1)),
                timestamp: Math.floor(Date.now() / 1000)
            });
        }
    }
}

window.faceEngine = new FaceLandmarkEngine();
