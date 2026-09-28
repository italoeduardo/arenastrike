import * as THREE from 'three';
import { playBounce, playGrenade } from './audio.js';

export const FUSE = { he: 1.6, flash: 1.4, smoke: 1.8 };
export const SMOKE_TIME = 16;
export const SMOKE_RADIUS = 4.2;
const GRAVITY = 15;
const R = 0.08;

// Shared by host (authoritative) and clients (visual), so both see the same arc.
export function stepGrenade(g, dt, colliders) {
  let bounced = false;
  const h = 1 / 120;
  for (let t = 0; t < dt; t += h) {
    g.vel.y -= GRAVITY * h;
    for (const axis of ['x', 'y', 'z']) {
      g.pos[axis] += g.vel[axis] * h;
      const hit = colliders.some(c =>
        g.pos.x + R > c.min.x && g.pos.x - R < c.max.x &&
        g.pos.y + R > c.min.y && g.pos.y - R < c.max.y &&
        g.pos.z + R > c.min.z && g.pos.z - R < c.max.z);
      if (hit) {
        g.pos[axis] -= g.vel[axis] * h;
        if (Math.abs(g.vel[axis]) > 1.5) bounced = true;
        g.vel[axis] *= -0.45;
        for (const o of ['x', 'y', 'z']) if (o !== axis) g.vel[o] *= 0.85;
      }
    }
    if (g.pos.y < R) {
      g.pos.y = R;
      if (g.vel.y < -1.5) bounced = true;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      if (g.vel.y < 0.6) g.vel.y = 0;
      g.vel.x *= 0.8; g.vel.z *= 0.8;
    }
  }
  g.t += dt;
  return bounced;
}

export function shouldDetonate(g) {
  if (g.key === 'smoke') return (g.t >= FUSE.smoke && g.vel.length() < 1) || g.t > 5;
  return g.t >= FUSE[g.key];
}

export function segmentHitsSmoke(a, b, smokes) {
  if (!smokes.length) return false;
  const ab = b.clone().sub(a), len2 = ab.lengthSq();
  for (const s of smokes) {
    const t = Math.max(0, Math.min(1, s.p.clone().sub(a).dot(ab) / len2));
    const closest = a.clone().addScaledVector(ab, t);
    const c = s.p.clone(); c.y += 1.2;
    if (closest.distanceTo(c) < SMOKE_RADIUS * 0.9) return true;
  }
  return false;
}

let puffTex = null;
function smokeTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

// Client-side visuals for thrown grenades, explosions and smoke clouds.
export class GrenadeFX {
  constructor(scene, colliders, listener) {
    this.scene = scene;
    this.colliders = colliders;
    this.listener = listener;
    this.flying = new Map();
    this.effects = [];
    this.smokes = [];
    this.geo = { he: new THREE.SphereGeometry(0.07, 10, 8), flash: new THREE.CylinderGeometry(0.045, 0.045, 0.13, 10), smoke: new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10) };
    this.mat = { he: new THREE.MeshStandardMaterial({ color: '#3d5a2c' }), flash: new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: 0.6 }), smoke: new THREE.MeshStandardMaterial({ color: '#6b7a86' }) };
  }

  spawn(id, key, o, v) {
    const mesh = new THREE.Mesh(this.geo[key], this.mat[key]);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.flying.set(id, { key, mesh, pos: new THREE.Vector3(...o), vel: new THREE.Vector3(...v), t: 0 });
  }

  boom(id, key, p) {
    const g = this.flying.get(id);
    if (g) { this.scene.remove(g.mesh); this.flying.delete(id); }
    const pos = new THREE.Vector3(...p);
    const { volume, pan } = this.listener(pos);
    playGrenade(key, volume, pan);
    if (key === 'he') this.explosion(pos, 5, '#ffb347');
    else if (key === 'flash') this.explosion(pos, 2.5, '#ffffff');
    else this.addSmoke(pos);
  }

  explosion(pos, size, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(pos);
    this.scene.add(m);
    const light = new THREE.PointLight(color, 40, size * 4);
    light.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    this.scene.add(light);
    this.effects.push({ m, light, t: 0, life: 0.45, size });
  }

  addSmoke(pos) {
    const group = new THREE.Group();
    const tex = smokeTexture();
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color().setHSL(0.1, 0.03, 0.5 + Math.random() * 0.12), transparent: true, opacity: 0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * SMOKE_RADIUS * 0.8;
      s.position.set(Math.cos(a) * r, 0.4 + Math.random() * 2.6, Math.sin(a) * r);
      s.userData.size = 2.6 + Math.random() * 2.2;
      s.scale.setScalar(0.1);
      group.add(s);
    }
    group.position.copy(pos);
    this.scene.add(group);
    this.smokes.push({ group, t: 0 });
  }

  update(dt) {
    for (const [id, g] of this.flying) {
      if (stepGrenade(g, dt, this.colliders)) {
        const { volume, pan } = this.listener(g.pos);
        playBounce(volume * 0.4, pan);
      }
      g.mesh.position.copy(g.pos);
      g.mesh.rotation.x += dt * g.vel.length() * 2;
      if (g.t > 8) { this.scene.remove(g.mesh); this.flying.delete(id); }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = e.t / e.life;
      e.m.scale.setScalar(e.size * (0.3 + k * 0.9));
      e.m.material.opacity = 0.9 * (1 - k);
      e.light.intensity = 40 * (1 - k);
      if (k >= 1) { this.scene.remove(e.m); this.scene.remove(e.light); e.m.geometry.dispose(); this.effects.splice(i, 1); }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const grow = Math.min(1, s.t / 1.2);
      const fade = s.t > SMOKE_TIME - 2 ? Math.max(0, (SMOKE_TIME - s.t) / 2) : 1;
      for (const sp of s.group.children) {
        sp.scale.setScalar(sp.userData.size * grow);
        sp.material.opacity = 0.92 * grow * fade;
        sp.position.y += Math.sin(s.t * 0.7 + sp.id) * dt * 0.05;
      }
      if (s.t >= SMOKE_TIME) { this.scene.remove(s.group); this.smokes.splice(i, 1); }
    }
  }

  clear() {
    for (const g of this.flying.values()) this.scene.remove(g.mesh);
    this.flying.clear();
    for (const s of this.smokes) this.scene.remove(s.group);
    this.smokes = [];
  }
}
