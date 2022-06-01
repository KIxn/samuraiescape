import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';



//Global
let peekView = false;
let Target = null;
let AvailableControls = null;
let panning = false;
let pos = null;
let Cam = null;
let ctrls = null;
let DistFromBox = 8;
let paused = false;

//Intermediary for animating a character
class BasicCharacterControllerProxy {
    constructor(animations) {
        this._animations = animations;
    }

    get animations() {
        return this._animations;
    }
};

//Mechanics behind using a character
class Character {
    constructor(params) {
        this._Init(params);
    }

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

    getTarget() {
        if (this._target) {
            const controlObject = this._target;
            return (controlObject);
        }
    }

    _LoadModels() {
        const loader = new FBXLoader();
        loader.setPath('../resources/kangin_lee/');
        loader.load('Ch24_nonPBR.fbx', (fbx) => {
            fbx.scale.setScalar(0.1);
            fbx.traverse(c => {
                c.castShadow = true;
            });



            this._target = fbx;
            this._params.scene.add(this._target);

            this._manager = new THREE.LoadingManager();
            this._manager.onLoad = () => {
                console.log('done loading');
                this._stateMachine.SetState('idle');
                document.getElementById('loadingScreen').className = 'loaderHidden';
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
            loader.setPath('../resources/kangin_lee/');
            loader.load('Crouched Walking.fbx', (a) => { _OnLoad('walk', a); });
            loader.load('Run.fbx', (a) => { _OnLoad('run', a); });
            loader.load('Idle.fbx', (a) => { _OnLoad('idle', a); });
            loader.load('Mma Kick.fbx', (a) => { _OnLoad('dance', a); });

        });

    }

    get Position() {
        return this._position;
    }

    get Rotation() {
        if (!this._target) {
            return new THREE.Quaternion();
        }
        return this._target.quaternion;
    }

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

//The input handler for characters movement
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
                this._keys.backward = false; //disabled for now
                break;
            case 68: // d
                this._keys.right = true;
                break;
            case 32: // SPACE
                this._keys.space = true;
                break;
            case 16: // SHIFT
                DistFromBox = 18;// increase raycasting distance because character is leaned forward when running
                this._keys.shift = true;
                break;
            case 27:
                paused = !paused;
                if (paused) {
                    document.getElementById('pauseMenu').className = "pauseShow";
                } else {
                    document.getElementById('pauseMenu').className = "loaderHidden";
                }
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
                DistFromBox = 8; // set raycasting distance back to 8 because character is walking normally
                this._keys.shift = false;
                break;
            case 67:
                peekView = !peekView
                break;
        }
    }
};

//Interface class for state machine to keep track of the character's movements 
class FiniteStateMachine {
    constructor() {
        this._states = {};
        this._currentState = new IdleState(this);
    }

    _AddState(name, type) {
        this._states[name] = type;
    }

    SetState(name) {
        const prevState = this._currentState;

        if (prevState) {
            if (prevState.Name == name) {
                return;
            }
            prevState.Exit();
        }

        const state = new this._states[name](this);

        this._currentState = state;
        state.Enter(prevState);
    }

    Update(timeElapsed, input) {
        if (this._currentState) {
            this._currentState.Update(timeElapsed, input);
        }
    }
};

//Implementation of the finite state machine class for character movement
class CharacterFSM extends FiniteStateMachine {
    constructor(proxy) {
        super();
        this._proxy = proxy;
        this._Init();
    }

    _Init() {
        this._AddState('idle', IdleState);
        this._AddState('walk', WalkState);
        this._AddState('run', RunState);
        this._AddState('dance', AttackState);
    }
};

//Interface that defines methods for each movement state
class State {
    constructor(parent) {
        this._parent = parent;
    }

    Enter() { }
    Exit() { }
    Update() { }
};

//States defining characters movement

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

    Update(_) {
    }
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

    Exit() {
    }

    Update(timeElapsed, input) {

        if (input._keys.forward || input._keys.backward) {
            if (input._keys.shift) {
                this._parent.SetState('run');
            }
            return;
        }
        //TODO implement backward walk
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

    Exit() {
    }

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

    Exit() {
    }

    Update(_, input) {
        if (input._keys.forward || input._keys.backward) {
            this._parent.SetState('walk');

        } else if (input._keys.space) {
            this._parent.SetState('dance');
        }
    }
};

//Implementation of a close following camera for our main character
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

        // const t = 0.05;
        // const t = 4.0 * timeElapsed;
        const t = 1.0 - Math.pow(0.001, timeElapsed);

        this._currentPosition.lerp(idealOffset, t);
        this._currentLookat.lerp(idealLookat, t);

        this._camera.position.copy(this._currentPosition);
        this._camera.lookAt(this._currentLookat);
    }
}

//Far camera with orbit controls
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

            // const t = 0.05;
            // const t = 4.0 * timeElapsed;
            const t = 1.0 - Math.pow(0.001, timeElapsed);

            this._currentPosition.lerp(idealOffset, t);
            this._currentLookat.lerp(idealLookat, t);

            this._camera.position.copy(this._currentPosition);
            this._camera.lookAt(this._currentLookat);
        }
        else {
            this._controls.update();
        }
    }


}


class Main {
    constructor() {
        this._Initialize();
    }

    _Initialize() {
        this._threejs = new THREE.WebGLRenderer({
            antialias: true,
        });
        this._threejs.outputEncoding = THREE.sRGBEncoding;
        this._threejs.shadowMap.enabled = true;
        this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
        this._threejs.setPixelRatio(window.devicePixelRatio);
        this._threejs.setSize(window.innerWidth, window.innerHeight);

        document.body.appendChild(this._threejs.domElement);

        window.addEventListener('resize', () => {
            this._OnWindowResize();
        }, false);
        const fov = 60;
        const aspect = 1920 / 1080;
        const near = 1.0;
        const far = 1000.0;

        //create cameras
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

        const controls = new OrbitControls(this._camera, this._threejs.domElement);
        controls.keys = {};
        ctrls = controls;

        controls.update();

        this._scene = new THREE.Scene();


        let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
        light.position.set(-100, 100, 100);
        light.target.position.set(0, 0, 0);
        light.castShadow = true;
        light.shadow.bias = -0.001;
        light.shadow.mapSize.width = 4096;
        light.shadow.mapSize.height = 4096;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 500.0;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 500.0;
        light.shadow.camera.left = 50;
        light.shadow.camera.right = -50;
        light.shadow.camera.top = 50;
        light.shadow.camera.bottom = -50;
        this._scene.add(light);

        light = new THREE.AmbientLight(0xFFFFFF, 0.25);
        this._scene.add(light);


        const loader = new THREE.CubeTextureLoader();
        const texture = loader.load([
            '../resources/skybox1/skybox_left.png',
            '../resources/skybox1/skybox_right.png',
            '../resources/skybox1/skybox_up.png',
            '../resources/skybox1/skybox_down.png',
            '../resources/skybox1/skybox_front.png',
            '../resources/skybox1/skybox_back.png',

        ]);
        this._scene.background = texture;
        texture.encoding = THREE.sRGBEncoding;
        this._scene.background = texture;


        //plane
        const textureLoader = new THREE.TextureLoader();
        const _PlaneBaseCol = textureLoader.load("../resources/PlaneFloor/Rocks_Hexagons_001_basecolor.jpg");
        const _PlaneNorm = textureLoader.load("../resources/PlaneFloor/Rocks_Hexagons_001_normal.jpg");
        const _PlaneHeight = textureLoader.load("../resources/PlaneFloor/Rocks_Hexagons_001_height.png");
        const _PlaneRoughness = textureLoader.load("../resources/PlaneFloor/Rocks_Hexagons_001_roughness.jpg");
        const _PlaneAmbientOcc = textureLoader.load("../resources/PlaneFloor/Rocks_Hexagons_001_ambientOcclusion.jpg");

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(2000, 2000, 10, 10),
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


        this._loadEnvironment();
        this._mixers = [];
        this._previousRAF = null;
        this._clock = new THREE.Clock();

        this._LoadAnimatedModel(controls);
        this._RAF();
    }

    _movePlayer() {
        if (this.environmentProxy) {
            const pos = Target.Position;
            pos.y += 60;
            let dir = new THREE.Vector3();
            this._camera.getWorldDirection(dir);

            let raycaster = new THREE.Raycaster(pos, dir);

            let blocked = false;


            for (let box of this.environmentProxy.children) { //environmentProxy stores all the boxes that we created in createDummyEnv

                const intersect = raycaster.intersectObject(box);
                //console.log(box);
                if (intersect.length > 0) {  //intersect is an array that stores all the boxes that is in the path of our raycaster
                    if (intersect[0].distance < DistFromBox) { //it is ordered by distance , so the closest is at pos[0] ,hence intersect[0].
                        console.log(DistFromBox);
                        blocked = true;  //Player should not be able to move in that direction
                        console.log("cannot proceed forward.");
                        AvailableControls.forward = false;
                        break;
                    }
                }
            }
            if (!blocked && AvailableControls.forward == false) {
                AvailableControls.forward = false;
            }
        }
    }

    _LoadAnimatedModel(ctrls) {
        const params = {
            camera: this._camera,
            scene: this._scene,
        }
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

    _loadEnvironment() {
        const game = this;
        const loader = new FBXLoader();

        loader.load('../resources/maze1.fbx', function (object) {
            game._scene.add(object);
            object.receiveShadow = true;
            object.name = "Environment";
            game.environmentProxy = object;
        }, null, this.onError);
    }

    _OnWindowResize() {
        this._camera.aspect = window.innerWidth / window.innerHeight;
        this._camera.updateProjectionMatrix();
        this._threejs.setSize(window.innerWidth, window.innerHeight);
    }

    _RAF() {
        requestAnimationFrame((t) => {
            if (this._previousRAF === null) {
                this._previousRAF = t;
            }

            let delta = this._clock.getDelta();

            this._threejs.render(this._scene, this._camera);
            this._Step(delta);
            this._previousRAF = t;
            this._RAF();
        });
    }

    _Step(timeElapsed) {
        if (!paused) {
            const timeElapsedS = timeElapsed;

            this._movePlayer(timeElapsedS);
            if (this._mixers) {
                //update mixers
                this._mixers.map(m => m.update(timeElapsedS));
            }

            if (this._controls) {
                this._controls.Update(timeElapsedS);
            }

            if (peekView) {
                this._perspectiveCamera.Update(timeElapsedS);
            }
            else {
                this._thirdPersonCamera.Update(timeElapsedS);
            }
        }
    }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
    _APP = new Main();
});