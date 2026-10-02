import * as THREE from 'three';

/**
 * WELDING / GRINDING SPARKS.
 * Every spark is a thin, camera-facing streak (a motion-blurred tail behind a bright head) that
 *  - starts white-hot and cools through yellow → orange → dull red while it flies,
 *  - flies on a gravity arc, bounces and skitters on the floor,
 *  - and some of them "pop": they burst into a few tiny sparks mid-air, exactly like sparks from a steel weld.
 */

// temperature ramp of a hot steel spark: white-hot → yellow → orange → dull red
const STOPS: number[][] = [
  [0.0, 1.0, 0.97, 0.88],
  [0.12, 1.0, 0.92, 0.6],
  [0.36, 1.0, 0.74, 0.2],
  [0.68, 1.0, 0.4, 0.06],
  [1.0, 0.5, 0.07, 0.01],
];

function ramp(u: number, out: number[]) {
  for (let i = 1; i < STOPS.length; i++) {
    const b = STOPS[i];
    if (u <= b[0]) {
      const a = STOPS[i - 1];
      const t = (u - a[0]) / (b[0] - a[0]);
      out[0] = a[1] + (b[1] - a[1]) * t;
      out[1] = a[2] + (b[2] - a[2]) * t;
      out[2] = a[3] + (b[3] - a[3]) * t;
      return;
    }
  }
  const l = STOPS[STOPS.length - 1];
  out[0] = l[1];
  out[1] = l[2];
  out[2] = l[3];
}

export class SparkStreaks {
  private readonly N = 1100;
  private p: Float32Array;
  private v: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private pop: Float32Array; // 0 = never, otherwise: pops when the remaining life fraction falls below this
  private tint: Float32Array;
  private weld: Uint8Array;
  private verts: Float32Array;
  private cols: Float32Array;
  private geo = new THREE.BufferGeometry();
  private head = 0;
  private rgb = [0, 0, 0];
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const N = this.N;
    this.p = new Float32Array(N * 3);
    this.v = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N).fill(1);
    this.size = new Float32Array(N);
    this.grav = new Float32Array(N);
    this.pop = new Float32Array(N);
    this.tint = new Float32Array(N * 3);
    this.weld = new Uint8Array(N);
    this.verts = new Float32Array(N * 12);
    this.cols = new Float32Array(N * 12);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.verts, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.cols, 3));
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = i * 4;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grav: number, weld: boolean, tr: number, tg: number, tb: number, pop: number) {
    const i = this.head;
    this.head = (this.head + 1) % this.N;
    const i3 = i * 3;
    this.p[i3] = x;
    this.p[i3 + 1] = y;
    this.p[i3 + 2] = z;
    this.v[i3] = vx;
    this.v[i3 + 1] = vy;
    this.v[i3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = grav;
    this.weld[i] = weld ? 1 : 0;
    this.tint[i3] = tr;
    this.tint[i3 + 1] = tg;
    this.tint[i3 + 2] = tb;
    this.pop[i] = pop;
  }

  /** a spark bursts into a few tiny ones (the typical "star" you see on a weld) */
  private burst(i: number) {
    const i3 = i * 3;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - b * b);
      const s = 2.2 + Math.random() * 3.6;
      this.emit(
        this.p[i3],
        this.p[i3 + 1],
        this.p[i3 + 2],
        this.v[i3] * 0.3 + Math.cos(a) * r * s,
        this.v[i3 + 1] * 0.3 + b * s,
        this.v[i3 + 2] * 0.3 + Math.sin(a) * r * s,
        0.16 + Math.random() * 0.26,
        this.size[i] * 0.7,
        this.grav[i],
        this.weld[i] === 1,
        this.tint[i3],
        this.tint[i3 + 1],
        this.tint[i3 + 2],
        0,
      );
    }
  }

  update(dt: number, cam: THREE.Camera) {
    const cx = cam.position.x;
    const cy = cam.position.y;
    const cz = cam.position.z;
    const rgb = this.rgb;
    let touched = false;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      touched = true;
      this.life[i] -= dt;
      const o = i * 12;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.verts.fill(0, o, o + 12);
        this.cols.fill(0, o, o + 12);
        continue;
      }
      const f = this.life[i] / this.maxLife[i];
      if (this.pop[i] > 0 && f < this.pop[i]) {
        this.pop[i] = 0;
        this.burst(i);
      }

      // ---- physics: gravity arc, a little air drag, bounce + skitter on the floor
      let vx = this.v[i3];
      let vy = this.v[i3 + 1];
      let vz = this.v[i3 + 2];
      vy -= this.grav[i] * dt;
      const drag = Math.max(0, 1 - 0.9 * dt);
      vx *= drag;
      vy *= drag;
      vz *= drag;
      let px = this.p[i3] + vx * dt;
      let py = this.p[i3 + 1] + vy * dt;
      let pz = this.p[i3 + 2] + vz * dt;
      const floor = Math.abs(px) < 15.6 && Math.abs(pz) < 15.6 ? 0.03 : -1.37;
      if (py < floor && vy < 0) {
        py = floor;
        if (-vy > 1.6) {
          vy *= -0.42;
          vx *= 0.8;
          vz *= 0.8;
        } else {
          vy = 0;
          vx *= 0.92;
          vz *= 0.92;
        }
      }
      this.p[i3] = px;
      this.p[i3 + 1] = py;
      this.p[i3 + 2] = pz;
      this.v[i3] = vx;
      this.v[i3 + 1] = vy;
      this.v[i3 + 2] = vz;

      // ---- colour = temperature
      const u = 1 - f;
      if (this.weld[i] === 1) ramp(u, rgb);
      else {
        const tr = this.tint[i3];
        const tg = this.tint[i3 + 1];
        const tb = this.tint[i3 + 2];
        if (u < 0.25) {
          const k = u / 0.25;
          rgb[0] = 1 + (tr - 1) * k;
          rgb[1] = 1 + (tg - 1) * k;
          rgb[2] = 1 + (tb - 1) * k;
        } else {
          const k = 1 - 0.8 * ((u - 0.25) / 0.75);
          rgb[0] = tr * k;
          rgb[1] = tg * k;
          rgb[2] = tb * k;
        }
      }
      const e = 1.9 * Math.pow(f, 0.45);
      const hr = rgb[0] * e;
      const hg = rgb[1] * e;
      const hb = rgb[2] * e;

      // ---- the streak: a quad from the bright head back along the velocity, facing the camera
      let spd = Math.sqrt(vx * vx + vy * vy + vz * vz);
      let dx = 0;
      let dy = 1;
      let dz = 0;
      if (spd > 0.01) {
        dx = vx / spd;
        dy = vy / spd;
        dz = vz / spd;
      } else spd = 0;
      const len = Math.min(1.5, Math.max(0.08, spd * 0.045));
      const tx = px - dx * len;
      const ty = py - dy * len;
      const tz = pz - dz * len;
      const wx = cx - px;
      const wy = cy - py;
      const wz = cz - pz;
      let sx = dy * wz - dz * wy;
      let sy = dz * wx - dx * wz;
      let sz = dx * wy - dy * wx;
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      const w = this.size[i] * (0.55 + 0.45 * f);
      sx = (sx / sl) * w;
      sy = (sy / sl) * w;
      sz = (sz / sl) * w;
      const w2 = 0.18;
      const V = this.verts;
      V[o] = px + sx;
      V[o + 1] = py + sy;
      V[o + 2] = pz + sz;
      V[o + 3] = px - sx;
      V[o + 4] = py - sy;
      V[o + 5] = pz - sz;
      V[o + 6] = tx + sx * w2;
      V[o + 7] = ty + sy * w2;
      V[o + 8] = tz + sz * w2;
      V[o + 9] = tx - sx * w2;
      V[o + 10] = ty - sy * w2;
      V[o + 11] = tz - sz * w2;
      const C = this.cols;
      C[o] = C[o + 3] = hr;
      C[o + 1] = C[o + 4] = hg;
      C[o + 2] = C[o + 5] = hb;
      C[o + 6] = C[o + 9] = hr * 0.1;
      C[o + 7] = C[o + 10] = hg * 0.1;
      C[o + 8] = C[o + 11] = hb * 0.1;
    }
    if (touched) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }
}
