// vue-app.js - Vue Application Logic and Components

import { resetGame, resetBoxes, toggleView } from './game/babylon-game.js';
import { InfoPanel } from './components/info-panel.js';
import { DesktopControls } from './components/desktop-controls.js';
import { MobileControls } from './components/mobile-controls.js';
import { FpsCounter } from './components/fps-counter.js';

/**
 * Create and mount the Vue application
 * @returns {Object} Vue application instance
 */
export function createVueApp() {
    const { createApp } = Vue;

    const app = createApp({
        components: {
            'info-panel': InfoPanel,
            'desktop-controls': DesktopControls,
            'mobile-controls': MobileControls,
            'fps-counter': FpsCounter
        },
        data() {
            return {
                isTouchDevice: false,
                fps: 0,
                _mqCoarseNoHover: null,
                _mqAnyHover: null,
                _updateTouchOnly: null,
                touchControls: {
                    forward: false,
                    backward: false,
                    left: false,
                    right: false,
                    brake: false
                },
                speed: 0,
                position: { x: 0, y: 0, z: 0 },
                rotation: 0,
                direction: '—',
                collisions: 0,
                knockedBoxes: 0,
                maxSpeed: 0,
                raceTime: 0,
                isRacing: false,
                boxesStatus: [
                    { knocked: false },
                    { knocked: false },
                    { knocked: false },
                    { knocked: false },
                    { knocked: false }
                ]
            }
        },
        mounted() {
            this.detectTouchOnly();
        },
        beforeUnmount() {
            // Cleanup
            this._mqCoarseNoHover?.removeEventListener?.('change', this._updateTouchOnly);
            this._mqAnyHover?.removeEventListener?.('change', this._updateTouchOnly);
        },
        methods: {
            async resetGame() {
                // Reset Vue data
                this.speed = 0;
                this.position = { x: 0, y: 0, z: 0 };
                this.rotation = 0;
                this.direction = '—';
                this.collisions = 0;
                this.knockedBoxes = 0;
                this.maxSpeed = 0;
                this.raceTime = 0;
                this.isRacing = false;
                this.boxesStatus = [
                    { knocked: false },
                    { knocked: false },
                    { knocked: false },
                    { knocked: false },
                    { knocked: false }
                ];

                // Reset Babylon.js scene
                await resetGame(this);
            },

            resetBoxes() {
                resetBoxes(this);
            },

            detectTouchOnly() {
                // Primary: Touch-only = (hover: none) & (pointer: coarse) and NO any input that can hover (Mouse/Trackpad)
                this._mqCoarseNoHover = window.matchMedia('(hover: none) and (pointer: coarse)');
                this._mqAnyHover = window.matchMedia('(any-hover: hover)');

                this._updateTouchOnly = () => {
                    this.isTouchDevice = this._mqCoarseNoHover.matches && !this._mqAnyHover.matches;
                    console.log('📱 Touch-only detected:', this.isTouchDevice);
                };

                // Initial
                this._updateTouchOnly();

                // Live-Updates (e.g. mouse connect/disconnect)
                this._mqCoarseNoHover.addEventListener?.('change', this._updateTouchOnly);
                this._mqAnyHover.addEventListener?.('change', this._updateTouchOnly);

                // Listen for first touch event - set to touch device
                const handleTouch = () => {
                    if (!this.isTouchDevice) {
                        this.isTouchDevice = true;
                        console.log('📱 Touch detected - switching to touch mode');
                    }
                };

                // Listen for first mouse event - set to non-touch device  
                const handleMouse = () => {
                    if (this.isTouchDevice) {
                        this.isTouchDevice = false;
                        console.log('�️ Mouse detected - switching to desktop mode');
                    }
                };

                // Add event listeners for touch events
                window.addEventListener('touchstart', handleTouch, { passive: true, once: false });
                window.addEventListener('touchmove', handleTouch, { passive: true, once: false });

                // Add event listeners for mouse events
                window.addEventListener('mousedown', handleMouse, { passive: true, once: false });
                window.addEventListener('mousemove', handleMouse, { passive: true, once: false });

                // Fallback for very old browsers (optional)
                if (!('matchMedia' in window)) {
                    this.isTouchDevice =
                        ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                }
            },

            onTouchControlsUpdate(newTouchControls) {
                this.touchControls = newTouchControls;
            },

            onMobileReset() {
                this.resetGame();
            },

            onToggleView() {
                toggleView();
            }
        }
    });

    // Mount the app and return the instance
    const mountedApp = app.mount('#app');
    console.log('🎨 Vue app mounted successfully');

    return mountedApp;
}