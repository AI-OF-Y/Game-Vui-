/**
 * Audio Synthesizer for Tai Xiu Game using Web Audio API
 * 100% self-contained, no external MP3 dependencies
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Ceramic chip placing sound
    playChip() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2400 + Math.random() * 400, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.05);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.06);
    }

    // Dice rattling in the bowl
    playShake() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        const totalDuration = 1.2;

        for (let i = 0; i < 12; i++) {
            const hitTime = now + (i * 0.09) + (Math.random() * 0.03);
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            const freq = 1200 + Math.random() * 800;
            osc.frequency.setValueAtTime(freq, hitTime);
            osc.frequency.exponentialRampToValueAtTime(400, hitTime + 0.04);

            gain.gain.setValueAtTime(0.18, hitTime);
            gain.gain.exponentialRampToValueAtTime(0.001, hitTime + 0.04);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(hitTime);
            osc.stop(hitTime + 0.05);
        }
    }

    // Bowl open swoosh
    playOpen() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.26);
    }

    // Cheering victory chime
    playWin() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

        notes.forEach((freq, idx) => {
            const noteTime = now + idx * 0.09;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, noteTime);

            gain.gain.setValueAtTime(0.3, noteTime);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(noteTime);
            osc.stop(noteTime + 0.36);
        });
    }

    // Soft lost sound
    playLose() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;
        const notes = [440, 392, 349.23]; // A4, G4, F4

        notes.forEach((freq, idx) => {
            const noteTime = now + idx * 0.12;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, noteTime);

            gain.gain.setValueAtTime(0.18, noteTime);
            gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(noteTime);
            osc.stop(noteTime + 0.26);
        });
    }

    // Countdown tick
    playTick() {
        if (!this.enabled) return;
        this.init();
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.04);
    }
}

window.soundEngine = new SoundEngine();
