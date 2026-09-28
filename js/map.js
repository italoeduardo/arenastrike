import * as THREE from 'three';

function makeCanvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
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

const textures = {
  floor: () => makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#b89968'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.08, 6000);
    g.strokeStyle = 'rgba(80,60,30,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= s; i += s / 2) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
    }
  }),
  wall: () => makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#d8c39a'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.07, 8000);
    g.fillStyle = 'rgba(120,90,50,0.12)';
    for (let i = 0; i < 25; i++) g.fillRect(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, 6 + Math.random() * 20);
    g.fillStyle = 'rgba(90,70,40,0.35)'; g.fillRect(0, s - 18, s, 18);
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
};

// Remap BoxGeometry UVs to world-space size so textures tile uniformly.
function tiledBox(sx, sy, sz, tile) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const uv = geo.attributes.uv;
  const faceDims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    const [w, h] = faceDims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
    }
  }
  return geo;
}

// [centerX, centerZ, sizeX, sizeZ, height, material, baseY]
const LAYOUT = [
  // outer walls
  [0, -40.5, 82, 1, 7, 'wall'], [0, 40.5, 82, 1, 7, 'wall'],
  [-40.5, 0, 1, 82, 7, 'wall'], [40.5, 0, 1, 82, 7, 'wall'],

  // mid spine with doorways
  [0, -22, 2, 24, 5, 'wall'], [0, 22, 2, 24, 5, 'wall'],
  [0, 0, 2, 6, 5, 'wall'],

  // west building
  [-22, -8, 14, 1.5, 5, 'wall'], [-22, 8, 14, 1.5, 5, 'wall'],
  [-29, 0, 1.5, 17.5, 5, 'wall'],
  [-15, -5.5, 1.5, 3.5, 5, 'wall'], [-15, 5.5, 1.5, 3.5, 5, 'wall'],

  // east long corridor walls
  [20, -12, 20, 1.5, 4, 'wall'], [20, 12, 20, 1.5, 4, 'wall'],

  // north-east platform + stairs
  [28, -28, 14, 14, 2, 'metal'],
  [20.375, -24, 1.25, 3, 1.5, 'metal'], [19.125, -24, 1.25, 3, 1.0, 'metal'], [17.875, -24, 1.25, 3, 0.5, 'metal'],

  // south-west platform + stairs
  [-28, 28, 14, 14, 2, 'metal'],
  [-20.375, 24, 1.25, 3, 1.5, 'metal'], [-19.125, 24, 1.25, 3, 1.0, 'metal'], [-17.875, 24, 1.25, 3, 0.5, 'metal'],

  // crates scattered
  [-8, -30, 2.4, 2.4, 2.4, 'crate'], [-8, -30, 1.4, 1.4, 1.2, 'crate', 2.4],
  [-11, -27, 2.4, 2.4, 2.4, 'crate'],
  [10, 30, 2.4, 2.4, 2.4, 'crate'], [12.6, 30, 2.4, 2.4, 2.4, 'crate'], [11.3, 30, 1.4, 1.4, 1.2, 'crate', 2.4],
  [8, -4, 2, 2, 1.2, 'crate'], [8, 4, 2, 2, 1.2, 'crate'],
  [-8, 12, 2.4, 2.4, 2.4, 'crate'], [-8, -16, 2, 2, 1.2, 'crate'],
  [30, 0, 2.4, 2.4, 2.4, 'crate'], [30, 2.6, 2.4, 2.4, 1.2, 'crate'],
  [-34, -30, 2.4, 2.4, 2.4, 'crate'], [34, 32, 2.4, 2.4, 2.4, 'crate'],
  [20, 20, 2.4, 2.4, 2.4, 'crate'], [-20, -22, 2.4, 2.4, 2.4, 'crate'],
  [-25, -5, 2, 2, 1.2, 'crate'],
];

export const SPAWNS = [
  new THREE.Vector3(-35, 0, -35), new THREE.Vector3(35, 0, 35),
  new THREE.Vector3(-35, 0, 12), new THREE.Vector3(35, 0, -8),
  new THREE.Vector3(-10, 0, 35), new THREE.Vector3(10, 0, -35),
  new THREE.Vector3(-22, 0, 0), new THREE.Vector3(20, 0, 0),
  new THREE.Vector3(28, 2, -28), new THREE.Vector3(-28, 2, 28),
];

export function buildMap(scene) {
  const mats = {};
  for (const k of Object.keys(textures)) {
    mats[k] = new THREE.MeshStandardMaterial({ map: textures[k](), roughness: 0.9, metalness: k === 'metal' ? 0.4 : 0 });
  }
  const tiles = { wall: 4, crate: 2.4, metal: 3, floor: 8 };

  const colliders = [];
  const meshes = [];

  const floor = new THREE.Mesh(tiledBox(82, 1, 82, tiles.floor), mats.floor);
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);
  meshes.push(floor);

  for (const [cx, cz, sx, sz, h, mat, baseY] of LAYOUT) {
    const y0 = baseY ?? 0;
    const mesh = new THREE.Mesh(tiledBox(sx, h, sz, tiles[mat]), mats[mat]);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
    colliders.push(new THREE.Box3(
      new THREE.Vector3(cx - sx / 2, y0, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, y0 + h, cz + sz / 2),
    ));
  }

  const waypoints = [];
  for (let x = -36; x <= 36; x += 4) {
    for (let z = -36; z <= 36; z += 4) {
      const p = new THREE.Vector3(x, 0, z);
      const probe = new THREE.Box3(new THREE.Vector3(x - 1, 0.1, z - 1), new THREE.Vector3(x + 1, 1.8, z + 1));
      if (!colliders.some(c => c.intersectsBox(probe))) waypoints.push(p);
    }
  }

  return { colliders, meshes, waypoints };
}

export function setupLighting(scene) {
  scene.background = new THREE.Color('#9fc4e8');
  scene.fog = new THREE.Fog('#9fc4e8', 60, 140);

  scene.add(new THREE.HemisphereLight('#dbe9ff', '#8a7050', 0.9));

  const sun = new THREE.DirectionalLight('#fff1d6', 1.6);
  sun.position.set(30, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -50; s.right = 50; s.top = 50; s.bottom = -50; s.near = 1; s.far = 150;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}
