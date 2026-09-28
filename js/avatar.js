import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#c2a000', '#7f8c8d', '#e84393', '#34495e'];
export function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export const TEAM_LOOK = {
  T:  { shirt: '#7d6443', pants: '#4a4032', rig: '#3b3526', head: '#1b1b1b', glove: '#3a2f22' },
  CT: { shirt: '#2c3e5a', pants: '#27313d', rig: '#1e2a3a', head: '#1f2a36', glove: '#1e2a3a' },
};

const GUN_LEN = { rifle: 0.78, smg: 0.5, shotgun: 0.8, sniper: 1.0, pistol: 0.26, knife: 0.22, grenade: 0.14, bomb: 0.2 };

function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.45)';
  const w = Math.min(250, g.measureText(text).width + 24);
  g.fillRect(128 - w / 2, 10, w, 44);
  g.fillStyle = '#fff';
  g.fillText(text, 128, 43);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

export class Avatar {
  constructor(scene, id, name, team = null) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const look = TEAM_LOOK[team] || { shirt: colorFor(id), pants: '#3b3b36', rig: '#2a2a2a', head: null, glove: '#222' };
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    const shirt = m(look.shirt), pants = m(look.pants), rig = m(look.rig), skin = m('#c89a78'), dark = m('#1a1a1a');
    const mk = (geo, mat, parent, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);

    this.hips = new THREE.Group(); this.hips.position.y = 0.9; this.body.add(this.hips);
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0, 0); this.hips.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0, 0); this.hips.add(this.legR);
    for (const leg of [this.legL, this.legR]) {
      mk(B(0.2, 0.86, 0.22), pants, leg, 0, -0.43, 0);
      mk(B(0.22, 0.12, 0.3), dark, leg, 0, -0.84, -0.04);
    }

    this.torso = new THREE.Group(); this.hips.add(this.torso);
    mk(B(0.5, 0.62, 0.3), shirt, this.torso, 0, 0.31, 0);
    mk(B(0.54, 0.4, 0.36), rig, this.torso, 0, 0.36, 0);
    this.head = new THREE.Group(); this.head.position.set(0, 0.8, 0); this.torso.add(this.head);
    if (team === 'T') {
      mk(B(0.28, 0.3, 0.28), m(look.head), this.head, 0, 0, 0);
      mk(B(0.29, 0.07, 0.05), skin, this.head, 0, 0.03, -0.13);
      mk(B(0.2, 0.03, 0.02), dark, this.head, 0, 0.03, -0.16);
    } else if (team === 'CT') {
      mk(B(0.26, 0.28, 0.26), skin, this.head, 0, -0.02, 0);
      mk(B(0.33, 0.16, 0.34), m(look.head), this.head, 0, 0.1, 0.01);
      mk(B(0.24, 0.06, 0.04), m('#0d0d0d'), this.head, 0, 0.02, -0.14);
    } else {
      mk(B(0.28, 0.3, 0.28), skin, this.head, 0, 0, 0);
      mk(B(0.31, 0.12, 0.31), dark, this.head, 0, 0.13, 0);
    }

    this.arms = new THREE.Group(); this.arms.position.set(0, 0.52, 0); this.torso.add(this.arms);
    mk(B(0.12, 0.12, 0.5), shirt, this.arms, -0.2, -0.05, -0.22).rotation.y = 0.35;
    mk(B(0.12, 0.12, 0.5), shirt, this.arms, 0.2, -0.05, -0.2).rotation.y = -0.2;
    this.gun = mk(B(0.07, 0.1, 0.75), dark, this.arms, 0.05, 0, -0.5);

    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.headBox = mk(B(0.34, 0.36, 0.34), hbMat, this.torso, 0, 0.82, 0);
    this.chestBox = mk(B(0.56, 0.7, 0.36), hbMat, this.torso, 0, 0.3, 0);
    this.legBox = mk(B(0.5, 0.9, 0.3), hbMat, this.hips, 0, -0.45, 0);
    for (const [box, part] of [[this.headBox, 'head'], [this.chestBox, 'body'], [this.legBox, 'legs']]) {
      box.castShadow = false;
      box.userData = { playerId: id, part, avatar: this.root };
    }
    this.hitboxes = [this.headBox, this.chestBox, this.legBox];

    this.tag = nameSprite(name || 'Jogador');
    this.tag.position.y = 2.25;
    this.tag.visible = false;
    this.showTag = false;
    this.root.add(this.tag);

    this.target = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, crouch: 0 };
    this.walkT = 0;
    this.dead = false;
    this.deadT = 0;
    this.fall = { x: -1, z: 0 };
    this.lastPos = new THREE.Vector3();
    this.speed = 0;
    this.weaponType = 'rifle';
    scene.add(this.root);
  }

  setName(name) {
    this.name = name;
    this.root.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag = nameSprite(name);
    this.tag.position.y = 2.25;
    this.root.add(this.tag);
  }

  setWeapon(key) {
    const type = WEAPONS[key]?.type || 'rifle';
    if (type === this.weaponType) return;
    this.weaponType = type;
    const len = GUN_LEN[type] ?? 0.75;
    this.gun.scale.z = len / 0.75;
    this.gun.position.z = -0.2 - len * 0.4;
    this.gun.material = new THREE.MeshStandardMaterial({ color: WEAPONS[key]?.color || '#1a1a1a', roughness: 0.6 });
  }

  setState(s) {
    this.target.pos.set(s.p[0], s.p[1], s.p[2]);
    this.target.yaw = s.y;
    this.target.pitch = s.x;
    this.target.crouch = s.c || 0;
    if (s.w) this.setWeapon(s.w);
  }

  snap() {
    this.root.position.copy(this.target.pos);
    this.lastPos.copy(this.target.pos);
  }

  // fromDir: world XZ direction the killing shot travelled; body falls along it
  setDead(dead, fromDir) {
    this.dead = dead;
    this.deadT = 0;
    for (const h of this.hitboxes) h.visible = !dead;
    if (dead) {
      const yaw = this.root.rotation.y;
      let fx = -1, fz = (Math.random() - 0.5) * 0.6;
      if (fromDir) {
        const lx = fromDir.x * Math.cos(yaw) - fromDir.z * Math.sin(yaw);
        const lz = fromDir.x * Math.sin(yaw) + fromDir.z * Math.cos(yaw);
        fx = lz > 0 ? -1 : 1;
        fz = -lx * 0.8;
      }
      this.fall = { x: fx, z: fz };
    } else {
      this.body.rotation.set(0, 0, 0);
      this.body.position.set(0, 0, 0);
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    if (this.root.position.distanceTo(this.target.pos) > 5) this.snap();
    if (!this.dead) {
      this.root.position.lerp(this.target.pos, k);
      let dy = this.target.yaw - this.root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.root.rotation.y += dy * k;
    }
    this.speed = Math.hypot(this.root.position.x - this.lastPos.x, this.root.position.z - this.lastPos.z) / Math.max(dt, 1e-4);
    this.lastPos.copy(this.root.position);

    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      const e = 1 - Math.pow(1 - this.deadT, 3);
      const bounce = this.deadT > 0.7 ? Math.sin((this.deadT - 0.7) / 0.3 * Math.PI) * 0.06 : 0;
      this.body.rotation.x = this.fall.x * Math.PI / 2 * e;
      this.body.rotation.z = this.fall.z * 0.5 * e;
      this.body.position.y = 0.12 * e + bounce;
      this.legL.rotation.x = -0.6 * e; this.legR.rotation.x = -0.2 * e;
      this.arms.rotation.x = -0.8 * e;
      this.head.rotation.x = 0.4 * e;
      this.tag.visible = false;
      return;
    }
    this.tag.visible = this.showTag;
    const c = this.target.crouch;
    this.hips.position.y = 0.9 - c * 0.4;
    this.legL.rotation.x = c * -0.9; this.legR.rotation.x = c * -0.9;
    if (this.speed > 0.4) {
      this.walkT += dt * Math.min(this.speed, 7) * 1.8;
      const sw = Math.sin(this.walkT) * 0.6 * Math.min(1, this.speed / 5);
      this.legL.rotation.x += sw; this.legR.rotation.x -= sw;
    }
    this.arms.rotation.x = this.target.pitch * 0.9;
    this.head.rotation.x = this.target.pitch * 0.4;
    this.torso.rotation.x = c * 0.2;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}

// weapon lying on the floor
export function worldWeapon(key) {
  const w = WEAPONS[key];
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: w?.color || '#222', roughness: 0.6, metalness: 0.3 });
  if (key === 'c4') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.2), mat);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: '#ff2020' }));
    led.position.set(0.08, 0.07, 0);
    b.add(led);
    g.add(b);
    g.userData.led = led;
  } else {
    const len = GUN_LEN[w?.type] ?? 0.7;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, len), mat);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: '#1a1a1a' }));
    grip.position.set(0, -0.07, len * 0.15);
    b.add(grip);
    b.rotation.z = Math.PI / 2 - 0.2;
    g.add(b);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
