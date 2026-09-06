// fps-meter.js - Frames per second, averaged over short time windows

const WINDOW_MS = 500;
const MS_PER_SECOND = 1000;

export class FpsMeter {
    /**
     * @param {(fps: number) => void} onUpdate - receives a new average every window
     */
    constructor(onUpdate) {
        this.onUpdate = onUpdate;
        this.frames = 0;
        this.windowStart = performance.now();
    }

    /** Call once per rendered frame */
    tick() {
        this.frames++;
        const now = performance.now();
        const elapsed = now - this.windowStart;
        if (elapsed < WINDOW_MS) {
            return;
        }
        this.onUpdate(this.frames * MS_PER_SECOND / elapsed);
        this.frames = 0;
        this.windowStart = now;
    }
}
