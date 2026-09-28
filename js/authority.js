import * as THREE from 'three';
import { Bot, BOT_NAMES, NavGraph } from './bots.js';
import { WEAPONS, applyArmor, damageFor, DM_PRIMARIES } from './weapons.js';
import { stepGrenade, shouldDetonate, segmentHitsSmoke, SMOKE_TIME } from './grenades.js';

export const DM_SECONDS = 10 * 60;
export const DM_FRAG_LIMIT = 30;
const STATE_HZ = 20;

// Runs only on the host (or offline): owns hp, armor, scores, bots and grenades.
// Free-for-all deathmatch lives here; the bomb mode extends it in competitive.js.
export class Authority {
  constructor(game, opts) {
    this.game = game;
    this.opts = opts;
    this.mode = 'dm';
    this.players = new Map();
    this.bots = new Map();
    this.nades = [];
    this.smokes = [];
    this.nadeId = 1;
    this.matchLeft = DM_SECONDS;
    this.ended = false;
    this.endT = 0;
    this.sendT = 0;
    this.spotT = 0;
    this.raycaster = new THREE.Raycaster();
    this.nav = new NavGraph(game.world.waypoints, game.world.colliders);
  }

  now() { return performance.now() / 1000; }
  get info() { return this.game.world.info; }

  emit(msg, to) {
    const g = this.game;
    if (to === undefined) { g.net.broadcast(msg); g.onGameMsg(msg); }
    else if (to === g.myId) g.onGameMsg(msg);
    else g.net.sendTo(to, msg);
  }

  // ---------- players ----------
  newPlayer(id, name, bot, team) {
    return {
      id, name, bot, team, hp: 100, armor: 0, helmet: false, kit: false, alive: false,
      kills: 0, assists: 0, deaths: 0, ping: 0, money: 0,
      inv: { primary: null, secondary: null, nades: [], bomb: false },
      state: { p: [0, 0, 0], y: 0, x: 0, c: 0, w: 'knife' },
      respawnAt: this.now() + 0.3, protectUntil: 0, dmgBy: new Map(), spotted: 0,
    };
  }

  addPlayer(id, name, bot = false, team = null) {
    const p = this.newPlayer(id, name, bot, team);
    this.players.set(id, p);
    this.sendRoster();
    return p;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.bots.delete(id);
    this.sendRoster();
  }

  makeBot(id, name, team) {
    const bot = new Bot(id, name, this.game.world.colliders, this.nav, this.opts.difficulty, team);
    this.bots.set(id, bot);
    return this.addPlayer(id, name, true, team);
  }

  addBots(count) {
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) this.makeBot('bot-' + (i + 1), 'BOT ' + names[i % names.length], null);
  }

  roster() {
    return [...this.players.values()].map(p => ({ id: p.id, n: p.name, k: p.kills, as: p.assists, d: p.deaths, a: p.alive, b: p.bot, pg: p.ping, tm: p.team, m: p.money }));
  }

  sendRoster() {
    this.emit({ t: 'roster', l: this.roster(), m: this.matchInfo() });
  }

  matchInfo() {
    return { mode: 'dm', left: this.matchLeft, limit: DM_FRAG_LIMIT, ended: this.ended };
  }

  sendInv(p) {
    if (p.bot) return;
    this.emit({ t: 'inv', ...p.inv, ar: p.armor, hm: p.helmet, kit: p.kit, m: p.money, hp: p.hp }, p.id);
  }

  pickSpawn(forId) {
    const others = [...this.players.values()].filter(p => p.alive && p.id !== forId).map(p => new THREE.Vector3(...p.state.p));
    const scored = this.info.dmSpawns.map(a => new THREE.Vector3(...a)).map(s => ({ s, d: others.length ? Math.min(...others.map(o => o.distanceTo(s))) : Math.random() * 100 }));
    scored.sort((a, b) => b.d - a.d);
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].s.clone();
  }

  placePlayer(p, pos) {
    p.hp = 100;
    p.alive = true;
    p.dmgBy.clear();
    p.state.p = [pos.x, pos.y, pos.z];
    p.state.y = Math.atan2(pos.x, pos.z);
    const bot = this.bots.get(p.id);
    if (bot) { bot.spawn(pos); bot.body.yaw = p.state.y; }
    this.emit({ t: 'spawn', id: p.id, p: [pos.x, pos.y, pos.z], y: p.state.y });
  }

  respawn(p) {
    p.protectUntil = this.now() + 1.5;
    if (p.bot) this.bots.get(p.id).setWeapon(DM_PRIMARIES[Math.floor(Math.random() * DM_PRIMARIES.length)]);
    this.placePlayer(p, this.pickSpawn(p.id));
    this.sendRoster();
  }

  isEnemy(a, b) {
    return a.id !== b.id && (!a.team || a.team !== b.team);
  }

  // ---------- messages from players ----------
  onClientMsg(from, msg) {
    const p = this.players.get(from);
    switch (msg.t) {
      case 'hello': {
        const name = String(msg.name || 'Jogador').slice(0, 16);
        if (p) { p.name = name; this.sendRoster(); break; }
        this.emit({ t: 'welcome', id: from, mode: this.mode, map: this.game.world.key }, from);
        this.onJoin(from, name, msg.team);
        break;
      }
      case 'st':
        if (!p) break;
        p.state = { p: msg.p, y: msg.y, x: msg.x, c: msg.c, w: WEAPONS[msg.w] ? msg.w : p.state.w };
        p.ping = msg.pg | 0;
        break;
      case 'shot':
        if (!p || !p.alive) break;
        this.game.net.broadcast({ ...msg, id: from }, from);
        if (from !== this.game.myId) this.game.onGameMsg({ ...msg, id: from });
        this.alertBots(new THREE.Vector3(...msg.o));
        break;
      case 'hit':
        if (!p || !WEAPONS[msg.w]) break;
        this.applyDamage(from, msg.target, Math.min(200, msg.dmg | 0), msg.part, msg.w);
        break;
      case 'throw':
        if (!p || !p.alive) break;
        this.throwNade(p, msg.k, msg.o, msg.v);
        break;
      case 'ping':
        this.emit({ t: 'pong', ts: msg.ts }, from);
        break;
    }
  }

  onJoin(id, name) {
    this.addPlayer(id, name);
  }

  alertBots(pos) {
    for (const b of this.bots.values()) b.hear(pos);
  }

  // ---------- damage ----------
  canDamage(a, t) {
    return this.isEnemy(a, t);
  }

  applyDamage(fromId, targetId, dmg, part, weaponKey) {
    if (this.ended) return;
    const a = this.players.get(fromId), t = this.players.get(targetId);
    if (!a || !t || !t.alive || dmg <= 0) return;
    if (weaponKey !== 'he' && !a.alive) return;
    if (!this.canDamage(a, t) || this.now() < t.protectUntil) return;
    const w = WEAPONS[weaponKey];
    const real = Math.min(t.hp, applyArmor(dmg, part, w?.pen ?? 1, t));
    t.hp -= real;
    t.dmgBy.set(fromId, (t.dmgBy.get(fromId) || 0) + real);
    const from = a.state.p;
    this.emit({ t: 'hp', id: targetId, hp: t.hp, ar: t.armor, hm: t.helmet, from }, t.bot ? this.game.myId : targetId);
    if (t.hp <= 0) this.kill(a, t, weaponKey, part === 'head');
  }

  kill(a, t, weaponKey, head) {
    t.alive = false;
    t.hp = 0;
    t.deaths++;
    if (a && a.id !== t.id) a.kills++;
    for (const [id, d] of t.dmgBy) {
      if (d >= 41 && id !== a?.id) { const as = this.players.get(id); if (as) as.assists++; }
    }
    t.respawnAt = this.now() + 3;
    const bot = this.bots.get(t.id);
    if (bot) bot.body.alive = false;
    const dir = a ? [t.state.p[0] - a.state.p[0], t.state.p[2] - a.state.p[2]] : [0, 1];
    this.emit({ t: 'kill', k: a ? a.id : null, v: t.id, w: weaponKey, h: head, dir });
    this.onKill(a, t, weaponKey);
    this.sendRoster();
  }

  onKill(a) {
    if (a && a.kills >= DM_FRAG_LIMIT) this.endMatch();
  }

  endMatch() {
    if (this.ended) return;
    this.ended = true;
    this.endT = 8;
    const ranked = [...this.players.values()].sort((x, y) => y.kills - x.kills || x.deaths - y.deaths);
    const w = ranked[0];
    this.emit({ t: 'end', winner: w ? `${w.name} venceu com ${w.kills} abates` : '-', wait: 8 });
    this.sendRoster();
  }

  resetMatch() {
    this.ended = false;
    this.matchLeft = DM_SECONDS;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.assists = 0;
      this.respawn(p);
    }
    this.emit({ t: 'newmatch' });
  }

  // ---------- grenades ----------
  throwNade(p, key, o, v) {
    if (!['he', 'flash', 'smoke'].includes(key)) return;
    if (this.mode === 'comp') {
      const i = p.inv.nades.indexOf(key);
      if (i < 0) return;
      p.inv.nades.splice(i, 1);
    }
    const id = this.nadeId++;
    this.nades.push({ id, key, by: p.id, pos: new THREE.Vector3(...o), vel: new THREE.Vector3(...v), t: 0 });
    this.emit({ t: 'nade', id, k: key, o, v, by: p.id });
  }

  detonate(n) {
    const p = n.pos;
    this.emit({ t: 'boom', id: n.id, k: n.key, p: [p.x, p.y, p.z] });
    this.alertBots(p);
    const thrower = this.players.get(n.by);
    if (n.key === 'smoke') { this.smokes.push({ p: p.clone(), until: this.now() + SMOKE_TIME }); return; }
    for (const t of this.players.values()) {
      if (!t.alive) continue;
      const pos = new THREE.Vector3(...t.state.p);
      if (n.key === 'he') {
        const chest = pos.clone().add(new THREE.Vector3(0, 1, 0));
        const d = chest.distanceTo(p);
        if (d > 8 || !this.mapLos(p.clone().add(new THREE.Vector3(0, 0.3, 0)), chest)) continue;
        const dmg = Math.round(98 * Math.pow(1 - d / 8, 1.3));
        if (thrower && t.id !== thrower.id) this.applyDamage(thrower.id, t.id, dmg, 'body', 'he');
      } else {
        const eye = this.eyeOf(t);
        const d = eye.distanceTo(p);
        if (d > 30 || !this.los(p.clone().add(new THREE.Vector3(0, 0.2, 0)), eye)) continue;
        const view = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(t.state.x, t.state.y, 0, 'YXZ'));
        const facing = view.dot(p.clone().sub(eye).normalize());
        const strength = facing > 0.5 ? 1 : facing > 0 ? 0.6 : facing > -0.4 ? 0.3 : 0.1;
        const dur = 4.8 * strength * Math.max(0, 1 - d / 32);
        if (dur < 0.25) continue;
        if (t.bot) this.bots.get(t.id).blindUntil = this.now() + dur * 0.8;
        else this.emit({ t: 'flashed', dur }, t.id);
      }
    }
  }

  // ---------- line of sight ----------
  eyeOf(p) {
    const s = p.state;
    return new THREE.Vector3(s.p[0], s.p[1] + 1.62 - 0.57 * (s.c || 0), s.p[2]);
  }

  mapLos(a, b) {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    this.raycaster.set(a, dir.normalize());
    this.raycaster.far = dist;
    return this.raycaster.intersectObjects(this.game.world.meshes, false).length === 0;
  }

  los(a, b) {
    return this.mapLos(a, b) && !segmentHitsSmoke(a, b, this.smokes);
  }

  // ---------- bots ----------
  botFire(bot, dirs) {
    const w = bot.weapon;
    const origin = bot.eye();
    const me = this.players.get(bot.id);
    const targets = this.game.allHitboxes().filter(h => {
      if (!h.visible || h.userData.playerId === bot.id) return false;
      const t = this.players.get(h.userData.playerId);
      return !t || this.isEnemy(me, t);
    });
    const ends = [];
    for (const dir of dirs) {
      this.raycaster.set(origin, dir);
      this.raycaster.far = w.range;
      const hit = this.raycaster.intersectObjects([...this.game.world.meshes, ...targets], false)[0];
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, w.range);
      ends.push([+end.x.toFixed(2), +end.y.toFixed(2), +end.z.toFixed(2)]);
      if (hit && hit.object.userData.playerId) {
        const part = hit.object.userData.part;
        this.applyDamage(bot.id, hit.object.userData.playerId, damageFor(w, part, hit.distance), part, bot.weaponKey);
      }
    }
    const msg = { t: 'shot', id: bot.id, o: [origin.x, origin.y, origin.z], e: ends, w: bot.weaponKey };
    this.game.net.broadcast(msg);
    this.game.onGameMsg(msg);
    this.alertBots(origin);
  }

  botWorld() {
    const enemiesOf = new Map();
    const all = [...this.players.values()].map(p => ({
      id: p.id, team: p.team, alive: p.alive, pos: new THREE.Vector3(...p.state.p), eye: this.eyeOf(p), crouch: (p.state.c || 0) > 0.5,
    }));
    return {
      now: this.now(),
      frozen: this.ended,
      enemies: all,
      enemiesFor: bot => {
        if (!enemiesOf.has(bot.team)) enemiesOf.set(bot.team, all.filter(e => !bot.team || e.team !== bot.team));
        return enemiesOf.get(bot.team);
      },
      los: (a, b) => this.los(a, b),
      fire: (bot, dirs) => this.botFire(bot, dirs),
      objective: null,
    };
  }

  // ---------- tick ----------
  tickMatch(dt) {
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
  }

  tick(dt) {
    this.tickMatch(dt);
    const now = this.now();

    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      stepGrenade(n, dt, this.game.world.colliders);
      if (shouldDetonate(n)) { this.nades.splice(i, 1); this.detonate(n); }
    }
    this.smokes = this.smokes.filter(s => s.until > now);

    if (this.bots.size) {
      const world = this.botWorld();
      for (const bot of this.bots.values()) {
        const view = { ...world, enemies: world.enemiesFor(bot) };
        bot.update(dt, view);
        const p = this.players.get(bot.id);
        if (p) p.state = bot.state();
      }
    }

    this.spotT -= dt;
    if (this.spotT <= 0) { this.spotT = 0.25; this.updateSpotted(); }

    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / STATE_HZ;
      const l = [];
      for (const p of this.players.values()) {
        const s = p.state;
        l.push([p.id, s.p.map(v => +v.toFixed(3)), +s.y.toFixed(3), +s.x.toFixed(3), +(s.c || 0).toFixed(2), s.w, p.spotted]);
      }
      const msg = { t: 'sts', l };
      this.game.net.broadcast(msg);
      this.game.onGameMsg(msg);
    }
  }

  // bit 1: seen by a T, bit 2: seen by a CT (feeds the radar)
  updateSpotted() {
    const alive = [...this.players.values()].filter(p => p.alive);
    for (const p of alive) p.spotted = 0;
    if (!alive.some(p => p.team)) return;
    for (const a of alive) {
      const eye = this.eyeOf(a);
      for (const b of alive) {
        if (!a.team || a.team === b.team) continue;
        const bit = a.team === 'T' ? 1 : 2;
        if (b.spotted & bit) continue;
        const beye = this.eyeOf(b);
        if (eye.distanceTo(beye) < 60 && this.los(eye, beye)) b.spotted |= bit;
      }
    }
  }
}
