import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- 配置参数 ---
const BOX_SIZE = { w: 2, h: 1, d: 2 };
const SWING_SPEED = 1.8;
const SWING_AMPLITUDE_X = 6;
const SWING_AMPLITUDE_Z = 4;
const CRANE_HEIGHT_ABOVE_STACK = 12;
const ARM_MOVE_SPEED = 8;       // 机械臂移动速度
const ARM_RANGE = 8;            // 机械臂最大偏移范围

class Game {
    constructor() {
        this.clock = new THREE.Clock();
        this.elapsedTime = 0;

        this.stackedBoxes = [];
        this.ghostMeshes = [];
        this.ghostRecords = [];
        this.stackHeight = 1;
        this.isSwinging = false;
        this.dropCount = 0;

        // 机械臂位置 (WASD 控制)
        this.armOffset = new THREE.Vector2(0, 0); // x, z 偏移
        this.keys = { w: false, a: false, s: false, d: false };

        this.initPhysics();
        this.initGraphics();
        this.addBase();
        this.initCrane();
        this.initInput();

        this.animate();
    }

    // ========== 输入系统 ==========
    initInput() {
        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (key in this.keys) this.keys[key] = true;
            if (key === ' ' || key === 'enter') {
                e.preventDefault();
                this.onRelease();
            }
        });
        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (key in this.keys) this.keys[key] = false;
        });
        document.addEventListener('click', () => this.onRelease());
        document.addEventListener('touchstart', () => this.onRelease());
        window.addEventListener('resize', () => this.onResize());
    }

    updateArmPosition(delta) {
        const speed = ARM_MOVE_SPEED * delta;
        if (this.keys.a) this.armOffset.x -= speed;
        if (this.keys.d) this.armOffset.x += speed;
        if (this.keys.w) this.armOffset.y -= speed; // W = 向前 (Z-)
        if (this.keys.s) this.armOffset.y += speed;  // S = 向后 (Z+)

        // 限制范围
        this.armOffset.x = THREE.MathUtils.clamp(this.armOffset.x, -ARM_RANGE, ARM_RANGE);
        this.armOffset.y = THREE.MathUtils.clamp(this.armOffset.y, -ARM_RANGE, ARM_RANGE);
    }

    // ========== 物理 ==========
    initPhysics() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, -15, 0)
        });
        this.world.allowSleep = true;

        this.groundMat = new CANNON.Material('ground');
        this.boxMat = new CANNON.Material('box');

        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.groundMat, this.boxMat,
            { friction: 0.6, restitution: 0.1 }
        ));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.boxMat, this.boxMat,
            { friction: 0.6, restitution: 0.1 }
        ));
    }

    // ========== 图形 ==========
    initGraphics() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d0d1a);
        this.scene.fog = new THREE.FogExp2(0x0d0d1a, 0.008);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        this.camera.position.set(18, 12, 18);
        this.camera.lookAt(0, 5, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // 灯光
        const ambient = new THREE.AmbientLight(0x8888cc, 0.4);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
        sun.position.set(10, 30, 10);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 100;
        sun.shadow.camera.left = -20;
        sun.shadow.camera.right = 20;
        sun.shadow.camera.top = 20;
        sun.shadow.camera.bottom = -20;
        this.scene.add(sun);

        const pointLight = new THREE.PointLight(0x8b5cf6, 1, 50);
        pointLight.position.set(0, 10, 0);
        this.scene.add(pointLight);
        this.pointLight = pointLight;
    }

    // ========== 地面与初始平台 ==========
    addBase() {
        // 物理地面
        const groundBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Plane(),
            material: this.groundMat
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);

        // 视觉地面 — 网格
        const gridHelper = new THREE.GridHelper(60, 30, 0x333355, 0x222244);
        this.scene.add(gridHelper);

        // 初始平台
        const pw = 4, ph = 1, pd = 4;
        const platBody = new CANNON.Body({
            mass: 0,
            shape: new CANNON.Box(new CANNON.Vec3(pw / 2, ph / 2, pd / 2)),
            material: this.groundMat
        });
        platBody.position.set(0, ph / 2, 0);
        this.world.addBody(platBody);

        const platGeo = new THREE.BoxGeometry(pw, ph, pd);
        const platMat = new THREE.MeshStandardMaterial({
            color: 0x555577,
            metalness: 0.3,
            roughness: 0.7
        });
        const platMesh = new THREE.Mesh(platGeo, platMat);
        platMesh.position.set(0, ph / 2, 0);
        platMesh.castShadow = true;
        platMesh.receiveShadow = true;
        this.scene.add(platMesh);
    }

    // ========== 起重机与机械臂 ==========
    initCrane() {
        const armMat = new THREE.MeshStandardMaterial({
            color: 0x888899,
            metalness: 0.8,
            roughness: 0.3
        });

        // 机械臂主体 — Group 方便整体移动
        this.armGroup = new THREE.Group();
        this.scene.add(this.armGroup);

        // 垂直主柱 (固定在世界中心)
        const pillarGeo = new THREE.CylinderGeometry(0.15, 0.2, 3, 8);
        this.pillarMesh = new THREE.Mesh(pillarGeo, armMat);
        this.armGroup.add(this.pillarMesh);

        // 水平横臂 (X 方向)
        const boomXGeo = new THREE.BoxGeometry(1, 0.12, 0.12);
        this.boomXMesh = new THREE.Mesh(boomXGeo, armMat);
        this.armGroup.add(this.boomXMesh);

        // 水平横臂 (Z 方向)
        const boomZGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
        this.boomZMesh = new THREE.Mesh(boomZGeo, armMat);
        this.armGroup.add(this.boomZMesh);

        // 挂点小球
        const pivotGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const pivotMat = new THREE.MeshStandardMaterial({
            color: 0xff8844,
            emissive: 0xff4400,
            emissiveIntensity: 0.5
        });
        this.pivotMesh = new THREE.Mesh(pivotGeo, pivotMat);
        this.armGroup.add(this.pivotMesh);

        // 绳索
        const ropeGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(), new THREE.Vector3()
        ]);
        this.ropeMesh = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({
            color: 0xaaaaaa,
            linewidth: 2
        }));
        this.scene.add(this.ropeMesh);

        // 机械臂位置指示器 (地面投影)
        const indicatorGeo = new THREE.RingGeometry(0.8, 1.0, 32);
        const indicatorMat = new THREE.MeshBasicMaterial({
            color: 0x8b5cf6,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        this.indicatorMesh = new THREE.Mesh(indicatorGeo, indicatorMat);
        this.indicatorMesh.rotation.x = -Math.PI / 2;
        this.scene.add(this.indicatorMesh);

        this.spawnSwingingBox();
    }

    // ========== 生成摆动的箱子 ==========
    spawnSwingingBox() {
        const geo = new THREE.BoxGeometry(BOX_SIZE.w, BOX_SIZE.h, BOX_SIZE.d);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8b5cf6,
            metalness: 0.4,
            roughness: 0.5,
            emissive: 0x2a1a5e,
            emissiveIntensity: 0.3
        });
        this.swingMesh = new THREE.Mesh(geo, mat);
        this.swingMesh.castShadow = true;
        this.scene.add(this.swingMesh);

        this.swingStartTime = this.elapsedTime;
        this.isSwinging = true;
    }

    // ========== 计算最终箱子位置 = 摆动 + 机械臂偏移 ==========
    getSwingPosition(time, craneY, armX, armZ) {
        const t = time * SWING_SPEED;
        // 摆动产生的偏移
        const swingX = Math.sin(t) * SWING_AMPLITUDE_X;
        const swingZ = Math.cos(t * 0.7) * SWING_AMPLITUDE_Z;
        // 最终位置 = 机械臂位置 + 摆动偏移
        const x = armX + swingX;
        const z = armZ + swingZ;
        const y = craneY;
        return new THREE.Vector3(x, y, z);
    }

    getCraneY() {
        return this.stackHeight + CRANE_HEIGHT_ABOVE_STACK;
    }

    // ========== 释放 ==========
    onRelease() {
        if (!this.isSwinging) return;
        this.isSwinging = false;

        const craneY = this.getCraneY();
        const armX = this.armOffset.x;
        const armZ = this.armOffset.y;
        const releasePos = this.getSwingPosition(this.elapsedTime, craneY, armX, armZ);

        // 记录操作历史 (包含机械臂位置)
        this.ghostRecords.push({
            swingStartTime: this.swingStartTime,
            releaseTime: this.elapsedTime,
            craneY: craneY,
            armX: armX,
            armZ: armZ
        });

        // 移除摆动 mesh
        this.scene.remove(this.swingMesh);

        // 创建物理 body
        const shape = new CANNON.Box(new CANNON.Vec3(BOX_SIZE.w / 2, BOX_SIZE.h / 2, BOX_SIZE.d / 2));
        const body = new CANNON.Body({
            mass: 5,
            shape: shape,
            material: this.boxMat,
            linearDamping: 0.1,
            angularDamping: 0.3
        });
        body.position.set(releasePos.x, releasePos.y, releasePos.z);
        this.world.addBody(body);

        const geo = new THREE.BoxGeometry(BOX_SIZE.w, BOX_SIZE.h, BOX_SIZE.d);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8b5cf6,
            metalness: 0.4,
            roughness: 0.5
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        this.stackedBoxes.push({ body, mesh });
        this.dropCount++;

        // 创建影子 mesh
        const ghostGeo = new THREE.BoxGeometry(BOX_SIZE.w, BOX_SIZE.h, BOX_SIZE.d);
        const ghostMat = new THREE.MeshBasicMaterial({
            color: 0xccaaff,
            transparent: true,
            opacity: 0.15,
            wireframe: false,
            depthWrite: false
        });
        const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
        const edges = new THREE.EdgesGeometry(ghostGeo);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.4 });
        const wireframe = new THREE.LineSegments(edges, lineMat);
        ghostMesh.add(wireframe);
        this.scene.add(ghostMesh);
        this.ghostMeshes.push(ghostMesh);

        // 重置机械臂位置
        this.armOffset.set(0, 0);

        // 等待箱子静止后准备下一个
        setTimeout(() => {
            this.updateStackHeight();
            this.updateUI();
            this.spawnSwingingBox();
        }, 1500);
    }

    updateStackHeight() {
        let maxY = 1;
        for (const { body } of this.stackedBoxes) {
            const topY = body.position.y + BOX_SIZE.h / 2;
            if (topY > maxY) maxY = topY;
        }
        this.stackHeight = maxY;
    }

    updateUI() {
        const height = Math.max(0, this.stackHeight - 1);
        document.getElementById('height-val').innerText = height.toFixed(1);
        document.getElementById('ghost-count').innerText = this.dropCount;
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ========== 主循环 ==========
    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        this.elapsedTime += delta;

        // 物理步进
        this.world.fixedStep(1 / 60, delta);

        // 更新机械臂位置 (WASD)
        this.updateArmPosition(delta);

        const craneY = this.getCraneY();
        const armX = this.armOffset.x;
        const armZ = this.armOffset.y;
        const armTopY = craneY + 6;

        // ---- 更新机械臂视觉 ----
        // 主柱 (垂直, 在机械臂位置上方)
        this.pillarMesh.position.set(armX, armTopY, armZ);
        this.pillarMesh.scale.y = 1;

        // X 横臂 — 从原点到 armX
        const boomXLen = Math.abs(armX) + 0.5;
        this.boomXMesh.scale.x = boomXLen;
        this.boomXMesh.position.set(armX / 2, armTopY + 1.5, armZ);

        // Z 横臂 — 从 armX 到 (armX, armZ)
        const boomZLen = Math.abs(armZ) + 0.5;
        this.boomZMesh.scale.z = boomZLen;
        this.boomZMesh.position.set(armX, armTopY + 1.5, armZ / 2);

        // 1. 更新摆动箱子
        if (this.isSwinging && this.swingMesh) {
            const pos = this.getSwingPosition(this.elapsedTime, craneY, armX, armZ);
            this.swingMesh.position.copy(pos);

            // 挂点
            const pivotPos = new THREE.Vector3(armX, armTopY, armZ);
            this.pivotMesh.position.copy(pivotPos);

            // 绳索
            this.ropeMesh.geometry.setFromPoints([pivotPos, pos]);
            this.ropeMesh.visible = true;
            this.pivotMesh.visible = true;

            // 地面投影指示器
            this.indicatorMesh.position.set(pos.x, 0.05, pos.z);
            this.indicatorMesh.visible = true;
        } else {
            this.ropeMesh.visible = false;
            this.pivotMesh.visible = false;
            this.indicatorMesh.visible = false;
        }

        // 2. 同步物理 body 到视觉 mesh
        for (const { body, mesh } of this.stackedBoxes) {
            mesh.position.set(body.position.x, body.position.y, body.position.z);
            mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        }

        // 3. 更新影子回响
        for (let i = 0; i < this.ghostRecords.length; i++) {
            const record = this.ghostRecords[i];
            const ghostMesh = this.ghostMeshes[i];
            if (!ghostMesh) continue;

            const swingDuration = record.releaseTime - record.swingStartTime;
            const totalCycle = swingDuration + 1.5;
            const phase = (this.elapsedTime % totalCycle);

            if (phase < swingDuration) {
                const replayTime = record.swingStartTime + phase;
                const pos = this.getSwingPosition(replayTime, record.craneY, record.armX, record.armZ);
                ghostMesh.position.copy(pos);
                ghostMesh.visible = true;
                ghostMesh.material.opacity = 0.1 + 0.08 * Math.sin(this.elapsedTime * 3);
            } else {
                const releasePos = this.getSwingPosition(record.releaseTime, record.craneY, record.armX, record.armZ);
                ghostMesh.position.copy(releasePos);
                ghostMesh.visible = true;
                ghostMesh.material.opacity = 0.08;
            }
        }

        // 4. 相机平滑跟随
        const targetCamY = craneY - 2;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.03;
        this.camera.lookAt(0, craneY - 6, 0);

        // 5. 点光源跟随高度
        this.pointLight.position.y = craneY;

        // 6. 动态背景色
        const heightRatio = Math.min(this.stackHeight / 30, 1);
        const r = THREE.MathUtils.lerp(0.05, 0.08, heightRatio);
        const g = THREE.MathUtils.lerp(0.05, 0.03, heightRatio);
        const b = THREE.MathUtils.lerp(0.1, 0.18, heightRatio);
        this.scene.background.setRGB(r, g, b);
        this.scene.fog.color.setRGB(r, g, b);

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
