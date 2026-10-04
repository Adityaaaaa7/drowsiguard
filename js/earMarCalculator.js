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
     * Euclidean distance between two 3D or 2D landmarks
     */
    distance(p1, p2) {
        return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) + 
            Math.pow(p1.y - p2.y, 2) + 
            Math.pow((p1.z || 0) - (p2.z || 0), 2)
        );
    }

    /**
     * Calculate Eye Aspect Ratio (EAR) for a single eye
     * Formula: (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
     */
    calculateSingleEar(landmarks, eyeIndices) {
        const p1 = landmarks[eyeIndices[0]];
        const p2 = landmarks[eyeIndices[1]];
        const p3 = landmarks[eyeIndices[2]];
        const p4 = landmarks[eyeIndices[3]];
        const p5 = landmarks[eyeIndices[4]];
        const p6 = landmarks[eyeIndices[5]];

        const vertical1 = this.distance(p2, p6);
        const vertical2 = this.distance(p3, p5);
        const horizontal = this.distance(p1, p4);

        if (horizontal === 0) return 0;
        return (vertical1 + vertical2) / (2.0 * horizontal);
    }

    /**
     * Calculate Average EAR across Left and Right Eyes
     */
    calculateEar(landmarks) {
        if (!landmarks || landmarks.length < 400) return 0;

        const leftEar = this.calculateSingleEar(landmarks, this.LEFT_EYE);
        const rightEar = this.calculateSingleEar(landmarks, this.RIGHT_EYE);

        return (leftEar + rightEar) / 2.0;
    }

    /**
     * Calculate Mouth Aspect Ratio (MAR)
     */
    calculateMar(landmarks) {
        if (!landmarks || landmarks.length < 400) return 0;

        const pTop = landmarks[this.MOUTH_TOP[1]];
        const pBottom = landmarks[this.MOUTH_BOTTOM[1]];
        const pLeft = landmarks[this.MOUTH_LEFT];
        const pRight = landmarks[this.MOUTH_RIGHT];

        const verticalDist = this.distance(pTop, pBottom);
        const horizontalDist = this.distance(pLeft, pRight);

        if (horizontalDist === 0) return 0;
        return verticalDist / horizontalDist;
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
