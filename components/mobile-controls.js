// mobile-controls.js - Mobile Touch Controls Component

export const MobileControls = {
    name: 'MobileControls',
    props: {
        isTouchDevice: {
            type: Boolean,
            required: true
        }
    },
    emits: ['update-touch-controls', 'reset-game', 'toggle-view'],
    data() {
        return {
            joystickActive: false,
            joystickPosition: { x: 0, y: 0 },
            touchControls: {
                forward: false,
                backward: false,
                left: false,
                right: false,
                brake: false,
                jump: false
            },
            jumpInterval: null
        }
    },
    mounted() {
        // Initialize touch controls regardless of device type for testing
        this.$nextTick(() => {
            this.initTouchControls();
        });
    },
    watch: {
        touchControls: {
            handler(newVal) {
                this.$emit('update-touch-controls', newVal);
            },
            deep: true
        }
    },
    methods: {
        initTouchControls() {
            const joystick = this.$refs.joystick;
            const joystickInner = this.$refs.joystickInner;

            if (!joystick || !joystickInner) {
                return;
            }

            let isDragging = false;
            let startPos = { x: 0, y: 0 };
            let joystickCenter = { x: 0, y: 0 };

            const updateJoystickCenter = () => {
                const rect = joystick.getBoundingClientRect();
                joystickCenter = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };
            };

            const handleStart = (e) => {
                e.preventDefault();
                isDragging = true;
                updateJoystickCenter();

                const touch = e.touches ? e.touches[0] : e;
                startPos = { x: touch.clientX, y: touch.clientY };
                this.joystickActive = true;
            };

            const handleMove = (e) => {
                if (!isDragging) return;
                e.preventDefault();

                const touch = e.touches ? e.touches[0] : e;
                const deltaX = touch.clientX - joystickCenter.x;
                const deltaY = touch.clientY - joystickCenter.y;

                const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                const maxDistance = 35; // Half of joystick outer radius minus inner radius

                let x = deltaX;
                let y = deltaY;

                if (distance > maxDistance) {
                    x = (deltaX / distance) * maxDistance;
                    y = (deltaY / distance) * maxDistance;
                }

                joystickInner.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

                // Update touch controls based on joystick position
                const threshold = 15;
                this.touchControls.forward = y < -threshold;
                this.touchControls.backward = y > threshold;
                this.touchControls.left = x < -threshold;
                this.touchControls.right = x > threshold;

                this.joystickPosition = { x: x / maxDistance, y: y / maxDistance };
            };

            const handleEnd = (e) => {
                e.preventDefault();
                isDragging = false;
                this.joystickActive = false;

                joystickInner.style.transform = 'translate(-50%, -50%)';

                // Reset all directional controls
                this.touchControls.forward = false;
                this.touchControls.backward = false;
                this.touchControls.left = false;
                this.touchControls.right = false;

                this.joystickPosition = { x: 0, y: 0 };
            };

            // Touch events
            joystick.addEventListener('touchstart', handleStart, { passive: false });
            document.addEventListener('touchmove', handleMove, { passive: false });
            document.addEventListener('touchend', handleEnd, { passive: false });

            // Mouse events for testing on desktop
            joystick.addEventListener('mousedown', handleStart);
            document.addEventListener('mousemove', handleMove);
            document.addEventListener('mouseup', handleEnd);
        },

        onBrakeStart(e) {
            e.preventDefault();
            this.touchControls.brake = true;
        },

        onBrakeEnd(e) {
            e.preventDefault();
            this.touchControls.brake = false;
        },

        onResetTouch(e) {
            e.preventDefault();
            this.$emit('reset-game');
        },

        onToggleView(e) {
            e.preventDefault();
            this.$emit('toggle-view');
        },

        onJumpStart(e) {
            e.preventDefault();
            this.touchControls.jump = true;

            // Continuously send jump like spacebar - every 50ms
            this.jumpInterval = setInterval(() => {
                // Jump signal is sent continuously while button is pressed
                this.touchControls.jump = true;
                // Force emit to make sure game receives the signal
                this.$emit('update-touch-controls', { ...this.touchControls });
            }, 50);
        },

        onJumpEnd(e) {
            e.preventDefault();
            this.touchControls.jump = false;

            // Stop continuous sending
            if (this.jumpInterval) {
                clearInterval(this.jumpInterval);
                this.jumpInterval = null;
            }
        }
    },
    beforeUnmount() {
        // Cleanup interval when component is destroyed
        if (this.jumpInterval) {
            clearInterval(this.jumpInterval);
            this.jumpInterval = null;
        }
    },
    template: `
        <!-- Mobile Touch Controls -->
        <div class="mobile-controls" :class="{ visible: isTouchDevice }">
            <!-- Virtual Joystick -->
            <div class="virtual-joystick" ref="joystick">
                <div class="joystick-outer">
                    <div class="joystick-inner" ref="joystickInner"></div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="action-buttons">
                <div class="action-button brake" @touchstart="onBrakeStart" @touchend="onBrakeEnd">
                    🚗
                </div>
                <div class="action-button jump" @touchstart="onJumpStart" @touchend="onJumpEnd">
                    🚀
                </div>
                <div class="action-button view" @touchstart="onToggleView">
                    📷
                </div>
                <div class="action-button reset" @touchstart="onResetTouch">
                    🔄
                </div>
            </div>
        </div>
    `
};