import * as THREE from 'three';
import { SPAWNS } from './map.js';
import { Bot, BOT_NAMES } from './bots.js';
import { WEAPONS } from './weapons.js';

export const MATCH_SECONDS = 10 * 60;
export const FRAG_LIMIT = 30;
const RESPAWN_S = 3;
const PROTECT_S = 1.5;
const END_PAUSE_S = 8;
const STATE_HZ = 20;

// Runs only on the host (or offline). Owns hp, scores, bots, spawns and the match clock.
export class Authority {
  constructor(game) {
    this.game = game;
    this.players = new Map();
    this.bots = new Map();
    this.matchLeft = MATCH_SECONDS;
    this.ended = false;
    this.endT = 0;
    this.sendT = 0;
    this.raycaster = new THREE.Raycaster();
  }

  now() { return performance.now() / 1000; }

  emit(msg, to) {
    const g = this.game;
    if (to === undefined) { g.net.broadcast(msg); g.onGameMsg(msg); }
    else if (to === g.myId) g.onGameMsg(msg);
    else g.net.sendTo(to, msg);
  }

  addPlayer(id, name, bot = false) {
    const p = { id, name, hp: 100, alive: false, kills: 0, deaths: 0, bot, ping: 0, state: { p: [0, 0, 0], y: 0, x: 0, c: 0 }, respawnAt: this.now() + 0.2, protectUntil: 0 };
    this.players.set(id, p);
    this.sendRoster();
    return p;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.bots.delete(id);
    this.sendRoster();
  }

  addBots(count, difficulty) {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const id = 'bot-' + (i + 1);
      const bot = new Bot(id, 'BOT ' + names[i % names.length], this.game.colliders, this.game.nav, difficulty);
      this.bots.set(id, bot);
      this.addPlayer(id, bot.name, true);
    }
  }

  roster() {
    return [...this.players.values()].map(p => ({ id: p.id, n: p.name, k: p.kills, d: p.deaths, a: p.alive, b: p.bot, pg: p.ping }));
  }

  sendRoster() {
    this.emit({ t: 'roster', l: this.roster(), m: { left: this.matchLeft, limit: FRAG_LIMIT, ended: this.ended } });
  }

  pickSpawn(forId) {
    const others = [...this.players.values()].filter(p => p.alive && p.id !== forId).map(p => new THREE.Vector3(...p.state.p));
    const scored = SPAWNS.map(s => ({ s, d: others.length ? Math.min(...others.map(o => o.distanceTo(s))) : Math.random() * 100 }));
    scored.sort((a, b) => b.d - a.d);
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].s.clone();
  }

  respawn(p) {
    const pos = this.pickSpawn(p.id);
    p.hp = 100;
    p.alive = true;
    p.protectUntil = this.now() + PROTECT_S;
    p.state.p = [pos.x, pos.y, pos.z];
    const bot = this.bots.get(p.id);
    if (bot) bot.spawn(pos);
    this.emit({ t: 'spawn', id: p.id, p: [pos.x, pos.y, pos.z] });
    this.sendRoster();
  }

  onClientMsg(from, msg) {
    const p = this.players.get(from);
    switch (msg.t) {
      case 'hello': {
        const name = String(msg.name || 'Jogador').slice(0, 16);
        if (p) { p.name = name; this.sendRoster(); break; }
        this.emit({ t: 'welcome', id: from }, from);
        this.addPlayer(from, name);
        break;
      }
      case 'st':
        if (!p) break;
        p.state = { p: msg.p, y: msg.y, x: msg.x, c: msg.c };
        p.ping = msg.pg | 0;
        break;
      case 'shot':
        if (!p || !p.alive) break;
        this.game.net.broadcast({ ...msg, id: from }, from);
        if (from !== this.game.myId) this.game.onGameMsg({ ...msg, id: from });
        this.alertBots(new THREE.Vector3(...msg.o));
        break;
      case 'hit':
        this.applyDamage(from, msg.target, Math.min(150, msg.dmg | 0), !!msg.head, msg.w);
        break;
      case 'ping':
        this.emit({ t: 'pong', ts: msg.ts }, from);
        break;
    }
  }

  alertBots(pos) {
    for (const b of this.bots.values()) b.hear(pos);
  }

  applyDamage(fromId, targetId, dmg, head, weaponKey) {
    if (this.ended) return;
    const a = this.players.get(fromId), t = this.players.get(targetId);
    if (!a || !t || !a.alive || !t.alive || dmg <= 0 || fromId === targetId) return;
    if (this.now() < t.protectUntil) return;
    t.hp = Math.max(0, t.hp - dmg);
    this.emit({ t: 'hp', id: targetId, hp: t.hp, from: a.state.p }, t.bot ? this.game.myId : targetId);
    if (t.hp > 0) return;

    t.alive = false;
    t.deaths++;
    a.kills++;
    t.respawnAt = this.now() + RESPAWN_S;
    const bot = this.bots.get(targetId);
    if (bot) bot.body.alive = false;
    this.emit({ t: 'kill', k: fromId, v: targetId, w: weaponKey, h: head });
    this.sendRoster();
    if (a.kills >= FRAG_LIMIT) this.endMatch();
  }

  endMatch() {
    if (this.ended) return;
    this.ended = true;
    this.endT = END_PAUSE_S;
    const ranked = [...this.players.values()].sort((x, y) => y.kills - x.kills || x.deaths - y.deaths);
    const w = ranked[0];
    this.emit({ t: 'end', winner: w ? w.name : '-', kills: w ? w.kills : 0, wait: END_PAUSE_S });
    this.sendRoster();
  }

  resetMatch() {
    this.ended = false;
    this.matchLeft = MATCH_SECONDS;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0;
      this.respawn(p);
    }
    this.emit({ t: 'newmatch' });
  }

  // ---------- bot support ----------
  eyeOf(p) {
    const s = p.state;
    return new THREE.Vector3(s.p[0], s.p[1] + 1.62 - 0.57 * (s.c || 0), s.p[2]);
  }

  los(a, b) {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    this.raycaster.set(a, dir.normalize());
    this.raycaster.far = dist;
    return this.raycaster.intersectObjects(this.game.mapMeshes, false).length === 0;
  }

  botFire(bot, dirs) {
    const w = bot.weapon;
    const origin = bot.eye();
    const targets = this.game.allHitboxes().filter(h => h.userData.playerId !== bot.id && h.visible);
    const ends = [];
    for (const dir of dirs) {
      this.raycaster.set(origin, dir);
      this.raycaster.far = w.range;
      const hit = this.raycaster.intersectObjects([...this.game.mapMeshes, ...targets], false)[0];
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, w.range);
      ends.push([+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)]);
      if (hit && hit.object.userData.playerId) {
        const head = hit.object.userData.part === 'head';
        const dmg = Math.round(w.dmg * (head ? w.head : 1) * Math.pow(0.985, hit.distance / 10));
        this.applyDamage(bot.id, hit.object.userData.playerId, dmg, head, bot.weaponKey);
      }
    }
    const msg = { t: 'shot', id: bot.id, o: [origin.x, origin.y, origin.z], e: ends, w: bot.weaponKey };
    this.game.net.broadcast(msg);
    this.game.onGameMsg(msg);
    this.alertBots(origin);
  }

  tick(dt) {
    const now = this.now();

    if (this.ended) {
      this.endT -= dt;
      if (this.endT <= 0) this.resetMatch();
    } else {
      this.matchLeft -= dt;
      if (this.matchLeft <= 0) { this.matchLeft = 0; this.endMatch(); }
    }

    for (const p of this.players.values()) {
      if (!p.alive && now >= p.respawnAt && !this.ended) this.respawn(p);
    }

    if (this.bots.size) {
      const enemies = [...this.players.values()].map(p => ({
        id: p.id, alive: p.alive, pos: new THREE.Vector3(...p.state.p), eye: this.eyeOf(p), crouch: (p.state.c || 0) > 0.5,
      }));
      const world = { enemies, los: (a, b) => this.los(a, b), fire: (bot, dirs) => this.botFire(bot, dirs) };
      for (const bot of this.bots.values()) {
        if (this.ended) continue;
        bot.update(dt, world);
        const p = this.players.get(bot.id);
        if (p) p.state = bot.state();
      }
    }

    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / STATE_HZ;
      const l = [];
      for (const p of this.players.values()) {
        const s = p.state;
        l.push([p.id, s.p.map(v => +v.toFixed(3)), +s.y.toFixed(3), +s.x.toFixed(3), +(s.c || 0).toFixed(2)]);
      }
      const msg = { t: 'sts', l };
      this.game.net.broadcast(msg);
      this.game.onGameMsg(msg);
    }
  }
}

export function weaponName(key) {
  return WEAPONS[key]?.name || key || '';
}
