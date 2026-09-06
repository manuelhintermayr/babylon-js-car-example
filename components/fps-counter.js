// fps-counter.js - Frames Per Second Badge Component

const LOW_FPS_THRESHOLD = 30;

export const FpsCounter = {
    name: 'FpsCounter',
    props: {
        fps: {
            type: Number,
            required: true
        }
    },
    computed: {
        roundedFps() {
            return Math.round(this.fps);
        },
        isLow() {
            return this.fps > 0 && this.fps < LOW_FPS_THRESHOLD;
        }
    },
    template: `
        <!-- FPS Badge -->
        <div class="fps-counter" :class="{ low: isLow }" title="Frames per second">
            {{ roundedFps }} FPS
        </div>
    `
};
