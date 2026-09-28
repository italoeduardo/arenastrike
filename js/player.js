import * as THREE from 'three';

const RADIUS = 0.35;
const STAND_H = 1.8, CROUCH_H = 1.2;
const STAND_EYE = 1.62, CROUCH_EYE = 1.05;
const STEP = 0.55;
const GRAVITY = 20;
const JUMP_V = 6.6;
export const RUN_SPEED = 6.2, WALK_SPEED = 3.0, CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 60, AIR_ACCEL = 12, FRICTION = 9;

// Shared movement physics for the local player and bots.
export class Body {
  constructor(colliders) {
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouch = 0;
    this.alive = true;
    this._box = new THREE.Box3();
  }

  get height() { return STAND_H - (STAND_H - CROUCH_H) * this.crouch; }
  get eyeHeight() { return STAND_EYE - (STAND_EYE - CROUCH_EYE) * this.crouch; }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  spawn(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(p.x, p.z);
    this.pitch = 0;
    this.crouch = 0;
    this.alive = true;
  }

  boxAt(pos, h = this.height) {
    this._box.min.set(pos.x - RADIUS, pos.y, pos.z - RADIUS);
    this._box.max.set(pos.x + RADIUS, pos.y + h, pos.z + RADIUS);
    return this._box;
  }

  // Strict overlap: Box3.intersectsBox treats touching as intersecting, which would make
  // standing exactly on top of a box register as a wall hit.
  hits(pos, h) {
    const b = this.boxAt(pos, h), e = 1e-4;
    for (const c of this.colliders) {
      if (b.min.x < c.max.x - e && b.max.x > c.min.x + e &&
          b.min.y < c.max.y - e && b.max.y > c.min.y + e &&
          b.min.z < c.max.z - e && b.max.z > c.min.z + e) return c;
    }
    return null;
  }

  moveAxis(axis, amount, canStep) {
    if (amount === 0) return;
    this.pos[axis] += amount;
    let c = this.hits(this.pos);
    let guard = 0;
    while (c && guard++ < 4) {
      if (axis !== 'y' && canStep) {
        const rise = c.max.y - this.pos.y;
        if (rise > 0 && rise <= STEP) {
          const oldY = this.pos.y;
          this.pos.y = c.max.y + 0.001;
          if (!this.hits(this.pos)) return;
          this.pos.y = oldY;
        }
      }
      if (axis === 'y') {
        if (amount > 0) this.pos.y = c.min.y - this.height - 0.001;
        else { this.pos.y = c.max.y; this.onGround = true; }
        this.vel.y = 0;
      } else {
        this.pos[axis] = amount > 0 ? c.min[axis] - RADIUS - 0.001 : c.max[axis] + RADIUS + 0.001;
        this.vel[axis] = 0;
      }
      c = this.hits(this.pos);
    }
  }

  // input: { wish: Vector3 (unit or zero, world XZ), maxSpeed, jump, crouch }
  simulate(dt, input) {
    if (input.crouch) this.crouch = Math.min(1, this.crouch + dt * 8);
    else if (this.crouch > 0) {
      const next = Math.max(0, this.crouch - dt * 8);
      if (!this.hits(this.pos, STAND_H - (STAND_H - CROUCH_H) * next)) this.crouch = next;
    }

    if (this.onGround) {
      const speed = this.speed;
      if (speed > 0) {
        const drop = Math.max(speed, 1.5) * FRICTION * dt;
        const scale = Math.max(0, speed - drop) / speed;
        this.vel.x *= scale; this.vel.z *= scale;
      }
    }

    const wish = input.wish;
    const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
    const current = this.vel.x * wish.x + this.vel.z * wish.z;
    const add = Math.min(Math.max(input.maxSpeed - current, 0), accel * dt);
    this.vel.x += wish.x * add;
    this.vel.z += wish.z * add;

    if (input.jump && this.onGround) this.vel.y = JUMP_V;
    this.vel.y -= GRAVITY * dt;

    const wasGround = this.onGround && this.vel.y <= 0;
    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt, wasGround);
    this.moveAxis('z', this.vel.z * dt, wasGround);
    this.moveAxis('y', this.vel.y * dt, false);

    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }

    // stick to the ground when walking down steps instead of hopping off them
    if (wasGround && !this.onGround) {
      let top = this.pos.y - STEP <= 0 ? 0 : -Infinity;
      const probe = this.boxAt(this.pos).clone();
      probe.min.y -= STEP;
      for (const c of this.colliders) {
        if (c.intersectsBox(probe) && c.max.y <= this.pos.y + 0.001) top = Math.max(top, c.max.y);
      }
      if (top > -Infinity) { this.pos.y = top; this.onGround = true; this.vel.y = 0; }
    }
  }
}

export class Player extends Body {
  constructor(camera, colliders) {
    super(colliders);
    this.camera = camera;
    this.keys = new Set();
    this.sensitivity = 0.0022;
    this.hp = 100;
    this.speedMul = 1;

    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'Space' || e.code === 'Tab') e.preventDefault(); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.lookEnabled = false;
    this.zoomSens = 1;
    addEventListener('mousemove', e => {
      if (!this.lookEnabled || !this.alive) return;
      this.look(e.movementX, e.movementY);
    });
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity * this.zoomSens;
    this.pitch -= dy * this.sensitivity * this.zoomSens;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
  }

  get quiet() { return this.keys.has('ShiftLeft') || this.crouch > 0.5; }

  // frozen: can look and crouch but not walk or jump (buy time, planting, defusing)
  update(dt, inputEnabled, frozen = false) {
    if (!this.alive) return;
    const k = inputEnabled ? new Set(this.keys) : new Set();
    if (frozen) for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) k.delete(c);
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const wish = new THREE.Vector3();
    if (fwd || side) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      wish.set(-sin * fwd + cos * side, 0, -cos * fwd - sin * side).normalize();
    }
    const crouch = k.has('ControlLeft') || k.has('KeyC');
    let maxSpeed = crouch ? CROUCH_SPEED : k.has('ShiftLeft') ? WALK_SPEED : RUN_SPEED;
    maxSpeed *= this.speedMul;
    this.simulate(dt, { wish, maxSpeed, jump: k.has('Space'), crouch });
  }

  applyCamera(punchPitch = 0, punchYaw = 0) {
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    this.camera.rotation.set(this.pitch + punchPitch, this.yaw + punchYaw, 0, 'YXZ');
  }
}
