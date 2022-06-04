import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

class Orb {
    constructor(x, z, scene) {
        const geometry = new THREE.SphereGeometry(1, 32, 16);
        const material = new THREE.MeshLambertMaterial({
            color: 0x049cf4,
            emissive: 0x005e94,
            emissiveIntensity: 1
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.translateX(x);
        sphere.translateY(10);
        sphere.translateZ(z);
        scene.add(sphere);
    }
}

export default Orb;