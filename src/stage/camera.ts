import { Mat4, mat4, Vec3, vec3 } from "wgpu-matrix";
import { toRadians } from "../math_util";
import { device, canvas, fovYDegrees, aspectRatio } from "../renderer";

class CameraUniforms {
    // 4 mat4 (64 floats) + near + far + 2 padding floats = 68 floats = 272 bytes
    readonly buffer = new ArrayBuffer(272);
    private readonly floatView = new Float32Array(this.buffer);

    set viewProjMat(mat: Float32Array) {
        this.floatView.set(mat, 0);
    }

    set viewMat(mat: Float32Array) {
        this.floatView.set(mat, 16);
    }

    set invProjMat(mat: Float32Array) {
        this.floatView.set(mat, 32);
    }

    set invViewProjMat(mat: Float32Array) {
        this.floatView.set(mat, 48);
    }

    set nearPlane(n: number) {
        this.floatView[64] = n;
    }

    set farPlane(f: number) {
        this.floatView[65] = f;
    }
}

export class Camera {
    uniforms: CameraUniforms = new CameraUniforms();
    uniformsBuffer: GPUBuffer;

    viewProjMat: Mat4 = mat4.create();
    projMat: Mat4 = mat4.create();
    cameraPos: Vec3 = vec3.create(-7, 2, 0);
    cameraFront: Vec3 = vec3.create(0, 0, -1);
    cameraUp: Vec3 = vec3.create(0, 1, 0);
    cameraRight: Vec3 = vec3.create(1, 0, 0);
    yaw: number = 0;
    pitch: number = 0;
    moveSpeed: number = 0.004;
    sensitivity: number = 0.15;
    touchSensitivity: number = 0.25; // degrees per pixel dragged
    touchMoveSpeed: number = 0.02; // world units per pixel dragged

    private lastTouch: { x: number, y: number, count: number } | undefined;

    static readonly nearPlane = 0.1;
    static readonly farPlane = 1000;

    keys: { [key: string]: boolean } = {};

    constructor () {
        // TODO-1.1: set `this.uniformsBuffer` to a new buffer of size `this.uniforms.buffer.byteLength`
        // ensure the usage is set to `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST` since we will be copying to this buffer
        // check `lights.ts` for examples of using `device.createBuffer()`
        //
        // note that you can add more variables (e.g. inverse proj matrix) to this buffer in later parts of the assignment

        this.uniformsBuffer = device.createBuffer({
            size: this.uniforms.buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.projMat = mat4.perspective(toRadians(fovYDegrees), aspectRatio, Camera.nearPlane, Camera.farPlane);

        this.uniforms.invProjMat = mat4.inverse(this.projMat);
        this.uniforms.nearPlane = Camera.nearPlane;
        this.uniforms.farPlane = Camera.farPlane;

        this.rotateCamera(0, 0); // set initial camera vectors

        window.addEventListener('keydown', (event) => this.onKeyEvent(event, true));
        window.addEventListener('keyup', (event) => this.onKeyEvent(event, false));
        window.onblur = () => this.keys = {}; // reset keys on page exit so they don't get stuck (e.g. on alt + tab)

        canvas.addEventListener('mousedown', () => canvas.requestPointerLock());
        canvas.addEventListener('mouseup', () => document.exitPointerLock());
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));

        // touch controls
        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
            canvas.addEventListener(type, (event) => this.onTouch(event as TouchEvent), { passive: false });
        }
    }

    private onKeyEvent(event: KeyboardEvent, down: boolean) {
        this.keys[event.key.toLowerCase()] = down;
        if (this.keys['alt']) { // prevent issues from alt shortcuts
            event.preventDefault();
        }
    }

    private rotateCamera(dx: number, dy: number) {
        this.yaw += dx;
        this.pitch -= dy;

        if (this.pitch > 89) {
            this.pitch = 89;
        }
        if (this.pitch < -89) {
            this.pitch = -89;
        }

        const front = mat4.create();
        front[0] = Math.cos(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));
        front[1] = Math.sin(toRadians(this.pitch));
        front[2] = Math.sin(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));

        this.cameraFront = vec3.normalize(front);
        this.cameraRight = vec3.normalize(vec3.cross(this.cameraFront, [0, 1, 0]));
        this.cameraUp = vec3.normalize(vec3.cross(this.cameraRight, this.cameraFront));
    }

    private onMouseMove(event: MouseEvent) {
        if (document.pointerLockElement === canvas) {
            this.rotateCamera(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
        }
    }

    private onTouch(event: TouchEvent) {
        event.preventDefault(); // Stops browser from emulating mouse events (and emulating pointer lock)

        const touches = event.touches;
        if (touches.length === 0) {
            this.lastTouch = undefined;
            return;
        }

        // track the midpoint of all fingers
        let x = 0;
        let y = 0;
        for (let i = 0; i < touches.length; ++i) {
            x += touches[i].clientX;
            y += touches[i].clientY;
        }
        x /= touches.length;
        y /= touches.length;

        // only apply movement while finger count stays the same
        if (event.type === 'touchmove' && this.lastTouch?.count === touches.length) {
            const dx = x - this.lastTouch.x;
            const dy = y - this.lastTouch.y;
            if (touches.length === 1) {
                this.rotateCamera(dx * this.touchSensitivity, dy * this.touchSensitivity);
            } else {
                // drag up to move forward, drag sideways to strafe
                const forward = vec3.scale(this.cameraFront, -dy * this.touchMoveSpeed);
                const right = vec3.scale(this.cameraRight, dx * this.touchMoveSpeed);
                this.cameraPos = vec3.add(this.cameraPos, vec3.add(forward, right));
            }
        }

        this.lastTouch = { x: x, y: y, count: touches.length };
    }

    private processInput(deltaTime: number) {
        let moveDir = vec3.create(0, 0, 0);
        if (this.keys['w']) {
            moveDir = vec3.add(moveDir, this.cameraFront);
        }
        if (this.keys['s']) {
            moveDir = vec3.sub(moveDir, this.cameraFront);
        }
        if (this.keys['a']) {
            moveDir = vec3.sub(moveDir, this.cameraRight);
        }
        if (this.keys['d']) {
            moveDir = vec3.add(moveDir, this.cameraRight);
        }
        if (this.keys['q']) {
            moveDir = vec3.sub(moveDir, this.cameraUp);
        }
        if (this.keys['e']) {
            moveDir = vec3.add(moveDir, this.cameraUp);
        }

        let moveSpeed = this.moveSpeed * deltaTime;
        const moveSpeedMultiplier = 3;
        if (this.keys['shift']) {
            moveSpeed *= moveSpeedMultiplier;
        }
        if (this.keys['alt']) {
            moveSpeed /= moveSpeedMultiplier;
        }

        if (vec3.length(moveDir) > 0) {
            const moveAmount = vec3.scale(vec3.normalize(moveDir), moveSpeed);
            this.cameraPos = vec3.add(this.cameraPos, moveAmount);
        }
    }

    onFrame(deltaTime: number) {
        this.processInput(deltaTime);

        const lookPos = vec3.add(this.cameraPos, vec3.scale(this.cameraFront, 1));
        const viewMat = mat4.lookAt(this.cameraPos, lookPos, [0, 1, 0]);
        const viewProjMat = mat4.mul(this.projMat, viewMat);
        this.uniforms.viewMat = viewMat;
        // TODO-1.1: set `this.uniforms.viewProjMat` to the newly calculated view proj mat
        this.uniforms.viewProjMat = viewProjMat;
        // TODO-2: write to extra buffers needed for light clustering here
        this.uniforms.invViewProjMat = mat4.inverse(viewProjMat);
    
        // TODO-1.1: upload `this.uniforms.buffer` (host side) to `this.uniformsBuffer` (device side)
        // check `lights.ts` for examples of using `device.queue.writeBuffer()`
        device.queue.writeBuffer(this.uniformsBuffer, 0, this.uniforms.buffer);
    }
}
