// babylon-game.js - Babylon.js Game Logic and Functions
import { FpsMeter } from './fps-meter.js';

// Global variables for car physics system
let scene;
let engine;
let havokInstance = null;
let tyreMaterial;
const debugColours = [];
debugColours[0] = new BABYLON.Color3(1, 0, 1);
debugColours[1] = new BABYLON.Color3(1, 0, 0);
debugColours[2] = new BABYLON.Color3(0, 1, 0);
debugColours[3] = new BABYLON.Color3(1, 1, 0);
debugColours[4] = new BABYLON.Color3(0, 1, 1);
debugColours[5] = new BABYLON.Color3(0, 0, 1);
const FILTERS = { CarParts: 1, Environment: 2 };
const trackRad = 400;

// Export global variables for access from Vue app
export { scene, engine };

/**
 * Initialize Babylon.js game engine and scene
 * @param {Object} vueApp - Vue application instance
 */
export function initializeGame(vueApp) {
    const canvas = document.getElementById('renderCanvas');
    engine = new BABYLON.Engine(canvas, true);

    // Create the scene
    createScene(vueApp).then(sceneInstance => {
        // Render loop
        engine.runRenderLoop(() => {
            sceneInstance.render();
        });

        // Resize handler
        window.addEventListener('resize', () => {
            engine.resize();
        });

        // Auto-focus the canvas after scene is ready
        setTimeout(() => {
            canvas.focus();
            canvas.setAttribute('tabindex', '0');

            // Add click listener to focus canvas when clicked
            canvas.addEventListener('click', () => {
                canvas.focus();
            });
        }, 100);

        console.log('🎮 Babylon.js scene created and render loop started');
    });
}

/**
 * Reset the entire game scene
 * @param {Object} vueApp - Vue application instance
 */
export async function resetGame(vueApp) {
    console.log("🔄 Resetting game using Babylon.js...");

    // Stop the render loop
    engine.stopRenderLoop();

    // Dispose the current scene completely
    if (scene) {
        scene.dispose();
    }

    // Create a fresh scene
    const newScene = await createScene(vueApp);

    // Restart the render loop with the new scene
    engine.runRenderLoop(() => {
        newScene.render();
    });

    // Re-focus canvas for immediate input with delay
    setTimeout(() => {
        const canvas = document.getElementById('renderCanvas');
        canvas.focus();
    }, 100);



    console.log("✅ Game reset complete!");
}

/**
 * Reset boxes in the current scene
 * @param {Object} vueApp - Vue application instance
 */
export function resetBoxes(vueApp) {
    // Reset box status in Vue
    vueApp.knockedBoxes = 0;
    vueApp.boxesStatus.forEach(box => {
        box.knocked = false;
    });

    // Reset boxes in the scene
    if (scene) {
        scene.meshes.forEach(mesh => {
            if (mesh.name.includes("knockableBox")) {
                mesh.knocked = false;
                mesh.positionSettled = false; // Reset settled flag
                if (mesh.physicsBody) {
                    // Reset position and rotation
                    mesh.position.copyFrom(mesh.originalPosition);
                    mesh.rotation.copyFrom(mesh.originalRotation);
                    // Reset physics velocities
                    mesh.physicsBody.setLinearVelocity(BABYLON.Vector3.Zero());
                    mesh.physicsBody.setAngularVelocity(BABYLON.Vector3.Zero());
                }
            }
        });
    }
}

async function createScene(vueApp) {
    scene = new BABYLON.Scene(engine);

    // Set white studio background
    scene.clearColor = new BABYLON.Color3(0.95, 0.95, 0.95); // Light white/gray background

    // Initialize Havok Physics
    const havokPlugin = new BABYLON.HavokPlugin(true, await HavokPhysics());
    scene.enablePhysics(new BABYLON.Vector3(0, -150, 0), havokPlugin);
    scene.getPhysicsEngine().setTimeStep(1 / 500);
    scene.getPhysicsEngine().setVelocityLimits(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    scene.getPhysicsEngine().setSubTimeStep(1.8);

    const camera = new BABYLON.FollowCamera("FollowCam", new BABYLON.Vector3(0, 10, -10), scene);
    camera.radius = 50;
    camera.heightOffset = 20;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.035;
    camera.maxCameraSpeed = 10;

    // Add mouse control for camera rotation (from playground)
    let isMouseDown = false;
    scene.onPointerObservable.add((pointerInfo) => {
        switch (pointerInfo.type) {
            case BABYLON.PointerEventTypes.POINTERDOWN:
                isMouseDown = true;
                break;

            case BABYLON.PointerEventTypes.POINTERUP:
                isMouseDown = false;
                break;

            case BABYLON.PointerEventTypes.POINTERMOVE:
                if (isMouseDown) {
                    // Rotate camera around the car using mouse movement
                    camera.rotationOffset += pointerInfo.event.movementX * 0.5;
                }
                break;
        }
    });

    const hemisphericLight = new BABYLON.HemisphericLight("Hemispheric Light", new BABYLON.Vector3(1, 1, 0), scene);
    hemisphericLight.intensity = 0.5; // Much darker ambient lighting

    const carF = await CreateCar(vueApp);

    // Ensure camera setup waits for car to be fully initialized
    if (carF && carF.position) {
        camera.lockedTarget = carF;
        console.log("✅ Camera locked to car:", carF.name);
    } else {
        console.error("❌ Car not properly created for camera targeting");
    }

    // Create square race track
    const track = createSquareRaceTrack(scene, 800, 800);
    track.position.y = -20;

    new BABYLON.PhysicsAggregate(track, BABYLON.PhysicsShapeType.MESH, { mass: 0, friction: 2 }, scene);

    // Create walls around the track
    createTrackWalls(scene, 800, 800);

    // Add collision towers
    createCollisionTowers(scene);

    // Add 5 knockable boxes
    createKnockableBoxes(scene, vueApp);

    // Add bridge
    createBridge(scene);

    addReflectionsToCar();

    addGlowLayer();

    // Measure the frame rate for the FPS badge
    const fpsMeter = new FpsMeter(fps => {
        if (vueApp) {
            vueApp.fps = fps;
        }
    });
    scene.onAfterRenderObservable.add(() => fpsMeter.tick());

    // Setup physics-based collision detection after car is fully created
    // Add a small delay to ensure physics body is properly initialized
    setTimeout(() => {
        setupCollisionDetection(scene, carF, vueApp);
    }, 200);

    let alreadyTriggered = false;
    let raceTime = 0;
    let raceStarted = false;

    const velocity = new BABYLON.Vector3();
    let speed;
    let fCounter = 0;
    scene.onBeforeRenderObservable.add(() => {
        carF.physicsBody.getLinearVelocityToRef(velocity);
        speed = velocity.length();
        if (speed < 1) { speed = 0; }

        // Auto-start race when car starts moving
        if (!raceStarted && speed > 2 && vueApp) {
            console.log("Race started automatically - car is moving!");
            raceTime = Date.now();
            raceStarted = true;
            vueApp.isRacing = true;
            vueApp.raceTime = 0;
        }

        // Update Vue.js data
        if (vueApp) {
            vueApp.speed = speed; // Convert to km/h
            vueApp.position.x = carF.position.x;
            vueApp.position.y = carF.position.y;
            vueApp.position.z = carF.position.z;

            // Fix rotation calculation - use quaternion if available, otherwise use euler
            let rotationY = 0;
            if (carF.rotationQuaternion) {
                rotationY = carF.rotationQuaternion.toEulerAngles().y;
            } else {
                rotationY = carF.rotation.y;
            }
            vueApp.rotation = (rotationY * 180 / Math.PI) % 360;

            vueApp.maxSpeed = Math.max(vueApp.maxSpeed, vueApp.speed);

            // Update race time
            if (vueApp.isRacing && raceStarted && !alreadyTriggered && fCounter < 1) {
                vueApp.raceTime = ((Date.now() - raceTime) / 1000);
            }
        }
    });

    return scene;
}

function addReflectionsToCar() {
    const carProbe = new BABYLON.ReflectionProbe("reflections", 256, scene, false, false);

    for (const mesh of scene.meshes) {
        carProbe.renderList.push(mesh);
    }

    const reflection = carProbe.cubeTexture;
    reflection.coordinatesMode = 6; //3;
    reflection.level = 5;
    const carBody = scene.getMeshByName("CarBody");
    if (carBody && carBody.material) {
        carBody.material.reflectionTexture = reflection;
    }
    if (carBody) {
        carProbe.attachToMesh(carBody);
    }
}

function addGlowLayer() {
    const glowLayer = new BABYLON.GlowLayer("Glow", scene, {
        mainTextureSamples: 4
    });

    glowLayer.intensity = 4;
    glowLayer.blurKernelSize = 64;
}

function createSquareRaceTrack(scene, width = 800, height = 800) {
    // Create a square ground/track
    const track = BABYLON.MeshBuilder.CreateGround("SquareTrack", {
        width: width,
        height: height
    }, scene);

    // Apply gray racing track material with same lighting properties as walls
    const trackMaterial = new BABYLON.StandardMaterial("trackMaterial", scene);
    trackMaterial.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.4); // Medium gray racing track color
    trackMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Same specular as walls for consistent lighting

    track.material = trackMaterial;
    track.receiveShadows = true; // Enable shadow receiving

    return track;
}

function createTrackWalls(scene, trackWidth = 800, trackHeight = 800) {
    const wallHeight = 20;
    const wallThickness = 2; // Keep the thickness for visibility

    // Create white wall material for studio environment
    const wallMaterial = new BABYLON.StandardMaterial("wallMaterial", scene);
    wallMaterial.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.95); // Clean white color
    wallMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Low specular for matte look

    // North Wall
    const northWall = BABYLON.MeshBuilder.CreateBox("northWall", {
        width: trackWidth + wallThickness * 2,
        height: wallHeight,
        depth: wallThickness
    }, scene);
    northWall.position.set(0, wallHeight / 2 - 20, trackHeight / 2 + wallThickness / 2);
    northWall.material = wallMaterial;
    new BABYLON.PhysicsAggregate(northWall, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.1 }, scene);

    // South Wall
    const southWall = BABYLON.MeshBuilder.CreateBox("southWall", {
        width: trackWidth + wallThickness * 2,
        height: wallHeight,
        depth: wallThickness
    }, scene);
    southWall.position.set(0, wallHeight / 2 - 20, -trackHeight / 2 - wallThickness / 2);
    southWall.material = wallMaterial;
    new BABYLON.PhysicsAggregate(southWall, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.1 }, scene);

    // East Wall
    const eastWall = BABYLON.MeshBuilder.CreateBox("eastWall", {
        width: wallThickness,
        height: wallHeight,
        depth: trackHeight
    }, scene);
    eastWall.position.set(trackWidth / 2 + wallThickness / 2, wallHeight / 2 - 20, 0);
    eastWall.material = wallMaterial;
    new BABYLON.PhysicsAggregate(eastWall, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.1 }, scene);

    // West Wall
    const westWall = BABYLON.MeshBuilder.CreateBox("westWall", {
        width: wallThickness,
        height: wallHeight,
        depth: trackHeight
    }, scene);
    westWall.position.set(-trackWidth / 2 - wallThickness / 2, wallHeight / 2 - 20, 0);
    westWall.material = wallMaterial;
    new BABYLON.PhysicsAggregate(westWall, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.1 }, scene);
}

function createCollisionTowers(scene) {
    const towerMaterial = new BABYLON.StandardMaterial("towerMaterial", scene);
    towerMaterial.diffuseColor = new BABYLON.Color3(0.6, 0.3, 0.1); // Brown color
    // No emissiveColor - no lightning effect

    // Create several towers around the track
    const towerPositions = [
        { x: 200, z: 200 },
        { x: -200, z: 200 },
        { x: 200, z: -200 },
        { x: -200, z: -200 },
        { x: 0, z: 300 },
        { x: 300, z: 0 },
        { x: -300, z: 0 },
        { x: 0, z: -300 }
    ];

    towerPositions.forEach((pos, index) => {
        const tower = BABYLON.MeshBuilder.CreateBox(`tower_${index}`, {
            width: 15,
            height: 25,
            depth: 15
        }, scene);

        tower.position.set(pos.x, 12.5 - 20, pos.z); // Height/2 - ground level
        tower.material = towerMaterial;

        // Add physics for collision
        new BABYLON.PhysicsAggregate(tower, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, scene);
    });
}

function createKnockableBoxes(scene, vueApp) {
    const boxMaterial = new BABYLON.StandardMaterial("boxMaterial", scene);
    boxMaterial.diffuseColor = new BABYLON.Color3(1, 0.5, 0); // Orange color
    boxMaterial.emissiveColor = new BABYLON.Color3(0.2, 0.1, 0);

    // Create 5 boxes at different positions (moved away from bridge area X=185 to X=-75)
    const boxPositions = [
        { x: 250, z: 100 },  // Moved further right
        { x: -200, z: 100 }, // Moved further left  
        { x: 250, z: -250 }, // Moved further right and back
        { x: -200, z: -250 }, // Moved further left and back
        { x: 300, z: 0 }     // Moved much further right from center
    ];

    const boxes = [];

    boxPositions.forEach((pos, index) => {
        const box = BABYLON.MeshBuilder.CreateBox(`knockableBox_${index}`, {
            width: 8,
            height: 8,
            depth: 8
        }, scene);

        box.position.set(pos.x, 4, pos.z); // Height/2 above ground level
        box.material = boxMaterial;

        // Add physics - these boxes can be knocked over
        const boxAggregate = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, {
            mass: 20, // Lighter mass for easier knockdown
            friction: 0.4, // Less friction
            restitution: 0.5 // More bounce
        }, scene);

        // Store original position for reset
        box.originalPosition = box.position.clone();
        box.originalRotation = box.rotation.clone();
        box.knocked = false;
        box.boxIndex = index;
        box.positionSettled = false; // Flag to track if position has settled

        boxes.push(box);
    });

    // Debug: List all created boxes
    console.log(`Created ${boxes.length} knockable boxes - position settling in 2 seconds`);

    return boxes;
}

// Physics-based collision detection system
function setupCollisionDetection(scene, car, vueApp) {
    // Get car's physics body with multiple fallback options
    let carPhysicsBody = null;

    if (car) {
        carPhysicsBody = car.physicsBody || car._physicsBody;

        // If still not found, try to wait a bit more for physics to initialize
        if (!carPhysicsBody) {
            console.log("⏳ Physics body not ready, retrying in 100ms...");
            setTimeout(() => {
                setupCollisionDetection(scene, car, vueApp);
            }, 100);
            return;
        }
    }

    if (!carPhysicsBody) {
        console.error("❌ Car physics body not found after retries!");
        return;
    }

    console.log("✅ Car physics body found, setting up collision detection");

    // Track collision cooldowns to prevent spam
    const collisionCooldowns = new Map();
    let lastVelocity = { x: 0, y: 0, z: 0 };
    let debugCounter = 0;
    let startTime = Date.now(); // Track when system started

    console.log("Collision detection system started, box detection active after 2 seconds...");

    // Setup collision detection
    scene.onBeforeRenderObservable.add(() => {
        debugCounter++;

        // Get current velocity
        const velocity = carPhysicsBody.getLinearVelocity();
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);

        // Check for sudden speed changes (collisions)
        const lastSpeed = Math.sqrt(lastVelocity.x * lastVelocity.x + lastVelocity.y * lastVelocity.y + lastVelocity.z * lastVelocity.z);
        const speedDifference = Math.abs(speed - lastSpeed);

        // If speed drops significantly (collision), increment counter
        if (speedDifference > 5 && speed < lastSpeed && lastSpeed > 2) {
            const now = Date.now();
            if (!collisionCooldowns.has('general') || now - collisionCooldowns.get('general') > 500) {
                if (vueApp) {
                    vueApp.collisions++;
                    console.log(`Collision detected! Speed change: ${speedDifference.toFixed(2)}, Total collisions: ${vueApp.collisions}`);
                }
                collisionCooldowns.set('general', now);
            }
        }

        // Debug every 300 frames (5 seconds at 60fps) - reduced spam
        if (debugCounter % 300 === 0) {
            const boxCount = scene.meshes.filter(m => m.name.includes("knockableBox_")).length;
            console.log(`Debug: Car at (${car.position.x.toFixed(1)}, ${car.position.y.toFixed(1)}, ${car.position.z.toFixed(1)}), Found ${boxCount} boxes`);
        }

        // Only start checking box movement after 2 seconds (let physics settle)
        if (Date.now() - startTime > 2000) {
            // Check for box movement (knocked boxes) - allow multiple hits per box
            scene.meshes.forEach(mesh => {
                if (mesh.name.includes("knockableBox_")) {
                    // Update initial position if this is first check after settling
                    if (!mesh.positionSettled) {
                        mesh.initialPosition = mesh.position.clone();
                        mesh.positionSettled = true;
                        return; // Skip this frame for this box
                    }

                    // Calculate how much the box has moved from its settled position
                    const movementDistance = BABYLON.Vector3.Distance(mesh.position, mesh.initialPosition);
                    const now = Date.now();

                    // If box moved more than 3 units and enough time passed since last count
                    if (movementDistance > 3) {
                        // Use cooldown per box to prevent rapid spam (1000ms)
                        if (!collisionCooldowns.has(mesh.name) || now - collisionCooldowns.get(mesh.name) > 1000) {
                            if (vueApp) {
                                vueApp.knockedBoxes++;
                                console.log(`Box ${mesh.name} moved ${movementDistance.toFixed(2)} units from settled position! Total: ${vueApp.knockedBoxes}`);
                                // Update initial position to current position to track further movement
                                mesh.initialPosition = mesh.position.clone();
                            }
                            collisionCooldowns.set(mesh.name, now);
                        }
                    }
                }
            });
        }

        lastVelocity = { x: velocity.x, y: velocity.y, z: velocity.z };
    });
}

// Create a ramp bridge for driving over
function createBridge(scene) {
    // Bridge spans from X=185 to X=-75 (total width: 260 units)
    const bridgeStartX = 185;
    const bridgeEndX = -75;
    const bridgeWidth = bridgeStartX - bridgeEndX; // 260 units
    const bridgeCenterX = (bridgeStartX + bridgeEndX) / 2; // 55
    const bridgeZ = 0; // Center on Z axis
    const bridgeHeight = 25; // Higher off the ground

    // Create bridge material - clean white/gray
    const bridgeMaterial = new BABYLON.StandardMaterial("bridgeMaterial", scene);
    bridgeMaterial.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    bridgeMaterial.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    // Define step parameters first
    const stepCount = 12; // More steps for gradual incline
    const stepWidth = 12; // Wider steps
    const stepHeight = 2;
    const stepDepth = 30; // Same depth as bridge

    // Create the main bridge platform (flat part on top) - much bigger
    // Position it to connect with the top of the highest steps
    const maxStepHeight = stepHeight * stepCount; // 24 units high
    const bridgePlatformWidth = 80;
    const bridgePlatform = BABYLON.MeshBuilder.CreateBox("bridgePlatform", {
        width: bridgePlatformWidth, // Much wider for easier driving
        height: 4,
        depth: 30 // Much deeper
    }, scene);
    bridgePlatform.position = new BABYLON.Vector3(bridgeCenterX, maxStepHeight - 20 + 2, bridgeZ); // Connect to top of steps
    bridgePlatform.material = bridgeMaterial;

    // Calculate where bridge starts and ends (bridge edges)
    const bridgeLeftEdge = bridgeCenterX - (bridgePlatformWidth / 2); // 55 - 40 = 15
    const bridgeRightEdge = bridgeCenterX + (bridgePlatformWidth / 2); // 55 + 40 = 95

    // Add physics to bridge platform
    new BABYLON.PhysicsAggregate(bridgePlatform, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 2 }, scene);
    bridgePlatform.receiveShadows = true;

    // Create support pillars under the bridge
    const pillarHeight = bridgeHeight;
    const pillarPositions = [
        { x: bridgeCenterX - 30, z: bridgeZ - 10 },
        { x: bridgeCenterX - 30, z: bridgeZ + 10 },
        { x: bridgeCenterX, z: bridgeZ - 10 },
        { x: bridgeCenterX, z: bridgeZ + 10 },
        { x: bridgeCenterX + 30, z: bridgeZ - 10 },
        { x: bridgeCenterX + 30, z: bridgeZ + 10 }
    ];

    pillarPositions.forEach((pos, index) => {
        const pillar = BABYLON.MeshBuilder.CreateBox(`bridgePillar${index}`, {
            width: 6,
            height: pillarHeight,
            depth: 6
        }, scene);
        pillar.position = new BABYLON.Vector3(pos.x, pillarHeight / 2 - 20, pos.z);
        pillar.material = bridgeMaterial;
        new BABYLON.PhysicsAggregate(pillar, BABYLON.PhysicsShapeType.BOX, { mass: 0, friction: 1 }, scene);
        pillar.receiveShadows = true;
    });

    console.log(`🌉 Large ramp bridge created from X=${bridgeStartX} to X=${bridgeEndX} at height ${bridgeHeight}`);
}

// Create red taillights for the car
// Lights the model's own headlight and taillight meshes and casts a spot light from each.
function createCarLights(carFrame, parts) {
    addCarLamp(carFrame, parts.headlights, [0.867, 0.773, 0.518], 1, { intensity: 3, range: 60, angle: Math.PI / 2, droop: 0.3, shadows: true });
    addCarLamp(carFrame, parts.taillights, [1, 0, 0], -1, { intensity: 1.5, range: 25, angle: Math.PI / 1.2, droop: 0, shadows: false });
    console.log('💡 Model headlights and taillights lit');
}

function addCarLamp(carFrame, lampMesh, rgb, forwardZ, spot) {
    const color = new BABYLON.Color3(rgb[0], rgb[1], rgb[2]);
    const material = new BABYLON.StandardMaterial(lampMesh.name + 'Material', scene);
    material.diffuseColor = color;
    material.emissiveColor = color;
    material.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    lampMesh.material = material;
    lampMesh.parent = carFrame;

    const box = lampMesh.getBoundingInfo().boundingBox;
    const center = box.minimum.add(box.maximum).scale(0.5);
    const light = new BABYLON.SpotLight(lampMesh.name + 'Spot',
        center,
        new BABYLON.Vector3(0, -spot.droop, forwardZ),
        spot.angle, 2, scene);
    light.diffuse = color;
    light.specular = color;
    light.intensity = spot.intensity;
    light.range = spot.range;
    light.parent = carFrame;

    if (spot.shadows) {
        const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
        shadowGenerator.useBlurExponentialShadowMap = true;
        shadowGenerator.blurBoxOffset = 2.0;
        shadowGenerator.bias = 0.00001;
        shadowGenerator.getShadowMap().renderList.push(carFrame);
    }
}

async function CreateCar(vueApp) {
    const parts = await importCustomCar();
    if (!parts) {
        console.error('Custom car loading failed! Using fallback box.');
        return createFallbackCar(vueApp);
    }

    const carFrame = parts.body;
    carFrame.position = new BABYLON.Vector3(0, 5, 0);
    const carFrameBody = AddDynamicPhysicsConvex(carFrame, 5000, 0, 0.8, new BABYLON.Vector3(0, -2.5, 1));
    FilterMeshCollisions(carFrame);

    const layout = [
        { corner: 'frontLeft', signX: 1, signZ: 1, steered: true, powered: true },
        { corner: 'frontRight', signX: -1, signZ: 1, steered: true, powered: true },
        { corner: 'rearLeft', signX: 1, signZ: -1, steered: false, powered: false },
        { corner: 'rearRight', signX: -1, signZ: -1, steered: false, powered: false }
    ];
    const wheelsByCorner = new Map(parts.wheels.map(wheel => [wheel.corner, wheel]));
    const assemblies = layout.map(entry => {
        const position = new BABYLON.Vector3(entry.signX * parts.halfTrack, 0, entry.signZ * parts.halfWheelbase);
        const wheelMesh = wheelsByCorner.get(entry.corner).mesh;
        wheelMesh.position = position.clone();
        const axle = CreateAxle(position.clone());
        return { ...entry, wheelMesh, axle };
    });

    for (const assembly of assemblies) {
        carFrame.addChild(assembly.axle);
        AddAxlePhysics(assembly.axle, 190, 0, 0);
        FilterMeshCollisions(assembly.axle);
    }
    for (const assembly of assemblies) {
        AddWheelPhysics(assembly.wheelMesh, 150, 0, 2.5, parts.wheelRadius);
        FilterMeshCollisions(assembly.wheelMesh);
    }

    const driveMotors = [];
    const steerMotors = [];
    for (const assembly of assemblies) {
        const motor = assembly.powered
            ? CreatePoweredWheelJoint(assembly.axle, assembly.wheelMesh)
            : CreateWheelJoint(assembly.axle, assembly.wheelMesh);
        if (assembly.powered) driveMotors.push(motor);
        const steer = AttachAxleToFrame(assembly.axle.physicsBody, carFrameBody, assembly.steered);
        if (assembly.steered) steerMotors.push(steer);
    }

    const cockpit = buildCockpit(carFrame, parts);
    createCarLights(carFrame, parts);
    InitKeyboardControls(driveMotors[0], driveMotors[1], steerMotors[0], steerMotors[1], carFrame, vueApp, cockpit, parts);

    return carFrame;
}

/** Parents the steering wheel and pedal to the body as animatable pivots. */
function buildCockpit(carFrame, parts) {
    const steeringPivot = new BABYLON.TransformNode('steeringPivot', scene);
    steeringPivot.parent = carFrame;
    steeringPivot.position = parts.steering.pivot;
    steeringPivot.rotationQuaternion = parts.steering.orientation;
    parts.steering.mesh.parent = steeringPivot;
    parts.steering.mesh.position = BABYLON.Vector3.Zero();
    parts.steering.mesh.rotationQuaternion = null;
    parts.steering.mesh.rotation = BABYLON.Vector3.Zero();

    const pedalPivot = new BABYLON.TransformNode('pedalPivot', scene);
    pedalPivot.parent = carFrame;
    pedalPivot.position = parts.pedal.pivot;
    pedalPivot.rotationQuaternion = null;
    parts.pedal.mesh.parent = pedalPivot;
    parts.pedal.mesh.position = BABYLON.Vector3.Zero();
    parts.pedal.mesh.rotation = BABYLON.Vector3.Zero();

    return { steeringWheel: parts.steering.mesh, pedal: pedalPivot, pedalPress: 0 };
}

function createFallbackCar(vueApp) {
    const carFrame = BABYLON.MeshBuilder.CreateBox('CarBody', { height: 1, width: 12, depth: 24, faceColors: debugColours });
    carFrame.position = new BABYLON.Vector3(0, 1, 0);
    carFrame.visibility = 0.5;
    const carFrameBody = AddDynamicPhysics(carFrame, 2000, 0, 0, new BABYLON.Vector3(0, -2.5, 1));
    FilterMeshCollisions(carFrame);

    const flWheel = CreateWheel(new BABYLON.Vector3(5, 0, 8));
    const flAxle = CreateAxle(new BABYLON.Vector3(5, 0, 8));
    const frWheel = CreateWheel(new BABYLON.Vector3(-5, 0, 8));
    const frAxle = CreateAxle(new BABYLON.Vector3(-5, 0, 8));
    const rlWheel = CreateWheel(new BABYLON.Vector3(5, 0, -8));
    const rlAxle = CreateAxle(new BABYLON.Vector3(5, 0, -8));
    const rrWheel = CreateWheel(new BABYLON.Vector3(-5, 0, -8));
    const rrAxle = CreateAxle(new BABYLON.Vector3(-5, 0, -8));

    for (const mesh of [flAxle, frAxle, rlAxle, rrAxle]) {
        carFrame.addChild(mesh);
        AddAxlePhysics(mesh, 190, 0, 0);
        FilterMeshCollisions(mesh);
    }
    for (const mesh of [flWheel, frWheel, rlWheel, rrWheel]) {
        AddWheelPhysics(mesh, 150, 0, 2.5, 2);
        FilterMeshCollisions(mesh);
    }
    const poweredWheelMotorA = CreatePoweredWheelJoint(flAxle, flWheel);
    const poweredWheelMotorB = CreatePoweredWheelJoint(frAxle, frWheel);
    CreateWheelJoint(rlAxle, rlWheel);
    CreateWheelJoint(rrAxle, rrWheel);
    const steerWheelA = AttachAxleToFrame(flAxle.physicsBody, carFrameBody, true);
    const steerWheelB = AttachAxleToFrame(frAxle.physicsBody, carFrameBody, true);
    AttachAxleToFrame(rlAxle.physicsBody, carFrameBody);
    AttachAxleToFrame(rrAxle.physicsBody, carFrameBody);
    InitKeyboardControls(poweredWheelMotorA, poweredWheelMotorB, steerWheelA, steerWheelB, carFrame, vueApp, null, null);
    return carFrame;
}

function CreateAxle(position) {
    const axleMesh = BABYLON.MeshBuilder.CreateBox('Axle', { height: 1, width: 2.5, depth: 1, faceColors: debugColours });
    axleMesh.position = position;
    axleMesh.isVisible = false;
    return axleMesh;
}

function CreateWheel(position) {
    const wheelMesh = BABYLON.MeshBuilder.CreateCylinder('Wheel', { height: 1.6, diameter: 4 });
    wheelMesh.rotation = new BABYLON.Vector3(0, 0, Math.PI / 2);
    wheelMesh.bakeCurrentTransformIntoVertices();
    wheelMesh.position = position;
    if (tyreMaterial) wheelMesh.material = tyreMaterial;
    return wheelMesh;
}

function AttachAxleToFrame(axle, frame, hasSteering) {
    const aPos = axle.transformNode.position;

    // Since @babylonjs/havok 1.3.12 angular position motors act in constraint space. Babylon derives the
    // secondary axis of (1, 0, 0) as (0, -1, 0), which turns the steering motor the wrong way round, so the
    // secondary axis is set explicitly to world up.
    const constraintUp = new BABYLON.Vector3(0, 1, 0);

    const joint = new BABYLON.Physics6DoFConstraint(
        {
            pivotA: new BABYLON.Vector3(0, 0, 0),
            pivotB: new BABYLON.Vector3(aPos.x, aPos.y, aPos.z),
            perpAxisA: constraintUp,
            perpAxisB: constraintUp,
        },
        [
            {
                axis: BABYLON.PhysicsConstraintAxis.LINEAR_X,
                minLimit: 0,
                maxLimit: 0,
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.LINEAR_Y,
                minLimit: -0.15,
                maxLimit: 0.15,
                stiffness: 100000,
                damping: 1500
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.LINEAR_Z,
                minLimit: 0,
                maxLimit: 0,
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.ANGULAR_X,
                minLimit: -0.25,
                maxLimit: 0.25,
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
                minLimit: hasSteering ? null : 0,
                maxLimit: hasSteering ? null : 0,
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
                minLimit: -0.05,
                maxLimit: 0.05,
            },
        ],
        scene
    );

    axle.addConstraint(frame, joint);

    if (hasSteering)
        AttachSteering(joint);

    return joint;
}

function CreateWheelJoint(axle, wheel) {
    const motorJoint = new BABYLON.Physics6DoFConstraint(
        {},
        [
            {
                axis: BABYLON.PhysicsConstraintAxis.LINEAR_DISTANCE,
                minLimit: 0,
                maxLimit: 0,
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
                minLimit: 0,
                maxLimit: 0,
            },
            {
                axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Z,
                minLimit: 0,
                maxLimit: 0,
            },
        ],
        scene
    );

    axle.addChild(wheel);
    axle.physicsBody.addConstraint(wheel.physicsBody, motorJoint);

    return motorJoint;
}

function CreatePoweredWheelJoint(axle, wheel) {
    const motorJoint = CreateWheelJoint(axle, wheel);

    motorJoint.setAxisMotorType(BABYLON.PhysicsConstraintAxis.ANGULAR_X, BABYLON.PhysicsConstraintMotorType.VELOCITY);
    motorJoint.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 330000);
    motorJoint.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 0);

    return motorJoint;
}

function AttachSteering(joint) {
    joint.setAxisMotorType(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, BABYLON.PhysicsConstraintMotorType.POSITION);
    joint.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 60000000);
    joint.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 0);

    return joint;
}

function InitKeyboardControls(motorWheelA, motorWheelB, steerWheelA, steerWheelB, carFrame, vueApp, cockpit, parts) {
    let forwardPressed = false;
    let backPressed = false;
    let leftPressed = false;
    let rightPressed = false;
    let brakePressed = false;
    let jumpPressed = false; // New jump state

    let currentSpeed = 0;
    let currentSteeringAngle = 0;
    let maxSpeed = 80; // Optimized for good control
    const maxSteeringAngle = Math.PI / 4; // Increased from PI/6 to PI/4 for sharper turns
    const jumpForce = 3000; // Increased jump force for better visibility

    scene.onKeyboardObservable.add(e => {
        switch (e.event.key) {
            case "w": case "W": case "ArrowUp": forwardPressed = e.type == BABYLON.KeyboardEventTypes.KEYDOWN ? true : false;
                break;
            case "s": case "S": case "ArrowDown": backPressed = e.type == BABYLON.KeyboardEventTypes.KEYDOWN ? true : false;
                break;
            case "a": case "A": case "ArrowLeft": leftPressed = e.type == BABYLON.KeyboardEventTypes.KEYDOWN ? true : false;
                break;
            case "d": case "D": case "ArrowRight": rightPressed = e.type == BABYLON.KeyboardEventTypes.KEYDOWN ? true : false;
                break;
            case "b": case "B": brakePressed = e.type == BABYLON.KeyboardEventTypes.KEYDOWN ? true : false; // Changed from Space to B
                break;
            case " ": // Space is now jump
                if (e.type == BABYLON.KeyboardEventTypes.KEYDOWN) {
                    jumpPressed = true;
                    console.log("🚀 Jump button pressed!");

                    // Apply jump force using multiple methods for reliability
                    if (carFrame.physicsBody) {
                        // Primary method: Direct impulse
                        carFrame.physicsBody.applyImpulse(new BABYLON.Vector3(0, jumpForce, 0), carFrame.getAbsolutePosition());

                        // Secondary method: Velocity adjustment
                        const currentVel = carFrame.physicsBody.getLinearVelocity();
                        carFrame.physicsBody.setLinearVelocity(new BABYLON.Vector3(currentVel.x, jumpForce / 100, currentVel.z));
                    } else {
                        console.error("❌ No physics body found on car frame!");
                    }
                } else {
                    jumpPressed = false;
                }
                break;
            case "Enter":
                if (e.type == BABYLON.KeyboardEventTypes.KEYDOWN && vueApp) {
                    vueApp.resetGame();
                }
                break;
        }
    });

    scene.onBeforeRenderObservable.add(() => {
        // Combine keyboard and touch inputs
        const isForward = forwardPressed || (vueApp && vueApp.touchControls.forward);
        const isBackward = backPressed || (vueApp && vueApp.touchControls.backward);
        const isLeft = leftPressed || (vueApp && vueApp.touchControls.left);
        const isRight = rightPressed || (vueApp && vueApp.touchControls.right);
        const isBrake = brakePressed || (vueApp && vueApp.touchControls.brake);
        const isJump = jumpPressed || (vueApp && vueApp.touchControls.jump);

        // Handle jump from both keyboard and touch
        if (isJump) {
            console.log("🚀 Jump (keyboard or touch) activated!");

            // Apply jump force continuously while button/touch is held
            if (carFrame.physicsBody) {
                // Apply continuous upward force for as long as jump is held
                carFrame.physicsBody.applyImpulse(new BABYLON.Vector3(0, jumpForce / 2, 0), carFrame.getAbsolutePosition());

                // Also add slight upward velocity for sustained effect
                const currentVel = carFrame.physicsBody.getLinearVelocity();
                carFrame.physicsBody.setLinearVelocity(new BABYLON.Vector3(currentVel.x, Math.min(currentVel.y + jumpForce / 200, jumpForce / 50), currentVel.z));
            }
        }

        if (isLeft && currentSteeringAngle < maxSteeringAngle) {
            currentSteeringAngle += 0.05; // Increased from 0.02 to 0.08 (4x faster)
        } else if (isRight && currentSteeringAngle > -maxSteeringAngle) {
            currentSteeringAngle -= 0.05; // Increased from 0.02 to 0.08 (4x faster)
        } else if (!isLeft && !isRight) {
            currentSteeringAngle *= 0.85; // Increased from 0.98 to 0.85 (much faster centering)
        }

        const [innerAngle, outerAngle] = CalculateWheelAngles(currentSteeringAngle);
        steerWheelA.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, outerAngle);
        steerWheelB.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, innerAngle);

        if (isBrake) {
            currentSpeed = 0;
        } else if (isForward && currentSpeed < maxSpeed) {
            currentSpeed += 1; // Smooth acceleration
        } else if (isBackward && currentSpeed > -maxSpeed * 0.5) {
            currentSpeed -= 1; // Smooth deceleration
        } else if (!isForward && !isBackward) {
            currentSpeed *= 0.92; // Natural slowdown
        }

        // Update Vue.js direction data
        if (vueApp) {
            let directions = [];

            if (isForward) directions.push('↑ Forward');
            if (isBackward) directions.push('↓ Backward');
            if (isLeft) directions.push('← Left');
            if (isRight) directions.push('→ Right');
            if (isBrake) directions.push('🚗 Brake');
            if (isJump) directions.push('🚀 Jump');

            if (directions.length > 0) {
                vueApp.direction = directions.join(' + ');
            } else {
                vueApp.direction = '—';
            }
        }

        if (isBrake) {
            motorWheelA.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 1000000);
            motorWheelB.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 1000000);
        } else {
            motorWheelA.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 330000);
            motorWheelB.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_X, 330000);
        }

        motorWheelA.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_X, currentSpeed);
        motorWheelB.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_X, currentSpeed);

        // Animate the cockpit: turn the steering wheel and press the pedal in time with the controls
        if (cockpit) {
            cockpit.steeringWheel.rotation.z = -currentSteeringAngle * 4;
            const pedalTarget = (isForward || isBackward || isBrake) ? 0.5 : 0;
            cockpit.pedalPress += (pedalTarget - cockpit.pedalPress) * 0.25;
            cockpit.pedal.rotation.x = cockpit.pedalPress;
        }
    });
}

function AddWheelPhysics(mesh, mass, bounce, friction, radius = 2) {
    const physicsShape = new BABYLON.PhysicsShapeCylinder(new BABYLON.Vector3(-0.8, 0, 0), new BABYLON.Vector3(0.8, 0, 0), radius, scene);
    const physicsBody = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
    physicsBody.setMassProperties({ mass: mass });
    physicsShape.material = { restitution: bounce, friction: friction };
    physicsBody.shape = physicsShape;

    return physicsBody;
}

function AddAxlePhysics(mesh, mass, bounce, friction) {
    const physicsShape = new BABYLON.PhysicsShapeCylinder(new BABYLON.Vector3(-0.8, 0, 0), new BABYLON.Vector3(0.8, 0, 0), 1.8, scene);
    const physicsBody = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
    physicsBody.setMassProperties({ mass: mass });
    physicsShape.material = { restitution: bounce, friction: friction };
    physicsBody.shape = physicsShape;

    return physicsBody;
}

function AddDynamicPhysics(mesh, mass, bounce, friction, centerOfMass) {
    const physicsShape = new BABYLON.PhysicsShapeMesh(mesh, scene);
    const physicsBody = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
    physicsBody.setMassProperties({ mass: mass, centerOfMass: centerOfMass });
    physicsShape.material = { restitution: bounce, friction: friction };
    physicsBody.shape = physicsShape;

    return physicsBody;
}

function AddDynamicPhysicsConvex(mesh, mass, bounce, friction, centerOfMass) {
    const physicsShape = new BABYLON.PhysicsShapeConvexHull(mesh, scene);
    const physicsBody = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
    physicsBody.setMassProperties({ mass: mass, centerOfMass: centerOfMass });
    physicsShape.material = { restitution: bounce, friction: friction };
    physicsBody.shape = physicsShape;

    return physicsBody;
}

function FilterMeshCollisions(mesh) {
    mesh.physicsBody.shape.filterMembershipMask = FILTERS.CarParts;
    mesh.physicsBody.shape.filterCollideMask = FILTERS.Environment;
}

function CalculateWheelAngles(averageAngle) {
    const wheelbase = 16;
    const trackWidth = 11;

    const avgRadius = wheelbase / Math.tan(averageAngle);
    const innerRadius = avgRadius - trackWidth / 2;
    const outerRadius = avgRadius + trackWidth / 2;
    const innerAngle = Math.atan(wheelbase / innerRadius);
    const outerAngle = Math.atan(wheelbase / outerRadius);

    return [innerAngle, outerAngle];
}

// ==== Ford Anglia model loading and part extraction ====
const CAR_PART_NAMES = {
    frontWheels: ['Cylinder023'],
    rearWheels: ['Cylinder024'],
    steering: ['Torus002'],
    pedal: ['Cylinder029', 'Cube073'],
    headlights: ['Plane021'],
    taillights: ['Plane041', 'Plane042', 'Plane043']
};
const TARGET_HALF_TRACK = 5;

function normalizeCarPartName(name) {
    return name.replace(/\./g, '');
}

function classifyImportedMeshes(meshes) {
    const lookup = new Map();
    for (const [part, names] of Object.entries(CAR_PART_NAMES)) {
        for (const name of names) {
            lookup.set(name, part);
        }
    }
    const buckets = { body: [], frontWheels: [], rearWheels: [], steering: [], pedal: [], headlights: [], taillights: [] };
    for (const mesh of meshes) {
        if (mesh.getClassName() !== 'Mesh' || mesh.getTotalVertices() === 0) {
            continue;
        }
        buckets[lookup.get(normalizeCarPartName(mesh.name)) ?? 'body'].push(mesh);
    }
    return buckets;
}

/** Merges the meshes (baking their world transforms) and then bakes an extra matrix into the result. */
function mergeBakedPart(meshes, bakeMatrix, name) {
    const clones = meshes.map(mesh => mesh.clone(mesh.name + '_clone'));
    const merged = BABYLON.Mesh.MergeMeshes(clones, true, true, undefined, false, false);
    merged.name = name;
    if (bakeMatrix) {
        merged.bakeTransformIntoVertices(bakeMatrix);
    }
    merged.flipFaces(true); // undo the winding flip from Babylon's right-to-left-handed import
    return merged;
}

/** World-space bounding box centre of a set of meshes. */
function meshesWorldBox(meshes) {
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
    }
    return { min, max, center: min.add(max).scale(0.5), size: max.subtract(min) };
}

/** Splits a wheel-pair mesh into its left (+X) and right (-X) wheel, recentred on the hub. */
function splitWheelPairMesh(pairMesh, keepPositive, name) {
    const pos = pairMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const nor = pairMesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    const uv = pairMesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    const idx = pairMesh.getIndices();
    const positions = [], normals = [], uvs = [], indices = [];
    const remap = new Map();
    for (let t = 0; t < idx.length; t += 3) {
        const tri = [idx[t], idx[t + 1], idx[t + 2]];
        const centroidX = (pos[tri[0] * 3] + pos[tri[1] * 3] + pos[tri[2] * 3]) / 3;
        if (keepPositive ? centroidX <= 0 : centroidX >= 0) {
            continue;
        }
        for (const vi of tri) {
            if (!remap.has(vi)) {
                remap.set(vi, positions.length / 3);
                positions.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
                if (nor) normals.push(nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2]);
                if (uv) uvs.push(uv[vi * 2], uv[vi * 2 + 1]);
            }
            indices.push(remap.get(vi));
        }
    }
    const wheel = new BABYLON.Mesh(name, scene);
    const data = new BABYLON.VertexData();
    data.positions = positions;
    if (nor) data.normals = normals;
    if (uv) data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(wheel);
    wheel.material = pairMesh.material;

    wheel.computeWorldMatrix(true);
    const box = wheel.getBoundingInfo().boundingBox;
    const hub = box.minimumWorld.add(box.maximumWorld).scale(0.5);
    const size = box.maximumWorld.subtract(box.minimumWorld);
    wheel.bakeTransformIntoVertices(BABYLON.Matrix.Translation(-hub.x, -hub.y, -hub.z));
    return { mesh: wheel, hub, radius: Math.max(size.y, size.z) / 2 };
}

function splitWheelPair(pairMeshes, bake, corners) {
    const merged = mergeBakedPart(pairMeshes, bake, 'wheelPair');
    const left = splitWheelPairMesh(merged, true, `Wheel_${corners[0]}`);
    const right = splitWheelPairMesh(merged, false, `Wheel_${corners[1]}`);
    merged.dispose();
    return [{ corner: corners[0], ...left }, { corner: corners[1], ...right }];
}

/** A recentred pivot part (steering wheel / pedal) with a parent node carrying its orientation. */
function buildPivotPart(meshes, bake, name, hingeTop) {
    const captureMesh = meshes[0];
    captureMesh.computeWorldMatrix(true);
    const orientation = captureMesh.absoluteRotationQuaternion.clone();

    const merged = mergeBakedPart(meshes, bake, name);
    merged.computeWorldMatrix(true);
    const box = merged.getBoundingInfo().boundingBox;
    const min = box.minimumWorld, max = box.maximumWorld;
    const pivot = hingeTop
        ? new BABYLON.Vector3((min.x + max.x) / 2, max.y, (min.z + max.z) / 2)
        : min.add(max).scale(0.5);

    merged.bakeTransformIntoVertices(BABYLON.Matrix.Translation(-pivot.x, -pivot.y, -pivot.z));
    // Undo the world orientation so the local part is axis-aligned; the pivot node re-applies the tilt
    if (!hingeTop) {
        merged.bakeTransformIntoVertices(BABYLON.Matrix.Compose(
            BABYLON.Vector3.One(), BABYLON.Quaternion.Inverse(orientation), BABYLON.Vector3.Zero()
        ));
    }
    return { mesh: merged, pivot, orientation };
}

async function importCustomCar() {
    try {
        console.log('🚗 Loading Ford Anglia car model...');
        const result = await BABYLON.SceneLoader.ImportMeshAsync('', 'game/models/', 'car.glb', scene);
        const buckets = classifyImportedMeshes(result.meshes);
        if (buckets.frontWheels.length === 0 || buckets.rearWheels.length === 0) {
            throw new Error('Car model is missing its wheel meshes');
        }

        // Measure the raw half-track by splitting the front pair, then scale so it matches the physics rig
        const rawFront = splitWheelPair(buckets.frontWheels, null, ['frontLeft', 'frontRight']);
        const rawHalfTrack = Math.abs(rawFront[0].hub.x);
        rawFront.forEach(wheel => wheel.mesh.dispose());
        const scale = TARGET_HALF_TRACK / rawHalfTrack;

        const front = meshesWorldBox(buckets.frontWheels).center;
        const rear = meshesWorldBox(buckets.rearWheels).center;
        const midZ = (front.z + rear.z) / 2;
        const axleY = (front.y + rear.y) / 2;
        const bake = BABYLON.Matrix.Translation(0, -axleY, -midZ).multiply(BABYLON.Matrix.Scaling(scale, scale, scale));

        const wheels = [
            ...splitWheelPair(buckets.frontWheels, bake, ['frontLeft', 'frontRight']),
            ...splitWheelPair(buckets.rearWheels, bake, ['rearLeft', 'rearRight'])
        ];
        const body = mergeBakedPart(buckets.body, bake, 'CarBody');

        const parts = {
            body,
            wheels,
            wheelRadius: wheels[0].radius,
            halfTrack: Math.abs(wheels[0].hub.x),
            halfWheelbase: Math.abs(wheels[0].hub.z),
            steering: buildPivotPart(buckets.steering, bake, 'SteeringWheel', false),
            pedal: buildPivotPart(buckets.pedal, bake, 'Pedal', true),
            headlights: mergeBakedPart(buckets.headlights, bake, 'Headlights'),
            taillights: mergeBakedPart(buckets.taillights, bake, 'Taillights')
        };
        result.meshes.forEach(mesh => { if (mesh.getClassName() === 'Mesh') mesh.dispose(); });

        console.log('✅ Ford Anglia prepared: body + 4 wheels + steering wheel + pedal + lights');
        return parts;
    } catch (error) {
        console.error('❌ Error loading car model:', error);
        return null;
    }
}
