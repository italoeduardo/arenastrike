import * as THREE from 'three';
import { playShot, playReload, playEmpty } from './audio.js';

export const WEAPONS = {
  ar7:      { name: 'AR-7',      slot: 1, sound: 'rifle',  auto: true,  dmg: 33,  head: 4,   interval: 0.1,  mag: 30, reserve: 90, reload: 2.5, spread: 0.003, moveSpread: 0.07, airSpread: 0.15, recoil: 'rifle',  range: 200, speedMul: 0.86, color: '#3a3027' },
  viper:    { name: 'Viper SMG', slot: 1, sound: 'pistol', auto: true,  dmg: 24,  head: 3,   interval: 0.07, mag: 30, reserve: 120, reload: 2.1, spread: 0.008, moveSpread: 0.025, airSpread: 0.1, recoil: 'smg',   range: 80,  speedMul: 0.96, color: '#2b2f36' },
  longbow:  { name: 'Longbow',   slot: 1, sound: 'sniper', auto: false, dmg: 115, head: 1.5, interval: 1.45, mag: 5,  reserve: 20, reload: 3.6, spread: 0.0005, moveSpread: 0.12, airSpread: 0.3, recoil: 'sniper', range: 300, speedMul: 0.8, scope: true, unscopedSpread: 0.08, color: '#2f4a33' },
  breacher: { name: 'Breacher',  slot: 1, sound: 'sniper', auto: false, dmg: 18,  head: 2,   interval: 0.85, mag: 7,  reserve: 28, reload: 3.0, spread: 0.07, moveSpread: 0.02, airSpread: 0.05, recoil: 'shotgun', range: 40, speedMul: 0.9, pellets: 9, color: '#4a3a2a' },
  p9:       { name: 'P-9',       slot: 2, sound: 'pistol', auto: false, dmg: 30,  head: 4,   interval: 0.15, mag: 12, reserve: 48, reload: 2.1, spread: 0.004, moveSpread: 0.03, airSpread: 0.1, recoil: 'pistol', range: 100, speedMul: 1.0, color: '#222' },
  knife:    { name: 'Faca',      slot: 3, melee: true,     auto: true,  dmg: 55,  head: 1,   interval: 0.55, range: 2.0, speedMul: 1.0, color: '#999' },
};
export const PRIMARIES = ['ar7', 'viper', 'longbow', 'breacher'];

function patternOffset(kind, i) {
  switch (kind) {
    case 'rifle': {
      const up = Math.min(i, 9) * 0.011;
      const side = i > 9 ? Math.sin((i - 9) * 0.55) * 0.028 : (i > 3 ? (i - 3) * 0.002 : 0);
      return [up, side];
    }
    case 'smg': return [Math.min(i, 8) * 0.006, i > 8 ? Math.sin(i * 0.9) * 0.015 : 0];
    case 'pistol': return [Math.min(i, 5) * 0.012, 0];
    case 'sniper': return [0, 0];
    case 'shotgun': return [0, 0];
    default: return [0, 0];
  }
}

function buildViewModel(key) {
  const w = WEAPONS[key];
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.6, metalness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.4, metalness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c89a78', roughness: 0.8 });
  const glove = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.9 });
  const box = (sx, sy, sz, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); g.add(b); return b; };

  let muzzleZ = -0.7;
  if (key === 'knife') {
    box(0.03, 0.03, 0.14, glove, 0, 0, 0);
    const blade = box(0.012, 0.04, 0.22, new THREE.MeshStandardMaterial({ color: '#cfd4da', metalness: 0.9, roughness: 0.2 }), 0, 0.005, -0.18);
    blade.rotation.x = 0.05;
    muzzleZ = -0.3;
  } else if (w.slot === 2) {
    box(0.05, 0.07, 0.22, dark, 0, 0, -0.1);
    box(0.045, 0.12, 0.06, metal, 0, -0.08, -0.02).rotation.x = 0.25;
    muzzleZ = -0.22;
  } else {
    const len = key === 'longbow' ? 0.95 : key === 'viper' ? 0.5 : key === 'breacher' ? 0.75 : 0.75;
    box(0.06, 0.09, len * 0.55, dark, 0, 0, -len * 0.3);
    box(0.03, 0.03, len * 0.5, metal, 0, 0.015, -len * 0.75);
    box(0.05, 0.14, 0.05, metal, 0, -0.1, -len * 0.2).rotation.x = 0.2;
    box(0.05, 0.08, 0.22, dark, 0, -0.02, 0.1);
    if (key === 'ar7') box(0.04, 0.16, 0.07, metal, 0, -0.12, -len * 0.42).rotation.x = -0.15;
    if (key === 'viper') box(0.035, 0.18, 0.05, metal, 0, -0.13, -len * 0.4);
    if (key === 'breacher') box(0.05, 0.05, 0.3, new THREE.MeshStandardMaterial({ color: '#6b4a2a' }), 0, -0.05, -len * 0.55);
    if (key === 'longbow') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 12), metal);
      scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.075, -0.35); g.add(scope);
    }
    muzzleZ = -len * 1.0;
  }
  // arm + hand
  const arm = box(0.07, 0.07, 0.4, skin, 0.03, -0.09, 0.28); arm.rotation.x = 0.3;
  box(0.08, 0.08, 0.09, glove, 0.0, -0.05, 0.05);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  flash.position.set(0, 0.015, muzzleZ - 0.05);
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzle = new THREE.Vector3(0, 0.015, muzzleZ);
  g.traverse(o => { if (o.isMesh) { o.renderOrder = 999; o.material.depthTest = true; } });
  return g;
}

export class WeaponSystem {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.7);
    this.holder.position.set(0.04, -0.01, 0);
    camera.add(this.holder);
    this.models = {};
    for (const k of Object.keys(WEAPONS)) {
      this.models[k] = buildViewModel(k);
      this.models[k].visible = false;
      this.holder.add(this.models[k]);
    }
    this.light = new THREE.PointLight('#ffb050', 0, 6);
    this.light.position.set(0.2, -0.1, -0.8);
    camera.add(this.light);

    this.raycaster = new THREE.Raycaster();
    this.primaryKey = 'ar7';
    this.reset();

    this.mouseDown = false;
    this.scoped = false;
    this.shotIndex = 0;
    this.lastShot = 0;
    this.punch = new THREE.Vector2();
    this.kick = 0;
    this.bobT = 0;
    this.switchT = 0;
  }

  reset(primary = this.primaryKey) {
    this.primaryKey = primary;
    this.ammo = {};
    for (const k of Object.keys(WEAPONS)) this.ammo[k] = { mag: WEAPONS[k].mag ?? 0, reserve: WEAPONS[k].reserve ?? 0 };
    this.reloading = 0;
    this.cooldown = 0;
    this.scoped = false;
    this.equip(primary);
  }

  get current() { return WEAPONS[this.key]; }

  equip(key) {
    if (this.key === key && this.models[key].visible) return;
    if (this.key) this.models[this.key].visible = false;
    this.key = key;
    this.models[key].visible = true;
    this.reloading = 0;
    this.scoped = false;
    this.switchT = 0.35;
    this.cooldown = Math.max(this.cooldown, 0.3);
    this.shotIndex = 0;
  }

  handleKey(code) {
    if (code === 'Digit1') this.equip(this.primaryKey);
    else if (code === 'Digit2') this.equip('p9');
    else if (code === 'Digit3') this.equip('knife');
    else if (code === 'KeyR') this.startReload();
  }

  handleWheel(dy) {
    const order = [this.primaryKey, 'p9', 'knife'];
    const i = order.indexOf(this.key);
    this.equip(order[(i + (dy > 0 ? 1 : 2)) % 3]);
  }

  toggleScope() {
    if (this.current.scope && this.reloading <= 0) this.scoped = !this.scoped;
  }

  startReload() {
    const w = this.current, a = this.ammo[this.key];
    if (w.melee || this.reloading > 0 || a.mag >= w.mag || a.reserve <= 0) return;
    this.reloading = w.reload;
    this.scoped = false;
    playReload();
  }

  // returns array of shot events for this frame
  update(dt, player, targets, onlyMap) {
    const w = this.current;
    const a = this.ammo[this.key];
    const shots = [];
    this.cooldown -= dt;
    this.switchT = Math.max(0, this.switchT - dt);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = w.mag - a.mag, take = Math.min(need, a.reserve);
        a.mag += take; a.reserve -= take;
      }
    }

    const since = performance.now() / 1000 - this.lastShot;
    if (since > w.interval * 1.8 + 0.08) this.shotIndex = Math.max(0, this.shotIndex - dt * 25);

    if (this.mouseDown && player.alive && this.cooldown <= 0 && this.reloading <= 0) {
      if (!w.melee && a.mag <= 0) {
        playEmpty();
        this.cooldown = 0.25;
        if (a.reserve > 0) this.startReload();
      } else {
        shots.push(...this.fire(player, targets, onlyMap));
        if (!w.auto) this.mouseDown = false;
      }
    }

    this.punch.multiplyScalar(Math.exp(-dt * 9));
    this.kick = Math.max(0, this.kick - dt * 8);
    this.animate(dt, player);
    return shots;
  }

  spreadFor(player) {
    const w = this.current;
    let s = w.spread;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (!player.onGround) s += w.airSpread;
    else if (speed > 1.5) s += w.moveSpread * Math.min(1, speed / 6);
    if (player.crouch > 0.5) s *= 0.7;
    if (w.scope && !this.scoped) s += w.unscopedSpread;
    return s;
  }

  fire(player, targets, mapMeshes) {
    const w = this.current;
    const a = this.ammo[this.key];
    this.cooldown = w.interval;
    this.lastShot = performance.now() / 1000;

    const events = [];
    if (w.melee) {
      const origin = this.camera.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
      const hit = this.cast(origin, dir, w.range, targets, mapMeshes);
      this.kick = 1;
      if (hit && hit.object.userData.playerId) {
        const back = this.isBackstab(hit.object, dir);
        events.push({ origin, dir, point: hit.point, target: hit.object.userData.playerId, dmg: back ? 150 : w.dmg, head: false, melee: true });
      } else events.push({ origin, dir, point: null, melee: true });
      return events;
    }

    a.mag--;
    const [pUp, pSide] = patternOffset(w.recoil, Math.floor(this.shotIndex));
    this.shotIndex++;
    const spread = this.spreadFor(player);

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      const e = new THREE.Euler(player.pitch + this.punch.x + pUp, player.yaw + this.punch.y + pSide, 0, 'YXZ');
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
      const r = Math.sqrt(Math.random()) * spread, t = Math.random() * Math.PI * 2;
      const right = new THREE.Vector3(1, 0, 0).applyEuler(e), up = new THREE.Vector3(0, 1, 0).applyEuler(e);
      dir.addScaledVector(right, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r).normalize();

      const hit = this.cast(origin, dir, w.range, targets, mapMeshes);
      const ev = { origin, dir, point: hit ? hit.point.clone() : origin.clone().addScaledVector(dir, w.range), normal: hit?.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null };
      if (hit && hit.object.userData.playerId) {
        const head = hit.object.userData.part === 'head';
        const falloff = Math.pow(0.985, hit.distance / 10);
        ev.target = hit.object.userData.playerId;
        ev.head = head;
        ev.dmg = Math.round(w.dmg * (head ? w.head : 1) * falloff);
      }
      events.push(ev);
    }

    // view kick: camera follows ~half of the bullet pattern, like CS
    const kickUp = w.recoil === 'sniper' ? 0.06 : w.recoil === 'shotgun' ? 0.05 : w.recoil === 'pistol' ? 0.022 : 0.012;
    this.punch.x += kickUp;
    this.punch.y += (Math.random() - 0.5) * kickUp * 0.4;
    this.kick = 1;
    this.models[this.key].userData.flash.material.opacity = 1;
    this.models[this.key].userData.flash.rotation.z = Math.random() * Math.PI;
    this.light.intensity = 3;
    playShot(w.sound);
    if (w.scope) this.scoped = false;
    return events;
  }

  isBackstab(obj, dir) {
    const avatar = obj.userData.avatar;
    if (!avatar) return false;
    const facing = new THREE.Vector3(-Math.sin(avatar.rotation.y), 0, -Math.cos(avatar.rotation.y));
    return facing.dot(new THREE.Vector3(dir.x, 0, dir.z).normalize()) > 0.5;
  }

  cast(origin, dir, range, targets, mapMeshes) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = range;
    const hits = this.raycaster.intersectObjects([...mapMeshes, ...targets], false);
    return hits.find(h => h.object.visible !== false) || null;
  }

  animate(dt, player) {
    const m = this.models[this.key];
    const speed = player.onGround ? Math.hypot(player.vel.x, player.vel.z) : 0;
    this.bobT += dt * speed * 1.6;
    const bob = Math.min(1, speed / 6);
    const reloadDip = this.reloading > 0 ? Math.sin(Math.min(1, (this.current.reload - this.reloading) / this.current.reload) * Math.PI) : 0;
    const scopedHide = this.scoped ? 1 : 0;

    m.position.set(
      0.22 + Math.sin(this.bobT) * 0.012 * bob,
      -0.2 + Math.abs(Math.cos(this.bobT)) * 0.012 * bob - reloadDip * 0.15 - this.switchT * 0.6 - scopedHide * 0.5,
      -0.35 + this.kick * 0.05,
    );
    m.rotation.set(this.kick * 0.08 + reloadDip * 0.6, 0, reloadDip * 0.4);
    if (this.current.melee) m.rotation.x = -this.kick * 1.1;

    const flash = m.userData.flash;
    flash.material.opacity = Math.max(0, flash.material.opacity - dt * 30);
    this.light.intensity = Math.max(0, this.light.intensity - dt * 60);
  }
}
