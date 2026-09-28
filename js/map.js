import * as THREE from 'three';

// ---------- procedural textures ----------
function makeCanvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function noise(g, size, alpha, count) {
  for (let i = 0; i < count; i++) {
    const v = Math.random() * 255 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
}

const TEXTURES = {
  floor: () => makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#b89968'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.08, 6000);
    g.strokeStyle = 'rgba(80,60,30,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= s; i += s / 2) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
    }
  }),
  stone: () => makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#a89274'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.1, 7000);
    g.strokeStyle = 'rgba(60,45,25,0.35)'; g.lineWidth = 3;
    for (let y = 0; y < s; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      for (let x = (y / 32) % 2 ? 0 : 32; x < s; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
    }
  }),
  wall: () => makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#d8c39a'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.07, 8000);
    g.fillStyle = 'rgba(120,90,50,0.12)';
    for (let i = 0; i < 25; i++) g.fillRect(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, 6 + Math.random() * 20);
    g.fillStyle = 'rgba(90,70,40,0.35)'; g.fillRect(0, s - 18, s, 18);
  }),
  wall2: () => makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#c9a27a'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.08, 8000);
    g.fillStyle = 'rgba(150,80,40,0.12)';
    for (let i = 0; i < 30; i++) g.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 50, 4 + Math.random() * 12);
    g.fillStyle = 'rgba(70,50,30,0.4)'; g.fillRect(0, s - 14, s, 14);
  }),
  crate: () => makeCanvasTexture(128, (g, s) => {
    g.fillStyle = '#8a6236'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#5a3c1c'; g.lineWidth = 3;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
    g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
    g.beginPath(); g.moveTo(4, 4); g.lineTo(s - 4, s - 4); g.stroke();
    noise(g, s, 0.1, 1500);
  }),
  metal: () => makeCanvasTexture(128, (g, s) => {
    g.fillStyle = '#4a5560'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.1, 2500);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2;
    for (let i = 0; i < s; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); }
  }),
  wood: () => makeCanvasTexture(128, (g, s) => {
    g.fillStyle = '#5e4128'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < s; i += 16) { g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
    noise(g, s, 0.12, 2000);
  }),
};
const TILE = { floor: 8, stone: 6, wall: 4, wall2: 4, crate: 2.4, metal: 3, wood: 2 };

function tiledBox(sx, sy, sz, tile) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const uv = geo.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    const [w, h] = dims[f];
    for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile); }
  }
  return geo;
}

function letterDecal(letter, size) {
  const tex = makeCanvasTexture(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.font = 'bold 200px Impact, Arial Black, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(190, 40, 30, 0.8)';
    g.fillText(letter, s / 2, s / 2 + 10);
    g.globalCompositeOperation = 'destination-out';
    noise(g, s, 0.6, 1500);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------- map definitions ----------
const rect = (x1, z1, x2, z2) => ({ x1, z1, x2, z2 });
export const inRect = (r, x, z) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;

// Arena: small free-for-all map. Boxes: [cx, cz, sx, sz, h, material, baseY]
const ARENA_BOXES = [
  [0, -40.5, 82, 1, 7, 'wall'], [0, 40.5, 82, 1, 7, 'wall'], [-40.5, 0, 1, 82, 7, 'wall'], [40.5, 0, 1, 82, 7, 'wall'],
  [0, -22, 2, 24, 5, 'wall'], [0, 22, 2, 24, 5, 'wall'], [0, 0, 2, 6, 5, 'wall'],
  [-22, -8, 14, 1.5, 5, 'wall'], [-22, 8, 14, 1.5, 5, 'wall'], [-29, 0, 1.5, 17.5, 5, 'wall'],
  [-15, -5.5, 1.5, 3.5, 5, 'wall'], [-15, 5.5, 1.5, 3.5, 5, 'wall'],
  [20, -12, 20, 1.5, 4, 'wall'], [20, 12, 20, 1.5, 4, 'wall'],
  [28, -28, 14, 14, 2, 'metal'], [20.375, -24, 1.25, 3, 1.5, 'metal'], [19.125, -24, 1.25, 3, 1.0, 'metal'], [17.875, -24, 1.25, 3, 0.5, 'metal'],
  [-28, 28, 14, 14, 2, 'metal'], [-20.375, 24, 1.25, 3, 1.5, 'metal'], [-19.125, 24, 1.25, 3, 1.0, 'metal'], [-17.875, 24, 1.25, 3, 0.5, 'metal'],
  [-8, -30, 2.4, 2.4, 2.4, 'crate'], [-8, -30, 1.4, 1.4, 1.2, 'crate', 2.4], [-11, -27, 2.4, 2.4, 2.4, 'crate'],
  [10, 30, 2.4, 2.4, 2.4, 'crate'], [12.6, 30, 2.4, 2.4, 2.4, 'crate'], [11.3, 30, 1.4, 1.4, 1.2, 'crate', 2.4],
  [8, -4, 2, 2, 1.2, 'crate'], [8, 4, 2, 2, 1.2, 'crate'], [-8, 12, 2.4, 2.4, 2.4, 'crate'], [-8, -16, 2, 2, 1.2, 'crate'],
  [30, 0, 2.4, 2.4, 2.4, 'crate'], [30, 2.6, 2.4, 2.4, 1.2, 'crate'], [-34, -30, 2.4, 2.4, 2.4, 'crate'], [34, 32, 2.4, 2.4, 2.4, 'crate'],
  [20, 20, 2.4, 2.4, 2.4, 'crate'], [-20, -22, 2.4, 2.4, 2.4, 'crate'], [-25, -5, 2, 2, 1.2, 'crate'],
];
const ARENA_SPAWNS = [[-35, 0, -35], [35, 0, 35], [-35, 0, 12], [35, 0, -8], [-10, 0, 35], [10, 0, -35], [-22, 0, 0], [20, 0, 0], [28, 2, -28], [-28, 2, 28]];

// Oasis: two-site defuse map. Everything outside these open areas becomes solid buildings.
const OASIS_OPEN = [
  rect(-14, 32, 14, 44),   // T spawn
  rect(14, 36, 44, 44),    // T -> A long
  rect(36, -18, 44, 44),   // A long
  rect(22, -42, 44, -16),  // A site
  rect(-44, 36, -14, 44),  // T -> B
  rect(-44, -18, -36, 44), // B tunnels
  rect(-44, -42, -22, -16),// B site
  rect(-4, -34, 4, 34),    // mid
  rect(-12, -44, 12, -32), // CT spawn
  rect(10, -42, 24, -34),  // CT -> A
  rect(-24, -42, -10, -34),// CT -> B
  rect(4, -12, 30, -6),    // short A catwalk
  rect(24, -20, 30, -6),   // short A drop
  rect(-30, -12, -4, -6),  // mid -> B
  rect(-30, -20, -22, -6), // B window
  rect(4, 16, 36, 22),     // courtyard mid <-> long
  rect(-36, 8, -4, 14),    // mid <-> tunnels
];
const OASIS_PROPS = [
  // tunnel roof
  [-40, 12, 8, 40, 0.8, 'wood', 3.4],
  // mid doors + lintel
  [-2.7, -22, 2.6, 0.6, 4.5, 'wood'], [2.7, -22, 2.6, 0.6, 4.5, 'wood'], [0, -22, 2.8, 0.6, 1.3, 'wood', 3.2],
  // long doors + lintel
  [36.9, 26, 1.8, 0.6, 4.5, 'wood'], [42.1, 26, 3.8, 0.6, 4.5, 'wood'], [39, 26, 2.4, 0.6, 1.3, 'wood', 3.2],
  // A site
  [32, -28, 2.4, 2.4, 2.4, 'crate'], [34.4, -28, 2.4, 2.4, 2.4, 'crate'], [33.2, -28, 1.4, 1.4, 1.2, 'crate', 2.4],
  [41, -39, 2, 2, 1.2, 'crate'], [26, -38, 2.4, 2.4, 2.4, 'crate'], [39, -21, 3, 1, 1.2, 'stone'], [28, -33, 1.2, 4, 1.1, 'stone'],
  // B site
  [-33, -30, 2.4, 2.4, 2.4, 'crate'], [-33, -27.6, 2.4, 2.4, 1.2, 'crate'], [-40, -38, 2.4, 2.4, 2.4, 'crate'],
  [-26, -24, 2, 2, 1.2, 'crate'], [-42, -20, 2.4, 2.4, 2.4, 'crate'], [-37, -35, 4, 1.2, 1.1, 'stone'],
  // mid / lanes
  [2, 6, 2, 2, 1.2, 'crate'], [-2, -28, 2.4, 2.4, 2.4, 'crate'], [40, 10, 2.4, 2.4, 2.4, 'crate'], [38, -6, 2.4, 2.4, 2.4, 'crate'],
  [-40, 22, 2, 2, 1.2, 'crate'], [16, -9, 1.6, 1.6, 1.0, 'crate'], [20, 19, 2.4, 2.4, 2.4, 'crate'],
  // spawns
  [-12, 34, 2.4, 2.4, 2.4, 'crate'], [12, 42, 2.4, 2.4, 2.4, 'crate'], [-11, -34, 2.4, 2.4, 2.4, 'crate'], [11, -43, 2, 2, 1.2, 'crate'],
];
const grid = (xs, zs, y = 0) => xs.flatMap(x => zs.map(z => [x, y, z]));

export const MAPS = {
  arena: {
    name: 'Arena', bounds: rect(-41, -41, 41, 41), modes: ['dm'],
    dmSpawns: ARENA_SPAWNS,
  },
  oasis: {
    name: 'Oásis', bounds: rect(-48, -46, 48, 46), modes: ['comp', 'dm'],
    spawns: { T: grid([-8, -4, 0, 4, 8], [37, 41]), CT: grid([-8, -4, 0, 4, 8], [-40, -36]) },
    buyZones: { T: rect(-14, 32, 14, 44), CT: rect(-12, -44, 12, -32) },
    sites: { A: rect(22, -42, 44, -16), B: rect(-44, -42, -22, -16) },
    siteCenters: { A: [33, -30], B: [-33, -30] },
    siteEntrances: { A: [[27, -14], [18, -38], [40, -14]], B: [[-26, -14], [-18, -38], [-40, -14]] },
    dmSpawns: [...grid([-8, 0, 8], [38]), ...grid([-8, 0, 8], [-38]), [40, 0, 0], [-40, 0, 0], [33, 0, -24], [-33, 0, -24], [0, 0, 10], [20, 0, -9], [-18, 0, -9], [20, 0, 40], [-28, 0, 40]],
  },
};

// ---------- world ----------
export class World {
  constructor(scene) {
    this.scene = scene;
    this.group = null;
    this.colliders = [];
    this.meshes = [];
    this.waypoints = [];
    this.key = null;
    this.info = null;
    this.mats = {};
    for (const k of Object.keys(TEXTURES)) {
      this.mats[k] = new THREE.MeshStandardMaterial({ map: TEXTURES[k](), roughness: 0.9, metalness: k === 'metal' ? 0.4 : 0 });
    }
  }

  load(key) {
    if (this.key === key) return;
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.colliders.length = 0;
    this.meshes.length = 0;
    this.key = key;
    this.info = MAPS[key];
    const b = this.info.bounds;

    const floor = this.addBox((b.x1 + b.x2) / 2, (b.z1 + b.z2) / 2, b.x2 - b.x1, b.z2 - b.z1, 1, key === 'oasis' ? 'stone' : 'floor', -1, false);
    floor.receiveShadow = true;

    if (key === 'arena') {
      for (const [cx, cz, sx, sz, h, m, y0] of ARENA_BOXES) this.addBox(cx, cz, sx, sz, h, m, y0 ?? 0);
    } else {
      this.buildFromOpenAreas(OASIS_OPEN, b);
      for (const [cx, cz, sx, sz, h, m, y0] of OASIS_PROPS) this.addBox(cx, cz, sx, sz, h, m, y0 ?? 0);
      for (const [site, [x, z]] of Object.entries(this.info.siteCenters)) {
        const d = letterDecal(site, 7);
        d.position.set(x, 0.02, z);
        this.group.add(d);
      }
    }
    this.buildWaypoints();
  }

  addBox(cx, cz, sx, sz, h, mat, y0 = 0, collide = true) {
    const mesh = new THREE.Mesh(tiledBox(sx, h, sz, TILE[mat]), this.mats[mat]);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
    if (collide) {
      this.colliders.push(new THREE.Box3(new THREE.Vector3(cx - sx / 2, y0, cz - sz / 2), new THREE.Vector3(cx + sx / 2, y0 + h, cz + sz / 2)));
    }
    return mesh;
  }

  // Greedy-merge the solid 2m cells into as few boxes as possible.
  buildFromOpenAreas(open, b) {
    const C = 2, nx = (b.x2 - b.x1) / C, nz = (b.z2 - b.z1) / C;
    const solid = [], seen = [];
    for (let i = 0; i < nx; i++) {
      solid.push([]); seen.push([]);
      for (let j = 0; j < nz; j++) {
        const x = b.x1 + i * C + 1, z = b.z1 + j * C + 1;
        solid[i].push(!open.some(r => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2));
        seen[i].push(false);
      }
    }
    let n = 0;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (!solid[i][j] || seen[i][j]) continue;
        let w = 1;
        while (i + w < nx && solid[i + w][j] && !seen[i + w][j]) w++;
        let h = 1;
        grow: while (j + h < nz) {
          for (let k = 0; k < w; k++) if (!solid[i + k][j + h] || seen[i + k][j + h]) break grow;
          h++;
        }
        for (let a = 0; a < w; a++) for (let c = 0; c < h; c++) seen[i + a][j + c] = true;
        const height = 6 + ((i * 7 + j * 13) % 3);
        this.addBox(b.x1 + (i + w / 2) * C, b.z1 + (j + h / 2) * C, w * C, h * C, height, n++ % 3 === 0 ? 'wall2' : 'wall');
      }
    }
  }

  buildWaypoints() {
    const b = this.info.bounds, step = 3;
    const probe = new THREE.Box3();
    this.waypoints = [];
    // grid aligned so nodes land in the middle of doorways centered on multiples of 3
    for (let x = b.x1 + 3; x < b.x2; x += step) {
      for (let z = b.z1 + 3; z < b.z2; z += step) {
        probe.min.set(x - 0.8, 0.1, z - 0.8);
        probe.max.set(x + 0.8, 1.8, z + 0.8);
        if (!this.colliders.some(c => c.intersectsBox(probe))) this.waypoints.push(new THREE.Vector3(x, 0, z));
      }
    }
  }
}

export function setupLighting(scene) {
  scene.background = new THREE.Color('#9fc4e8');
  scene.fog = new THREE.Fog('#9fc4e8', 70, 160);
  scene.add(new THREE.HemisphereLight('#dbe9ff', '#8a7050', 0.9));
  const sun = new THREE.DirectionalLight('#fff1d6', 1.6);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -58; s.right = 58; s.top = 58; s.bottom = -58; s.near = 1; s.far = 160;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}
