export class AudioManager {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Tono grave disonante sintetizado mediante Web Audio API
    playAmbientDissonance() {
        if (!this.ctx) return;

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(55, this.ctx.currentTime); // A1

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(58.7, this.ctx.currentTime); // Disonancia cercana

        gain.gain.setValueAtTime(0.05, this.ctx.currentTime);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start();
        osc2.start();
    }

    playClickSound() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }
}