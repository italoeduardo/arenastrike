import * as THREE from 'three';
import { Body, RUN_SPEED } from './player.js';
import { WEAPONS, PRIMARIES } from './weapons.js';

export const BOT_NAMES = ['Zé Pequeno', 'Tonhão', 'Kleber', 'Juninho', 'Mancha', 'Bigode', 'Careca', 'Magrão', 'Tiozão', 'Neguinho', 'Baixinho', 'Alemão'];

const DIFFICULTY = {
  easy:   { reaction: 0.75, aimSpeed: 3.5, error: 0.07, head: 0.1, spreadMul: 2.2, strafe: false },
  normal: { reaction: 0.42, aimSpeed: 7,   error: 0.04, head: 0.25, spreadMul: 1.4, strafe: true },
  hard:   { reaction: 0.22, aimSpeed: 13,  error: 0.02, head: 0.45, spreadMul: 1.0, strafe: true },
};

const ORIGIN_UP = new THREE.Vector3(0, 1, 0);

export class NavGraph {
  constructor(waypoints, colliders) {
    this.nodes = waypoints;
    this.adj = waypoints.map(() => []);
    const probe = new THREE.Box3();
    const clear = (a, b) => {
      const d = a.distanceTo(b), steps = Math.ceil(d / 0.5);
      for (let i = 1; i < steps; i++) {
        const p = a.clone().lerp(b, i / steps);
        probe.min.set(p.x - 0.45, 0.6, p.z - 0.45);
        probe.max.set(p.x + 0.45, 1.7, p.z + 0.45);
        if (colliders.some(c => c.intersectsBox(probe))) return false;
      }
      return true;
    };
    for (let i = 0; i < waypoints.length; i++) {
      for (let j = i + 1; j < waypoints.length; j++) {
        const d = waypoints[i].distanceTo(waypoints[j]);
        if (d < 5.8 && clear(waypoints[i], waypoints[j])) {
          this.adj[i].push(j); this.adj[j].push(i);
        }
      }
    }
  }

  nearest(p) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  path(fromPos, toPos) {
    const s = this.nearest(fromPos), g = this.nearest(toPos);
    const nodes = this.nodes;
    const open = new Set([s]);
    const came = new Map();
    const gScore = new Map([[s, 0]]);
    const f = new Map([[s, nodes[s].distanceTo(nodes[g])]]);
    let guard = 0;
    while (open.size && guard++ < 4000) {
      let cur = -1, cf = Infinity;
      for (const n of open) { const v = f.get(n); if (v < cf) { cf = v; cur = n; } }
      if (cur === g) {
        const out = [nodes[cur]];
        while (came.has(cur)) { cur = came.get(cur); out.unshift(nodes[cur]); }
        return out;
      }
      open.delete(cur);
      for (const nb of this.adj[cur]) {
        const t = gScore.get(cur) + nodes[cur].distanceTo(nodes[nb]);
        if (t < (gScore.get(nb) ?? Infinity)) {
          came.set(nb, cur); gScore.set(nb, t);
          f.set(nb, t + nodes[nb].distanceTo(nodes[g]));
          open.add(nb);
        }
      }
    }
    return [nodes[g]];
  }

  random() { return this.nodes[Math.floor(Math.random() * this.nodes.length)]; }
}

export class Bot {
  constructor(id, name, colliders, nav, difficulty = 'normal') {
    this.id = id;
    this.name = name;
    this.nav = nav;
    this.body = new Body(colliders);
    this.cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.pickWeapon();
    this.path = [];
    this.repathT = 0;
    this.enemy = null;
    this.seenT = 0;
    this.lastSeen = null;
    this.lastSeenT = 0;
    this.cooldown = 0;
    this.burst = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.stuckPos = new THREE.Vector3();
    this.aimErr = new THREE.Vector2();
    this.aimHead = false;
    this.reloadT = 0;
    this.thinkT = 0;
    this.heard = null;
  }

  pickWeapon() {
    this.weaponKey = PRIMARIES[Math.floor(Math.random() * PRIMARIES.length)];
    this.mag = WEAPONS[this.weaponKey].mag;
  }

  get weapon() { return WEAPONS[this.weaponKey]; }

  spawn(p) {
    this.body.spawn(p);
    this.path = [];
    this.enemy = null;
    this.lastSeen = null;
    this.heard = null;
    this.pickWeapon();
    this.reloadT = 0;
  }

  eye() { return this.body.pos.clone().add(new THREE.Vector3(0, this.body.eyeHeight, 0)); }

  hear(pos) {
    if (!this.enemy && this.body.pos.distanceTo(pos) < 45) this.heard = pos.clone();
  }

  // world: { enemies: [{id, pos, eye, alive}], los(a,b), fire(bot, dir) }
  update(dt, world) {
    const b = this.body;
    if (!b.alive) return;
    this.cooldown -= dt;
    this.thinkT -= dt;

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.mag = this.weapon.mag;
    }

    if (this.thinkT <= 0) {
      this.thinkT = 0.15;
      const eye = this.eye();
      let best = null, bd = Infinity;
      for (const e of world.enemies) {
        if (!e.alive || e.id === this.id) continue;
        const d = eye.distanceTo(e.eye);
        if (d > 70 || d >= bd) continue;
        const toE = e.eye.clone().sub(eye).normalize();
        const facing = new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw));
        // limited field of view unless the enemy is very close
        if (d > 6 && facing.dot(new THREE.Vector3(toE.x, 0, toE.z).normalize()) < 0.2) continue;
        if (!world.los(eye, e.eye) && !world.los(eye, e.pos.clone().add(new THREE.Vector3(0, 1.1, 0)))) continue;
        best = e; bd = d;
      }
      if (best) {
        if (!this.enemy || this.enemy.id !== best.id) {
          this.seenT = 0;
          this.aimErr.set((Math.random() - 0.5) * this.cfg.error * 6, (Math.random() - 0.5) * this.cfg.error * 6);
          this.aimHead = Math.random() < this.cfg.head;
        }
        this.enemy = best;
        this.lastSeen = best.pos.clone();
        this.lastSeenT = 4;
      } else {
        this.enemy = null;
      }
    }

    const wish = new THREE.Vector3();
    const maxSpeed = RUN_SPEED * this.weapon.speedMul;
    let jump = false;

    if (this.enemy) {
      this.seenT += dt;
      const e = this.enemy;
      const aimPoint = this.aimHead ? e.eye.clone().add(new THREE.Vector3(0, 0.05, 0)) : e.pos.clone().add(new THREE.Vector3(0, e.crouch ? 0.75 : 1.2, 0));
      const eye = this.eye();
      const d = aimPoint.clone().sub(eye);
      const targetYaw = Math.atan2(-d.x, -d.z) + this.aimErr.x;
      const targetPitch = Math.atan2(d.y, Math.hypot(d.x, d.z)) + this.aimErr.y;
      this.aimErr.multiplyScalar(Math.exp(-dt * 2.5));

      let dy = Math.atan2(Math.sin(targetYaw - b.yaw), Math.cos(targetYaw - b.yaw));
      const step = this.cfg.aimSpeed * dt;
      b.yaw += Math.max(-step, Math.min(step, dy));
      b.pitch += Math.max(-step, Math.min(step, targetPitch - b.pitch));
      dy = Math.atan2(Math.sin(targetYaw - b.yaw), Math.cos(targetYaw - b.yaw));
      const aimOff = Math.hypot(dy, targetPitch - b.pitch);

      const dist = d.length();
      const w = this.weapon;
      const tolerance = w.scope ? 0.02 : Math.max(0.03, 0.6 / Math.max(dist, 1));

      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = 0.35 + Math.random() * 0.5; }

      const shooting = this.seenT > this.cfg.reaction && aimOff < tolerance && this.reloadT <= 0 && this.burstPause <= 0;
      if (this.burstPause > 0) this.burstPause -= dt;

      if (!shooting && this.cfg.strafe) {
        wish.set(Math.cos(b.yaw) * this.strafeDir, 0, -Math.sin(b.yaw) * this.strafeDir);
        if (dist > 25) wish.add(new THREE.Vector3(-Math.sin(b.yaw), 0, -Math.cos(b.yaw)).multiplyScalar(0.7));
        wish.normalize();
      }

      if (shooting && this.cooldown <= 0) {
        if (this.mag <= 0) { this.reloadT = w.reload; this.burst = 0; }
        else if (b.speed < 2.5 || !this.cfg.strafe) {
          this.fire(world);
          this.burst++;
          const maxBurst = w.auto ? (dist > 20 ? 3 : 7) : 1;
          if (this.burst >= maxBurst) { this.burst = 0; this.burstPause = w.auto ? 0.25 + Math.random() * 0.3 : 0.1; }
        }
      }
    } else {
      this.seenT = 0;
      this.burst = 0;
      if (this.mag < this.weapon.mag * 0.4 && this.reloadT <= 0) this.reloadT = this.weapon.reload;

      if (this.lastSeenT > 0) this.lastSeenT -= dt;
      this.repathT -= dt;
      if (this.heard) { this.path = this.nav.path(b.pos, this.heard); this.heard = null; this.repathT = 6; }
      else if (this.lastSeen && this.lastSeenT > 0 && this.repathT < 5) { this.path = this.nav.path(b.pos, this.lastSeen); this.lastSeen = null; this.repathT = 6; }
      else if (!this.path.length || this.repathT <= 0) {
        const hunt = world.enemies.filter(e => e.alive && e.id !== this.id);
        const goal = hunt.length && Math.random() < 0.55 ? hunt[Math.floor(Math.random() * hunt.length)].pos : this.nav.random();
        this.path = this.nav.path(b.pos, goal);
        this.repathT = 7 + Math.random() * 4;
      }

      while (this.path.length && Math.hypot(this.path[0].x - b.pos.x, this.path[0].z - b.pos.z) < 1.3) this.path.shift();
      if (this.path.length) {
        const n = this.path[0];
        wish.set(n.x - b.pos.x, 0, n.z - b.pos.z).normalize();
        const targetYaw = Math.atan2(-wish.x, -wish.z);
        const dy = Math.atan2(Math.sin(targetYaw - b.yaw), Math.cos(targetYaw - b.yaw));
        b.yaw += dy * Math.min(1, dt * 6);
        b.pitch *= 1 - Math.min(1, dt * 4);
      }

      this.stuckT += dt;
      if (this.stuckT > 1) {
        if (wish.lengthSq() > 0 && this.stuckPos.distanceTo(b.pos) < 0.6) { jump = true; this.path = []; }
        this.stuckPos.copy(b.pos);
        this.stuckT = 0;
      }
    }

    b.simulate(dt, { wish, maxSpeed, jump, crouch: false });
  }

  fire(world) {
    const b = this.body, w = this.weapon;
    this.cooldown = w.interval;
    this.mag--;
    const pellets = w.pellets || 1;
    const spread = (w.spread + (b.speed > 2 ? w.moveSpread * 0.6 : 0) + (w.scope ? 0.004 : 0)) * this.cfg.spreadMul + this.burst * 0.004;
    const dirs = [];
    const e = new THREE.Euler(b.pitch, b.yaw, 0, 'YXZ');
    const right = new THREE.Vector3(1, 0, 0).applyEuler(e);
    const up = ORIGIN_UP.clone().applyEuler(e);
    for (let i = 0; i < pellets; i++) {
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(e);
      const r = Math.sqrt(Math.random()) * spread, t = Math.random() * Math.PI * 2;
      dir.addScaledVector(right, Math.cos(t) * r).addScaledVector(up, Math.sin(t) * r).normalize();
      dirs.push(dir);
    }
    world.fire(this, dirs);
  }

  state() {
    const b = this.body;
    return { p: [b.pos.x, b.pos.y, b.pos.z], y: b.yaw, x: b.pitch, c: b.crouch };
  }
}
