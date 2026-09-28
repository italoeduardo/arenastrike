import * as THREE from 'three';
import { World, setupLighting, inRect } from './map.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS, BUY_MENU, DM_PRIMARIES, itemInfo } from './weapons.js';
import { Avatar, TEAM_LOOK, worldWeapon } from './avatar.js';
import { Net } from './network.js';
import { Authority } from './authority.js';
import { Competitive, TIMES } from './competitive.js';
import { Effects } from './effects.js';
import { GrenadeFX } from './grenades.js';
import { Radar, TEAM_COLOR } from './radar.js';
import * as sfx from './audio.js';

const $ = id => document.getElementById(id);
const nowS = () => performance.now() / 1000;
const TEAM_NAME = { T: 'Terroristas', CT: 'Contra-Terroristas' };
const REASON = { elim: 'Todos os inimigos foram eliminados', bomb: 'A bomba explodiu', defuse: 'A bomba foi desarmada', time: 'O tempo acabou' };

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('as_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('as_' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const settings = {
  sens: store.get('sens', 1.2), vol: store.get('vol', 0.5), fov: store.get('fov', 80),
  primary: store.get('primary', 'ak47'), pistol: store.get('pistol', 'deagle'),
};
if (!DM_PRIMARIES.includes(settings.primary)) settings.primary = 'ak47';
if (WEAPONS[settings.pistol]?.type !== 'pistol') settings.pistol = 'deagle';
for (const id of ['modeSelect', 'mapSelect', 'teamSelect', 'botCount', 'difficulty']) {
  const v = store.get('menu_' + id, null);
  if (v !== null && [...$(id).options].some(o => o.value === v)) $(id).value = v;
  $(id).addEventListener('change', () => store.set('menu_' + id, $(id).value));
}

// ---------- renderer / scene ----------
const canvas = $('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 300);
scene.add(camera);
setupLighting(scene);
const world = new World(scene);
world.load('oasis');

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const player = new Player(camera, world.colliders);
const weapons = new WeaponSystem(camera);
const effects = new Effects(scene);
const listenerAt = pos => {
  const d = camera.position.distanceTo(pos);
  return { volume: Math.max(0.05, 1 - d / 70), pan: panFor(pos) };
};
const nadeFx = new GrenadeFX(scene, world.colliders, listenerAt);
const radar = new Radar($('radar'));

// ---------- game state ----------
const game = {
  net: new Net(),
  world,
  myId: 'local',
  myName: 'Jogador',
  myTeam: null,
  mode: 'comp',
  authority: null,
  avatars: new Map(),
  roster: [],
  selfProxy: null,
  inGame: false,
  dm: { left: 600, limit: 30 },
  matchEnded: false,
  round: { ph: 'pre', n: 0, sc: { T: 0, CT: 0 }, left: 0, buy: 0, at: 0, bomb: { s: 'none' } },
  inv: { primary: null, secondary: null, nades: [], bomb: false, ar: 0, hm: false, kit: false, m: 0 },
  drops: new Map(),
  bombMesh: null,
  spawnedAt: 0,
  deathAt: 0,
  killerId: null,
  respawnAt: 0,
  spectate: null,
  ping: 0,
  refillNext: true,
  planting: 0,
  defusing: null,
  flash: { until: 0, dur: 1 },
  shake: 0,
  allHitboxes() {
    const out = [];
    for (const a of this.avatars.values()) out.push(...a.hitboxes);
    if (this.selfProxy) out.push(...this.selfProxy.hitboxes);
    return out;
  },
  onGameMsg: msg => handleMsg(msg),
};

const DEBUG = new URLSearchParams(location.search).has('debug');
if (DEBUG) Object.assign(window, { game, player, weapons, world });
// debug: keep simulating even in hidden tabs so two tabs can be tested side by side
let pendingFrame = null;
const nextFrame = DEBUG ? cb => { pendingFrame = cb; } : cb => requestAnimationFrame(cb);

const comp = () => game.mode === 'comp';
const rosterOf = id => game.roster.find(r => r.id === id);
function nameOf(id) {
  if (!id) return 'Bomba';
  if (id === game.myId) return game.myName;
  return rosterOf(id)?.n || '???';
}
const isTeammate = id => comp() && rosterOf(id)?.tm === game.myTeam;

function sendToAuthority(msg) {
  if (game.authority) game.authority.onClientMsg(game.myId, msg);
  else game.net.send(msg);
}

function setMode(mode) {
  game.mode = mode;
  document.body.classList.toggle('dm', mode === 'dm');
  weapons.infiniteAmmo = mode === 'dm';
}

function roundLeft() {
  return Math.max(0, game.round.left - (nowS() - game.round.at));
}

// ---------- message handling (all peers) ----------
function handleMsg(msg) {
  switch (msg.t) {
    case 'welcome':
      game.myId = msg.id;
      setMode(msg.mode);
      world.load(msg.map);
      radar.setMap(world);
      break;

    case 'roster': onRoster(msg); break;

    case 'sts':
      for (const [id, p, y, x, c, w, s] of msg.l) {
        if (id === game.myId) continue;
        const av = game.avatars.get(id);
        if (av) { av.setState({ p, y, x, c, w }); av.spotted = s; }
      }
      break;

    case 'spawn': {
      const p = new THREE.Vector3(...msg.p);
      if (msg.id === game.myId) {
        player.spawn(p);
        if (msg.y !== undefined) player.yaw = msg.y;
        player.hp = 100;
        game.spawnedAt = nowS();
        game.killerId = null;
        game.spectate = null;
        game.refillNext = true;
        game.planting = 0;
        game.defusing = null;
        if (!comp()) applyDmLoadout(true);
        $('deathScreen').classList.add('hidden');
        $('spectating').classList.add('hidden');
      } else {
        const av = game.avatars.get(msg.id);
        if (av) { av.target.pos.copy(p); av.target.yaw = msg.y ?? av.target.yaw; av.snap(); av.root.rotation.y = av.target.yaw; av.setDead(false); av.root.visible = true; }
      }
      break;
    }

    case 'inv':
      game.inv = { primary: msg.primary, secondary: msg.secondary, nades: msg.nades || [], bomb: msg.bomb, ar: msg.ar, hm: msg.hm, kit: msg.kit, m: msg.m };
      weapons.setLoadout(game.inv, game.refillNext);
      game.refillNext = false;
      if (msg.bought) {
        sfx.playBuy();
        const slot = WEAPONS[msg.bought]?.slot;
        if (slot === 1 || (slot === 2 && !game.inv.primary)) weapons.equip(msg.bought);
        if (buyOpen()) renderBuy();
      }
      player.speedMul = weapons.current.speedMul;
      break;

    case 'hp':
      if (msg.id === game.myId) {
        const lost = player.hp - msg.hp;
        player.hp = msg.hp;
        if (msg.ar !== undefined) { game.inv.ar = msg.ar; game.inv.hm = msg.hm; }
        if (lost > 0) {
          sfx.playHurt();
          if (msg.from) showDamageDir(new THREE.Vector3(...msg.from));
          game.shake = Math.min(0.5, game.shake + lost / 200);
        }
      }
      break;

    case 'kill': {
      addKillFeed(msg);
      if (msg.k === game.myId && msg.v !== game.myId) {
        sfx.playKill();
        toast(msg.h ? 'HEADSHOT!' : 'Abate', msg.h ? '#ff5a5a' : '#fff');
        if (comp() && game.round.ph !== 'warmup') moneyPop(WEAPONS[msg.w]?.reward ?? 300);
      }
      const dir = msg.dir ? new THREE.Vector3(msg.dir[0], 0, msg.dir[1]).normalize() : null;
      if (msg.v === game.myId) die(msg.k, msg.w, msg.h);
      else {
        const av = game.avatars.get(msg.v);
        if (av) av.setDead(true, dir);
      }
      break;
    }

    case 'shot': {
      if (msg.id === game.myId) break;
      const av = game.avatars.get(msg.id);
      const from = av ? av.root.position.clone().add(new THREE.Vector3(0, 1.35 - av.target.crouch * 0.4, 0)) : new THREE.Vector3(...msg.o);
      for (const e of msg.e || []) {
        const end = new THREE.Vector3(...e);
        effects.tracer(from, end);
        effects.puff(end, '#d9c7a0', 0.08, 0.2);
      }
      const w = WEAPONS[msg.w];
      if (w && w.type !== 'knife') { const l = listenerAt(from); sfx.playShot(w.sound, l.volume * 0.85, l.pan); }
      break;
    }

    case 'round': {
      const prev = game.round.ph;
      game.round = { ph: msg.ph, n: msg.n, sc: msg.sc, left: msg.left, buy: msg.buy, at: nowS(), bomb: msg.bomb };
      if (prev !== msg.ph && msg.ph === 'warmup') toast('AQUECIMENTO', '#ffcf6a');
      updateBombMesh();
      if (game.defusing && msg.bomb.def !== game.myId) game.defusing.confirmed = false;
      break;
    }

    case 'roundstart':
      effects.clearDecals();
      nadeFx.clear();
      hideBanner();
      game.matchEnded = false;
      $('matchEnd').classList.add('hidden');
      break;

    case 'golive':
      sfx.playRoundStart();
      toast('VAI! VAI! VAI!', '#fff');
      break;

    case 'matchstart':
      toast('PARTIDA INICIADA', '#7ddc6c');
      break;

    case 'roundend': {
      const title = `${TEAM_NAME[msg.w]} venceram`;
      showBanner(title, REASON[msg.r], msg.w);
      sfx.announce(title);
      break;
    }

    case 'halftime':
      setTimeout(() => showBanner('Intervalo', 'Trocando de lado', null), 300);
      break;

    case 'planted':
      toast(`BOMBA PLANTADA NO BOMBSITE ${msg.site}`, '#ff5a5a');
      sfx.announce('Bomba plantada');
      game.bombBeepT = 0;
      break;

    case 'defusing':
      if (game.defusing) {
        if (msg.id === game.myId) Object.assign(game.defusing, { confirmed: true, start: nowS(), need: msg.need });
        else game.defusing.confirmed = false;
      }
      if (msg.id && msg.id !== game.myId) {
        const pos = game.round.bomb?.p;
        if (pos) { const l = listenerAt(new THREE.Vector3(...pos)); sfx.playDefuse(l.volume * 0.6, l.pan); }
      }
      break;

    case 'defused':
      if (msg.by === game.myId) moneyPop(300);
      break;

    case 'explode': {
      const p = new THREE.Vector3(...msg.p);
      nadeFx.explosion(p.clone().add(new THREE.Vector3(0, 1, 0)), 16, '#ffb347');
      const l = listenerAt(p);
      sfx.playExplosion(Math.max(0.3, l.volume), l.pan);
      game.shake = 1;
      break;
    }

    case 'drops': syncDrops(msg.l); break;
    case 'nade': nadeFx.spawn(msg.id, msg.k, msg.o, msg.v); break;
    case 'boom': nadeFx.boom(msg.id, msg.k, msg.p); break;

    case 'flashed':
      game.flash = { until: nowS() + msg.dur, dur: msg.dur };
      sfx.playFlashRing(msg.dur);
      break;

    case 'end':
      game.matchEnded = true;
      $('endWinner').textContent = msg.winner;
      $('matchEnd').classList.remove('hidden');
      hideBanner();
      {
        let left = msg.wait;
        $('endNext').textContent = `Nova partida em ${left}s`;
        clearInterval(game.endTimer);
        game.endTimer = setInterval(() => {
          left--;
          $('endNext').textContent = left > 0 ? `Nova partida em ${left}s` : '';
          if (left <= 0) clearInterval(game.endTimer);
        }, 1000);
      }
      break;

    case 'newmatch':
      game.matchEnded = false;
      $('matchEnd').classList.add('hidden');
      $('killFeed').innerHTML = '';
      effects.clearDecals();
      break;

    case 'pong':
      game.ping = Math.round(performance.now() - msg.ts);
      break;
  }
}

function onRoster(msg) {
  game.roster = msg.l;
  if (msg.m.mode === 'dm') { game.dm.left = msg.m.left; game.dm.limit = msg.m.limit; game.dm.at = nowS(); }
  const me = rosterOf(game.myId);
  if (me && me.tm !== game.myTeam) {
    game.myTeam = me.tm;
    weapons.setGlove(TEAM_LOOK[me.tm]?.glove || '#3a3a3a');
  }
  const ids = new Set(msg.l.map(r => r.id));
  for (const [id, av] of game.avatars) if (!ids.has(id)) { av.dispose(); game.avatars.delete(id); }
  for (const r of msg.l) {
    if (r.id === game.myId) continue;
    let av = game.avatars.get(r.id);
    if (av && av.team !== r.tm) {
      const keep = { pos: av.target.pos.clone(), dead: av.dead, visible: av.root.visible };
      av.dispose();
      av = new Avatar(scene, r.id, r.n, r.tm);
      av.target.pos.copy(keep.pos); av.snap();
      av.setDead(keep.dead); av.root.visible = keep.visible;
      game.avatars.set(r.id, av);
    }
    if (!av) {
      av = new Avatar(scene, r.id, r.n, r.tm);
      game.avatars.set(r.id, av);
      av.setDead(!r.a);
      av.root.visible = r.a;
    } else if (av.name !== r.n) av.setName(r.n);
    av.showTag = isTeammate(r.id);
  }
  if (!$('scoreboard').classList.contains('hidden')) renderScoreboard();
}

function applyDmLoadout(refill) {
  weapons.setLoadout({ primary: settings.primary, secondary: settings.pistol, nades: [], bomb: false }, refill);
  weapons.equip(settings.primary);
  player.speedMul = weapons.current.speedMul;
}

function syncDrops(list) {
  const ids = new Set(list.map(d => d.id));
  for (const [id, d] of game.drops) if (!ids.has(id)) { scene.remove(d.mesh); game.drops.delete(id); }
  for (const d of list) {
    if (game.drops.has(d.id)) continue;
    const mesh = worldWeapon(d.key);
    mesh.position.set(...d.p);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);
    game.drops.set(d.id, { ...d, mesh });
  }
}

function updateBombMesh() {
  const b = game.round.bomb;
  const planted = b && b.s === 'planted' && b.p;
  if (planted && !game.bombMesh) {
    game.bombMesh = worldWeapon('c4');
    game.bombMesh.position.set(b.p[0], b.p[1] + 0.07, b.p[2]);
    scene.add(game.bombMesh);
  } else if (!planted && game.bombMesh && b.s !== 'defused' && b.s !== 'exploded') {
    scene.remove(game.bombMesh);
    game.bombMesh = null;
  } else if (game.bombMesh && b.s === 'none') {
    scene.remove(game.bombMesh);
    game.bombMesh = null;
  }
}

function panFor(pos) {
  const toSrc = pos.clone().sub(camera.position).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  return toSrc.dot(right) * 0.8;
}

// ---------- local player ----------
function die(killerId, weaponKey, head) {
  player.alive = false;
  player.hp = 0;
  weapons.mouseDown = false;
  weapons.scoped = false;
  game.killerId = killerId;
  game.deathAt = nowS();
  game.respawnAt = nowS() + (comp() && game.round.ph !== 'warmup' ? 0 : comp() ? 2 : 3);
  game.planting = 0;
  if (game.defusing) { sendToAuthority({ t: 'defuse', on: false }); game.defusing = null; }
  $('deathScreen').classList.remove('hidden');
  $('deathBy').textContent = killerId ? `Morto por ${nameOf(killerId)} (${WEAPONS[weaponKey]?.name || weaponKey}${head ? ', headshot' : ''})` : 'Morto pela bomba';
}

function localEvents(events) {
  if (!events.length) return;
  const m = weapons.model(weapons.key);
  const muzzle = m.localToWorld(m.userData.muzzle.clone());
  const ends = [];
  let hitAny = false, headAny = false;
  const perTarget = new Map();
  for (const s of events) {
    if (s.throw) {
      sendToAuthority({ t: 'throw', k: s.key, o: s.origin.toArray(), v: s.vel.toArray() });
      continue;
    }
    if (s.melee) {
      if (s.target) { perTarget.set(s.target, { dmg: s.dmg, part: 'body' }); effects.blood(s.point); hitAny = true; }
      continue;
    }
    effects.tracer(muzzle, s.point);
    ends.push([+s.point.x.toFixed(2), +s.point.y.toFixed(2), +s.point.z.toFixed(2)]);
    if (s.target) {
      effects.blood(s.point);
      hitAny = true;
      headAny ||= s.part === 'head';
      // one message per target per trigger pull; keep the best hit group for armor math
      const prev = perTarget.get(s.target);
      if (!prev) perTarget.set(s.target, { dmg: s.dmg, part: s.part });
      else { prev.dmg += s.dmg; if (s.part === 'head') prev.part = 'head'; }
    } else effects.impact(s.point, s.normal);
  }
  for (const [target, h] of perTarget) sendToAuthority({ t: 'hit', target, dmg: h.dmg, part: h.part, w: weapons.key });
  if (ends.length) {
    const o = camera.position;
    sendToAuthority({ t: 'shot', o: [o.x, o.y, o.z], e: ends, w: weapons.key });
  } else if (events.some(e => e.melee)) {
    const o = camera.position;
    sendToAuthority({ t: 'shot', o: [o.x, o.y, o.z], e: [], w: 'knife' });
  }
  if (hitAny) { sfx.playHit(headAny); showHitMarker(headAny); }
}

// ---------- HUD ----------
function updateHud() {
  const hp = Math.max(0, Math.round(player.hp));
  $('hpText').textContent = hp;
  $('hpBox').classList.toggle('low', hp <= 25);
  $('armorText').textContent = game.inv.ar || 0;
  $('armorBox').classList.toggle('helmet', !!game.inv.hm);
  $('moneyText').textContent = '$' + (game.inv.m || 0);
  const w = weapons.current, a = weapons.ammo[weapons.key];
  $('weaponName').textContent = w.name;
  if (!a) { $('ammoMag').textContent = w.type === 'grenade' ? game.inv.nades.filter(k => k === weapons.key).length || 1 : '—'; $('ammoRes').textContent = ''; }
  else {
    $('ammoMag').textContent = weapons.reloading > 0 ? '...' : a.mag;
    $('ammoRes').textContent = weapons.infiniteAmmo ? '/ ∞' : '/ ' + a.reserve;
    $('ammoMag').classList.toggle('low', a.mag <= Math.ceil(w.mag * 0.2));
  }
  $('reloadHint').classList.toggle('hidden', !a || a.mag > 0 || weapons.reloading > 0 || !player.alive);
  const lo = weapons.loadout;
  const slots = [['1', lo.primary], ['2', lo.secondary], ['3', 'knife'], ...lo.nades.map(k => ['4', k]), ...(lo.bomb ? [['5', 'c4']] : [])];
  $('invIcons').innerHTML = slots.filter(s => s[1]).map(([n, k]) => `<span class="${k === weapons.key ? 'on' : ''}">${n} ${esc(WEAPONS[k].name)}</span>`).join('');
  $('bombCarry').classList.toggle('hidden', !(comp() && game.inv.bomb && player.alive));
  $('buyIcon').classList.toggle('hidden', !canBuyNow());

  // top bar
  if (comp()) {
    const r = game.round;
    $('scoreT').textContent = r.sc.T;
    $('scoreCT').textContent = r.sc.CT;
    const planted = r.ph === 'planted';
    $('matchTimer').textContent = planted ? 'BOMBA' : formatTime(roundLeft());
    $('matchTimer').classList.toggle('bomb', planted);
    $('phaseLabel').textContent = { warmup: 'Aquecimento', freeze: 'Compra', post: 'Fim do round', end: 'Fim', pre: 'Preparando' }[r.ph] || (r.n ? `Round ${r.n}` : '');
    for (const t of ['T', 'CT']) {
      const members = game.roster.filter(p => p.tm === t);
      $('alive' + t).innerHTML = members.map(p => `<i class="${p.a ? '' : 'dead'}"></i>`).join('');
    }
    $('fragInfo').textContent = '';
  } else {
    $('matchTimer').textContent = formatTime(game.authority ? game.authority.matchLeft : game.dm.left - (nowS() - (game.dm.at || nowS())));
    $('phaseLabel').textContent = '';
    const me = rosterOf(game.myId);
    const top = [...game.roster].sort((a, b) => b.k - a.k)[0];
    $('fragInfo').textContent = me ? `Você: ${me.k} | Líder: ${top ? top.k : 0}/${game.dm.limit}` : '';
  }
}

function moneyPop(v) {
  const el = $('moneyPop');
  el.textContent = `+$${v}`;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = 0; }, 1500);
}

let hitTimer = 0;
function showHitMarker(head) {
  const el = $('hitMarker');
  el.classList.toggle('head', head);
  el.style.opacity = 1;
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => { el.style.opacity = 0; }, 140);
}

let dmgTimer = 0;
function showDamageDir(from) {
  const to = from.clone().sub(player.pos);
  const ang = Math.atan2(to.x, to.z) - Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw));
  const el = $('damageDir');
  el.style.transform = `rotate(${-ang}rad)`;
  el.style.opacity = 1;
  el.style.transition = 'none';
  clearTimeout(dmgTimer);
  dmgTimer = setTimeout(() => { el.style.transition = 'opacity .8s'; el.style.opacity = 0; }, 150);
}

let toastTimer = 0;
function toast(text, color = '#fff') {
  const el = $('toast');
  el.textContent = text;
  el.style.color = color;
  el.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = 0; }, 1600);
}

let bannerTimer = 0;
function showBanner(title, sub, team) {
  $('bannerTitle').textContent = title;
  $('bannerSub').textContent = sub || '';
  $('banner').className = team || '';
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, 4500);
}
function hideBanner() { $('banner').classList.add('hidden'); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addKillFeed(msg) {
  const feed = $('killFeed');
  const div = document.createElement('div');
  if (msg.k === game.myId || msg.v === game.myId) div.className = 'mine';
  const cls = id => (comp() ? rosterOf(id)?.tm || '' : '');
  const killer = msg.k ? `<span class="${cls(msg.k)}">${esc(nameOf(msg.k))}</span>` : '';
  div.innerHTML = `${killer}<span class="w">[${esc(WEAPONS[msg.w]?.name || 'Bomba')}]</span>${msg.h ? '<span class="hs">HS</span>' : ''}<span class="${cls(msg.v)}">${esc(nameOf(msg.v))}</span>`;
  feed.prepend(div);
  while (feed.children.length > 6) feed.lastChild.remove();
  setTimeout(() => div.remove(), 7000);
}

function renderScoreboard() {
  const row = r => {
    const mate = r.tm === game.myTeam;
    const ping = r.b ? 'BOT' : (r.id === game.myId && game.net.mode !== 'client' ? 'host' : (r.pg || '-'));
    const c4 = comp() && game.myTeam === 'T' && r.id === game.round.bomb?.carrier ? '<span class="c4">C4</span>' : '';
    return `<tr class="${r.id === game.myId ? 'me' : ''} ${r.a ? '' : 'dead'}">
      <td>${esc(r.n)}${r.b ? '<span class="bot">BOT</span>' : ''}${c4}</td>
      ${comp() ? `<td class="money">${mate ? '$' + r.m : ''}</td>` : ''}
      <td>${r.k}</td><td>${r.as || 0}</td><td>${r.d}</td><td>${ping}</td></tr>`;
  };
  const head = `<tr><th>Jogador</th>${comp() ? '<th>$</th>' : ''}<th>K</th><th>A</th><th>M</th><th>Ping</th></tr>`;
  const sort = (a, b) => b.k - a.k || a.d - b.d;
  if (comp()) {
    const r = game.round;
    $('sbHeader').innerHTML = `<span class="t">TR ${r.sc.T}</span><small>Round ${r.n || '-'} de 16 · primeiro a 9</small><span class="ct">${r.sc.CT} CT</span>`;
    $('sbTables').innerHTML = ['CT', 'T'].map(t => `<div class="sbTeam ${t}"><h3>${TEAM_NAME[t]}</h3><table><thead>${head}</thead><tbody>${game.roster.filter(p => p.tm === t).sort(sort).map(row).join('')}</tbody></table></div>`).join('');
  } else {
    $('sbHeader').innerHTML = '<span>Mata-mata</span>';
    $('sbTables').innerHTML = `<div class="sbTeam FFA"><table><thead>${head}</thead><tbody>${[...game.roster].sort(sort).map(row).join('')}</tbody></table></div>`;
  }
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- buying ----------
function inBuyZone() {
  const zone = world.info.buyZones?.[game.myTeam];
  return !zone || inRect(zone, player.pos.x, player.pos.z);
}

function canBuyNow() {
  if (!comp() || !player.alive) return !comp() && player.alive;
  const r = game.round;
  if (r.ph === 'warmup') return true;
  if (r.ph !== 'freeze' && r.ph !== 'live') return false;
  return r.buy - (nowS() - r.at) > 0 && inBuyZone();
}

function owned(key) {
  const i = game.inv;
  if (key === 'vest') return i.ar >= 100;
  if (key === 'vesthelm') return i.ar >= 100 && i.hm;
  if (key === 'kit') return i.kit;
  return key === i.primary || key === i.secondary || i.nades.includes(key);
}

// Rebuilding the buttons mid-click would swallow the click, so only rebuild when something changed.
let buyStateKey = '';
function refreshBuy() {
  const i = game.inv;
  const key = [canBuyNow(), i.m, i.primary, i.secondary, i.nades.join(), i.ar, i.hm, i.kit, game.myTeam].join('|');
  if (key !== buyStateKey) renderBuy();
  else if (comp()) {
    const r = game.round;
    if (r.ph !== 'warmup' && canBuyNow()) $('buyTimer').textContent = `Tempo de compra: ${Math.ceil(r.buy - (nowS() - r.at))}s`;
  }
}

function renderBuy() {
  const i = game.inv;
  buyStateKey = [canBuyNow(), i.m, i.primary, i.secondary, i.nades.join(), i.ar, i.hm, i.kit, game.myTeam].join('|');
  if (!comp()) {
    $('buyMoney').textContent = '';
    $('buyTimer').textContent = 'Mata-mata: armas liberadas';
    const col = (title, keys, cur) => `<div class="buyCol"><h3>${title}</h3>${keys.map(k => `<button class="buyItem ${cur === k ? 'owned' : ''}" data-k="${k}"><span>${esc(WEAPONS[k].name)}</span></button>`).join('')}</div>`;
    $('buyGrid').innerHTML = col('Principal', DM_PRIMARIES, settings.primary) + col('Pistola', ['usp', 'glock', 'p250', 'deagle'], settings.pistol);
    return;
  }
  const money = game.inv.m || 0;
  const allowed = canBuyNow();
  $('buyMoney').textContent = '$' + money;
  const r = game.round;
  $('buyTimer').textContent = r.ph === 'warmup' ? 'Aquecimento: compra liberada' : allowed ? `Tempo de compra: ${Math.ceil(r.buy - (nowS() - r.at))}s` : (inBuyZone() ? 'Tempo de compra acabou' : 'Fora da zona de compra');
  $('buyGrid').innerHTML = BUY_MENU.map(cat => {
    const items = cat.items.filter(k => !itemInfo(k).team || itemInfo(k).team === game.myTeam);
    if (!items.length) return '';
    return `<div class="buyCol"><h3>${cat.title}</h3>${items.map(k => {
      const it = itemInfo(k);
      let price = it.price;
      if (k === 'vesthelm' && game.inv.ar >= 100 && !game.inv.hm) price = 350;
      const has = owned(k);
      return `<button class="buyItem ${has ? 'owned' : ''}" data-k="${k}" ${!allowed || price > money || (has && WEAPONS[k]?.type !== 'grenade') ? 'disabled' : ''}><span>${esc(it.name)}</span><span class="price">$${price}</span></button>`;
    }).join('')}</div>`;
  }).join('');
}

$('buyGrid').addEventListener('click', e => {
  const b = e.target.closest('.buyItem');
  if (!b || b.disabled) return;
  const k = b.dataset.k;
  if (comp()) { sendToAuthority({ t: 'buy', k }); return; }
  if (WEAPONS[k].type === 'pistol') { settings.pistol = k; store.set('pistol', k); }
  else { settings.primary = k; store.set('primary', k); }
  sfx.playBuy();
  if (player.alive && nowS() - game.spawnedAt < 10) { applyDmLoadout(true); toast(WEAPONS[k].name); }
  else toast(`${WEAPONS[k].name} no próximo respawn`);
  renderBuy();
});
function openBuy() { renderBuy(); $('buyMenu').classList.remove('hidden'); document.exitPointerLock?.(); weapons.mouseDown = false; }
function closeBuy() { $('buyMenu').classList.add('hidden'); lockPointer(); }
const buyOpen = () => !$('buyMenu').classList.contains('hidden');
const pauseOpen = () => !$('pauseMenu').classList.contains('hidden');

// ---------- input ----------
// Some browsers/embedded views refuse pointer lock. Instead of silently ignoring input,
// fall back to "free mouse": relative movement + edge turning, and keep retrying the lock on click.
let freeMouse = false;
let mouseX = innerWidth / 2;
function setFreeMouse(on) {
  freeMouse = on;
  document.body.classList.toggle('freeMouse', on);
  $('freeMouse').classList.toggle('hidden', !on);
}
function lockPointer() {
  if (!game.inGame) return;
  try {
    const r = document.body.requestPointerLock();
    if (r && r.catch) r.catch(() => setFreeMouse(true));
  } catch { setFreeMouse(true); }
}
const locked = () => document.pointerLockElement === document.body;
const inputActive = () => game.inGame && (locked() || freeMouse) && !buyOpen() && !pauseOpen();

document.addEventListener('pointerlockerror', () => { if (game.inGame) setFreeMouse(true); });
document.addEventListener('pointerlockchange', () => {
  if (!game.inGame) return;
  if (locked()) { setFreeMouse(false); $('pauseMenu').classList.add('hidden'); }
  else if (!freeMouse) {
    weapons.mouseDown = false;
    player.keys.clear();
    if (!buyOpen()) showPause();
  }
});

canvas.addEventListener('mousedown', e => {
  if (!game.inGame) return;
  if (!locked()) lockPointer();
  if (!locked() && !freeMouse) return;
  if (!inputActive()) return;
  if (!player.alive) { if (e.button === 0) cycleSpectate(); return; }
  if (e.button === 0) weapons.pullTrigger();
  if (e.button === 2) weapons.toggleScope();
});
addEventListener('mousemove', e => { mouseX = e.clientX; });
addEventListener('mouseup', e => { if (e.button === 0) weapons.mouseDown = false; });
addEventListener('contextmenu', e => { if (game.inGame) e.preventDefault(); });
addEventListener('wheel', e => { if (inputActive() && player.alive) { weapons.handleWheel(e.deltaY); player.speedMul = weapons.current.speedMul; } }, { passive: true });

addEventListener('keydown', e => {
  if (!game.inGame) return;
  if (e.code === 'Tab') { $('scoreboard').classList.remove('hidden'); renderScoreboard(); return; }
  if (e.code === 'KeyB' && !pauseOpen()) { buyOpen() ? closeBuy() : openBuy(); return; }
  if (buyOpen()) { if (e.code === 'Escape') closeBuy(); return; }
  if (e.code === 'Escape' && freeMouse && !pauseOpen()) { showPause(); return; }
  if (!inputActive() || !player.alive || e.repeat) return;
  weapons.handleKey(e.code);
  player.speedMul = weapons.current.speedMul;
  if (!comp()) return;
  if (e.code === 'KeyG') sendToAuthority({ t: 'drop' });
  if (e.code === 'KeyE' && !nearBomb()) sendToAuthority({ t: 'use' });
});
addEventListener('keyup', e => { if (e.code === 'Tab') $('scoreboard').classList.add('hidden'); });

// ---------- bomb interaction ----------
function nearBomb() {
  const b = game.round.bomb;
  return comp() && game.myTeam === 'CT' && b?.s === 'planted' && b.p && player.pos.distanceTo(new THREE.Vector3(...b.p)) < 1.8;
}

function siteHere() {
  const sites = world.info.sites;
  if (!sites) return null;
  for (const [n, r] of Object.entries(sites)) if (inRect(r, player.pos.x, player.pos.z)) return n;
  return null;
}

let keypadT = 0;
function updateObjective(dt, active) {
  let hint = '';
  let prog = null;
  const r = game.round;
  if (comp() && player.alive && active) {
    // planting
    const canPlant = weapons.key === 'c4' && r.ph === 'live' && siteHere() && player.onGround;
    if (canPlant && weapons.mouseDown) {
      game.planting += dt;
      keypadT -= dt;
      if (keypadT <= 0) { sfx.playKeypad(); keypadT = 0.35; }
      prog = { label: 'Plantando a bomba...', v: game.planting / TIMES.plant };
      if (game.planting >= TIMES.plant) { sendToAuthority({ t: 'plant' }); game.planting = 0; weapons.mouseDown = false; }
    } else game.planting = 0;
    if (game.inv.bomb && !prog) {
      if (weapons.key !== 'c4' && siteHere() && r.ph === 'live') hint = 'Aperte 5 e segure o clique pra plantar';
      else if (weapons.key === 'c4' && !siteHere()) hint = 'Leve a bomba até o bombsite A ou B';
      else if (weapons.key === 'c4' && r.ph === 'live') hint = 'Segure o clique pra plantar';
    }

    // defusing
    const near = nearBomb();
    const holding = player.keys.has('KeyE');
    if (near && holding && r.ph === 'planted') {
      const other = r.bomb.def && r.bomb.def !== game.myId;
      if (!game.defusing && !other) game.defusing = { start: nowS(), need: game.inv.kit ? TIMES.defuseKit : TIMES.defuse, confirmed: false, sentAt: 0 };
      const d = game.defusing;
      if (d) {
        // the host owns the timer: keep asking until it confirms we are the defuser
        if (!d.confirmed && nowS() - d.sentAt > 0.5) { d.sentAt = nowS(); sendToAuthority({ t: 'defuse', on: true }); }
        const v = d.confirmed ? (nowS() - d.start) / d.need : 0;
        prog = { label: game.inv.kit ? 'Desarmando (com kit)...' : 'Desarmando...', v };
        keypadT -= dt;
        if (keypadT <= 0 && d.confirmed) { sfx.playDefuse(0.25); keypadT = 0.5; }
      } else hint = 'Outro jogador já está desarmando';
    } else if (game.defusing) {
      sendToAuthority({ t: 'defuse', on: false });
      game.defusing = null;
    }
    if (near && !game.defusing && !hint) hint = game.inv.kit ? 'Segure E pra desarmar (5s)' : 'Segure E pra desarmar (10s)';

    if (!hint && !prog) {
      for (const d of game.drops.values()) {
        if (d.key === 'c4') continue;
        if (Math.hypot(d.p[0] - player.pos.x, d.p[2] - player.pos.z) < 2) { hint = `E pra pegar ${WEAPONS[d.key].name}`; break; }
      }
    }
  } else {
    game.planting = 0;
    if (game.defusing) { sendToAuthority({ t: 'defuse', on: false }); game.defusing = null; }
  }
  $('hint').textContent = hint;
  $('progress').classList.toggle('hidden', !prog);
  if (prog) { $('progressLabel').textContent = prog.label; $('progressFill').style.width = Math.min(100, prog.v * 100).toFixed(1) + '%'; }
  return !!prog;
}

// planted bomb beeps speed up as the timer runs down
let beepT = 0;
function updateBombAudio(dt) {
  const b = game.round.bomb;
  if (!comp() || b?.s !== 'planted' || !b.p) return;
  const left = Math.max(0, b.left - (nowS() - game.round.at));
  beepT -= dt;
  if (beepT <= 0) {
    const l = listenerAt(new THREE.Vector3(...b.p));
    sfx.playBombBeep(Math.max(0.12, l.volume) * 0.5, l.pan);
    beepT = 0.12 + 0.88 * Math.pow(left / TIMES.bomb, 1.4);
  }
  if (game.bombMesh) {
    const led = game.bombMesh.userData.led;
    if (led) led.visible = beepT > 0.06 ? led.visible : !led.visible;
  }
}

// ---------- spectating ----------
function spectateCandidates() {
  const alive = game.roster.filter(r => r.a && r.id !== game.myId && game.avatars.has(r.id));
  const mates = alive.filter(r => !comp() || r.tm === game.myTeam);
  return (mates.length ? mates : alive).map(r => r.id);
}
function cycleSpectate() {
  const c = spectateCandidates();
  if (!c.length) return;
  const i = c.indexOf(game.spectate);
  game.spectate = c[(i + 1) % c.length];
}

// ---------- pause menu ----------
function showPause() {
  $('pauseMenu').classList.remove('hidden');
  const online = game.net.mode !== 'offline';
  $('pauseNote').textContent = online ? 'No online o jogo continua rolando.' : 'O jogo continua rolando por trás.';
  $('pauseInvite').classList.toggle('hidden', !online);
  if (online) $('pauseLink').value = inviteLink(game.net.code);
  $('startMatchBtn').classList.toggle('hidden', !(game.authority && comp() && game.authority.phase === 'warmup'));
}
function bindRange(id, valId, key, fmt, apply) {
  const el = $(id);
  el.value = settings[key];
  $(valId).textContent = fmt(settings[key]);
  el.addEventListener('input', () => {
    settings[key] = parseFloat(el.value);
    $(valId).textContent = fmt(settings[key]);
    store.set(key, settings[key]);
    apply(settings[key]);
  });
  apply(settings[key]);
}
bindRange('sensInput', 'sensVal', 'sens', v => v.toFixed(2), v => { player.sensitivity = 0.0018 * v; });
bindRange('volInput', 'volVal', 'vol', v => Math.round(v * 100) + '%', v => sfx.setVolume(v));
bindRange('fovInput', 'fovVal', 'fov', v => v + '°', v => { settings.fov = v; });
$('resumeBtn').addEventListener('click', () => { $('pauseMenu').classList.add('hidden'); lockPointer(); });
$('quitBtn').addEventListener('click', () => location.reload());
$('pauseCopyBtn').addEventListener('click', () => copyText($('pauseLink').value, $('pauseCopyBtn')));
$('startMatchBtn').addEventListener('click', () => { sendToAuthority({ t: 'start' }); $('startMatchBtn').classList.add('hidden'); });

// ---------- menu / session start ----------
function inviteLink(code) { return `${location.origin}${location.pathname}#sala=${code}`; }
function copyText(text, btn) {
  navigator.clipboard?.writeText(text).then(() => {
    const old = btn.textContent; btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = old; }, 1200);
  }).catch(() => {});
}

$('nickInput').value = store.get('nick', '');
function readNick() {
  const n = $('nickInput').value.trim().slice(0, 16) || 'Jogador' + Math.floor(Math.random() * 900 + 100);
  store.set('nick', $('nickInput').value.trim());
  return n;
}

function syncMenuOptions() {
  const isComp = $('modeSelect').value === 'comp';
  if (isComp) $('mapSelect').value = 'oasis';
  $('mapSelect').querySelector('option[value=arena]').disabled = isComp;
  $('teamSelect').disabled = !isComp;
}
$('modeSelect').addEventListener('change', syncMenuOptions);
syncMenuOptions();

function startAuthority(online) {
  const mode = $('modeSelect').value;
  const map = mode === 'comp' ? 'oasis' : $('mapSelect').value;
  world.load(map);
  radar.setMap(world);
  setMode(mode);
  const opts = { difficulty: $('difficulty').value, warmup: online };
  const Auth = mode === 'comp' ? Competitive : Authority;
  const auth = new Auth(game, opts);
  game.authority = auth;
  game.selfProxy = new Avatar(scene, game.myId, game.myName);
  game.selfProxy.root.visible = false;
  const pref = $('teamSelect').value;
  auth.onJoin(game.myId, game.myName, pref === 'auto' ? null : pref);
  auth.addBots(parseInt($('botCount').value, 10));
  game.net.onPeerJoin = () => {};
  game.net.onMessage = (from, msg) => auth.onClientMsg(from, msg);
  game.net.onPeerLeave = id => auth.removePlayer(id);
}

function enterGame() {
  sfx.initAudio();
  game.inGame = true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('roomTag').textContent = game.net.mode === 'offline' ? 'Offline' : `Sala ${game.net.code}`;
  player.colliders = world.colliders;
  player.alive = false;
  game.deathAt = nowS();
  lockPointer();
}

$('offlineBtn').addEventListener('click', () => {
  game.myName = readNick();
  game.myId = 'local';
  startAuthority(false);
  enterGame();
});

$('hostBtn').addEventListener('click', async () => {
  const btn = $('hostBtn');
  btn.disabled = true;
  $('hostStatus').textContent = 'Criando sala...';
  try {
    const code = await game.net.host();
    game.myName = readNick();
    game.myId = game.net.myId;
    startAuthority(true);
    $('roomLink').value = inviteLink(code);
    $('hostInfo').classList.remove('hidden');
    $('hostStatus').textContent = `Sala ${code} criada. Começa com 90s de aquecimento (dá pra pular no Esc).`;
    btn.classList.add('hidden');
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    $('hostStatus').textContent = 'Não consegui criar a sala. Verifique a internet e tente de novo.';
  }
});
$('copyLinkBtn').addEventListener('click', () => copyText($('roomLink').value, $('copyLinkBtn')));
$('startHostBtn').addEventListener('click', enterGame);

async function joinRoom() {
  const raw = $('roomCodeInput').value.trim();
  const code = (raw.match(/sala=([A-Za-z0-9]+)/)?.[1] || raw).toUpperCase();
  if (!code) { $('joinStatus').textContent = 'Digite o código da sala.'; return; }
  $('joinBtn').disabled = true;
  $('joinStatus').textContent = 'Conectando...';
  game.myName = readNick();
  let welcomed;
  const gotWelcome = new Promise(res => { welcomed = res; });
  game.net.onMessage = (_from, msg) => { handleMsg(msg); if (msg.t === 'welcome') welcomed(); };
  game.net.onDisconnected = () => {
    if (!game.inGame) return;
    game.inGame = false;
    document.exitPointerLock?.();
    alert('A conexão com o host caiu (ele saiu ou a internet falhou).');
    location.reload();
  };
  try {
    await game.net.join(code);
    game.myId = game.net.myId;
    const pref = $('teamSelect').value;
    game.net.send({ t: 'hello', name: game.myName, team: pref === 'auto' ? null : pref });
    await Promise.race([gotWelcome, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
    enterGame();
  } catch (err) {
    console.error(err);
    $('joinBtn').disabled = false;
    $('joinStatus').textContent = err.message === 'Sala não encontrada' ? 'Sala não encontrada. Confere o código?' : 'Falha ao conectar. Tente de novo — algumas redes (corporativas, 4G) bloqueiam conexão direta.';
  }
}
$('joinBtn').addEventListener('click', joinRoom);
$('roomCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

function readInvite() {
  const code = location.hash.match(/sala=([A-Za-z0-9]+)/)?.[1];
  if (!code) return;
  if (game.inGame) { location.reload(); return; }
  $('roomCodeInput').value = code.toUpperCase();
  $('joinStatus').textContent = 'Convite detectado — coloque seu nick e clique em Entrar.';
  $('joinBtn').classList.add('primaryBtn');
  $('joinBtn').style.width = 'auto';
}
readInvite();
addEventListener('hashchange', readInvite);

// ---------- host simulation ----------
// Driven by a worker timer, not requestAnimationFrame: browsers pause rAF in background tabs,
// which would freeze the match for every client whenever the host alt-tabs.
let authLast = performance.now();
const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000 / 60);'], { type: 'text/javascript' })));
ticker.onmessage = () => {
  if (pendingFrame) { const f = pendingFrame; pendingFrame = null; f(); }
  const now = performance.now();
  let dt = Math.min((now - authLast) / 1000, 0.25);
  authLast = now;
  if (!game.authority || !game.inGame) return;
  while (dt > 0) {
    const step = Math.min(dt, 1 / 30);
    game.authority.tick(step);
    dt -= step;
  }
};

// ---------- main loop ----------
const clock = new THREE.Clock();
let stateT = 0, pingT = 0, stepT = 0, hudT = 0, radarT = 0;
const remoteStep = new Map();

function frame() {
  nextFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.inGame) {
    const now = nowS();
    const active = inputActive();
    const ph = game.round.ph;
    const roundFrozen = comp() && (ph === 'freeze' || ph === 'pre' || ph === 'end');
    const busy = updateObjective(dt, active);
    const canAct = active && player.alive && !game.matchEnded;

    // free-mouse edge turning keeps you able to spin around without pointer lock
    if (freeMouse && canAct) {
      const edge = 60;
      if (mouseX < edge) player.look(-(edge - mouseX) * 25 * dt, 0);
      else if (mouseX > innerWidth - edge) player.look((mouseX - (innerWidth - edge)) * 25 * dt, 0);
    }
    player.lookEnabled = active && player.alive;
    player.update(dt, canAct, roundFrozen || busy);

    if (!canAct) weapons.mouseDown = false;
    const targets = [];
    for (const av of game.avatars.values()) {
      if (comp() && av.team === game.myTeam) continue;
      for (const h of av.hitboxes) if (h.visible) targets.push(h);
    }
    const canFire = canAct && !(comp() && (ph === 'freeze' || ph === 'pre')) && !busy;
    localEvents(weapons.update(dt, player, targets, world.meshes, canFire));

    const scoped = weapons.scoped && player.alive;
    const targetFov = scoped ? 22 : settings.fov;
    if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
    player.zoomSens = scoped ? 0.3 : 1;
    $('scope').classList.toggle('hidden', !scoped);
    weapons.holder.visible = !scoped && player.alive;

    game.shake = Math.max(0, game.shake - dt * 1.5);
    const sx = (Math.random() - 0.5) * game.shake * 0.04, sy = (Math.random() - 0.5) * game.shake * 0.04;

    if (player.alive) player.applyCamera(weapons.punch.x + sx, weapons.punch.y + sy);
    else updateDeadCamera(dt, now);

    const gap = weapons.spreadFor(player) === 0 ? 6 : Math.min(40, 4 + weapons.spreadFor(player) * 380 + weapons.shotIndex * 1.2);
    $('crosshair').style.setProperty('--gap', gap.toFixed(1) + 'px');
    $('crosshair').classList.toggle('hidden', scoped || !player.alive);

    const fl = game.flash;
    const fleft = fl.until - now;
    $('flashOverlay').style.opacity = fleft > 0 ? Math.min(1, fleft / (fl.dur * 0.55)).toFixed(3) : 0;

    if (player.alive && player.onGround && player.speed > 4 && !player.quiet) {
      stepT -= dt;
      if (stepT <= 0) { sfx.playStep(0.12); stepT = 0.36; }
    }

    stateT -= dt;
    if (stateT <= 0 && player.alive) {
      stateT = 0.05;
      sendToAuthority({ t: 'st', p: [+player.pos.x.toFixed(3), +player.pos.y.toFixed(3), +player.pos.z.toFixed(3)], y: +player.yaw.toFixed(3), x: +player.pitch.toFixed(3), c: +player.crouch.toFixed(2), w: weapons.key, pg: game.ping });
    }
    if (game.net.mode === 'client') {
      pingT -= dt;
      if (pingT <= 0) { pingT = 2; game.net.send({ t: 'ping', ts: performance.now() }); }
    }

    if (game.selfProxy) {
      game.selfProxy.setState({ p: [player.pos.x, player.pos.y, player.pos.z], y: player.yaw, x: player.pitch, c: player.crouch });
      game.selfProxy.snap();
      game.selfProxy.update(dt);
      for (const h of game.selfProxy.hitboxes) h.visible = player.alive;
    }

    for (const av of game.avatars.values()) {
      av.update(dt);
      if (!av.dead && av.root.visible && av.speed > 4.5) {
        const pos = av.root.position;
        const d = camera.position.distanceTo(pos);
        if (d < 28) {
          const t = (remoteStep.get(av.id) ?? 0) - dt;
          if (t <= 0) { sfx.playStep(0.35 * (1 - d / 28), panFor(pos)); remoteStep.set(av.id, 0.36); }
          else remoteStep.set(av.id, t);
        }
      }
    }
    for (const d of game.drops.values()) if (d.key === 'c4') d.mesh.rotation.y += dt;

    updateBombAudio(dt);

    radarT -= dt;
    if (radarT <= 0) { radarT = 1 / 30; drawRadar(); }

    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      updateHud();
      if (buyOpen()) refreshBuy();
    }
  } else {
    const t = performance.now() / 14000;
    camera.position.set(Math.sin(t) * 38, 24, Math.cos(t) * 38);
    camera.lookAt(0, 0, 0);
  }

  effects.update(dt);
  nadeFx.update(dt);
  renderer.render(scene, camera);
}

function updateDeadCamera(dt, now) {
  const since = now - game.deathAt;
  const compRound = comp() && game.round.ph !== 'warmup';
  if (compRound && since > 2.5) {
    $('deathScreen').classList.add('hidden');
    const c = spectateCandidates();
    if (!c.includes(game.spectate)) game.spectate = c[0] || null;
    const av = game.avatars.get(game.spectate);
    if (av) {
      const yaw = av.root.rotation.y;
      const target = av.root.position.clone().add(new THREE.Vector3(Math.sin(yaw) * 2.8, 2.1, Math.cos(yaw) * 2.8));
      camera.position.lerp(target, 1 - Math.exp(-dt * 8));
      camera.lookAt(av.root.position.clone().add(new THREE.Vector3(-Math.sin(yaw) * 4, 1.4, -Math.cos(yaw) * 4)));
      $('spectating').textContent = `Assistindo: ${nameOf(game.spectate)} — clique pra trocar`;
      $('spectating').classList.remove('hidden');
      return;
    }
    $('spectating').classList.add('hidden');
  }
  const killer = game.avatars.get(game.killerId);
  camera.position.lerp(new THREE.Vector3(player.pos.x, player.pos.y + 3.2, player.pos.z), 1 - Math.exp(-dt * 3));
  if (killer) camera.lookAt(killer.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
  $('respawnIn').textContent = compRound ? 'Você volta no próximo round' : `Renascendo em ${Math.max(0, Math.ceil(game.respawnAt - now))}s`;
}

function drawRadar() {
  const look = camera.getWorldDirection(new THREE.Vector3());
  const me = player.alive ? { x: player.pos.x, z: player.pos.z, yaw: player.yaw } : { x: camera.position.x, z: camera.position.z, yaw: Math.atan2(-look.x, -look.z) };
  const dots = [];
  if (comp()) {
    const myBit = game.myTeam === 'T' ? 1 : 2;
    for (const [id, av] of game.avatars) {
      const r = rosterOf(id);
      if (!r) continue;
      const p = av.root.position;
      if (r.tm === game.myTeam) dots.push({ x: p.x, z: p.z, yaw: av.dead ? undefined : av.root.rotation.y, color: TEAM_COLOR[r.tm], dead: av.dead });
      else if (!av.dead && (av.spotted & myBit)) dots.push({ x: p.x, z: p.z, color: '#ff3b3b' });
    }
  }
  let bomb = null;
  const b = game.round.bomb;
  if (comp() && b) {
    if (b.s === 'planted' && b.p) bomb = { x: b.p[0], z: b.p[2], planted: true };
    else if (game.myTeam === 'T') {
      const d = [...game.drops.values()].find(x => x.key === 'c4');
      if (d) bomb = { x: d.p[0], z: d.p[2] };
      else if (b.carrier && b.carrier !== game.myId) {
        const av = game.avatars.get(b.carrier);
        if (av) bomb = { x: av.root.position.x, z: av.root.position.z };
      }
    }
  }
  radar.draw(me, dots, bomb);
}

radar.setMap(world);
frame();
