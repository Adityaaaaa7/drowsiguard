/**
 * Mathematical Algorithms for Facial Character Analysis
 * Includes EAR (Soukupová & Čech), MAR (Yawn detection), and PERCLOS.
 */
class EarMarCalculator {
    constructor() {
        // MediaPipe Face Mesh Index Mappings for Eyes and Mouth
        this.LEFT_EYE = [33, 160, 158, 133, 153, 144];
        this.RIGHT_EYE = [362, 385, 387, 263, 373, 380];
        
        // Inner Mouth Contour Landmarks
        this.MOUTH_TOP = [82, 13, 312];
        this.MOUTH_BOTTOM = [87, 14, 317];
        this.MOUTH_LEFT = 78;
        this.MOUTH_RIGHT = 308;

        // Rolling buffer for PERCLOS (60s at ~10 samples/sec = 600 slots)
        this.perclosBuffer = [];
        this.maxBufferLength = 300; // ~30 seconds window
    }

    /**
     * Euclidean distance between two landmarks in physical or aspect-scaled pixel space.
     * Eliminates mobile portrait aspect-ratio distortion and removes Z-depth jitter.
     */
    distance(p1, p2, width = 1280, height = 720) {
        if (!p1 || !p2) return 0;
        const dx = (p1.x - p2.x) * width;
        const dy = (p1.y - p2.y) * height;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * High-Precision 3-Point Eye Aspect Ratio (EAR) for a single eye
     * Uses:
     * - Outer vertical eyelid pair
     * - Center vertical eyelid pair (pupil line, point of maximum deflection)
     * - Inner vertical eyelid pair
     * Formula: (|v_outer| + 2*|v_center| + |v_inner|) / (4.0 * |horizontal|)
     */
    calculateSingleEar(landmarks, eyeIndices, width = 1280, height = 720) {
        // eyeIndices: [p_outer, p_top_outer, p_top_center, p_top_inner, p_inner, p_bot_inner, p_bot_center, p_bot_outer]
        // Left eye indices:  [33, 160, 159, 158, 133, 153, 145, 144]
        // Right eye indices: [362, 385, 386, 387, 263, 373, 374, 380]
        
        if (eyeIndices.length >= 8) {
            const pOuter = landmarks[eyeIndices[0]];
            const pTopOuter = landmarks[eyeIndices[1]];
            const pTopCenter = landmarks[eyeIndices[2]];
            const pTopInner = landmarks[eyeIndices[3]];
            const pInner = landmarks[eyeIndices[4]];
            const pBotInner = landmarks[eyeIndices[5]];
            const pBotCenter = landmarks[eyeIndices[6]];
            const pBotOuter = landmarks[eyeIndices[7]];

            const vOuter = this.distance(pTopOuter, pBotOuter, width, height);
            const vCenter = this.distance(pTopCenter, pBotCenter, width, height);
            const vInner = this.distance(pTopInner, pBotInner, width, height);
            const horizontal = this.distance(pOuter, pInner, width, height);

            if (horizontal === 0) return 0;
            return (vOuter + (2.0 * vCenter) + vInner) / (4.0 * horizontal);
        }

        // Backward-compatible fallback for 6-point arrays
        const p1 = landmarks[eyeIndices[0]];
        const p2 = landmarks[eyeIndices[1]];
        const p3 = landmarks[eyeIndices[2]];
        const p4 = landmarks[eyeIndices[3]];
        const p5 = landmarks[eyeIndices[4]];
        const p6 = landmarks[eyeIndices[5]];

        const vertical1 = this.distance(p2, p6, width, height);
        const vertical2 = this.distance(p3, p5, width, height);
        const horizontal = this.distance(p1, p4, width, height);

        if (horizontal === 0) return 0;
        return (vertical1 + vertical2) / (2.0 * horizontal);
    }

    /**
     * Calculate Average EAR across Left and Right Eyes with resolution scaling
     */
    calculateEar(landmarks, width = 1280, height = 720) {
        if (!landmarks || landmarks.length < 400) return 0;

        // 8-point high-precision eye landmarks
        const LEFT_EYE_8 = [33, 160, 159, 158, 133, 153, 145, 144];
        const RIGHT_EYE_8 = [362, 385, 386, 387, 263, 373, 374, 380];

        const leftEar = this.calculateSingleEar(landmarks, LEFT_EYE_8, width, height);
        const rightEar = this.calculateSingleEar(landmarks, RIGHT_EYE_8, width, height);

        return (leftEar + rightEar) / 2.0;
    }

    /**
     * Calculate High-Precision Mouth Aspect Ratio (MAR) with resolution scaling
     * Uses 3 vertical measurement lines across inner lips
     */
    calculateMar(landmarks, width = 1280, height = 720) {
        if (!landmarks || landmarks.length < 400) return 0;

        // Inner Lip Contour landmarks
        // Outer vertical: 82 to 87
        // Center vertical: 13 to 14
        // Inner vertical: 312 to 317
        // Horizontal: 78 to 308
        const pLeft = landmarks[78];
        const pRight = landmarks[308];
        const pTopCenter = landmarks[13];
        const pBotCenter = landmarks[14];
        const pTopLeft = landmarks[82];
        const pBotLeft = landmarks[87];
        const pTopRight = landmarks[312];
        const pBotRight = landmarks[317];

        const vLeft = this.distance(pTopLeft, pBotLeft, width, height);
        const vCenter = this.distance(pTopCenter, pBotCenter, width, height);
        const vRight = this.distance(pTopRight, pBotRight, width, height);
        const horizontal = this.distance(pLeft, pRight, width, height);

        if (horizontal === 0) return 0;
        return (vLeft + (2.0 * vCenter) + vRight) / (4.0 * horizontal);
    }

    /**
     * Update PERCLOS score (percentage of time eyes closed over moving window)
     * @param {boolean} isClosed - true if current EAR is below threshold
     */
    updatePerclos(isClosed) {
        this.perclosBuffer.push(isClosed ? 1 : 0);
        if (this.perclosBuffer.length > this.maxBufferLength) {
            this.perclosBuffer.shift();
        }

        const closedCount = this.perclosBuffer.reduce((sum, val) => sum + val, 0);
        return Math.round((closedCount / this.perclosBuffer.length) * 100);
    }

    resetPerclos() {
        this.perclosBuffer = [];
    }

    /**
     * Configure PERCLOS moving window duration
     * @param {number} seconds - Window size in seconds (e.g., 30 or 60)
     * @param {number} sampleRateHz - Approximate processing frequency (default 10)
     */
    setWindowSeconds(seconds, sampleRateHz = 10) {
        this.maxBufferLength = Math.max(30, Math.round(seconds * sampleRateHz));
        while (this.perclosBuffer.length > this.maxBufferLength) {
            this.perclosBuffer.shift();
        }
    }
}

window.earMarCalc = new EarMarCalculator();

