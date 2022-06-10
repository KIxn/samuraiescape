import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
//import Stats from '../node_modules/stats.js/src/Stats.js';
import Orb from './orb.js';

//Global
let peekView = false;
let Target = null; //Target.getTarget().Position will return position of kangin
let AvailableControls = null;
let level;
let path;
let panning = false;
let pos = null;
let Cam = null;
let ctrls = null;
let Walk_dist = 15;
let Run_dist = 25;
let DistFromBox = Walk_dist;
let paused = false;
let timerTag = null;
let timerInterval;
let secondsDiff = 3 * 60; //3 minutes
let map = false;
let placeOrb = false;
let adversary = null; // adversary.getTarget().position will return position of enemy
let light;
let search = [];
let platform;
let solution = null;
let interact = false;
let solutionInterval = 0;
let backgroundMusic;
let backgroundTheme;
let adversaryMusic;
let listener;

/**
 *
 * @param { float } x1
 * @param { float } z1
 * @param { float } x2
 * @param { float } z2
 * @returns
 */

function Distance(x1, z1, x2, z2) {
    var dist = Math.sqrt(Math.pow((x1 - x2), 2) + Math.pow((z1 - z2), 2));
    console.log(dist);
    return (dist);
}

/**
 * Will show performance stats for things such as
 * Frame Rate
 * Time between frames
 * RAM Usage
 *
 * @method
 */
function creatHUD() {
    let script = document.createElement("script");
    script.onload = function() {
        let stats = new Stats();
        document.body.appendChild(stats.dom);
        requestAnimationFrame(function loop() {
            stats.update();
            requestAnimationFrame(loop);
        });
    };
    script.src = "//mrdoob.github.io/stats.js/build/stats.min.js";
    document.head.appendChild(script);
}

/** Intermediary class for animating a character
 * @class
 * Create BasicCharacterControllerProxy
 * @param { list } animations- a list of animations
 */
class BasicCharacterControllerProxy {

    constructor(animations) {
        this._animations = animations;
    }

    /**
     * Get the animation list
     * @return { list } returns list of animations
     */
    get animations() {
        return this._animations;
    }
};
/**
 * Class to control adversary character
 * @class
 * @constructor
 * @param{ THREE.Scene } scene
 */
class Adversary {
    constructor(scene) {
        this._scene = scene;
        this._animations = {};
        this._Init()
    }

    _Init() {
        this._prevDist = 0;
        this._prevZdiff = 0;
        this._raycaster = new THREE.Raycaster();
        const loader = new FBXLoader();
        loader.setPath('../resources/adversary/');
        loader.load('Ch25_nonPBR.fbx', (fbx) => {
            fbx.scale.setScalar(0.15);
            fbx.traverse(c => {
                c.castShadow = true;
            });

            this._target = fbx;
            this._target.translateZ(-150);
            this._scene.add(this._target);

            this._manager = new THREE.LoadingManager();
            this._manager.onLoad = async() => {
                console.log('done loading');
                await new Promise(r => setTimeout(r, 2000));
                document.getElementById('loadingScreen').className = 'loaderHidden';
                document.getElementById("timer").className = "timerBox";
                timerInterval = setInterval(() => {
                    //if dom is rendered
                    if (timerTag) {
                        //calc time diff
                        let minutes = Math.floor(secondsDiff / 60);
                        let seconds = secondsDiff - (minutes * 60);
                        if (minutes < 10) {
                            minutes = "0" + minutes.toString();
                        } else {
                            minutes = minutes.toString();
                        }
                        if (seconds < 10) {
                            seconds = "0" + seconds.toString();
                        } else {
                            seconds = seconds.toString();
                        }
                        timerTag.innerHTML = minutes + ":" + seconds;
                        if (!paused) {
                            secondsDiff--;
                        }
                    }
                }, 1000);
                (level === '3') ? this.setRun(): this.setCrawl();
                //positional
                let tmp = new THREE.PositionalAudio(listener);
                const audioLoader = new THREE.AudioLoader();

                audioLoader.load('../resources/sounds/monster_growl.mp3', function(buffer) {
                    adversaryMusic = tmp;
                    adversaryMusic.setBuffer(buffer);
                    adversaryMusic.setLoop(true);
                    adversaryMusic.setRefDistance(75);
                    adversaryMusic.setVolume(2);
                    adversaryMusic.play();
                });

                this._target.add(adversaryMusic);
            };

            this._mixer = new THREE.AnimationMixer(this._target);

            const _OnLoad = (animName, anim) => {
                const clip = anim.animations[0];
                const action = this._mixer.clipAction(clip);
                action.clampWhenFinished = true;
                action.loop = THREE.LoopRepeat;

                this._animations[animName] = {
                    clip: clip,
                    action: action,
                };
            };
            const loader = new FBXLoader(this._manager);
            loader.setPath('../resources/adversary/');
            loader.load('Crouch Idle.fbx', (a) => { _OnLoad('idle', a); });
            loader.load('Mutant Run.fbx', (a) => { _OnLoad('run', a); });
            loader.load('Running Crawl.fbx', (a) => { _OnLoad('crawlRun', a); });

        });
    };

    /**
     * Setting idle animations
     * @method
     */
    setIdle() {
            if (this._animations['crawlRun']) {
                const idleAction = this._animations['idle'].action;
                idleAction.play();
            }
        }
        /**
         * Setting Run animations
         * @method
         */

    setRun() {
            if (this._animations['crawlRun']) {
                const runAction = this._animations['run'].action;
                runAction.play();
            }
        }
        /**
         * Seting crawl animations
         * @method
         */

    setCrawl() {
        if (this._animations['crawlRun']) {
            const crawlAction = this._animations['crawlRun'].action;
            crawlAction.play();
        }
    }

    /**
     * update the position of the npc (Demon)
     * @method
     * @param { float } delta - number of seconds the game has been running
     */
    Update(delta) {
        if (this._mixer && this._target) {
            this._mixer.update(delta);

            if (Target) {
                let lag = 0.6;
                if (level === '2') {
                    lag = 0.8;
                } else if (level === '3') {
                    lag = 0.9;
                }
                let num = (this._target.position.dot(Target.Position));
                let den = (this._target.position.length() * Target.Position.length());
                let theta = Math.acos(num / den);
                if (den === 0) {
                    theta = 0;
                }
                this._target.lookAt(Target.Position);
                this._target.translateZ(1 * lag);

                if (this._target.position.distanceTo(Target.Position) <= 13) {
                    paused = true;
                    timerTag.className = "loaderHidden";
                    document.getElementById("gameOver").className = "endGame";
                }
            }

        }
    }

    /**
     * @method
     * @returns {Object} returns reference to the adversary
     */
    getTarget() {
        if (this._target) {
            const controlObject = this._target;
            return (controlObject);
        }
    }
}
/**
 * class defining the Mechanics of the main character
 * @class
 * Create Character
 * @constructor
 * @param {Object} params- an object containing camera and scene
 */
class Character {
    constructor(params) {
        this._Init(params);
    }

    /**
     * Inilialises the various attritubes of the character
     * @param {Object} params- an object containing camera and scene
     */
    _Init(params) {
        this._params = params;
        this._decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
        this._acceleration = new THREE.Vector3(1, 0.25, 50.0);
        this._velocity = new THREE.Vector3(0, 0, 0);
        this._position = new THREE.Vector3();
        this._animations = {};
        this.player = {};
        this._input = new BasicCharacterControllerInput();
        this._stateMachine = new CharacterFSM(
            new BasicCharacterControllerProxy(this._animations));

        this._LoadModels();
    }

    /**
     * Inilialises the various attritubes of the character
     *@return {Object} the target is returned as a control object
     */
    getTarget() {
        if (this._target) {
            const controlObject = this._target;
            console.log(controlObject);
            return (controlObject);
        }
    }

    /**
     * Loads animated character to the scene
     * @method
     */
    _LoadModels() {
        const loader = new FBXLoader();
        loader.setPath('../resources/kangin_lee/');
        loader.load('Ch24_nonPBR.fbx', (fbx) => {
            fbx.scale.setScalar(0.1);
            fbx.traverse(c => {
                c.castShadow = true;
                c.userData.name = "kangin";
            });

            this._target = fbx;
            this._target.userData.name = "kangin";
            this._params.scene.add(this._target);

            this._mixer = new THREE.AnimationMixer(this._target);

            const _OnLoad = (animName, anim) => {
                const clip = anim.animations[0];
                const action = this._mixer.clipAction(clip);
                action.clampWhenFinished = true;
                action.loop = THREE.LoopRepeat;

                this._animations[animName] = {
                    clip: clip,
                    action: action,
                };
            };
            const loader = new FBXLoader(this._manager);
            loader.setPath('../resources/kangin_lee/');
            loader.load('Crouched Walking.fbx', (a) => { _OnLoad('walk', a); });
            loader.load('Run.fbx', (a) => { _OnLoad('run', a); });
            loader.load('Idle.fbx', (a) => { _OnLoad('idle', a); });
            loader.load('Hurricane Kick.fbx', (a) => { _OnLoad('dance', a); });

        });

    }

    /**
     * returns current position of main character
     * @method
     * @returns {vector} current position of target
     */
    get Position() {
        return this._position;
    }

    /**
     * returns targets quaternion which will be used for rotations
     * @method
     * @returns {vector} returns target quaternion for rotation
     */
    get Rotation() {
        if (!this._target) {
            return new THREE.Quaternion();
        }
        return this._target.quaternion;
    }

    /**
     * Updates the various attributes of the character such as velocity,rotation etc
     * @method
     * @param {float} timeInSeconds -the number of seconds that the game has been running for
     */
    Update(timeInSeconds) {
        if (!this._target) {
            return;
        }

        this._stateMachine.Update(timeInSeconds, this._input);

        const velocity = this._velocity;
        const frameDecceleration = new THREE.Vector3(
            velocity.x * this._decceleration.x,
            velocity.y * this._decceleration.y,
            velocity.z * this._decceleration.z
        );
        frameDecceleration.multiplyScalar(timeInSeconds);
        frameDecceleration.z = Math.sign(frameDecceleration.z) * Math.min(
            Math.abs(frameDecceleration.z), Math.abs(velocity.z));

        velocity.add(frameDecceleration);

        const controlObject = this._target;
        const _Q = new THREE.Quaternion();
        const _A = new THREE.Vector3();
        const _R = controlObject.quaternion.clone();

        const acc = this._acceleration.clone();
        if (this._input._keys.shift) {
            //TODO adjust sprint speed
            acc.multiplyScalar(6.0);
        }

        if (this._stateMachine._currentState.Name == 'dance') {
            acc.multiplyScalar(0.0);
        }

        if (this._input._keys.forward) {
            velocity.z += acc.z * timeInSeconds;
        }
        if (this._input._keys.backward) {
            velocity.z -= acc.z * timeInSeconds;
        }
        if (this._input._keys.left) {
            _A.set(0, 1, 0);
            _Q.setFromAxisAngle(_A, 4.0 * Math.PI * timeInSeconds * this._acceleration.y);
            _R.multiply(_Q);
        }
        if (this._input._keys.right) {
            _A.set(0, 1, 0);
            _Q.setFromAxisAngle(_A, 4.0 * -Math.PI * timeInSeconds * this._acceleration.y);
            _R.multiply(_Q);
        }

        controlObject.quaternion.copy(_R);

        const oldPosition = new THREE.Vector3();
        oldPosition.copy(controlObject.position);

        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(controlObject.quaternion);
        forward.normalize();

        const sideways = new THREE.Vector3(1, 0, 0);
        sideways.applyQuaternion(controlObject.quaternion);
        sideways.normalize();

        sideways.multiplyScalar(velocity.x * timeInSeconds);
        forward.multiplyScalar(velocity.z * timeInSeconds);

        controlObject.position.add(forward);
        controlObject.position.add(sideways);

        oldPosition.copy(controlObject.position);

        this._position.copy(controlObject.position);

        if (this._mixer) {
            this._mixer.update(timeInSeconds);
        }
    }
};

/**
 * Class input handler for characters movement
 * @class
 * @constructor
 */

class BasicCharacterControllerInput {
    constructor() {
        this._Init();
    }

    _Init() {
        this._keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            space: false,
            shift: false,
        };
        document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
        document.addEventListener('mousedown', (e) => {
            panning = true;
            if (pos === null) {
                const idealOffset = new THREE.Vector3(-15, 30, -60);
                idealOffset.applyQuaternion(Target.Rotation);
                idealOffset.add(Target.Position);
                Cam.position.copy(idealOffset);
                const idealLookat = new THREE.Vector3(0, 20, 50);
                idealLookat.applyQuaternion(Target.Rotation);
                idealLookat.add(Target.Position);
                ctrls.target = idealLookat;
            }
        });
        document.addEventListener('mouseup', (e) => {
            panning = false;
            pos = null;
        });
    }

    _onKeyDown(event) {
        switch (event.keyCode) {
            case 87: // w
                this._keys.forward = true;
                break;
            case 65: // a
                this._keys.left = true;
                break;
            case 83: // s
                this._keys.backward = true;
                if (this._keys.shift) {
                    this._keys.shift = false;
                }
                break;
            case 68: // d
                this._keys.right = true;
                break;
            case 32: // SPACE
                this._keys.space = true;
                break;
            case 16: // SHIFT
                DistFromBox = Run_dist; // increase raycasting distance because character is leaned forward when running
                if (!this._keys.backward) {
                    this._keys.shift = true;
                }
                break;
            case 27:
                paused = !paused;
                if (paused) {
                    //listener.backgroundmusic.play(false);
                    document.getElementById('pauseMenu').className = "pauseShow";
                } else {
                    document.getElementById('pauseMenu').className = "loaderHidden";
                }
                break;
            case 77:
                map = !map;
                break;
            case 69:
                placeOrb = true;
                break;
        }
    }

    _onKeyUp(event) {
        switch (event.keyCode) {
            case 87: // w
                this._keys.forward = false;
                break;
            case 65: // a
                this._keys.left = false;
                break;
            case 83: // s
                this._keys.backward = false;
                break;
            case 68: // d
                this._keys.right = false;
                break;
            case 32: // SPACE
                this._keys.space = false;
                break;
            case 16: // SHIFT
                DistFromBox = Walk_dist; // set raycasting distance back to 8 because character is walking normally
                this._keys.shift = false;
                break;
            case 67:
                peekView = !peekView
                break;
            case 70:
                if (interact) {
                    paused = true;
                    document.getElementById("endLevel").className = "endLevel";
                }
                break;
        }
    }
};

/**
 * Interface class for state machine to keep track of the character's movements
 * @class
 * Initiates State Machine
 * @constructor
 */
class FiniteStateMachine {

    constructor() {
            this._states = {};
            this._currentState = new IdleState(this);
        }
        /**
         * Adds state to state machine
         * @method
         * @param {string} name - The name of the state
         * @param {class} type - state class extending state
         */
    _AddState(name, type) {
        console.log(type);
        this._states[name] = type;
    }

    /**
     *transition from one state to the next
     * @method
     * @param {string} name - The name of the state
     */
    SetState(name) {
        const prevState = this._currentState;

        if (prevState) {
            if (prevState.Name == name) {
                return;
            }
            prevState.Exit();
        }
        /**
         *Update the current state
         * @method
         * @param {number} timeElapsed - The number of seconds the game has been running for
         * @param { Object} input - instance of a state (idle,run etc)
         */

        Update(timeElapsed, input) {
            if (this._currentState) {
                this._currentState.Update(timeElapsed, input);
            }
        }
    };

    /**
     * Class representing our characters Finite state machine
     * @class
     * @constructor
     * @param { Object} proxy - instance of a finite state machine
     * @extends FiniteStateMachine
     */
    class CharacterFSM extends FiniteStateMachine {

        constructor(proxy) {
            super();
            this._proxy = proxy;
            this._Init();
        }

        /**
         * add states to our characters FSM
         * @method
         */
        _Init() {
            this._AddState('idle', IdleState);
            this._AddState('walk', WalkState);
            this._AddState('run', RunState);
            this._AddState('dance', AttackState);
        }
    };


    /**
     * Interface  that defines methods for each movement state
     * @class
     * @constructor
     * @param {Object} parent - instance of CharacterFSM class
     */
    class State {

        constructor(parent) {
            this._parent = parent;
        }
        Enter() {}
        Exit() {}
        Update() {}
    };

    /**
     * States defining characters movement
     * @class
     * @constructor
     * @param {Object} parent - instance of CharacterFSM class
     */

    class AttackState extends State {
        constructor(parent) {
            super(parent);

            this._FinishedCallback = () => {
                this._Finished();
            }
        }

        get Name() {
            return 'dance';
        }

        Enter(prevState) {
            const curAction = this._parent._proxy._animations['dance'].action;
            const mixer = curAction.getMixer();
            mixer.addEventListener('finished', this._FinishedCallback);

            if (prevState) {
                const prevAction = this._parent._proxy._animations[prevState.Name].action;

                curAction.reset();
                curAction.setLoop(THREE.LoopOnce, 1);
                curAction.clampWhenFinished = true;
                curAction.crossFadeFrom(prevAction, 0.2, true);
                curAction.play();
            } else {
                curAction.play();
            }
        }

        _Finished() {
            this._Cleanup();
            this._parent.SetState('idle');
        }

        _Cleanup() {
            const action = this._parent._proxy._animations['dance'].action;

            action.getMixer().removeEventListener('finished', this._CleanupCallback);
        }

        Exit() {
            this._Cleanup();
        }

        Update(_) {}
    };


    class WalkState extends State {
        constructor(parent) {
            super(parent);
        }

        get Name() {
            return 'walk';
        }

        Enter(prevState) {
            const curAction = this._parent._proxy._animations['walk'].action;
            if (prevState) {
                const prevAction = this._parent._proxy._animations[prevState.Name].action;

                curAction.enabled = true;

                if (prevState.Name == 'run') {
                    const ratio = curAction.getClip().duration / prevAction.getClip().duration;
                    curAction.time = prevAction.time * ratio;
                } else {
                    curAction.time = 0.0;
                    curAction.setEffectiveTimeScale(1.3);
                    curAction.setEffectiveWeight(1.0);
                }

                curAction.crossFadeFrom(prevAction, (prevAction.Name == 'walk') ? 0 : 0.5, true);
                curAction.play();
            } else {
                curAction.play();
            }
        }

        Exit() {}

        Update(timeElapsed, input) {

            if (input._keys.forward || input._keys.backward) {
                if (input._keys.shift) {
                    this._parent.SetState('run');
                }
                return;
            }
            this._parent.SetState('idle');
        }
    };


    class RunState extends State {
        constructor(parent) {
            super(parent);
        }

        get Name() {
            return 'run';
        }

        Enter(prevState) {
            const curAction = this._parent._proxy._animations['run'].action;
            if (prevState) {
                const prevAction = this._parent._proxy._animations[prevState.Name].action;

                curAction.enabled = true;

                if (prevState.Name == 'walk') {
                    const ratio = curAction.getClip().duration / prevAction.getClip().duration;
                    curAction.time = prevAction.time * ratio;
                } else {
                    curAction.time = 0.0;
                    curAction.setEffectiveTimeScale(0.1);
                    curAction.setEffectiveWeight(1.0);
                }

                curAction.crossFadeFrom(prevAction, 0.5, true);
                curAction.play();
            } else {
                curAction.play();
            }
        }

        Exit() {}

        Update(timeElapsed, input) {
            if (input._keys.forward || input._keys.backward) {
                if (!input._keys.shift) {
                    this._parent.SetState('walk');
                }
                return;
            }

            this._parent.SetState('idle');
        }
    };

    /**
     * creates an idle state of the character
     * @class
     * @constructor
     * @param {Object} parent - instance of CharacterFSM class
     */
    class IdleState extends State {
        constructor(parent) {
            super(parent);
        }

        get Name() {
            return 'idle';
        }

        Enter(prevState) {
            const idleAction = this._parent._proxy._animations['idle'].action;
            if (prevState) {
                const prevAction = this._parent._proxy._animations[prevState.Name].action;
                idleAction.time = 0.0;
                idleAction.enabled = true;
                idleAction.setEffectiveTimeScale(0.8);
                idleAction.setEffectiveWeight(1.0);
                idleAction.crossFadeFrom(prevAction, 0.5, true);
                idleAction.play();
            } else {
                idleAction.play();
            }
        }

        Exit() {}

        Update(_, input) {
            if (input._keys.forward || input._keys.backward) {
                this._parent.SetState('walk');

            } else if (input._keys.space) {
                this._parent.SetState('dance');
            }
        }
    };


    /**
     * Implementation of a close following camera for our main character
     * @class
     * @constructor
     * @param {THREE.Scene} params - returns the camera and the scene
     */

    class ThirdPersonCamera {
        constructor(params) {
            this._params = params;
            this._camera = params.camera;

            this._currentPosition = new THREE.Vector3();
            this._currentLookat = new THREE.Vector3();
        }

        _CalculateIdealOffset() {
            const idealOffset = new THREE.Vector3(-15, 20, -30);
            idealOffset.applyQuaternion(this._params.target.Rotation);
            idealOffset.add(this._params.target.Position);
            return idealOffset;
        }

        _CalculateIdealLookat() {
            const idealLookat = new THREE.Vector3(0, 10, 50);
            idealLookat.applyQuaternion(this._params.target.Rotation);
            idealLookat.add(this._params.target.Position);
            return idealLookat;
        }

        Update(timeElapsed) {
            const idealOffset = this._CalculateIdealOffset();
            const idealLookat = this._CalculateIdealLookat();
            const t = 1.0 - Math.pow(0.001, timeElapsed);
            this._currentPosition.lerp(idealOffset, t);
            this._currentLookat.lerp(idealLookat, t);
            this._camera.position.copy(this._currentPosition);
            this._camera.lookAt(this._currentLookat);
        }
    }


    /**
     * Far camera with orbit controls
     * @class
     * @constructor
     * @param {THREE.Scene} params - returns the camera and the scene
     * @param {Object}controls - allows us to perform camera movement
     */

    class PerspectiveCamera {
        constructor(params, controls) {
            this._params = params;
            this._camera = params.camera;
            this._controls = controls;

            this._currentPosition = new THREE.Vector3();
            this._currentLookat = new THREE.Vector3();
        }

        _CalculateIdealOffset() {
            const idealOffset = new THREE.Vector3(-15, 50, -60);
            idealOffset.applyQuaternion(this._params.target.Rotation);
            idealOffset.add(this._params.target.Position);
            return idealOffset;
        }

        _CalculateIdealLookat() {
            const idealLookat = new THREE.Vector3(0, 10, 50);
            idealLookat.applyQuaternion(this._params.target.Rotation);
            idealLookat.add(this._params.target.Position);
            return idealLookat;
        }

        Update(timeElapsed) {
            if (!panning) {
                const idealOffset = this._CalculateIdealOffset();
                const idealLookat = this._CalculateIdealLookat();

                const t = 1.0 - Math.pow(0.001, timeElapsed);

                this._currentPosition.lerp(idealOffset, t);
                this._currentLookat.lerp(idealLookat, t);

                this._camera.position.copy(this._currentPosition);
                this._camera.lookAt(this._currentLookat);
            } else {
                this._controls.update();
            }
        }


    }

    /**
     * Main class that loads set ups and updates each each level as timeElapsed increases
     * @class
     * @constructor
     */
    class Main {
        /**
         * calls our initialize function to set uo our scene
         */
        constructor() {
            this._Initialize();
        }

        /**
         * Sets up our scene
         */
        _Initialize() {
            //stats
            creatHUD();

            //get search directions
            for (let i = 0; i < 360; i += 3) {
                search[i] = new THREE.Vector3(Math.cos(i), 0, Math.sin(i));
            }

            //necessary objects from dom tree
            timerTag = document.getElementById("timer");

            this._threejs = new THREE.WebGLRenderer({
                antialias: true,
            });
            this._threejs.outputEncoding = THREE.sRGBEncoding;
            this._threejs.shadowMap.enabled = true;
            this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
            this._threejs.setPixelRatio(window.devicePixelRatio);
            this._threejs.setSize(window.innerWidth, window.innerHeight);
            this._insetWidth = window.innerHeight / 4;
            this._insetHeight = window.innerHeight / 4;

            document.body.appendChild(this._threejs.domElement);

            window.addEventListener('resize', () => {
                this._OnWindowResize();
            }, false);
            const fov = 60;
            this._aspect = 1920 / 1080;
            const near = 2.0;
            const far = 1000.0;

            //create cameras
            this._camera = new THREE.PerspectiveCamera(fov, this._aspect, near, far);

            listener = new THREE.AudioListener();


            this._camera.add(listener);

            const audioLoader = new THREE.AudioLoader();

            backgroundTheme = new THREE.Audio(listener);

            audioLoader.load('../resources/sounds/horror_theme.mp3', function(buffer) {
                backgroundTheme.setBuffer(buffer);
                backgroundTheme.setLoop(true);
                backgroundTheme.setVolume(1.2);
                backgroundTheme.play();
            });

            //added mini map here
            //adjust minimap scale
            let viewSize = 140;
            this._cameraOrtho = new THREE.OrthographicCamera((this._aspect * viewSize) / -2, (this._aspect * viewSize) / 2, (this._aspect * viewSize) / 2, (this._aspect * viewSize) / -2, -200, 1000);
            this._cameraOrtho.zoom = 100;
            this._cameraOrtho.position.set(0, 30, 0);
            this._cameraOrtho.up.set(0, 1, 0);
            this._cameraOrtho.lookAt(new THREE.Vector3());
            this._camera.add(this._cameraOrtho);

            const controls = new OrbitControls(this._camera, this._threejs.domElement);
            controls.keys = {};
            ctrls = controls;

            controls.update();

            this._scene = new THREE.Scene();
            this._scene.add(this._camera);

            //antialiasing done here
            this.renderer = new THREE.WebGLRenderer({ antialias: true });

            //added ambient light here
            light = new THREE.AmbientLight(0xFFFFFF, 0.5);
            this._scene.add(light);

            //added directional light here
            light = new THREE.DirectionalLight(0xFFFFFF, 1.5);
            light.position.set(-100, 200, 300);
            light.target.position.set(0, 0, 0);
            light.castShadow = true;
            light.shadow.bias = -0.001;
            light.shadow.mapSize.width = 512;
            light.shadow.mapSize.height = 512;
            light.shadow.camera.near = 0.1;
            light.shadow.camera.far = 500.0;
            light.shadow.camera.near = 0.5;
            light.shadow.camera.far = 500.0;
            light.shadow.camera.left = 50;
            light.shadow.camera.right = -50;
            light.shadow.camera.top = 50;
            light.shadow.camera.bottom = -50;

            this._scene.add(light);


            //Setting up dynamic skybox
            const loader = new THREE.CubeTextureLoader();
            const texture = loader.load([
                '../resources/skybox1/skybox_left.png',
                '../resources/skybox1/skybox_right.png',
                '../resources/skybox1/skybox_up.png',
                '../resources/skybox1/skybox_down.png',
                '../resources/skybox1/skybox_front.png',
                '../resources/skybox1/skybox_back.png',

            ]);
            const geometry = new THREE.BoxBufferGeometry(1000, 1000, 1000);
            const material = this._generateMaterialsArray(this._getTexturesPaths('skybox'));
            this.skybox = new THREE.Mesh(geometry, material);
            this._scene.add(this.skybox);

            //setting up the plane
            const textureLoader = new THREE.TextureLoader();
            const _PlaneBaseCol = textureLoader.load("../resources/PlaneFloor/Stone_Wall_014_basecolor.jpg");
            const _PlaneNorm = textureLoader.load("../resources/PlaneFloor/Stone_Wall_014_normal.jpg");
            const _PlaneRoughness = textureLoader.load("../resources/PlaneFloor/Stone_Wall_014_roughness.jpg");
            const _PlaneAmbientOcc = textureLoader.load("../resources/PlaneFloor/Stone_Wall_014_ambientOcclusion.jpg");
            const _PlaneHeight = textureLoader.load("../resources/PlaneFloor/Stone_Wall_014_height.png");

            //creating the plane
            const plane = new THREE.Mesh(
                new THREE.PlaneGeometry(5000, 5000, 10, 10),
                new THREE.MeshStandardMaterial({
                    map: _PlaneBaseCol,
                    normalMap: _PlaneNorm,
                    displacementMap: _PlaneHeight,
                    displacementScale: 0.05,
                    roughnessMap: _PlaneRoughness,
                    roughness: 0.5,
                    aoMap: _PlaneAmbientOcc,
                }));
            plane.castShadow = false;
            plane.receiveShadow = true;
            plane.rotation.x = -Math.PI / 2;
            this._scene.add(plane);

            //testing out environment compatability for 3 dimensional playability

            path = window.location.pathname;
            level = path.split("/").pop().charAt(5);
            this._loadEnvironment();
            this._loadSolution();
            this._mixers = [];
            this._preveiousRAF = null;
            this._clock = new THREE.Clock();


            //Draw platform (goal of maze) with difference coloured gems

            this._platform = this._DrawPlatForm();
            if (level === '1') {
                this._platform.position.set(-25.826967788871027, 0, 626.0965432774168);
            } else if (level == '2') {
                this._platform.position.set(2.8251132620141375, 0, 722.0679682006315);

            } else {
                this._platform.position.set(-38.234280902886155, 0, 929.8273839831012);
            }
            this._scene.add(this._platform);
            this._LoadAnimatedModel(controls);
            this._RAF();
        }


        /**
         * gets the paths of the images to be loaded onto our skybox geometry
         * @method
         * @param {string} ident common substring found in all of our image paths
         * @returns {List} list containing all the file paths of the skybox images
         */
        _getTexturesPaths(ident = 'skybox', refraction = true) {
                const basePath = `/resources/skybox1/${ident}`;
                const ext = '.png';
                const sides = !refraction ? ['_left', '_right', '_up', '_down', '_front', '_back'] : ['_left', '_right', '_up', '_down', '_front', '_back'];

                return sides.map(side => {
                    return basePath + side + ext;
                });
            }
            /**
             * gets the paths of the images to be loaded onto our skybox geometry
             * @method
             * @param {List} urls list containing filepaths of images
             * @returns {THREE.MeshBasicMaterial} a three js material define using the images found in urls
             */
        _generateMaterialsArray(urls = []) {
            return urls.map((url) => {
                const texture = new THREE.TextureLoader().load(url);
                texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

                const props = {
                    map: texture,
                    side: THREE.BackSide,
                    fog: false,
                    depthWrite: false,
                };

                return new THREE.MeshBasicMaterial(props);
            });
        }

        /**
         * Calculate age
         * @method
         * @param {raycaster} raycaster ray calcuated in a particular direction
         * @returns {boolean} whether or not there is an object in the way of the main character
         */
        _movePlayer() {
            const pos = Target.Position;
            pos.y += 60;
            let dir = new THREE.Vector3();
            this._camera.getWorldDirection(dir);

            if (this.environmentProxy != undefined) {
                //cast in front
                let raycaster_front = new THREE.Raycaster(pos, dir);
                let Front_Blocked = this._CheckBlocked(raycaster_front);
                if (Front_Blocked) {
                    AvailableControls.forward = false;
                }
            }

            if (this.environmentProxy != undefined) {
                //cast behind
                dir.set(0, 0, -1);
                dir.applyMatrix4(this._camera.matrix);
                dir.normalize();
                let ryacaster_back = new THREE.Raycaster(pos, dir);
                let Back_Blocked = this._CheckBlocked(ryacaster_back);
                if (Back_Blocked) {
                    AvailableControls.backward = false;
                }
            }
        }

        /**
         * Check if there is an object blocking the character
         * @method
         * @param {raycaster} raycaster ray calcuated in a particular direction
         * @returns {boolean} whether or not there is an object in the way of the main character
         */

        _CheckBlocked(raycaster) {
            let blocked = false;
            for (let box of this.environmentProxy.children) { //environmentProxy stores all the boxes that we created in createDummyEnv
                const intersect = raycaster.intersectObject(box);
                if (intersect.length > 0) { //intersect is an array that stores all the boxes that is in the path of our raycaster
                    if (intersect[0].distance < DistFromBox) { //it is ordered by distance , so the closest is at pos[0] ,hence intersect[0].
                        blocked = true; //Player should not be able to move in that direction
                        break;
                    }
                }
            }
            return blocked;
        }

        /**
         * Creates a new character and adversary instance and sets up cameras
         * @method
         * @param {OrbitControls} ctrls allows us to move or drag the cameras around
         */
        _LoadAnimatedModel(ctrls) {
            const params = {
                camera: this._camera,
                scene: this._scene,
            }
            adversary = new Adversary(this._scene);
            this._controls = new Character(params);

            AvailableControls = this._controls._input._keys;

            Target = this._controls;
            Cam = this._camera;
            //create cameras
            this._thirdPersonCamera = new ThirdPersonCamera({
                camera: this._camera,
                target: this._controls,
            });

            this._perspectiveCamera = new PerspectiveCamera({
                camera: this._camera,
                target: this._controls,
            }, ctrls);
        }

        _LoadAnimatedModelAndPlay(path, modelFile, animFile, offset) {
            const loader = new FBXLoader();
            loader.setPath(path);
            loader.load(modelFile, (fbx) => {
                fbx.scale.setScalar(0.1);
                fbx.traverse(c => {
                    c.castShadow = true;
                });
                fbx.position.copy(offset);

                const anim = new FBXLoader();
                anim.setPath(path);
                anim.load(animFile, (anim) => {
                    const m = new THREE.AnimationMixer(fbx);
                    this._mixers.push(m);
                    const idle = m.clipAction(anim.animations[0]);
                    idle.play();
                });
                this._scene.add(fbx);
            });
        }

        /**
         * hierarchical Modelling for creating the end goal (pillar with gemstone attached)
         * @method
         **@returns {Group} hierarchical composition of all sub-objects created
         */
        _DrawPlatForm() {
            let col;
            if (level == '1') {
                col = 0x0000ff;
            } else if (level == '2') {
                col = 0x39ff14;
            } else {
                col = 0xff0000;
            }
            const GemGeo = new THREE.TetrahedronGeometry(5, 1);
            const GemMaterial = new THREE.MeshBasicMaterial({
                color: col,
                wireframe: true,
                wireframeLinewidth: 1
            });

            const GemStone = new THREE.Mesh(GemGeo, GemMaterial);
            //  GemStone.position.set(60, 40, 30);
            GemStone.position.y = 40;
            //  this._scene.add(GemStone);
            //create a stair for each side of the main platform
            const Plat_Loader = new THREE.TextureLoader();
            //load texture
            const Plat_text = Plat_Loader.load("../resources/black_marble.jpg");
            const stair1 = new THREE.BoxGeometry(10, 8, 10);
            //set the material
            const material = new THREE.MeshBasicMaterial({ map: Plat_text });
            //create a mesh
            const cube = new THREE.Mesh(stair1, material);
            //rotate stair
            //set position of stair case on the right
            cube.position.y = 30;


            //create a stair for each side of the main platform
            const stair2 = new THREE.BoxGeometry(10, 8, 10);
            //set the material
            const material2 = new THREE.MeshBasicMaterial({ map: Plat_text });
            //create a mesh
            const cube2 = new THREE.Mesh(stair2, material2);
            //rotate stair
            //set position of stair case on the left
            // cube2.position.set(60, 4, 30);
            cube2.position.y = 4;


            //create middle platform
            const middle = new THREE.BoxGeometry(7, 25, 7);
            //set the material
            const material3 = new THREE.MeshBasicMaterial({ map: Plat_text });
            //create mesh
            const cube3 = new THREE.Mesh(middle, material3);
            //set position of platform
            // cube3.position.set(60, 20, 30);
            cube3.position.y = 20;


            //create platform group to add all components
            let platform = new THREE.Group();
            platform.add(cube);
            platform.add(cube2);
            platform.add(cube3);
            platform.add(GemStone);

            //return platform to render to scene
            return platform;


        }

        /**
         * Loads the maze for the various levels
         * @method
         */

        _loadEnvironment() {
            const game = this;
            const loader = new FBXLoader();
            if (level === '1') {
                loader.load('../resources/mazes/lvl1_maze.fbx', function(object) {
                    game._scene.add(object);
                    object.receiveShadow = true;
                    object.name = "Environment";

                    game.environmentProxy = object;
                }, null, this.onError);
            } else if (level === '2') {
                loader.load('../resources/mazes/maze2.fbx', function(object) {
                    game._scene.add(object);
                    object.receiveShadow = true;
                    console.log(object);
                    object.name = "Environment";
                    game.environmentProxy = object;
                    object.traverse((t) => {
                        t.name = "Environment";
                    })
                }, null, this.onError);
            } else {
                loader.load('../resources/mazes/lvl3_maze.fbx', function(object) {
                    game._scene.add(object);
                    object.receiveShadow = true;
                    object.name = "Environment";
                    game.environmentProxy = object;
                }, null, this.onError);
            }
        }

        /**
         * Loads the solution of each maze to help the player out
         * @method
         */
        _loadSolution() {
                const game = this;
                const loader = new FBXLoader();
                if (level === '1') {
                    //no sulution
                } else if (level === '2') {
                    loader.load('../resources/mazes/lvl2_solution.fbx', function(object) {
                        solution = object;
                        object.translateY(-12);
                        game._scene.add(object);
                        object.receiveShadow = true;
                        object.name = "Environment";
                        game.environmentProxy = object;
                        //flash solution
                        setInterval(() => {
                            solution.visible = true;
                        }, 5000);
                        setInterval(() => {
                            solution.visible = false;
                        }, 3000);
                    }, null, this.onError);
                } else {
                    loader.load('../resources/mazes/lvl3_solution.fbx', function(object) {
                        solution = object;
                        object.translateY(-12);
                        game._scene.add(object);
                        object.receiveShadow = true;
                        object.name = "Environment";
                        game.environmentProxy = object;
                        //flash solution
                        setInterval(() => {
                            solution.visible = true;
                        }, 5000);
                        setInterval(() => {
                            solution.visible = false;
                        }, 3000);
                    }, null, this.onError);
                }
                /**
                 * Hides the maze solution from the player
                 * @method
                 */
                _hideSolution() {
                    if (solution) {
                        solution.visible = false;
                    }
                }

                _OnWindowResize() {
                    this._camera.aspect = window.innerWidth / window.innerHeight;
                    this._camera.updateProjectionMatrix();
                    this._threejs.setSize(window.innerWidth, window.innerHeight);

                    this._insetWidth = window.innerHeight / 4;
                    this._insetHeight = window.innerHeight / 4;

                    this._cameraOrtho.aspect = this._insetWidth / this._insetHeight;
                    this._cameraOrtho.updateProjectionMatrix();
                }

                _RAF() {
                    requestAnimationFrame((t) => {
                        if (this._previousRAF === null) {
                            this._previousRAF = t;
                        }

                        let delta = this._clock.getDelta();

                        //place orb if need be
                        if (placeOrb) {
                            new Orb(Target.Position.x, Target.Position.z, this._scene);
                            placeOrb = false;
                        }

                        //timer
                        if (!(secondsDiff > 0)) {
                            clearInterval(timerInterval);
                            paused = true;
                            timerTag.className = "loaderHidden";
                            document.getElementById("gameOver").className = "endGame";
                        }


                        //dynamic skybox
                        const initialRotY = this.skybox.rotation.y;
                        const initialRotX = this.skybox.rotation.x;
                        this.skybox.rotation.y = initialRotY + (delta * -0.06);
                        this.skybox.rotation.x = initialRotX;
                        this.skybox.position.x = Target.Position.x;
                        this.skybox.position.z = Target.Position.z;

                        //minimap
                        this._threejs.setClearColor(0x000000);
                        this._threejs.setViewport(0, 0, window.innerWidth, window.innerHeight);
                        this._threejs.render(this._scene, this._camera);

                        this._threejs.setClearColor(0x333333);
                        this._threejs.clearDepth();
                        this._threejs.setScissorTest(true);

                        //map view controller
                        if (!map) {
                            let viewSize = 140;
                            this._cameraOrtho = new THREE.OrthographicCamera((this._aspect * viewSize) / -2, (this._aspect * viewSize) / 2, (this._aspect * viewSize) / 2, (this._aspect * viewSize) / -2, -200, 1000);
                            this._cameraOrtho.zoom = 100;
                            this._cameraOrtho.position.set(0, 30, 0);
                            this._cameraOrtho.up.set(0, 1, 0);
                            this._cameraOrtho.lookAt(new THREE.Vector3());
                            this._camera.add(this._cameraOrtho);

                            this._threejs.setScissor(16, window.innerHeight - this._insetHeight - 16, this._insetWidth, this._insetHeight);
                            this._threejs.setViewport(16, window.innerHeight - this._insetHeight - 16, this._insetWidth, this._insetHeight);
                        } else {
                            let viewSize = 500;
                            this._cameraOrtho = new THREE.OrthographicCamera((this._aspect * viewSize) / -2, (this._aspect * viewSize) / 2, (viewSize) / 2, (viewSize) / -2, -200, 1000);
                            this._cameraOrtho.zoom = 100;
                            this._cameraOrtho.position.set(0, 30, 0);
                            this._cameraOrtho.up.set(0, 1, 0);
                            this._cameraOrtho.lookAt(new THREE.Vector3());
                            this._camera.add(this._cameraOrtho);

                            this._threejs.setScissor(0, 0, window.innerWidth, window.innerHeight);
                            this._threejs.setViewport(0, 0, window.innerWidth, window.innerHeight);
                        }
                        this._threejs.render(this._scene, this._cameraOrtho);
                        this._threejs.setScissorTest(false);

                        this._Step(delta);
                        this._previousRAF = t;
                        this._RAF();
                    });
                }

                /**
                 * Calculate age
                 * @method
                 * @param {float} currTimer current time left when user finishes level
                 * @param {float} lvlMins number of minutes taken to complete level
                 * @returns {string} the time taken for the player to complete the maze
                 */

                _CalculateTimeTake(currTimer, lvlMins) {
                    let tot = lvlMins * 60;
                    let strTime = currTimer.split(":");
                    let intTime = [parseInt(strTime[0]), parseInt(strTime[1])];

                    let secs = intTime[0] * 60; //mins *60
                    secs = secs + intTime[1]; //mins in seconds +seconds
                    let diff = tot - secs;

                    if (diff < 60) {
                        return "00:" + diff;

                    } else if (diff > 60) {
                        let s = diff % 60;
                        let m = (diff - s) / 60;

                        if (s < 10) {
                            s = "0" + s.toString();
                        }
                        return "0" + m + ":" + s;
                    }
                }


                /**
                 * Checks whether our main character is in the vicinity of the gemstone
                 * @method
                 * @returns {boolean} whether or not the character has won
                 */

                _CheckWin() {
                    let cx = this._platform.position.x;
                    let cy = 0;
                    let cz = this._platform.position.z;
                    let tx = Target.Position.x;
                    let ty = 0;
                    let tz = Target.Position.z;

                    let dist = Math.sqrt(Math.pow(cx - tx, 2) + Math.pow(cy - ty, 2) + Math.pow(cz - tz, 2));
                    if ((dist) < 15) { //targets distane from the box
                        AvailableControls.forward = false;
                        return true;
                    } else {
                        //AvailableControls.forward= true;
                        return false;
                    }
                    /**
                     * Renders the current state of the game
                     * @method
                     * @param {number} timeElapsed the number of seconds that the game has been running for
                     */
                    _Step(timeElapsed) {
                        if (!paused) {
                            if (backgroundTheme && adversaryMusic) {
                                if (!backgroundTheme.isPlaying) {
                                    backgroundTheme.play();
                                }
                                if (!adversaryMusic.isPlaying) {
                                    adversaryMusic.play();
                                }
                            }
                            this._platform.children[3].rotation.y += 0.05;
                            let currTimer = timerTag.innerHTML;
                            //need to stop the clock
                            interact = this._CheckWin();
                            if (interact) {
                                document.getElementById('prompt').className = 'interactPrompt';
                            } else {
                                document.getElementById('prompt').className = 'loaderHidden';
                            }

                            const timeElapsedS = timeElapsed;

                            this._movePlayer(timeElapsedS);
                            if (this._mixers) {
                                //update mixers
                                this._mixers.map(m => m.update(timeElapsedS));
                            }

                            if (this._controls) {
                                this._controls.Update(timeElapsedS);
                            }

                            if (adversary) {
                                adversary.Update(timeElapsedS);
                            }

                            if (peekView) {
                                this._perspectiveCamera.Update(timeElapsedS);
                            } else {
                                this._thirdPersonCamera.Update(timeElapsedS);
                            }
                        } else {
                            backgroundTheme.pause();
                            adversaryMusic.pause();
                        }
                    }
                }


                let _APP = null;

                window.addEventListener('DOMContentLoaded', () => {
                    _APP = new Main();
                });