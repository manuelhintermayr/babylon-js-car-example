// desktop-controls.js - Desktop Controls Display Component

export const DesktopControls = {
    name: 'DesktopControls',
    props: {
        isTouchDevice: {
            type: Boolean,
            required: true
        }
    },
    data() {
        return {
            keyStates: {
                w: false,
                a: false,
                s: false,
                d: false,
                space: false, // Now for jumping
                b: false,     // New brake key
                c: false,     // Camera view toggle
                enter: false
            }
        }
    },
    mounted() {
        if (!this.isTouchDevice) {
            this.setupKeyboardListeners();
        }
    },
    beforeUnmount() {
        if (!this.isTouchDevice) {
            this.removeKeyboardListeners();
        }
    },
    methods: {
        setupKeyboardListeners() {
            this.handleKeyDown = (e) => {
                this.updateKeyState(e.key, true);
            };

            this.handleKeyUp = (e) => {
                this.updateKeyState(e.key, false);
            };

            window.addEventListener('keydown', this.handleKeyDown);
            window.addEventListener('keyup', this.handleKeyUp);
        },

        removeKeyboardListeners() {
            if (this.handleKeyDown) {
                window.removeEventListener('keydown', this.handleKeyDown);
            }
            if (this.handleKeyUp) {
                window.removeEventListener('keyup', this.handleKeyUp);
            }
        },

        updateKeyState(key, isPressed) {
            switch (key.toLowerCase()) {
                case 'w':
                case 'arrowup':
                    this.keyStates.w = isPressed;
                    break;
                case 'a':
                case 'arrowleft':
                    this.keyStates.a = isPressed;
                    break;
                case 's':
                case 'arrowdown':
                    this.keyStates.s = isPressed;
                    break;
                case 'd':
                case 'arrowright':
                    this.keyStates.d = isPressed;
                    break;
                case ' ':
                    this.keyStates.space = isPressed; // Space for jumping
                    break;
                case 'b':
                    this.keyStates.b = isPressed; // B for braking
                    break;
                case 'c':
                    this.keyStates.c = isPressed; // C toggles the camera view
                    break;
                case 'enter':
                    this.keyStates.enter = isPressed;
                    // Reset after short delay for visual feedback
                    if (isPressed) {
                        setTimeout(() => {
                            this.keyStates.enter = false;
                        }, 200);
                    }
                    break;
            }
        }
    },
    template: `
        <!-- Desktop Controls Display -->
        <div class="desktop-controls" :class="{ visible: !isTouchDevice }">
            <div class="control-group">
                <div class="key-display wasd" :class="{ active: keyStates.w }">W</div>
                <div class="key-display wasd" :class="{ active: keyStates.a }">A</div>
                <div class="key-display wasd" :class="{ active: keyStates.s }">S</div>
                <div class="key-display wasd" :class="{ active: keyStates.d }">D</div>
                <span class="control-label">Move</span>
            </div>
            
            <div class="control-separator"></div>
            
            <div class="control-group">
                <div class="key-display space" :class="{ active: keyStates.space }">SPACE</div>
                <span class="control-label">Jump</span>
            </div>
            
            <div class="control-separator"></div>
            
            <div class="control-group">
                <div class="key-display b" :class="{ active: keyStates.b }">B</div>
                <span class="control-label">Brake</span>
            </div>

            <div class="control-separator"></div>

            <div class="control-group">
                <div class="key-display c" :class="{ active: keyStates.c }">C</div>
                <span class="control-label">View</span>
            </div>

            <div class="control-separator"></div>

            <div class="control-group">
                <div class="key-display enter" :class="{ active: keyStates.enter }">ENTER</div>
                <span class="control-label">Reset</span>
            </div>
        </div>
    `
};