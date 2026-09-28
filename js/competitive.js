import * as THREE from 'three';
import { Authority } from './authority.js';
import { BOT_NAMES } from './bots.js';
import { WEAPONS, EQUIPMENT, DEFAULT_PISTOL } from './weapons.js';
import { inRect } from './map.js';

export const TIMES = { warmup: 90, freeze: 10, round: 115, bomb: 40, post: 5, buy: 20, plant: 3.2, defuse: 10, defuseKit: 5, end: 10 };
export const RULES = { win: 9, half: 8, max: 16 };
const MONEY = { start: 800, warmup: 16000, max: 16000, win: 3250, winObj: 3500, lossBase: 1400, lossStep: 500, plant: 300, defuse: 300, plantedLoss: 800 };
const other = t => (t === 'T' ? 'CT' : 'T');
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);

// Bomb defusal: TR plant at A or B, CT defend and defuse. MR16 with side swap after round 8.
export class Competitive extends Authority {
  constructor(game, opts) {
    super(game, opts);
    this.mode = 'comp';
    this.phase = opts.warmup ? 'warmup' : 'pre';
    this.phaseEnd = this.now() + (opts.warmup ? TIMES.warmup : 0.5);
    this.round = 0;
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.roundStart = 0;
    this.drops = [];
    this.dropId = 1;
    this.infoT = 0;
    this.pickT = 0;
    this.pendingSwap = false;
    this.matchWinner = null;
    this.tSite = 'A';
    this.resetBomb();
  }

  resetBomb() {
    this.bomb = { carrier: null, planted: null, explodeAt: 0, defuser: null, state: 'none' };
  }

  matchInfo() {
    return { mode: 'comp', phase: this.phase, round: this.round, score: this.score, ended: this.phase === 'end' };
  }

  // ---------- teams ----------
  teamCount(team) { return [...this.players.values()].filter(p => p.team === team).length; }

  pickTeam(pref) {
    if (pref === 'T' || pref === 'CT') return pref;
    return this.teamCount('T') <= this.teamCount('CT') ? 'T' : 'CT';
  }

  addPlayer(id, name, bot = false, team = null) {
    const p = super.addPlayer(id, name, bot, team);
    p.money = this.phase === 'warmup' ? MONEY.warmup : MONEY.start;
    this.giveDefaults(p);
    if (this.phase === 'warmup' || this.phase === 'pre') p.respawnAt = this.now() + 0.3;
    else p.respawnAt = Infinity;
    return p;
  }

  onJoin(id, name, pref) {
    const team = this.pickTeam(pref);
    // a human takes a bot's place so teams stay the same size
    if (this.teamCount(team) >= this.teamCount(other(team))) {
      const bot = [...this.players.values()].reverse().find(p => p.bot && p.team === team);
      if (bot) this.removePlayer(bot.id);
    }
    const p = this.addPlayer(id, name, false, team);
    this.sendInv(p);
    this.sendRoundInfo();
  }

  addBots(count) {
    const names = shuffle([...BOT_NAMES]);
    for (let i = 0; i < count; i++) {
      const team = this.teamCount('T') <= this.teamCount('CT') ? 'T' : 'CT';
      const p = this.makeBot('bot-' + (i + 1), 'BOT ' + names[i % names.length], team);
      p.respawnAt = this.now() + 0.3;
    }
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p && p.inv.bomb && p.alive) this.dropItem('c4', p.state.p);
    super.removePlayer(id);
    this.checkElimination();
  }

  giveDefaults(p) {
    p.inv = { primary: null, secondary: DEFAULT_PISTOL[p.team] || 'glock', nades: [], bomb: false };
    this.syncBot(p);
  }

  syncBot(p) {
    const bot = this.bots.get(p.id);
    if (bot) {
      const key = p.inv.primary || p.inv.secondary || 'knife';
      if (bot.weaponKey !== key) bot.setWeapon(key);
      bot.team = p.team;
    }
  }

  // ---------- spawning ----------
  teamSpawn(team, taken) {
    const pts = this.info.spawns[team].map(a => new THREE.Vector3(...a));
    const free = shuffle(pts).find(s => !taken.some(t => t.distanceTo(s) < 1.5));
    return free || pts[Math.floor(Math.random() * pts.length)];
  }

  respawn(p) {
    // warmup / pre-match only; during a match players come back at round start
    const taken = [...this.players.values()].filter(o => o.alive).map(o => new THREE.Vector3(...o.state.p));
    p.money = MONEY.warmup;
    p.protectUntil = this.now() + 1;
    this.placePlayer(p, this.teamSpawn(p.team, taken));
    this.sendInv(p);
    this.sendRoster();
  }

  // ---------- phases ----------
  setPhase(phase, duration) {
    this.phase = phase;
    this.phaseEnd = this.now() + duration;
    this.sendRoundInfo();
  }

  startMatch() {
    this.round = 0;
    this.score = { T: 0, CT: 0 };
    this.lossStreak = { T: 0, CT: 0 };
    this.matchWinner = null;
    this.pendingSwap = false;
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.assists = 0;
      p.money = MONEY.start;
      p.armor = 0; p.helmet = false; p.kit = false;
      p.alive = false;
      this.giveDefaults(p);
    }
    this.emit({ t: 'matchstart' });
    this.startRound();
  }

  startRound() {
    const now = this.now();
    if (this.pendingSwap) this.swapSides();
    this.round++;
    this.resetBomb();
    this.clearDrops();
    this.nades = [];
    this.smokes = [];
    this.tSite = Math.random() < 0.5 ? 'A' : 'B';

    const placed = [];
    for (const p of this.players.values()) {
      if (!p.alive) { this.giveDefaults(p); p.armor = 0; p.helmet = false; p.kit = false; }
      p.inv.bomb = false;
      p.protectUntil = 0;
      p.respawnAt = Infinity;
      const pos = this.teamSpawn(p.team, placed);
      placed.push(pos);
      this.placePlayer(p, pos);
    }
    const carrier = shuffle([...this.players.values()].filter(p => p.team === 'T'))[0];
    if (carrier) { carrier.inv.bomb = true; this.bomb.carrier = carrier.id; this.bomb.state = 'carried'; }

    let ctIndex = 0;
    for (const p of this.players.values()) {
      if (p.bot) this.botRoundSetup(p, p.team === 'CT' ? (ctIndex++ % 2 ? 'B' : 'A') : this.tSite);
      this.syncBot(p);
      this.sendInv(p);
    }
    this.roundStart = now;
    this.emit({ t: 'roundstart', n: this.round });
    this.setPhase('freeze', this.game.net.mode === 'offline' ? 7 : TIMES.freeze);
    this.sendRoster();
  }

  swapSides() {
    this.pendingSwap = false;
    this.score = { T: this.score.CT, CT: this.score.T };
    this.lossStreak = { T: 0, CT: 0 };
    for (const p of this.players.values()) {
      p.team = other(p.team);
      p.money = MONEY.start;
      p.armor = 0; p.helmet = false; p.kit = false;
      p.alive = false;
      this.giveDefaults(p);
    }
    this.emit({ t: 'halftime' });
  }

  endRound(winner, reason) {
    if (this.phase === 'post' || this.phase === 'end') return;
    const loser = other(winner);
    this.score[winner]++;
    const lossBonus = MONEY.lossBase + MONEY.lossStep * Math.min(this.lossStreak[loser], 4);
    this.lossStreak[loser]++;
    this.lossStreak[winner] = 0;
    const planted = !!this.bomb.planted;
    for (const p of this.players.values()) {
      if (p.team === winner) p.money += reason === 'bomb' || reason === 'defuse' ? MONEY.winObj : MONEY.win;
      else if (!(loser === 'T' && reason === 'time' && p.alive)) p.money += lossBonus + (loser === 'T' && planted ? MONEY.plantedLoss : 0);
      p.money = Math.min(MONEY.max, p.money);
    }
    this.bomb.defuser = null;
    this.emit({ t: 'roundend', w: winner, r: reason, sc: this.score });

    const total = this.score.T + this.score.CT;
    if (this.score[winner] >= RULES.win || total >= RULES.max) this.matchWinner = this.score.T === this.score.CT ? 'draw' : (this.score.T > this.score.CT ? 'T' : 'CT');
    else if (total === RULES.half) this.pendingSwap = true;
    this.setPhase('post', TIMES.post);
    for (const p of this.players.values()) this.sendInv(p);
    this.sendRoster();
  }

  endMatch() {
    const w = this.matchWinner;
    const text = w === 'draw' ? 'Empate' : w === 'T' ? 'Terroristas venceram a partida' : 'Contra-Terroristas venceram a partida';
    this.emit({ t: 'end', winner: `${text} (${this.score.T} x ${this.score.CT})`, team: w, wait: TIMES.end });
    this.setPhase('end', TIMES.end);
  }

  checkElimination() {
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    const alive = t => [...this.players.values()].some(p => p.team === t && p.alive);
    const tAlive = alive('T'), ctAlive = alive('CT');
    if (this.phase === 'live') {
      if (!tAlive) this.endRound('CT', 'elim');
      else if (!ctAlive) this.endRound('T', 'elim');
    } else if (!ctAlive) this.endRound('T', 'elim');
  }

  tickMatch(dt) {
    const now = this.now();
    const left = this.phaseEnd - now;
    switch (this.phase) {
      case 'warmup':
        for (const p of this.players.values()) if (!p.alive && now >= p.respawnAt) this.respawn(p);
        if (left <= 0) this.startMatch();
        break;
      case 'pre':
        if (left <= 0) this.startMatch();
        break;
      case 'freeze':
        if (left <= 0) { this.setPhase('live', TIMES.round); this.emit({ t: 'golive' }); }
        break;
      case 'live':
        if (left <= 0) this.endRound('CT', 'time');
        break;
      case 'planted':
        this.tickDefuse(now);
        if (now >= this.bomb.explodeAt && this.phase === 'planted') this.explode();
        break;
      case 'post':
        if (left <= 0) { if (this.matchWinner) this.endMatch(); else this.startRound(); }
        break;
      case 'end':
        if (left <= 0) this.startMatch();
        break;
    }
    this.pickT -= dt;
    if (this.pickT <= 0) { this.pickT = 0.1; this.autoPickup(); }
    this.infoT -= dt;
    if (this.infoT <= 0) { this.infoT = 1; this.sendRoundInfo(); }
  }

  get frozen() { return this.phase === 'freeze' || this.phase === 'end' || this.phase === 'pre'; }

  sendRoundInfo() {
    const b = this.bomb, now = this.now();
    this.emit({
      t: 'round', ph: this.phase, n: this.round, sc: this.score, left: Math.max(0, this.phaseEnd - now),
      buy: Math.max(0, this.roundStart + (this.game.net.mode === 'offline' ? 7 : TIMES.freeze) + TIMES.buy - now),
      bomb: { s: b.state, carrier: b.carrier, p: b.planted?.p, site: b.planted?.site, left: b.planted ? Math.max(0, b.explodeAt - now) : 0, def: b.defuser?.id || null, need: b.defuser?.need || 0 },
    });
  }

  // ---------- kills / economy ----------
  canDamage(a, t) {
    if (this.phase === 'post' && a.team === t.team) return false;
    return a.team !== t.team;
  }

  onKill(a, t, weaponKey) {
    if (this.phase === 'warmup') { t.respawnAt = this.now() + 2; return; }
    t.respawnAt = Infinity;
    if (a && a.team !== t.team && this.phase !== 'end') {
      a.money = Math.min(MONEY.max, a.money + (WEAPONS[weaponKey]?.reward ?? 300));
      this.sendInv(a);
    }
    const pos = t.state.p;
    const drop = t.inv.primary || (t.inv.secondary !== DEFAULT_PISTOL[t.team] ? t.inv.secondary : null);
    if (drop) this.dropItem(drop, pos, 0.6);
    if (t.inv.bomb) { this.dropItem('c4', pos); this.bomb.carrier = null; this.bomb.state = 'dropped'; }
    t.inv = { primary: null, secondary: null, nades: [], bomb: false };
    t.armor = 0; t.helmet = false; t.kit = false;
    if (this.bomb.defuser?.id === t.id) this.cancelDefuse();
    this.sendInv(t);
    this.checkElimination();
  }

  // ---------- buying ----------
  canBuy(p) {
    if (!p.alive) return false;
    if (this.phase === 'warmup') return true;
    if (this.phase !== 'freeze' && this.phase !== 'live') return false;
    const freeze = this.game.net.mode === 'offline' ? 7 : TIMES.freeze;
    if (this.now() - this.roundStart > freeze + TIMES.buy) return false;
    const zone = this.info.buyZones[p.team];
    return !zone || inRect(zone, p.state.p[0], p.state.p[2]);
  }

  buy(p, key, force = false) {
    const item = WEAPONS[key] || EQUIPMENT[key];
    if (!item || item.price === undefined) return false;
    if (!force && !this.canBuy(p)) return false;
    if (item.team && item.team !== p.team) return false;
    let price = item.price;
    const inv = p.inv;
    if (key === 'vest') { if (p.armor >= 100) return false; }
    else if (key === 'vesthelm') { if (p.helmet && p.armor >= 100) return false; if (p.armor >= 100) price = 350; }
    else if (key === 'kit') { if (p.kit) return false; }
    else if (item.type === 'grenade') {
      if (inv.nades.filter(k => k === key).length >= item.max || inv.nades.length >= 4) return false;
    } else if (inv.primary === key || inv.secondary === key) return false;
    if (p.money < price) return false;

    p.money -= price;
    if (key === 'vest') p.armor = 100;
    else if (key === 'vesthelm') { p.armor = 100; p.helmet = true; }
    else if (key === 'kit') p.kit = true;
    else if (item.type === 'grenade') inv.nades.push(key);
    else if (item.slot === 1) { if (inv.primary) this.dropItem(inv.primary, p.state.p, 0.8); inv.primary = key; }
    else if (item.slot === 2) { if (inv.secondary) this.dropItem(inv.secondary, p.state.p, 0.8); inv.secondary = key; }
    this.syncBot(p);
    if (!p.bot) this.emit({ t: 'inv', ...inv, ar: p.armor, hm: p.helmet, kit: p.kit, m: p.money, hp: p.hp, bought: key }, p.id);
    this.sendRoster();
    return true;
  }

  botRoundSetup(p, site) {
    const bot = this.bots.get(p.id);
    const rich = p.money;
    const pri = { rifle: p.team === 'T' ? 'ak47' : 'm4', cheap: p.team === 'T' ? 'galil' : 'famas', smg: p.team === 'T' ? 'mac10' : 'mp9' };
    if (!p.inv.primary) {
      if (rich >= 5750 && Math.random() < 0.2) this.buy(p, 'awp', true);
      else if (rich >= WEAPONS[pri.rifle].price + 1000) this.buy(p, pri.rifle, true);
      else if (rich >= WEAPONS[pri.cheap].price + 650) this.buy(p, pri.cheap, true);
      else if (rich >= WEAPONS[pri.smg].price + 650 && this.round > 1) this.buy(p, pri.smg, true);
      else if (rich >= 1350 && this.round > 1) this.buy(p, 'deagle', true);
    }
    if (p.money >= 1000) this.buy(p, 'vesthelm', true);
    else if (p.money >= 650) this.buy(p, 'vest', true);
    if (p.team === 'CT' && p.money >= 400 && Math.random() < 0.6) this.buy(p, 'kit', true);

    const c = this.info.siteCenters[site];
    const center = new THREE.Vector3(c[0], 0, c[1]);
    bot.site = site;
    bot.holdPoint = this.nav.randomNear(center, 7).clone();
    const ent = this.info.siteEntrances[site];
    const e = ent[Math.floor(Math.random() * ent.length)];
    bot.holdLook = new THREE.Vector3(e[0], 0, e[1]);
    bot.plantT = 0;
  }

  // ---------- drops ----------
  dropItem(key, pos, scatter = 0) {
    const a = Math.random() * Math.PI * 2;
    const p = [pos[0] + Math.cos(a) * scatter, 0.08, pos[2] + Math.sin(a) * scatter];
    this.drops.push({ id: this.dropId++, key, p });
    this.sendDrops();
  }

  clearDrops() {
    this.drops = [];
    this.sendDrops();
  }

  sendDrops() {
    this.emit({ t: 'drops', l: this.drops });
  }

  give(p, d) {
    const w = WEAPONS[d.key];
    if (d.key === 'c4') { p.inv.bomb = true; this.bomb.carrier = p.id; this.bomb.state = 'carried'; }
    else if (w.slot === 1) p.inv.primary = d.key;
    else if (w.slot === 2) p.inv.secondary = d.key;
    this.drops = this.drops.filter(x => x !== d);
    this.syncBot(p);
    this.sendInv(p);
    this.sendDrops();
    this.sendRoundInfo();
  }

  autoPickup() {
    if (!this.drops.length) return;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (const d of this.drops) {
        if (Math.hypot(d.p[0] - p.state.p[0], d.p[2] - p.state.p[2]) > 1.1) continue;
        const w = WEAPONS[d.key];
        if (d.key === 'c4' ? p.team === 'T' : (w.slot === 1 ? !p.inv.primary : !p.inv.secondary)) { this.give(p, d); return; }
      }
    }
  }

  use(p) {
    let best = null, bd = 2.2;
    for (const d of this.drops) {
      const dist = Math.hypot(d.p[0] - p.state.p[0], d.p[2] - p.state.p[2]);
      if (dist < bd && d.key !== 'c4') { bd = dist; best = d; }
    }
    if (!best) return;
    const slot = WEAPONS[best.key].slot;
    const cur = slot === 1 ? p.inv.primary : p.inv.secondary;
    if (cur) this.dropItem(cur, p.state.p, 0.5);
    if (slot === 1) p.inv.primary = null; else p.inv.secondary = null;
    this.give(p, best);
  }

  dropCurrent(p) {
    const w = p.state.w;
    if (w === 'c4' && p.inv.bomb) {
      p.inv.bomb = false;
      this.bomb.carrier = null; this.bomb.state = 'dropped';
      this.dropItem('c4', this.aheadOf(p));
    } else if (w && (w === p.inv.primary || w === p.inv.secondary)) {
      if (w === p.inv.primary) p.inv.primary = null; else p.inv.secondary = null;
      this.dropItem(w, this.aheadOf(p));
    } else return;
    this.syncBot(p);
    this.sendInv(p);
    this.sendRoundInfo();
  }

  aheadOf(p) {
    const [x, y, z] = p.state.p;
    return [x - Math.sin(p.state.y) * 1.6, y, z - Math.cos(p.state.y) * 1.6];
  }

  // ---------- bomb ----------
  siteAt(pos) {
    for (const [name, r] of Object.entries(this.info.sites)) if (inRect(r, pos[0], pos[2])) return name;
    return null;
  }

  plant(p) {
    if (this.phase !== 'live' || !p.alive || !p.inv.bomb) return;
    const site = this.siteAt(p.state.p);
    if (!site) return;
    p.inv.bomb = false;
    p.money = Math.min(MONEY.max, p.money + MONEY.plant);
    const pos = [p.state.p[0], p.state.p[1], p.state.p[2]];
    this.bomb = { carrier: null, planted: { p: pos, site }, explodeAt: this.now() + TIMES.bomb, defuser: null, state: 'planted' };
    this.phase = 'planted';
    this.phaseEnd = this.bomb.explodeAt;
    this.emit({ t: 'planted', site, p: pos, by: p.id });
    this.alertBots(new THREE.Vector3(...pos));
    this.sendInv(p);
    this.sendRoundInfo();
  }

  startDefuse(p) {
    const b = this.bomb;
    if (this.phase !== 'planted' || !p.alive || p.team !== 'CT' || b.defuser) return;
    if (new THREE.Vector3(...p.state.p).distanceTo(new THREE.Vector3(...b.planted.p)) > 2.2) return;
    b.defuser = { id: p.id, start: this.now(), need: p.kit ? TIMES.defuseKit : TIMES.defuse, tick: this.now() };
    this.emit({ t: 'defusing', id: p.id, need: b.defuser.need });
    this.sendRoundInfo();
  }

  cancelDefuse() {
    if (!this.bomb.defuser) return;
    this.bomb.defuser = null;
    this.emit({ t: 'defusing', id: null });
    this.sendRoundInfo();
  }

  tickDefuse(now) {
    const d = this.bomb.defuser;
    if (!d) return;
    const p = this.players.get(d.id);
    const far = !p || !p.alive || new THREE.Vector3(...p.state.p).distanceTo(new THREE.Vector3(...this.bomb.planted.p)) > 2.6;
    if (far || (p.bot && now - d.tick > 0.4)) { this.cancelDefuse(); return; }
    if (now - d.start >= d.need && now < this.bomb.explodeAt) {
      p.money = Math.min(MONEY.max, p.money + MONEY.defuse);
      this.bomb.state = 'defused';
      this.emit({ t: 'defused', by: p.id });
      this.endRound('CT', 'defuse');
    }
  }

  explode() {
    const pos = new THREE.Vector3(...this.bomb.planted.p);
    this.bomb.state = 'exploded';
    this.bomb.defuser = null;
    this.emit({ t: 'explode', p: this.bomb.planted.p });
    this.endRound('T', 'bomb');
    for (const t of [...this.players.values()]) {
      if (!t.alive) continue;
      const d = new THREE.Vector3(...t.state.p).distanceTo(pos);
      const dmg = Math.round(500 * Math.exp(-(d * d) / 162));
      if (dmg < 1) continue;
      t.hp = Math.max(0, t.hp - dmg);
      this.emit({ t: 'hp', id: t.id, hp: t.hp, ar: t.armor, hm: t.helmet, from: this.bomb.planted.p }, t.bot ? this.game.myId : t.id);
      if (t.hp <= 0) this.kill(null, t, 'c4', false);
    }
  }

  // ---------- messages ----------
  onClientMsg(from, msg) {
    const p = this.players.get(from);
    switch (msg.t) {
      case 'buy': if (p) this.buy(p, msg.k); return;
      case 'drop': if (p && p.alive) this.dropCurrent(p); return;
      case 'use': if (p && p.alive) this.use(p); return;
      case 'plant': if (p) this.plant(p); return;
      case 'defuse': if (p) { if (msg.on) this.startDefuse(p); else if (this.bomb.defuser?.id === from) this.cancelDefuse(); } return;
      case 'start': if (from === this.game.myId && this.phase === 'warmup') this.startMatch(); return;
    }
    super.onClientMsg(from, msg);
  }

  // ---------- bots ----------
  botWorld() {
    const w = super.botWorld();
    w.frozen = this.frozen;
    w.objective = bot => this.botObjective(bot);
    return w;
  }

  botObjective(bot) {
    const p = this.players.get(bot.id);
    if (!p || this.phase === 'warmup' || this.phase === 'post') return null;
    const b = this.bomb;
    if (b.planted) {
      const bp = new THREE.Vector3(...b.planted.p);
      if (bot.team === 'CT') return { goal: bp, radius: 1.2, crouch: true, action: bb => this.botDefuse(bb) };
      if (!bot.guard || bot.guard.distanceTo(bp) > 10) bot.guard = this.nav.randomNear(bp, 7).clone();
      return { goal: bot.guard, radius: 1.5, look: bot.holdLook, canInvestigate: false };
    }
    if (bot.team === 'T') {
      if (p.inv.bomb) {
        const c = this.info.siteCenters[this.tSite];
        const goal = new THREE.Vector3(c[0], 0, c[1]);
        if (this.siteAt(p.state.p) && bot.body.pos.distanceTo(goal) < 5) return { goal: bot.body.pos.clone(), radius: 10, crouch: true, action: bb => this.botPlant(bb) };
        return { goal, radius: 2 };
      }
      const dropped = this.drops.find(d => d.key === 'c4');
      if (dropped) {
        const dp = new THREE.Vector3(dropped.p[0], 0, dropped.p[2]);
        const nearest = [...this.bots.values()].filter(x => x.team === 'T' && x.body.alive).sort((x, y) => x.body.pos.distanceTo(dp) - y.body.pos.distanceTo(dp))[0];
        if (nearest === bot) return { goal: dp, radius: 0.5 };
      }
      return { goal: bot.holdPoint, radius: 2, look: bot.holdLook, canInvestigate: true };
    }
    return { goal: bot.holdPoint, radius: 2, look: bot.holdLook, canInvestigate: true };
  }

  botPlant(bot) {
    const now = this.now();
    if (now - (bot.plantTick || 0) > 0.3) bot.plantT = 0;
    bot.plantT = (bot.plantT || 0) + (now - (bot.plantTick || now));
    bot.plantTick = now;
    if (bot.plantT >= TIMES.plant) this.plant(this.players.get(bot.id));
  }

  botDefuse(bot) {
    const d = this.bomb.defuser;
    if (!d) this.startDefuse(this.players.get(bot.id));
    else if (d.id === bot.id) d.tick = this.now();
  }
}
