import * as THREE from 'three';
import { buildMap, setupLighting, SPAWNS } from './map.js';
import { Player } from './player.js';
import { WeaponSystem, WEAPONS, PRIMARIES } from './weapons.js';
import { Avatar } from './avatar.js';
import { Net } from './network.js';
import { Authority, MATCH_SECONDS, FRAG_LIMIT, weaponName } from './authority.js';
import { NavGraph } from './bots.js';
import { Effects } from './effects.js';
import * as sfx from './audio.js';

const $ = id => document.getElementById(id);

// ---------- settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('as_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('as_' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const settings = {
  sens: store.get('sens', 1.2),
  vol: store.get('vol', 0.5),
  fov: store.get('fov', 80),
  primary: store.get('primary', 'ar7'),
};
if (!WEAPONS[settings.primary]) settings.primary = 'ar7';

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
const { colliders, meshes: mapMeshes, waypoints } = buildMap(scene);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const player = new Player(camera, colliders);
const weapons = new WeaponSystem(camera, scene);
const effects = new Effects(scene);

// ---------- game state ----------
const game = {
  net: new Net(),
  myId: 'local',
  myName: 'Jogador',
  colliders,
  mapMeshes,
  nav: null,
  authority: null,
  avatars: new Map(),
  roster: [],
  selfProxy: null,
  inGame: false,
  matchLeft: MATCH_SECONDS,
  matchLimit: FRAG_LIMIT,
  matchEnded: false,
  spawnedAt: 0,
  killerId: null,
  respawnAt: 0,
  ping: 0,
  allHitboxes() {
    const out = [];
    for (const a of this.avatars.values()) out.push(...a.hitboxes);
    if (this.selfProxy) out.push(...this.selfProxy.hitboxes);
    return out;
  },
  onGameMsg: msg => handleMsg(msg),
};

const DEBUG = new URLSearchParams(location.search).has('debug');
if (DEBUG) Object.assign(window, { game, player, weapons });
// debug: keep simulating even in hidden tabs so two tabs can be tested side by side
let pendingFrame = null;
const nextFrame = DEBUG ? cb => { pendingFrame = cb; } : cb => requestAnimationFrame(cb);

function nameOf(id) {
  if (id === game.myId) return game.myName;
  return game.roster.find(r => r.id === id)?.n || '???';
}

// Everything the local player does goes through here, so host and client share one path.
function sendToAuthority(msg) {
  if (game.authority) game.authority.onClientMsg(game.myId, msg);
  else game.net.send(msg);
}

// ---------- message handling (all peers) ----------
function handleMsg(msg) {
  switch (msg.t) {
    case 'welcome':
      game.myId = msg.id;
      break;

    case 'roster': {
      game.roster = msg.l;
      game.matchLeft = msg.m.left;
      game.matchLimit = msg.m.limit;
      const ids = new Set(msg.l.map(r => r.id));
      for (const [id, av] of game.avatars) if (!ids.has(id)) { av.dispose(); game.avatars.delete(id); }
      for (const r of msg.l) {
        if (r.id === game.myId) continue;
        let av = game.avatars.get(r.id);
        if (!av) { av = new Avatar(scene, r.id, r.n); av.name = r.n; game.avatars.set(r.id, av); av.setDead(!r.a); av.root.visible = r.a; }
        else if (av.name !== r.n) { av.setName(r.n); av.name = r.n; }
      }
      renderScoreboard();
      break;
    }

    case 'sts':
      for (const [id, p, y, x, c] of msg.l) {
        if (id === game.myId) continue;
        const av = game.avatars.get(id);
        if (av) av.setState({ p, y, x, c });
      }
      break;

    case 'spawn': {
      const p = new THREE.Vector3(...msg.p);
      if (msg.id === game.myId) {
        player.spawn(p);
        player.hp = 100;
        weapons.reset(settings.primary);
        player.speedMul = WEAPONS[weapons.key].speedMul;
        game.spawnedAt = performance.now() / 1000;
        game.killerId = null;
        $('deathScreen').classList.add('hidden');
        updateHud();
      } else {
        const av = game.avatars.get(msg.id);
        if (av) { av.target.pos.copy(p); av.snap(); av.setDead(false); av.root.visible = true; }
      }
      break;
    }

    case 'hp':
      if (msg.id === game.myId) {
        const lost = player.hp - msg.hp;
        player.hp = msg.hp;
        if (lost > 0) {
          sfx.playHurt();
          if (msg.from) showDamageDir(new THREE.Vector3(...msg.from));
        }
        updateHud();
      }
      break;

    case 'kill': {
      addKillFeed(msg);
      const mine = msg.k === game.myId;
      if (mine && msg.v !== game.myId) {
        sfx.playKill();
        toast(msg.h ? 'HEADSHOT!' : 'Abate', msg.h ? '#ff5a5a' : '#fff');
      }
      if (msg.v === game.myId) die(msg.k, msg.w, msg.h);
      else {
        const av = game.avatars.get(msg.v);
        if (av) { av.setDead(true); setTimeout(() => { if (av.dead) av.root.visible = false; }, 2500); }
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
      const d = camera.position.distanceTo(from);
      const vol = Math.max(0.04, 1 - d / 80) * 0.8;
      const w = WEAPONS[msg.w];
      if (w && !w.melee) sfx.playShot(w.sound, vol, panFor(from));
      break;
    }

    case 'end':
      game.matchEnded = true;
      $('endWinner').textContent = `${msg.winner} venceu com ${msg.kills} abates`;
      $('matchEnd').classList.remove('hidden');
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

function panFor(pos) {
  const toSrc = pos.clone().sub(camera.position).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  return toSrc.dot(right) * 0.8;
}

// ---------- local player events ----------
function die(killerId, weaponKey, head) {
  player.alive = false;
  player.hp = 0;
  weapons.mouseDown = false;
  weapons.scoped = false;
  game.killerId = killerId;
  game.respawnAt = performance.now() / 1000 + 3;
  $('deathScreen').classList.remove('hidden');
  $('deathBy').textContent = `Morto por ${nameOf(killerId)} (${weaponName(weaponKey)}${head ? ', headshot' : ''})`;
  updateHud();
}

function localShots(shots) {
  if (!shots.length) return;
  const muzzle = weapons.models[weapons.key].localToWorld(weapons.models[weapons.key].userData.muzzle.clone());
  const ends = [];
  let hitAny = false, headAny = false;
  const perTarget = new Map();
  for (const s of shots) {
    if (s.melee) {
      if (s.target) {
        perTarget.set(s.target, { dmg: s.dmg, head: false });
        effects.blood(s.point);
        hitAny = true;
      }
      continue;
    }
    effects.tracer(muzzle, s.point);
    ends.push([+s.point.x.toFixed(2), +s.point.y.toFixed(2), +s.point.z.toFixed(2)]);
    if (s.target) {
      effects.blood(s.point);
      hitAny = true; headAny ||= s.head;
      const prev = perTarget.get(s.target) || { dmg: 0, head: false };
      prev.dmg += s.dmg; prev.head ||= s.head;
      perTarget.set(s.target, prev);
    } else effects.impact(s.point, s.normal);
  }
  for (const [target, h] of perTarget) sendToAuthority({ t: 'hit', target, dmg: h.dmg, head: h.head, w: weapons.key });
  const o = camera.position;
  sendToAuthority({ t: 'shot', o: [o.x, o.y, o.z], e: ends, w: weapons.key });
  if (hitAny) { sfx.playHit(headAny); showHitMarker(headAny); }
}

// ---------- HUD ----------
function updateHud() {
  const hp = Math.max(0, Math.round(player.hp));
  $('hpText').textContent = hp;
  $('hpBox').classList.toggle('low', hp <= 25);
  const w = weapons.current, a = weapons.ammo[weapons.key];
  $('weaponName').textContent = w.name;
  if (w.melee) { $('ammoMag').textContent = '—'; $('ammoRes').textContent = ''; }
  else {
    $('ammoMag').textContent = weapons.reloading > 0 ? '...' : a.mag;
    $('ammoRes').textContent = '/ ' + a.reserve;
    $('ammoMag').classList.toggle('low', a.mag <= Math.ceil(w.mag * 0.2));
  }
  $('reloadHint').classList.toggle('hidden', w.melee || a.mag > 0 || weapons.reloading > 0 || !player.alive);
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
  toastTimer = setTimeout(() => { el.style.opacity = 0; }, 1100);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function addKillFeed(msg) {
  const feed = $('killFeed');
  const div = document.createElement('div');
  if (msg.k === game.myId || msg.v === game.myId) div.className = 'mine';
  div.innerHTML = `${esc(nameOf(msg.k))}<span class="w">[${esc(weaponName(msg.w))}]</span>${msg.h ? '<span class="hs">HS</span>' : ''}${esc(nameOf(msg.v))}`;
  feed.prepend(div);
  while (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => div.remove(), 6000);
}

function renderScoreboard() {
  const rows = [...game.roster].sort((a, b) => b.k - a.k || a.d - b.d);
  $('scoreBody').innerHTML = rows.map(r => `
    <tr class="${r.id === game.myId ? 'me' : ''} ${r.a ? '' : 'dead'}">
      <td>${esc(r.n)}${r.b ? '<span class="bot">BOT</span>' : ''}</td>
      <td>${r.k}</td><td>${r.d}</td><td>${r.b ? '-' : (r.id === game.myId && game.net.mode !== 'client' ? 'host' : (r.pg || '-'))}</td>
    </tr>`).join('');
  const me = game.roster.find(r => r.id === game.myId);
  const top = rows[0];
  $('fragInfo').textContent = me ? `Você: ${me.k} | Líder: ${top ? top.k : 0}/${game.matchLimit}` : '';
}

function formatTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- buy menu ----------
const WEAPON_DESC = {
  ar7: 'Rifle automático. Headshot de 1 tiro, recuo forte.',
  viper: 'SMG rápida e precisa em movimento. Dano baixo.',
  longbow: 'Sniper. Mata com 1 tiro no corpo. Botão direito mira.',
  breacher: 'Escopeta. Devastadora de perto, inútil de longe.',
};
function renderBuy() {
  $('buyGrid').innerHTML = PRIMARIES.map((k, i) => `
    <button class="buyItem ${settings.primary === k ? 'sel' : ''}" data-k="${k}">
      <span class="key">${i + 1}</span><b>${WEAPONS[k].name}</b><small>${WEAPON_DESC[k]}</small>
    </button>`).join('');
}
function choosePrimary(k) {
  settings.primary = k;
  store.set('primary', k);
  renderBuy();
  sfx.playBuy();
  if (player.alive && performance.now() / 1000 - game.spawnedAt < 10) {
    weapons.reset(k);
    player.speedMul = WEAPONS[k].speedMul;
    toast(WEAPONS[k].name);
  } else toast(`${WEAPONS[k].name} no próximo respawn`);
  closeBuy();
}
$('buyGrid').addEventListener('click', e => {
  const b = e.target.closest('.buyItem');
  if (b) choosePrimary(b.dataset.k);
});
function openBuy() { renderBuy(); $('buyMenu').classList.remove('hidden'); document.exitPointerLock?.(); }
function closeBuy() { $('buyMenu').classList.add('hidden'); lockPointer(); }
const buyOpen = () => !$('buyMenu').classList.contains('hidden');

// ---------- input ----------
function lockPointer() {
  if (!game.inGame) return;
  try {
    const r = document.body.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch { /* browser refused, user can click again */ }
}
const locked = () => document.pointerLockElement === document.body;

canvas.addEventListener('mousedown', e => {
  if (!game.inGame) return;
  if (!locked()) { lockPointer(); return; }
  if (e.button === 0) weapons.mouseDown = true;
  if (e.button === 2) weapons.toggleScope();
});
addEventListener('mouseup', e => { if (e.button === 0) weapons.mouseDown = false; });
addEventListener('contextmenu', e => { if (game.inGame) e.preventDefault(); });
addEventListener('wheel', e => { if (game.inGame && locked() && player.alive) weapons.handleWheel(e.deltaY); }, { passive: true });

document.addEventListener('pointerlockchange', () => {
  if (!game.inGame) return;
  if (locked()) { $('pauseMenu').classList.add('hidden'); }
  else {
    weapons.mouseDown = false;
    player.keys.clear();
    if (!buyOpen()) showPause();
  }
});

addEventListener('keydown', e => {
  if (!game.inGame) return;
  if (e.code === 'Tab') { $('scoreboard').classList.remove('hidden'); renderScoreboard(); return; }
  if (e.code === 'KeyB') { buyOpen() ? closeBuy() : openBuy(); return; }
  if (buyOpen()) {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= PRIMARIES.length) choosePrimary(PRIMARIES[n - 1]);
    if (e.code === 'Escape') closeBuy();
    return;
  }
  if (!locked() || !player.alive) return;
  weapons.handleKey(e.code);
  if (e.code.startsWith('Digit')) player.speedMul = WEAPONS[weapons.key].speedMul;
});
addEventListener('keyup', e => { if (e.code === 'Tab') $('scoreboard').classList.add('hidden'); });

// ---------- pause menu ----------
function showPause() {
  $('pauseMenu').classList.remove('hidden');
  const online = game.net.mode !== 'offline';
  $('pauseNote').textContent = online ? 'No online o jogo continua rolando.' : 'Treino offline.';
  $('pauseInvite').classList.toggle('hidden', !online);
  if (online) $('pauseLink').value = inviteLink(game.net.code);
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

// ---------- menu / session start ----------
function inviteLink(code) {
  return `${location.origin}${location.pathname}#sala=${code}`;
}
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

function ensureNav() {
  if (!game.nav) game.nav = new NavGraph(waypoints, colliders);
  return game.nav;
}

function startAuthority() {
  ensureNav();
  const auth = new Authority(game);
  game.authority = auth;
  game.selfProxy = new Avatar(scene, game.myId, game.myName);
  game.selfProxy.root.visible = false;
  auth.addPlayer(game.myId, game.myName);
  auth.addBots(parseInt($('botCount').value, 10), $('difficulty').value);
  game.net.onPeerJoin = () => {};
  game.net.onMessage = (from, msg) => auth.onClientMsg(from, msg);
  game.net.onPeerLeave = id => auth.removePlayer(id);
}

function enterGame() {
  sfx.initAudio();
  game.inGame = true;
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('roomTag').textContent = game.net.mode === 'offline' ? 'Treino offline' : `Sala ${game.net.code}`;
  player.spawn(SPAWNS[0]);
  player.alive = false;
  lockPointer();
}

$('offlineBtn').addEventListener('click', () => {
  game.myName = readNick();
  game.myId = 'local';
  startAuthority();
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
    startAuthority();
    $('roomLink').value = inviteLink(code);
    $('hostInfo').classList.remove('hidden');
    $('hostStatus').textContent = `Sala ${code} criada.`;
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
  game.net.onMessage = (_from, msg) => handleMsg(msg);
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
    game.net.send({ t: 'hello', name: game.myName });
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
let stateT = 0, pingT = 0, stepT = 0, hudT = 0;
const remoteStep = new Map();

function frame() {
  nextFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.inGame) {
    const now = performance.now() / 1000;
    const canAct = locked() && player.alive && !game.matchEnded;
    player.update(dt, canAct);

    if (!canAct) weapons.mouseDown = false;
    const targets = [];
    for (const av of game.avatars.values()) for (const h of av.hitboxes) if (h.visible) targets.push(h);
    const shots = weapons.update(dt, player, targets, mapMeshes);
    localShots(shots);

    // scope + fov
    const scoped = weapons.scoped && player.alive;
    const targetFov = scoped ? 22 : settings.fov;
    if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
    player.zoomSens = scoped ? 0.3 : 1;
    $('scope').classList.toggle('hidden', !scoped);
    weapons.holder.visible = !scoped && player.alive;

    if (player.alive) player.applyCamera(weapons.punch.x, weapons.punch.y);
    else {
      // simple death cam: rise up and look at the killer
      const killer = game.avatars.get(game.killerId);
      camera.position.lerp(new THREE.Vector3(player.pos.x, player.pos.y + 3.2, player.pos.z), 1 - Math.exp(-dt * 3));
      if (killer) camera.lookAt(killer.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
      $('respawnIn').textContent = `Renascendo em ${Math.max(0, Math.ceil(game.respawnAt - now))}s`;
    }

    // crosshair spread
    const gap = weapons.current.melee ? 6 : Math.min(40, 4 + weapons.spreadFor(player) * 380 + weapons.shotIndex * 1.2);
    $('crosshair').style.setProperty('--gap', gap.toFixed(1) + 'px');
    $('crosshair').classList.toggle('hidden', scoped || !player.alive);

    // footsteps
    if (player.alive && player.onGround && player.speed > 4 && !player.quiet) {
      stepT -= dt;
      if (stepT <= 0) { sfx.playStep(0.12); stepT = 0.36; }
    }

    // send own state
    stateT -= dt;
    if (stateT <= 0 && player.alive) {
      stateT = 0.05;
      sendToAuthority({ t: 'st', p: [+player.pos.x.toFixed(3), +player.pos.y.toFixed(3), +player.pos.z.toFixed(3)], y: +player.yaw.toFixed(3), x: +player.pitch.toFixed(3), c: +player.crouch.toFixed(2), pg: game.ping });
    }
    if (game.net.mode === 'client') {
      pingT -= dt;
      if (pingT <= 0) { pingT = 2; game.net.send({ t: 'ping', ts: performance.now() }); }
    }

    if (game.selfProxy) {
      game.selfProxy.setState({ p: [player.pos.x, player.pos.y, player.pos.z], y: player.yaw, x: player.pitch, c: player.crouch });
      game.selfProxy.snap();
      game.selfProxy.update(dt);
      game.selfProxy.setDead(!player.alive);
    }

    for (const av of game.avatars.values()) {
      av.update(dt);
      // enemy footsteps, the main sound cue in tactical shooters
      if (!av.dead && av.root.visible) {
        const spd = av.speedEstimate ?? 0;
        const moved = av.root.position.clone();
        const last = av.prevStepPos || moved;
        av.speedEstimate = Math.hypot(moved.x - last.x, moved.z - last.z) / Math.max(dt, 1e-4);
        av.prevStepPos = moved;
        const d = camera.position.distanceTo(moved);
        if (spd > 4.5 && d < 28) {
          const t = (remoteStep.get(av.id) ?? 0) - dt;
          if (t <= 0) { sfx.playStep(0.35 * (1 - d / 28), panFor(moved)); remoteStep.set(av.id, 0.36); }
          else remoteStep.set(av.id, t);
        }
      }
    }

    game.matchLeft -= dt;
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      $('matchTimer').textContent = formatTime(game.authority ? game.authority.matchLeft : game.matchLeft);
      updateHud();
    }
  } else {
    // idle menu camera orbit
    const t = performance.now() / 12000;
    camera.position.set(Math.sin(t) * 30, 18, Math.cos(t) * 30);
    camera.lookAt(0, 0, 0);
  }

  effects.update(dt);
  renderer.render(scene, camera);
}
frame();
