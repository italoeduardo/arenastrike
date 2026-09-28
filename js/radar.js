const PX = 4;       // offscreen pixels per meter
const VIEW = 2.6;   // radar pixels per meter

export const TEAM_COLOR = { T: '#e0b44c', CT: '#5aa9ff' };

export class Radar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = null;
  }

  setMap(world) {
    const b = world.info.bounds;
    const w = (b.x2 - b.x1) * PX, h = (b.z2 - b.z1) * PX;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#6d6250';
    g.fillRect(0, 0, w, h);
    for (const col of world.colliders) {
      const tall = col.max.y - col.min.y > 2.6 && col.min.y < 1;
      if (col.min.y > 2.5) continue;
      g.fillStyle = tall ? '#26231e' : '#4d4538';
      g.fillRect((col.min.x - b.x1) * PX, (col.min.z - b.z1) * PX, (col.max.x - col.min.x) * PX, (col.max.z - col.min.z) * PX);
    }
    const info = world.info;
    if (info.sites) {
      g.font = `bold ${10 * PX}px Arial Black, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [name, r] of Object.entries(info.sites)) {
        g.fillStyle = 'rgba(200, 60, 40, 0.25)';
        g.fillRect((r.x1 - b.x1) * PX, (r.z1 - b.z1) * PX, (r.x2 - r.x1) * PX, (r.z2 - r.z1) * PX);
        g.fillStyle = 'rgba(255, 90, 60, 0.85)';
        const [cx, cz] = info.siteCenters[name];
        g.fillText(name, (cx - b.x1) * PX, (cz - b.z1) * PX);
      }
    }
    this.map = c;
    this.bounds = b;
  }

  // me: {x, z, yaw}; dots: [{x, z, yaw, color, dead}]; bomb: {x, z, planted}
  draw(me, dots, bomb) {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.map) return;
    ctx.save();
    ctx.fillStyle = 'rgba(10,12,15,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(me.yaw);
    const toScreen = (x, z) => [(x - me.x) * VIEW, (z - me.z) * VIEW];
    const s = VIEW / PX;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.map, (this.bounds.x1 - me.x) * VIEW, (this.bounds.z1 - me.z) * VIEW, this.map.width * s, this.map.height * s);
    ctx.globalAlpha = 1;

    if (bomb) {
      const [bx, bz] = toScreen(bomb.x, bomb.z);
      ctx.fillStyle = bomb.planted ? '#ff3030' : '#ff9f1a';
      ctx.fillRect(bx - 4, bz - 3, 8, 6);
    }
    for (const d of dots) {
      const [x, z] = toScreen(d.x, d.z);
      if (d.dead) {
        ctx.strokeStyle = d.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 3, z - 3); ctx.lineTo(x + 3, z + 3); ctx.moveTo(x + 3, z - 3); ctx.lineTo(x - 3, z + 3); ctx.stroke();
        continue;
      }
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(x, z, 4, 0, Math.PI * 2); ctx.fill();
      if (d.yaw !== undefined) {
        ctx.strokeStyle = d.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x - Math.sin(d.yaw) * 8, z - Math.cos(d.yaw) * 8); ctx.stroke();
      }
    }
    ctx.restore();

    // self arrow, always pointing up
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 7); ctx.lineTo(W / 2 + 5, H / 2 + 5); ctx.lineTo(W / 2, H / 2 + 2); ctx.lineTo(W / 2 - 5, H / 2 + 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
}
