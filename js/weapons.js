import * as THREE from 'three';
import { playShot, playReload, playEmpty, playSwish } from './audio.js';

// rec: [upPerShot, shotsUntilPlateau, sideAmplitude, sideFrequency, viewKick]
const R = {
  ak:      [0.011, 9, 0.028, 0.55, 0.012],
  m4:      [0.009, 9, 0.020, 0.60, 0.010],
  mid:     [0.009, 8, 0.022, 0.60, 0.010],
  smg:     [0.006, 8, 0.015, 0.90, 0.007],
  p90:     [0.004, 10, 0.012, 0.80, 0.006],
  pistol:  [0.012, 5, 0, 0, 0.022],
  deagle:  [0.035, 3, 0.010, 1.0, 0.050],
  sniper:  [0, 0, 0, 0, 0.060],
  shotgun: [0, 0, 0, 0, 0.050],
};

// team: 'T' | 'CT' | undefined (both). reward = kill reward in competitive.
export const WEAPONS = {
  // pistols
  glock:  { name: 'G-9',          type: 'pistol', slot: 2, price: 200,  team: 'T',  reward: 300, sound: 'pistol', auto: false, dmg: 30,  head: 4,   pen: 0.47,  interval: 0.15, mag: 20, reserve: 120, reload: 2.2, spread: 0.005, moveSpread: 0.025, airSpread: 0.1,  rec: R.pistol, range: 100, speedMul: 1.0,  color: '#2a2a2a' },
  usp:    { name: 'Guardian-S',   type: 'pistol', slot: 2, price: 200,  team: 'CT', reward: 300, sound: 'pistol', auto: false, dmg: 35,  head: 4,   pen: 0.505, interval: 0.17, mag: 12, reserve: 24,  reload: 2.2, spread: 0.003, moveSpread: 0.025, airSpread: 0.1,  rec: R.pistol, range: 100, speedMul: 1.0,  color: '#1f2226' },
  p250:   { name: 'Compact-25',   type: 'pistol', slot: 2, price: 300,               reward: 300, sound: 'pistol', auto: false, dmg: 38,  head: 4,   pen: 0.64,  interval: 0.15, mag: 13, reserve: 26,  reload: 2.2, spread: 0.005, moveSpread: 0.03,  airSpread: 0.1,  rec: R.pistol, range: 100, speedMul: 1.0,  color: '#3a3f44' },
  deagle: { name: 'Hand Cannon',  type: 'pistol', slot: 2, price: 700,               reward: 300, sound: 'deagle', auto: false, dmg: 63,  head: 4,   pen: 0.93,  interval: 0.27, mag: 7,  reserve: 35,  reload: 2.2, spread: 0.004, moveSpread: 0.07,  airSpread: 0.15, rec: R.deagle, range: 150, speedMul: 0.98, color: '#8a8d90' },
  // smgs
  mac10:  { name: 'Viper',        type: 'smg', slot: 1, price: 1050, team: 'T',  reward: 600, sound: 'smg', auto: true, dmg: 29, head: 4, pen: 0.575, interval: 0.075, mag: 30, reserve: 100, reload: 2.6, spread: 0.009, moveSpread: 0.02, airSpread: 0.1, rec: R.smg, range: 70, speedMul: 0.96, color: '#2b2f36' },
  mp9:    { name: 'Hornet',       type: 'smg', slot: 1, price: 1250, team: 'CT', reward: 600, sound: 'smg', auto: true, dmg: 26, head: 4, pen: 0.6,   interval: 0.07,  mag: 30, reserve: 120, reload: 2.1, spread: 0.008, moveSpread: 0.02, airSpread: 0.1, rec: R.smg, range: 70, speedMul: 0.96, color: '#23262b' },
  p90:    { name: 'Buzzsaw',      type: 'smg', slot: 1, price: 2350,             reward: 300, sound: 'smg', auto: true, dmg: 26, head: 4, pen: 0.69,  interval: 0.07,  mag: 50, reserve: 100, reload: 3.3, spread: 0.008, moveSpread: 0.018, airSpread: 0.1, rec: R.p90, range: 80, speedMul: 0.92, color: '#3b4038' },
  // heavy
  nova:   { name: 'Breacher',     type: 'shotgun', slot: 1, price: 1050, reward: 900, sound: 'shotgun', auto: false, dmg: 26, head: 2, pen: 0.5, interval: 0.88, mag: 8, reserve: 32, reload: 3.0, spread: 0.07, moveSpread: 0.02, airSpread: 0.05, rec: R.shotgun, range: 35, speedMul: 0.88, pellets: 9, color: '#4a3a2a' },
  // rifles
  galil:  { name: 'Raider',       type: 'rifle', slot: 1, price: 1800, team: 'T',  reward: 300, sound: 'rifle', auto: true, dmg: 30, head: 4, pen: 0.775, interval: 0.09, mag: 35, reserve: 90, reload: 3.0, spread: 0.005, moveSpread: 0.06, airSpread: 0.15, rec: R.mid, range: 200, speedMul: 0.86, color: '#4a4436' },
  famas:  { name: 'Falcon',       type: 'rifle', slot: 1, price: 2050, team: 'CT', reward: 300, sound: 'rifle', auto: true, dmg: 30, head: 4, pen: 0.7,   interval: 0.09, mag: 25, reserve: 90, reload: 3.3, spread: 0.005, moveSpread: 0.06, airSpread: 0.15, rec: R.mid, range: 200, speedMul: 0.88, color: '#2f3338' },
  ak47:   { name: 'AR-7',         type: 'rifle', slot: 1, price: 2700, team: 'T',  reward: 300, sound: 'rifle', auto: true, dmg: 36, head: 4, pen: 0.775, interval: 0.1,  mag: 30, reserve: 90, reload: 2.5, spread: 0.003, moveSpread: 0.07, airSpread: 0.15, rec: R.ak, range: 200, speedMul: 0.86, color: '#5a3d22' },
  m4:     { name: 'Sentinel M4',  type: 'rifle', slot: 1, price: 3100, team: 'CT', reward: 300, sound: 'rifleS', auto: true, dmg: 33, head: 4, pen: 0.7,  interval: 0.09, mag: 30, reserve: 90, reload: 3.1, spread: 0.003, moveSpread: 0.065, airSpread: 0.15, rec: R.m4, range: 200, speedMul: 0.9, color: '#2b2e33' },
  ssg:    { name: 'Scout',        type: 'sniper', slot: 1, price: 1700, reward: 300, sound: 'scout', auto: false, dmg: 88,  head: 2.5, pen: 0.85,  interval: 1.25, mag: 10, reserve: 90, reload: 3.7, spread: 0.0008, moveSpread: 0.05, airSpread: 0.02, rec: R.sniper, range: 300, speedMul: 0.96, scope: true, unscopedSpread: 0.04, color: '#3c4a3a' },
  awp:    { name: 'Longbow',      type: 'sniper', slot: 1, price: 4750, reward: 100, sound: 'sniper', auto: false, dmg: 115, head: 4,  pen: 0.975, interval: 1.45, mag: 5,  reserve: 30, reload: 3.6, spread: 0.0005, moveSpread: 0.12, airSpread: 0.3,  rec: R.sniper, range: 300, speedMul: 0.8, scope: true, unscopedSpread: 0.08, color: '#2f4a33' },
  // melee / utility
  knife:  { name: 'Faca',         type: 'knife', slot: 3, reward: 1500, auto: true, dmg: 55, head: 1, pen: 0.85, interval: 0.55, range: 2.0, speedMul: 1.04, color: '#999' },
  he:     { name: 'Granada HE',   type: 'grenade', slot: 4, price: 300, reward: 300, max: 1, speedMul: 1.0, color: '#3d5a2c' },
  flash:  { name: 'Flash',        type: 'grenade', slot: 4, price: 200, max: 2, speedMul: 1.0, color: '#c9c9c9' },
  smoke:  { name: 'Fumaça',       type: 'grenade', slot: 4, price: 300, max: 1, speedMul: 1.0, color: '#6b7a86' },
  c4:     { name: 'Bomba',        type: 'bomb', slot: 5, speedMul: 1.0, color: '#6b5a3a' },
};

export const EQUIPMENT = {
  vest:     { name: 'Colete', price: 650 },
  vesthelm: { name: 'Colete + Capacete', price: 1000 },
  kit:      { name: 'Kit de desarme', price: 400, team: 'CT' },
};

export const BUY_MENU = [
  { title: 'Pistolas', items: ['glock', 'usp', 'p250', 'deagle'] },
  { title: 'Submetralhadoras', items: ['mac10', 'mp9', 'p90'] },
  { title: 'Pesadas', items: ['nova'] },
  { title: 'Rifles', items: ['galil', 'famas', 'ak47', 'm4', 'ssg', 'awp'] },
  { title: 'Equipamento', items: ['vest', 'vesthelm', 'kit'] },
  { title: 'Granadas', items: ['he', 'flash', 'smoke'] },
];

export const DM_PRIMARIES = ['ak47', 'm4', 'awp', 'mp9', 'p90', 'nova', 'ssg', 'galil'];
export const GRENADE_ORDER = ['he', 'flash', 'smoke'];
export const DEFAULT_PISTOL = { T: 'glock', CT: 'usp' };

export function itemInfo(key) { return WEAPONS[key] || EQUIPMENT[key]; }

function recoilOffset(rec, i) {
  const [up, plateau, amp, freq] = rec;
  const pUp = Math.min(i, plateau) * up;
  const pSide = i > plateau ? Math.sin((i - plateau) * freq) * amp : (i > 3 ? (i - 3) * amp * 0.07 : 0);
  return [pUp, pSide];
}

// ---------- first-person models ----------
const matCache = {};
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4, ...opts }));
}

function buildViewModel(key, gloveColor) {
  const w = WEAPONS[key];
  const g = new THREE.Group();
  const body = mat(w.color);
  const metal = mat('#1a1a1a', { roughness: 0.4, metalness: 0.8 });
  const wood = mat('#6b4a2a', { metalness: 0.1, roughness: 0.8 });
  const glove = mat(gloveColor, { metalness: 0, roughness: 0.9 });
  const sleeve = mat(gloveColor === '#1e2a3a' ? '#2c3e5a' : '#6a5a3e', { metalness: 0, roughness: 0.9 });
  const box = (sx, sy, sz, m, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.rotation.x = rx; g.add(b); return b; };

  let muzzleZ = -0.7;
  switch (w.type) {
    case 'knife': {
      box(0.03, 0.035, 0.13, metal, 0, 0, 0);
      box(0.01, 0.045, 0.24, mat('#cfd4da', { metalness: 0.9, roughness: 0.2 }), 0, 0.005, -0.19, 0.05);
      muzzleZ = -0.3;
      break;
    }
    case 'pistol': {
      const big = key === 'deagle';
      box(0.05, 0.07, big ? 0.28 : 0.22, body, 0, 0, -0.1);
      box(0.045, 0.12, 0.06, metal, 0, -0.08, -0.02, 0.25);
      muzzleZ = big ? -0.26 : -0.22;
      break;
    }
    case 'grenade': {
      const s = new THREE.Mesh(key === 'smoke' ? new THREE.CylinderGeometry(0.04, 0.04, 0.12, 12) : new THREE.SphereGeometry(0.05, 12, 10), body);
      s.position.set(0, 0.02, -0.12); g.add(s);
      box(0.015, 0.06, 0.03, metal, 0.03, 0.07, -0.12);
      muzzleZ = -0.15;
      break;
    }
    case 'bomb': {
      box(0.22, 0.1, 0.16, body, 0, 0, -0.12);
      box(0.12, 0.02, 0.08, mat('#1c2a1c', { emissive: '#1a5a1a', emissiveIntensity: 0.6 }), -0.03, 0.06, -0.12);
      box(0.05, 0.015, 0.05, mat('#aa2222', { emissive: '#aa0000' }), 0.07, 0.06, -0.12);
      muzzleZ = -0.2;
      break;
    }
    default: {
      const len = { smg: 0.5, shotgun: 0.8, sniper: 1.0, rifle: 0.78 }[w.type] ?? 0.75;
      box(0.06, 0.09, len * 0.55, body, 0, 0, -len * 0.3);
      box(0.03, 0.03, len * 0.5, metal, 0, 0.015, -len * 0.75);
      box(0.05, 0.14, 0.05, metal, 0, -0.1, -len * 0.2, 0.2);
      box(0.05, 0.08, 0.22, key === 'ak47' ? wood : body, 0, -0.02, 0.1);
      if (key === 'ak47' || key === 'galil') box(0.04, 0.17, 0.07, metal, 0, -0.12, -len * 0.42, -0.25);
      else if (w.type === 'rifle') box(0.04, 0.15, 0.06, metal, 0, -0.12, -len * 0.42, -0.1);
      if (key === 'ak47') box(0.065, 0.06, 0.2, wood, 0, -0.01, -len * 0.62);
      if (w.type === 'smg') box(0.035, 0.18, 0.05, metal, 0, -0.13, -len * 0.4);
      if (key === 'p90') box(0.07, 0.05, 0.3, metal, 0, 0.06, -len * 0.3);
      if (w.type === 'shotgun') box(0.05, 0.05, 0.3, wood, 0, -0.05, -len * 0.55);
      if (w.scope) {
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.32, 12), metal);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.075, -0.35); g.add(scope);
      }
      if (key === 'm4') box(0.02, 0.05, 0.03, metal, 0, 0.07, -0.05);
      muzzleZ = -len;
    }
  }
  box(0.075, 0.075, 0.4, sleeve, 0.03, -0.09, 0.28, 0.3);
  box(0.08, 0.08, 0.09, glove, 0, -0.05, 0.05);
  if (w.type === 'rifle' || w.type === 'smg' || w.type === 'shotgun' || w.type === 'sniper') {
    box(0.07, 0.07, 0.35, sleeve, -0.13, -0.12, -0.05, 0.1).rotation.y = 0.5;
    box(0.075, 0.075, 0.08, glove, -0.02, -0.08, -0.3);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  flash.position.set(0, 0.015, muzzleZ - 0.05);
  g.add(flash);
  g.userData.flash = flash;
  g.userData.muzzle = new THREE.Vector3(0, 0.015, muzzleZ);
  return g;
}

// ---------- local weapon handling ----------
export class WeaponSystem {
  constructor(camera) {
    this.camera = camera;
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.7);
    this.holder.position.set(0.04, -0.01, 0);
    camera.add(this.holder);
    this.models = {};
    this.glove = '#3a3a3a';
    this.light = new THREE.PointLight('#ffb050', 0, 6);
    this.light.position.set(0.2, -0.1, -0.8);
    camera.add(this.light);

    this.raycaster = new THREE.Raycaster();
    this.ammo = {};
    this.loadout = { primary: null, secondary: 'glock', nades: [], bomb: false };
    this.key = null;
    this.prevKey = null;
    this.mouseDown = false;
    this.scoped = false;
    this.shotIndex = 0;
    this.lastShot = 0;
    this.punch = new THREE.Vector2();
    this.kick = 0;
    this.bobT = 0;
    this.switchT = 0;
    this.reloading = 0;
    this.cooldown = 0;
    this.infiniteAmmo = false;
    this.tapUntil = 0;
  }

  pullTrigger() {
    this.mouseDown = true;
    this.tapUntil = performance.now() / 1000 + 0.25;
  }

  setGlove(color) {
    if (this.glove === color) return;
    this.glove = color;
    for (const k of Object.keys(this.models)) { this.holder.remove(this.models[k]); }
    this.models = {};
    if (this.key) this.showModel(this.key);
  }

  model(key) {
    if (!this.models[key]) {
      this.models[key] = buildViewModel(key, this.glove);
      this.models[key].visible = false;
      this.holder.add(this.models[key]);
    }
    return this.models[key];
  }

  showModel(key) {
    for (const k of Object.keys(this.models)) this.models[k].visible = false;
    this.model(key).visible = true;
  }

  // loadout: { primary, secondary, nades: [keys], bomb }
  setLoadout(lo, refill = false) {
    const prev = this.loadout;
    this.loadout = { primary: lo.primary || null, secondary: lo.secondary || null, nades: [...(lo.nades || [])], bomb: !!lo.bomb };
    for (const k of [this.loadout.primary, this.loadout.secondary]) {
      if (!k) continue;
      const w = WEAPONS[k];
      if (refill || !this.ammo[k] || (k !== prev.primary && k !== prev.secondary)) this.ammo[k] = { mag: w.mag, reserve: w.reserve };
    }
    if (!this.key || !this.owns(this.key)) this.equip(this.best());
  }

  owns(key) {
    const lo = this.loadout;
    return key === 'knife' || key === lo.primary || key === lo.secondary || (key === 'c4' && lo.bomb) || lo.nades.includes(key);
  }

  best() { return this.loadout.primary || this.loadout.secondary || 'knife'; }

  get current() { return WEAPONS[this.key] || WEAPONS.knife; }

  equip(key) {
    if (!key || !this.owns(key)) return;
    if (this.key === key && this.model(key).visible) return;
    if (this.key && this.key !== key) this.prevKey = this.key;
    this.key = key;
    this.showModel(key);
    this.reloading = 0;
    this.scoped = false;
    this.switchT = 0.35;
    this.cooldown = Math.max(this.cooldown, 0.3);
    this.shotIndex = 0;
  }

  handleKey(code) {
    const lo = this.loadout;
    if (code === 'Digit1') this.equip(lo.primary);
    else if (code === 'Digit2') this.equip(lo.secondary);
    else if (code === 'Digit3') this.equip('knife');
    else if (code === 'Digit4') {
      const owned = GRENADE_ORDER.filter(k => lo.nades.includes(k));
      if (!owned.length) return;
      const i = owned.indexOf(this.key);
      this.equip(owned[(i + 1) % owned.length]);
    } else if (code === 'Digit5') this.equip(lo.bomb ? 'c4' : null);
    else if (code === 'KeyQ') { if (this.prevKey && this.owns(this.prevKey)) this.equip(this.prevKey); }
    else if (code === 'KeyR') this.startReload();
  }

  handleWheel(dy) {
    const lo = this.loadout;
    const order = [lo.primary, lo.secondary, 'knife', ...GRENADE_ORDER.filter(k => lo.nades.includes(k)), lo.bomb ? 'c4' : null].filter(Boolean);
    const i = Math.max(0, order.indexOf(this.key));
    this.equip(order[(i + (dy > 0 ? 1 : order.length - 1)) % order.length]);
  }

  toggleScope() {
    if (this.current.scope && this.reloading <= 0) this.scoped = !this.scoped;
  }

  startReload() {
    const w = this.current, a = this.ammo[this.key];
    if (!a || this.reloading > 0 || a.mag >= w.mag || (a.reserve <= 0 && !this.infiniteAmmo)) return;
    this.reloading = w.reload;
    this.scoped = false;
    playReload();
  }

  removeGrenade(key) {
    const i = this.loadout.nades.indexOf(key);
    if (i >= 0) this.loadout.nades.splice(i, 1);
    if (!this.owns(this.key)) this.equip(this.loadout.nades.includes(key) ? key : this.best());
  }

  // returns events: shots {origin, dir, point, target, dmg, part} or {throw, key, origin, vel}
  update(dt, player, targets, mapMeshes, canFire) {
    const w = this.current;
    const a = this.ammo[this.key];
    const out = [];
    this.cooldown -= dt;
    this.switchT = Math.max(0, this.switchT - dt);

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0 && a) {
        const need = w.mag - a.mag, take = this.infiniteAmmo ? need : Math.min(need, a.reserve);
        a.mag += take;
        if (!this.infiniteAmmo) a.reserve -= take;
      }
    }

    const since = performance.now() / 1000 - this.lastShot;
    if (since > (w.interval || 0.1) * 1.8 + 0.08) this.shotIndex = Math.max(0, this.shotIndex - dt * 25);

    // a click shorter than one frame still counts
    const pulled = this.mouseDown || (this.tapUntil > performance.now() / 1000);
    if (pulled && canFire && player.alive && this.cooldown <= 0 && this.reloading <= 0 && w.type !== 'bomb') {
      this.tapUntil = 0;
      if (w.type === 'grenade') {
        out.push(this.throwGrenade(player));
        this.mouseDown = false;
      } else if (a && a.mag <= 0) {
        playEmpty();
        this.cooldown = 0.25;
        if (a.reserve > 0 || this.infiniteAmmo) this.startReload();
      } else {
        out.push(...this.fire(player, targets, mapMeshes));
        if (!w.auto) this.mouseDown = false;
      }
    }

    this.punch.multiplyScalar(Math.exp(-dt * 9));
    this.kick = Math.max(0, this.kick - dt * 8);
    this.animate(dt, player);
    return out;
  }

  throwGrenade(player) {
    const key = this.key;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch + 0.08, player.yaw, 0, 'YXZ'));
    origin.addScaledVector(dir, 0.4);
    const vel = dir.multiplyScalar(17).add(new THREE.Vector3(player.vel.x, Math.max(0, player.vel.y), player.vel.z));
    this.kick = 1;
    this.cooldown = 0.6;
    playSwish();
    this.removeGrenade(key);
    return { throw: true, key, origin, vel };
  }

  spreadFor(player) {
    const w = this.current;
    if (!w.spread) return 0;
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
    this.cooldown = w.interval;
    this.lastShot = performance.now() / 1000;

    if (w.type === 'knife') {
      const origin = this.camera.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
      const hit = this.cast(origin, dir, w.range, targets, mapMeshes);
      this.kick = 1;
      playSwish();
      if (hit && hit.object.userData.playerId) {
        const back = this.isBackstab(hit.object, dir);
        return [{ origin, dir, point: hit.point, target: hit.object.userData.playerId, dmg: back ? 180 : w.dmg, part: 'body', melee: true }];
      }
      return [{ origin, dir, point: null, melee: true }];
    }

    const a = this.ammo[this.key];
    a.mag--;
    const [pUp, pSide] = recoilOffset(w.rec, Math.floor(this.shotIndex));
    this.shotIndex++;
    const spread = this.spreadFor(player);
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const events = [];
    for (let p = 0; p < (w.pellets || 1); p++) {
      const e = new THREE.Euler(player.pitch + this.punch.x + pUp, player.yaw + this.punch.y + pSide, 0, 'YXZ');
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
      const r = Math.sqrt(Math.random()) * spread, t = Math.random() * Math.PI * 2;
      const right = new THREE.Vector3(1, 0, 0).applyEuler(e), up = new THREE.Vector3(0, 1, 0).applyEuler(e);
      dir.addScaledVector(right, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r).normalize();
      const hit = this.cast(origin, dir, w.range, targets, mapMeshes);
      const ev = { origin, dir, point: hit ? hit.point.clone() : origin.clone().addScaledVector(dir, w.range), normal: hit?.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null };
      if (hit && hit.object.userData.playerId) {
        ev.target = hit.object.userData.playerId;
        ev.part = hit.object.userData.part;
        ev.dmg = damageFor(w, ev.part, hit.distance);
      }
      events.push(ev);
    }

    const kickUp = w.rec[4];
    this.punch.x += kickUp;
    this.punch.y += (Math.random() - 0.5) * kickUp * 0.4;
    this.kick = 1;
    const m = this.model(this.key);
    m.userData.flash.material.opacity = 1;
    m.userData.flash.rotation.z = Math.random() * Math.PI;
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
    if (!this.key) return;
    const m = this.model(this.key);
    const w = this.current;
    const speed = player.onGround ? Math.hypot(player.vel.x, player.vel.z) : 0;
    this.bobT += dt * speed * 1.6;
    const bob = Math.min(1, speed / 6);
    const reloadDip = this.reloading > 0 ? Math.sin(Math.min(1, (w.reload - this.reloading) / w.reload) * Math.PI) : 0;
    const scopedHide = this.scoped ? 1 : 0;
    m.position.set(
      0.24 + Math.sin(this.bobT) * 0.012 * bob,
      -0.22 + Math.abs(Math.cos(this.bobT)) * 0.012 * bob - reloadDip * 0.15 - this.switchT * 0.6 - scopedHide * 0.5,
      -0.36 + this.kick * 0.05,
    );
    m.rotation.set(this.kick * 0.08 + reloadDip * 0.6, 0, reloadDip * 0.4);
    if (w.type === 'knife') m.rotation.x = -this.kick * 1.1;
    if (w.type === 'grenade') m.position.z -= this.kick * 0.25;
    const flash = m.userData.flash;
    flash.material.opacity = Math.max(0, flash.material.opacity - dt * 30);
    this.light.intensity = Math.max(0, this.light.intensity - dt * 60);
  }
}

// hit group multipliers like CS: head x(weapon), stomach/chest 1, legs 0.75
export function damageFor(w, part, distance) {
  const mul = part === 'head' ? w.head : part === 'legs' ? 0.75 : 1;
  return Math.round(w.dmg * mul * Math.pow(0.985, distance / 10));
}

// armor: body hits (and head with helmet) get reduced by weapon penetration; armor absorbs half the rest
export function applyArmor(dmg, part, pen, target) {
  if (!target.armor || part === 'legs' || (part === 'head' && !target.helmet)) return dmg;
  let hp = dmg * pen;
  let armorLoss = (dmg - hp) * 0.5;
  if (armorLoss > target.armor) { hp = dmg - target.armor * 2; armorLoss = target.armor; }
  target.armor = Math.max(0, Math.round(target.armor - armorLoss));
  if (target.armor === 0) target.helmet = false;
  return Math.round(hp);
}
