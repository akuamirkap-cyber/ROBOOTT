import * as THREE from 'three';
import { SparkStreaks } from './sparks';

function glowTexture(inner = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, inner * 32, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  // 4-point high-contrast anime/AAA fighting-game impact starburst spikes
  g.save();
  g.translate(64, 64);
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 4);
    const sg = g.createLinearGradient(-62, 0, 62, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.38, 'rgba(255,255,255,0.75)');
    sg.addColorStop(0.5, 'rgba(255,255,255,1)');
    sg.addColorStop(0.62, 'rgba(255,255,255,0.75)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.ellipse(0, 0, i % 2 === 0 ? 62 : 42, i % 2 === 0 ? 3.5 : 2.2, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return new THREE.CanvasTexture(c);
}

export class Effects {
  private N = 700;
  private pos: Float32Array;
  private col: Float32Array;
  private base: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private head = 0;
  private points: THREE.Points;
  private rings: { m: THREE.Mesh; age: number; life: number; max: number }[] = [];
  private impactRings: { m: THREE.Mesh; age: number; life: number; max: number }[] = [];
  private flashes: { s: THREE.Sprite; age: number; life: number; size: number }[] = [];
  private starFlares: { s: THREE.Sprite; age: number; life: number; size: number }[] = [];
  private light: THREE.PointLight;
  private lightPow = 0;
  private streaks: SparkStreaks;
  // ---- METAL DEBRIS: armour chips and bolt fragments knocked off by a blow (tumbling instanced solids)
  private readonly SN = 160;
  private shardMesh: THREE.InstancedMesh;
  private sPos = new Float32Array(this.SN * 3);
  private sVel = new Float32Array(this.SN * 3);
  private sRot = new Float32Array(this.SN * 3);
  private sSpin = new Float32Array(this.SN * 3);
  private sLife = new Float32Array(this.SN);
  private sMax = new Float32Array(this.SN).fill(1);
  private sSize = new Float32Array(this.SN).fill(1);
  private sHead = 0;
  private sDummy = new THREE.Object3D();
  private sColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const N = this.N;
    this.pos = new Float32Array(N * 3).fill(-100);
    this.col = new Float32Array(N * 3);
    this.base = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N).fill(1);
    this.grav = new Float32Array(N).fill(14);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.26,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.streaks = new SparkStreaks(scene);

    // debris: a chipped slab (box) with a hot, fading edge glow — one instanced draw call for all of them
    const shardGeo = new THREE.BoxGeometry(0.16, 0.05, 0.11);
    const shardMat = new THREE.MeshStandardMaterial({ color: 0x8e949c, metalness: 0.9, roughness: 0.35, emissive: 0xff8a40, emissiveIntensity: 0 });
    this.shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, this.SN);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.castShadow = true;
    this.shardMesh.frustumCulled = false;
    this.shardMesh.count = this.SN;
    for (let i = 0; i < this.SN; i++) {
      this.sDummy.position.set(0, -100, 0);
      this.sDummy.scale.setScalar(0.001);
      this.sDummy.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.sDummy.matrix);
      this.shardMesh.setColorAt(i, this.sColor.setHex(0x8e949c));
    }
    scene.add(this.shardMesh);

    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 56),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, age: 1, life: 1, max: 1 });
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 1, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      m.visible = false;
      scene.add(m);
      this.impactRings.push({ m, age: 1, life: 1, max: 1 });
    }
    const tex = glowTexture();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, age: 1, life: 1, size: 1 });
    }
    const stex = starTexture();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: stex,
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          opacity: 0,
          rotation: Math.random() * Math.PI,
        }),
      );
      s.visible = false;
      scene.add(s);
      this.starFlares.push({ s, age: 1, life: 1, size: 1 });
    }
    this.light = new THREE.PointLight(0xffffff, 0, 16, 1.5);
    scene.add(this.light);
  }

  /**
   * A burst of welding sparks: thin white-hot streaks that cool to orange and red, fly on a gravity arc, bounce on the floor
   * and sometimes pop into a few tiny sparks. Most are fast (long streaks), ~20% drift slowly and glow for longer.
   */
  private weldBurst(p: THREE.Vector3, n: number, speed: number, c: THREE.Color, warm: boolean, dir: THREE.Vector3 | undefined, spread: number, life: number, grav: number) {
    for (let k = 0; k < n; k++) {
      let vx = (Math.random() * 2 - 1) * spread;
      let vy = (Math.random() * 2 - 1) * spread * 0.8 + 0.3;
      let vz = (Math.random() * 2 - 1) * spread;
      if (dir) {
        vx += dir.x * 1.4;
        vy += dir.y * 1.4;
        vz += dir.z * 1.4;
      }
      const l = Math.hypot(vx, vy, vz) || 1;
      const drift = Math.random() < 0.2;
      const sp = speed * (drift ? 0.3 + Math.random() * 0.3 : 0.25 + Math.pow(Math.random(), 1.6) * 1.15);
      this.streaks.emit(
        p.x,
        p.y,
        p.z,
        (vx / l) * sp,
        (vy / l) * sp,
        (vz / l) * sp,
        life * (0.55 + Math.random() * 0.9) * (drift ? 1.5 : 1),
        0.016 + Math.random() * 0.022,
        grav * 1.25,
        warm,
        c.r,
        c.g,
        c.b,
        !drift && Math.random() < 0.2 ? 0.35 + Math.random() * 0.25 : 0,
      );
    }
  }

  spark(p: THREE.Vector3, n: number, speed: number, color: number, dir?: THREE.Vector3, spread = 1, life = 0.7, grav = 14) {
    const c = new THREE.Color(color);
    // fast, hot-coloured sparks are WELDING SPARKS (streaks); slow, grey ones stay soft dust
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    if (grav >= 8 && (hsl.s > 0.15 || hsl.l > 0.9)) {
      const warm = hsl.s < 0.15 || hsl.h < 0.17 || hsl.h > 0.95;
      this.weldBurst(p, n, speed, c, warm, dir, spread, life, grav);
      return;
    }
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.N;
      const rx = Math.random() * 2 - 1;
      const ry = Math.random() * 2 - 1;
      const rz = Math.random() * 2 - 1;
      const sp = speed * (0.35 + Math.random() * 0.9);
      let vx = rx * spread;
      let vy = ry * spread * 0.8 + 0.3;
      let vz = rz * spread;
      if (dir) {
        vx += dir.x * 1.4;
        vy += dir.y * 1.4;
        vz += dir.z * 1.4;
      }
      const l = Math.hypot(vx, vy, vz) || 1;
      this.vel[i * 3] = (vx / l) * sp;
      this.vel[i * 3 + 1] = (vy / l) * sp;
      this.vel[i * 3 + 2] = (vz / l) * sp;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const bright = 0.8 + Math.random() * 1.0;
      this.base[i * 3] = c.r * bright;
      this.base[i * 3 + 1] = c.g * bright;
      this.base[i * 3 + 2] = c.b * bright;
      this.maxLife[i] = life * (0.5 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i];
      this.grav[i] = grav;
    }
  }

  /**
   * ARMOUR DEBRIS. A heavy blow does not only make sparks: it knocks chips of plating and bolt heads off the
   * armour. They fly out of the impact with the punch, tumble, bounce on the canvas, and lie there for a moment.
   * `color` tints the chips to the armour that was hit; a fraction of them carry a hot glowing edge.
   */
  shards(p: THREE.Vector3, n: number, dir: THREE.Vector3, color = 0x8e949c, speed = 9, scale = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.sHead;
      this.sHead = (this.sHead + 1) % this.SN;
      const i3 = i * 3;
      let vx = (Math.random() * 2 - 1) * 0.9 + dir.x * 1.3;
      let vy = Math.random() * 0.9 + 0.35 + dir.y * 0.6;
      let vz = (Math.random() * 2 - 1) * 0.9 + dir.z * 1.3;
      const l = Math.hypot(vx, vy, vz) || 1;
      const sp = speed * (0.4 + Math.random() * 0.9);
      vx = (vx / l) * sp;
      vy = (vy / l) * sp;
      vz = (vz / l) * sp;
      this.sPos[i3] = p.x + (Math.random() - 0.5) * 0.3;
      this.sPos[i3 + 1] = p.y + (Math.random() - 0.5) * 0.3;
      this.sPos[i3 + 2] = p.z + (Math.random() - 0.5) * 0.3;
      this.sVel[i3] = vx;
      this.sVel[i3 + 1] = vy;
      this.sVel[i3 + 2] = vz;
      this.sRot[i3] = Math.random() * Math.PI * 2;
      this.sRot[i3 + 1] = Math.random() * Math.PI * 2;
      this.sRot[i3 + 2] = Math.random() * Math.PI * 2;
      this.sSpin[i3] = (Math.random() - 0.5) * 24;
      this.sSpin[i3 + 1] = (Math.random() - 0.5) * 24;
      this.sSpin[i3 + 2] = (Math.random() - 0.5) * 24;
      this.sMax[i] = 1.4 + Math.random() * 1.2;
      this.sLife[i] = this.sMax[i];
      this.sSize[i] = scale * (0.5 + Math.random() * 1.1);
      // chips take the colour of the armour they came off, a few are still glowing hot at the break
      const hot = Math.random() < 0.35;
      this.sColor.setHex(color);
      if (hot) this.sColor.lerp(new THREE.Color(0xffb060), 0.75);
      else this.sColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
      this.shardMesh.setColorAt(i, this.sColor);
    }
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
  }

  ring(x: number, z: number, color: number, max: number, life = 0.5, y = 0.07) {
    const r = this.rings.find((q) => q.age >= q.life) ?? this.rings[0];
    r.age = 0;
    r.life = life;
    r.max = max;
    r.m.position.set(x, y, z);
    (r.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.m.visible = true;
  }

  /**
   * 3D Oriented Sonic Shockwave Ring + 4-Point Starburst Impact Flare right at the point of fist contact!
   */
  impactWave(p: THREE.Vector3, dir: THREE.Vector3, color: number, max: number, life = 0.24) {
    const r = this.impactRings.find((q) => q.age >= q.life) ?? this.impactRings[0];
    r.age = 0;
    r.life = life;
    r.max = max;
    r.m.position.copy(p);
    // Orient ring perpendicular to the punch vector so it bursts outward like a 3D sonic boom halo
    r.m.lookAt(p.x + dir.x, p.y + dir.y * 0.4, p.z + dir.z);
    (r.m.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.m.visible = true;

    const sf = this.starFlares.find((q) => q.age >= q.life) ?? this.starFlares[0];
    sf.age = 0;
    sf.life = life * 0.65;
    sf.size = max * 0.95;
    sf.s.position.copy(p);
    const smat = sf.s.material as THREE.SpriteMaterial;
    smat.color.setHex(0xffffff);
    smat.rotation = Math.random() * Math.PI;
    sf.s.visible = true;
  }

  flash(p: THREE.Vector3, size: number, color: number, life = 0.18) {
    const f = this.flashes.find((q) => q.age >= q.life) ?? this.flashes[0];
    f.age = 0;
    f.life = life;
    f.size = size;
    f.s.position.copy(p);
    (f.s.material as THREE.SpriteMaterial).color.setHex(color);
    f.s.visible = true;
    this.light.position.copy(p);
    this.light.color.setHex(color);
    this.lightPow = size * 26; // a heavier punch of light on an impact — the ring answers every blow
  }

  update(dt: number, cam?: THREE.Camera) {
    if (cam) this.streaks.update(dt, cam);
    const N = this.N;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -100;
        this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0;
        continue;
      }
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.vel[i3] *= 1 - 0.8 * dt;
      this.vel[i3 + 2] *= 1 - 0.8 * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05 && this.grav[i] > 0) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.35;
      }
      const f = Math.pow(this.life[i] / this.maxLife[i], 0.8);
      this.col[i3] = this.base[i3] * f;
      this.col[i3 + 1] = this.base[i3 + 1] * f;
      this.col[i3 + 2] = this.base[i3 + 2] * f;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;

    // ---- debris: gravity, tumble, bounce + skid on the canvas, shrink away at the end of life
    let anyShard = false;
    for (let i = 0; i < this.SN; i++) {
      if (this.sLife[i] <= 0) continue;
      anyShard = true;
      const i3 = i * 3;
      this.sLife[i] -= dt;
      if (this.sLife[i] <= 0) {
        this.sDummy.position.set(0, -100, 0);
        this.sDummy.scale.setScalar(0.001);
        this.sDummy.updateMatrix();
        this.shardMesh.setMatrixAt(i, this.sDummy.matrix);
        continue;
      }
      this.sVel[i3 + 1] -= 26 * dt;
      this.sPos[i3] += this.sVel[i3] * dt;
      this.sPos[i3 + 1] += this.sVel[i3 + 1] * dt;
      this.sPos[i3 + 2] += this.sVel[i3 + 2] * dt;
      let onFloor = false;
      if (this.sPos[i3 + 1] < 0.04) {
        this.sPos[i3 + 1] = 0.04;
        if (this.sVel[i3 + 1] < -0.6) {
          this.sVel[i3 + 1] *= -0.38;
          this.sVel[i3] *= 0.6;
          this.sVel[i3 + 2] *= 0.6;
          this.sSpin[i3] *= 0.5;
          this.sSpin[i3 + 1] *= 0.5;
          this.sSpin[i3 + 2] *= 0.5;
        } else {
          this.sVel[i3 + 1] = 0;
          this.sVel[i3] *= 1 - 6 * dt;
          this.sVel[i3 + 2] *= 1 - 6 * dt;
          onFloor = true;
        }
      }
      if (!onFloor) {
        this.sRot[i3] += this.sSpin[i3] * dt;
        this.sRot[i3 + 1] += this.sSpin[i3 + 1] * dt;
        this.sRot[i3 + 2] += this.sSpin[i3 + 2] * dt;
      } else {
        // settle flat
        this.sRot[i3] *= 1 - 8 * dt;
        this.sRot[i3 + 2] *= 1 - 8 * dt;
      }
      const u = this.sLife[i] / this.sMax[i];
      const sc = this.sSize[i] * (u < 0.2 ? u / 0.2 : 1);
      this.sDummy.position.set(this.sPos[i3], this.sPos[i3 + 1], this.sPos[i3 + 2]);
      this.sDummy.rotation.set(this.sRot[i3], this.sRot[i3 + 1], this.sRot[i3 + 2]);
      this.sDummy.scale.setScalar(sc);
      this.sDummy.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.sDummy.matrix);
    }
    if (anyShard) this.shardMesh.instanceMatrix.needsUpdate = true;

    for (const r of this.rings) {
      if (r.age >= r.life) {
        r.m.visible = false;
        continue;
      }
      r.age += dt;
      const u = Math.min(1, r.age / r.life);
      const e = 1 - Math.pow(1 - u, 3);
      r.m.scale.setScalar(0.3 + e * r.max);
      (r.m.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9;
    }
    for (const r of this.impactRings) {
      if (r.age >= r.life) {
        r.m.visible = false;
        continue;
      }
      r.age += dt;
      const u = Math.min(1, r.age / r.life);
      const e = 1 - Math.pow(1 - u, 3.2);
      r.m.scale.setScalar(0.25 + e * r.max);
      (r.m.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - u, 1.3) * 0.95;
    }
    for (const f of this.flashes) {
      if (f.age >= f.life) {
        f.s.visible = false;
        continue;
      }
      f.age += dt;
      const u = Math.min(1, f.age / f.life);
      f.s.scale.setScalar(f.size * (0.5 + u * 1.6));
      (f.s.material as THREE.SpriteMaterial).opacity = (1 - u) * 0.65;
    }
    for (const sf of this.starFlares) {
      if (sf.age >= sf.life) {
        sf.s.visible = false;
        continue;
      }
      sf.age += dt;
      const u = Math.min(1, sf.age / sf.life);
      const e = 1 - Math.pow(1 - u, 2.5);
      sf.s.scale.setScalar(sf.size * (0.35 + e * 1.45));
      const smat = sf.s.material as THREE.SpriteMaterial;
      smat.opacity = Math.pow(1 - u, 1.5) * 0.92;
      smat.rotation += dt * 2.5;
    }
    this.lightPow *= Math.exp(-14 * dt);
    this.light.intensity = this.lightPow;
  }
}

/** Camera-facing ribbon that follows a fast-moving fist. */
export class Trail {
  private pts: { p: THREE.Vector3; age: number }[] = [];
  private N = 18;
  private life = 0.29;
  private geo = new THREE.BufferGeometry();
  private posA: Float32Array;
  private colA: Float32Array;
  readonly mesh: THREE.Mesh;
  private color = new THREE.Color();
  width = 0.76;

  constructor(scene: THREE.Scene, color: number) {
    this.color.setHex(color);
    this.posA = new Float32Array(this.N * 2 * 3);
    this.colA = new Float32Array(this.N * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colA, 3));
    const idx: number[] = [];
    for (let i = 0; i < this.N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setColor(c: number) {
    this.color.setHex(c);
  }

  update(p: THREE.Vector3, emit: boolean, dt: number, cam: THREE.Camera) {
    for (const q of this.pts) q.age += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].age > this.life) this.pts.pop();
    if (emit) {
      this.pts.unshift({ p: p.clone(), age: 0 });
      if (this.pts.length > this.N) this.pts.pop();
    }
    const n = this.pts.length;
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const tan = new THREE.Vector3();
    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < this.N; i++) {
      const j = Math.min(i, n - 1);
      const cur = this.pts[j];
      const prev = this.pts[Math.max(0, j - 1)].p;
      const next = this.pts[Math.min(n - 1, j + 1)].p;
      tan.subVectors(prev, next);
      if (tan.lengthSq() < 1e-6) tan.set(0, 1, 0);
      view.subVectors(cam.position, cur.p);
      side.crossVectors(tan, view).normalize();
      const f = i < n ? Math.max(0, 1 - cur.age / this.life) : 0;
      const w = this.width * f * (0.35 + 0.65 * f);
      const o = i * 6;
      this.posA[o] = cur.p.x + side.x * w;
      this.posA[o + 1] = cur.p.y + side.y * w;
      this.posA[o + 2] = cur.p.z + side.z * w;
      this.posA[o + 3] = cur.p.x - side.x * w;
      this.posA[o + 4] = cur.p.y - side.y * w;
      this.posA[o + 5] = cur.p.z - side.z * w;
      const c = Math.pow(f, 1.8) * 0.9;
      for (let k = 0; k < 2; k++) {
        this.colA[o + k * 3] = this.color.r * c;
        this.colA[o + k * 3 + 1] = this.color.g * c;
        this.colA[o + k * 3 + 2] = this.color.b * c;
      }
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
