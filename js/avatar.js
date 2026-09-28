import * as THREE from 'three';

const COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#c2a000', '#7f8c8d', '#e84393', '#34495e'];
export function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

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
  constructor(scene, id, name) {
    this.id = id;
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const color = colorFor(id);
    const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const pants = new THREE.MeshStandardMaterial({ color: '#3b3b36', roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: '#c89a78', roughness: 0.8 });
    const gear = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.7 });

    const mk = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

    this.hips = new THREE.Group(); this.hips.position.y = 0.9; this.body.add(this.hips);
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0, 0); this.hips.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0, 0); this.hips.add(this.legR);
    mk(new THREE.BoxGeometry(0.2, 0.9, 0.22), pants, this.legL, 0, -0.45, 0);
    mk(new THREE.BoxGeometry(0.2, 0.9, 0.22), pants, this.legR, 0, -0.45, 0);

    this.torso = new THREE.Group(); this.hips.add(this.torso);
    mk(new THREE.BoxGeometry(0.5, 0.62, 0.3), cloth, this.torso, 0, 0.31, 0);
    mk(new THREE.BoxGeometry(0.52, 0.35, 0.34), gear, this.torso, 0, 0.35, 0);
    mk(new THREE.BoxGeometry(0.28, 0.3, 0.28), skin, this.torso, 0, 0.8, 0);
    mk(new THREE.BoxGeometry(0.31, 0.12, 0.31), gear, this.torso, 0, 0.93, 0);

    this.arms = new THREE.Group(); this.arms.position.set(0, 0.52, 0); this.torso.add(this.arms);
    const armL = mk(new THREE.BoxGeometry(0.12, 0.12, 0.5), cloth, this.arms, -0.2, -0.05, -0.22); armL.rotation.y = 0.35;
    const armR = mk(new THREE.BoxGeometry(0.12, 0.12, 0.5), cloth, this.arms, 0.2, -0.05, -0.2); armR.rotation.y = -0.2;
    this.gun = mk(new THREE.BoxGeometry(0.07, 0.1, 0.75), gear, this.arms, 0.05, 0.0, -0.5);

    // invisible, slightly generous hitboxes
    const hbMat = new THREE.MeshBasicMaterial({ visible: false });
    this.headBox = mk(new THREE.BoxGeometry(0.34, 0.36, 0.34), hbMat, this.torso, 0, 0.82, 0);
    this.chestBox = mk(new THREE.BoxGeometry(0.56, 0.7, 0.36), hbMat, this.torso, 0, 0.3, 0);
    this.legBox = mk(new THREE.BoxGeometry(0.5, 0.9, 0.3), hbMat, this.hips, 0, -0.45, 0);
    for (const [m, part] of [[this.headBox, 'head'], [this.chestBox, 'body'], [this.legBox, 'legs']]) {
      m.castShadow = false;
      m.userData = { playerId: id, part, avatar: this.root };
    }
    this.hitboxes = [this.headBox, this.chestBox, this.legBox];

    this.tag = nameSprite(name || 'Jogador');
    this.tag.position.y = 2.25;
    this.root.add(this.tag);

    this.target = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, crouch: 0 };
    this.walkT = 0;
    this.dead = false;
    this.deadT = 0;
    this.lastPos = new THREE.Vector3();
    scene.add(this.root);
  }

  setName(name) {
    this.root.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag = nameSprite(name);
    this.tag.position.y = 2.25;
    this.root.add(this.tag);
  }

  setState(s) {
    this.target.pos.set(s.p[0], s.p[1], s.p[2]);
    this.target.yaw = s.y;
    this.target.pitch = s.x;
    this.target.crouch = s.c || 0;
  }

  snap() {
    this.root.position.copy(this.target.pos);
    this.lastPos.copy(this.target.pos);
  }

  setDead(dead) {
    this.dead = dead;
    this.deadT = 0;
    for (const h of this.hitboxes) h.visible = !dead;
    if (!dead) { this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0); }
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    if (this.root.position.distanceTo(this.target.pos) > 5) this.snap();
    this.root.position.lerp(this.target.pos, k);
    let dy = this.target.yaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * k;

    const moved = Math.hypot(this.root.position.x - this.lastPos.x, this.root.position.z - this.lastPos.z) / Math.max(dt, 1e-4);
    this.lastPos.copy(this.root.position);

    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 3);
      this.body.rotation.x = -Math.PI / 2 * this.deadT;
      this.body.position.y = 0.15 * this.deadT;
      this.tag.visible = false;
      return;
    }
    this.tag.visible = true;

    const c = this.target.crouch;
    this.hips.position.y = 0.9 - c * 0.4;
    this.legL.rotation.x = c * -0.9; this.legR.rotation.x = c * -0.9;
    if (moved > 0.4) {
      this.walkT += dt * Math.min(moved, 7) * 1.8;
      const sw = Math.sin(this.walkT) * 0.6 * Math.min(1, moved / 5);
      this.legL.rotation.x += sw; this.legR.rotation.x -= sw;
    }
    this.arms.rotation.x = this.target.pitch * 0.9;
    this.torso.rotation.x = c * 0.2;
  }

  dispose() {
    this.scene.remove(this.root);
  }
}
