import * as THREE from 'three';

const MAX_DECALS = 120;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.decals = [];
    this.tracerMat = new THREE.LineBasicMaterial({ color: '#ffe8a0', transparent: true, opacity: 0.85 });
    this.decalGeo = new THREE.PlaneGeometry(0.1, 0.1);
    this.decalMat = new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    this.puffGeo = new THREE.SphereGeometry(1, 6, 4);
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.07, max: 0.07, kind: 'tracer' });
  }

  impact(point, normal) {
    if (normal) {
      const d = new THREE.Mesh(this.decalGeo, this.decalMat);
      d.position.copy(point).addScaledVector(normal, 0.01);
      d.lookAt(point.clone().add(normal));
      d.rotation.z = Math.random() * Math.PI;
      this.scene.add(d);
      this.decals.push(d);
      if (this.decals.length > MAX_DECALS) this.scene.remove(this.decals.shift());
    }
    this.puff(point, '#d9c7a0', 0.12, 0.25);
  }

  blood(point) {
    this.puff(point, '#9b1010', 0.18, 0.3);
  }

  puff(point, color, size, life) {
    const m = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.copy(point);
    m.scale.setScalar(size * 0.4);
    this.scene.add(m);
    this.items.push({ obj: m, life, max: life, kind: 'puff', size });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const t = Math.max(0, it.life / it.max);
      it.obj.material.opacity = (it.kind === 'tracer' ? 0.85 : 0.8) * t;
      if (it.kind === 'puff') it.obj.scale.setScalar(it.size * (1.2 - t * 0.8));
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        if (it.kind === 'tracer') it.obj.geometry.dispose();
        it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  clearDecals() {
    for (const d of this.decals) this.scene.remove(d);
    this.decals = [];
  }
}
