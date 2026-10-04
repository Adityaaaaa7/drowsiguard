/**
 * Web Audio API Sound Synthesizer & Mobile Vibration Manager
 * Generates warning siren alerts without needing external mp3 files.
 */
class AudioAlertSystem {
    constructor() {
        this.audioCtx = null;
        this.isMuted = false;
        this.isAlarmActive = false;
        this.oscillator = null;
        this.gainNode = null;
        this.intervalId = null;
        this.volume = 0.8;
    }

    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, parseFloat(val) || 0));
    }

    init() {
        if (!this.audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.stopAlarm();
        }
        return this.isMuted;
    }

    /**
     * Start repeating warning alarm sound (880Hz high beep pulse)
     */
    startAlarm() {
        if (this.isMuted || this.isAlarmActive) return;
        this.init();
        if (!this.audioCtx) return;

        this.isAlarmActive = true;
        this.playPulseBeep();

        // Repeat pulse every 350ms
        this.intervalId = setInterval(() => {
            if (this.isAlarmActive) {
                this.playPulseBeep();
            }
        }, 350);

        // Mobile Haptic Vibration
        if ('vibrate' in navigator) {
            navigator.vibrate([400, 100, 400, 100, 400]);
        }
    }

    playPulseBeep() {
        if (!this.audioCtx || this.isMuted) return;

        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5 note
            osc.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.25); // Pitch drop

            const baseGain = 0.4 * this.volume;
            gain.gain.setValueAtTime(baseGain, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.25);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.25);
        } catch (e) {
            console.error("Audio synth error:", e);
        }
    }

    playYawnNotification() {
        if (!this.audioCtx || this.isMuted) return;
        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, this.audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(500, this.audioCtx.currentTime + 0.3);

            const baseGain = 0.2 * this.volume;
            gain.gain.setValueAtTime(baseGain, this.audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.3);
        } catch (e) {}
    }

    testAlarmSound() {
        this.init();
        this.playPulseBeep();
        if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
        }
    }

    stopAlarm() {
        this.isAlarmActive = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if ('vibrate' in navigator) {
            navigator.vibrate(0); // Cancel vibration
        }
    }
}

window.audioAlert = new AudioAlertSystem();
