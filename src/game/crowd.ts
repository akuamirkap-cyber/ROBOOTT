import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  empty?: boolean; // an unoccupied seat
}

// ---- muted, believable palettes: a real mix of light, mid and dark — not all black, not a rainbow ----
const TEES = [
  0xe8e6df, 0xe8e6df, 0xdad0c4, 0xcfd3d8, 0xb9c2cf, 0x8fa3bd, 0x6f86a8, 0xd8c8a8, 0xc2ae88, 0xb98c6a,
  0x9aa58a, 0x7b8a6e, 0xa9534d, 0x8c3b3f, 0x6d7a86, 0x3a3f4a, 0x22324b, 0x1a1d24,
];
const SUITS = [0x12141a, 0x1b2030, 0x2b3040, 0x555a64, 0x6b6358, 0x262a33, 0x8a8f98];
const TIES = [0x6a1f2a, 0x1f2d52, 0x2b2b30, 0x3a2a52, 0x244a45, 0x7a7a80];
const PANTS = [0x2c3c55, 0x3d5170, 0x3d5170, 0x6a6a60, 0xb8a888, 0x34343a, 0x14161b, 0x4a4f5a, 0x7a6a52];
// natural hair colours only (weighted towards dark, with a few browns, blondes and greys)
const HAIRS = [
  0x0e0e10, 0x0e0e10, 0x14110f, 0x14110f, 0x241a12, 0x241a12, 0x3b2a1c, 0x3b2a1c, 0x5a3d25, 0x7a5a36,
  0x6e3a22, 0xa07c4a, 0xc9a867, 0x8c8c8c, 0xd6d6d2,
];
const SKINS = [0xf1cfae, 0xdcae86, 0xb98058, 0x8a5a3a, 0x5a3a28];
const SEAT_COL = 0x1b2334;

// hair styles
const BALD = 0;
const SHORT = 1;
const CAP = 2;
const LONG = 3;
const BUN = 4;
const CURLY = 5;

interface Person {
  x: number;
  y: number;
  z: number;
  yaw: number;
  ph: number;
  sp: number; // jump / wave speed (rad/s) — deliberately slow
  thr: number; // how excited the crowd must be before this person reacts
  k: number; // body size
  seated: boolean;
  suit: boolean;
  hair: number;
  phone: number;
  pump: boolean; // seated person who throws both arms up when it gets loud
}

function pickHair() {
  const r = Math.random();
  if (r < 0.1) return BALD;
  if (r < 0.4) return SHORT;
  if (r < 0.58) return LONG;
  if (r < 0.66) return BUN;
  if (r < 0.74) return CURLY;
  return CAP;
}

/**
 * Low-poly spectators: chunky heads, simple faces, a mix of suits and plain tees in muted colours,
 * six different hairstyles in natural colours, most of them SEATED in proper chairs, some standing.
 * Everything is instanced.
 */
export function buildCrowd(scene: THREE.Scene, spots: Spot[], phoneCount: number) {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const people: Person[] = [];
  for (const s of spots) {
    if (s.empty) continue;
    people.push({
      x: s.x,
      y: s.y,
      z: s.z,
      yaw: s.yaw,
      ph: Math.random() * 10,
      sp: 2.2 + Math.random() * 1.5,
      thr: Math.random() * 0.75,
      k: 0.94 + Math.random() * 0.16,
      seated: Math.random() < 0.64,
      suit: Math.random() < 0.16,
      hair: pickHair(),
      phone: -1,
      pump: Math.random() < 0.3,
    });
  }
  const N = people.length;
  for (let k = 0; k < phoneCount && N > 0; k++) people[Math.floor(Math.random() * N)].phone = k;

  const std = (rough = 0.8) => new THREE.MeshStandardMaterial({ roughness: rough, metalness: 0.02 });
  const mk = (geo: THREE.BufferGeometry, count: number, m?: THREE.Material) => {
    const im = new THREE.InstancedMesh(geo, m ?? std(), Math.max(1, count));
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im);
    return im;
  };

  // ---------- seats (static) ----------
  {
    const seatG = new THREE.BoxGeometry(1.0, 0.2, 0.9);
    const backG = new THREE.BoxGeometry(1.0, 0.95, 0.12);
    const seats = new THREE.InstancedMesh(seatG, std(0.7), spots.length);
    const backs = new THREE.InstancedMesh(backG, std(0.7), spots.length);
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    spots.forEach((s, i) => {
      d.position.set(s.x, s.y + 0.1, s.z);
      d.rotation.set(0, s.yaw, 0);
      d.updateMatrix();
      seats.setMatrixAt(i, d.matrix);
      const off = new THREE.Vector3(0, 0.55, -0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      d.position.set(s.x + off.x, s.y + off.y, s.z + off.z);
      d.updateMatrix();
      backs.setMatrixAt(i, d.matrix);
      col.setHex(SEAT_COL).offsetHSL(0, 0, (Math.random() - 0.5) * 0.02);
      seats.setColorAt(i, col);
      backs.setColorAt(i, col);
    });
    seats.receiveShadow = backs.receiveShadow = true;
    scene.add(seats, backs);
  }

  // ---------- geometry ----------
  const torsoG = new RoundedBoxGeometry(0.92, 0.98, 0.62, 2, 0.2);
  const headG = new THREE.SphereGeometry(0.47, 12, 9);
  const eyeWG = new THREE.SphereGeometry(0.085, 6, 5);
  eyeWG.scale(1, 1.2, 0.5);
  const pupilG = new THREE.SphereGeometry(0.042, 6, 4);
  const mouthG = new THREE.SphereGeometry(0.08, 6, 4);
  mouthG.scale(1.4, 0.8, 0.5);
  const armG = new THREE.CapsuleGeometry(0.13, 0.42, 2, 6);
  armG.translate(0, -0.34, 0); // pivot at the shoulder
  const legG = new RoundedBoxGeometry(0.38, 0.78, 0.44, 1, 0.12);
  const thighG = new RoundedBoxGeometry(0.38, 0.62, 0.44, 1, 0.12);
  const shinG = new RoundedBoxGeometry(0.38, 0.55, 0.42, 1, 0.12);
  const hairG = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const hairBackG = new RoundedBoxGeometry(0.86, 0.8, 0.22, 1, 0.1); // long hair hanging down behind the head
  const bunG = new THREE.SphereGeometry(0.17, 8, 6);
  const brimG = new RoundedBoxGeometry(0.6, 0.06, 0.38, 1, 0.03);
  const shirtG = new THREE.BoxGeometry(0.3, 0.64, 0.04);
  const tieG = new THREE.BoxGeometry(0.09, 0.48, 0.04);

  const torso = mk(torsoG, N);
  const head = mk(headG, N);
  const eyeW = mk(eyeWG, N * 2, std(0.4));
  (eyeW.material as THREE.MeshStandardMaterial).color.set(0xf4f4f0);
  const pupil = mk(pupilG, N * 2, std(0.3));
  (pupil.material as THREE.MeshStandardMaterial).color.set(0x14151a);
  const mouth = mk(mouthG, N, std(0.6));
  (mouth.material as THREE.MeshStandardMaterial).color.set(0x2e0f12);
  const arms = mk(armG, N * 2);
  const legs = mk(legG, N * 2);
  const thighs = mk(thighG, N * 2);
  const shins = mk(shinG, N * 2);
  const hair = mk(hairG, N);
  const hairBack = mk(hairBackG, N);
  const bun = mk(bunG, N);
  const brim = mk(brimG, N);
  const shirt = mk(shirtG, N, std(0.6));
  (shirt.material as THREE.MeshStandardMaterial).color.set(0xe6e6e2);
  const tie = mk(tieG, N);

  const col = new THREE.Color();
  const jit = (hex: number, l = 0.04) => {
    col.setHex(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    col.getHSL(hsl);
    return col.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + (Math.random() - 0.5) * l, 0, 1));
  };

  people.forEach((p, i) => {
    const top = jit(p.suit ? pick(SUITS) : pick(TEES), 0.05).clone();
    torso.setColorAt(i, top);
    arms.setColorAt(i * 2, top);
    arms.setColorAt(i * 2 + 1, top);
    const pants = p.suit ? top.clone().multiplyScalar(0.9) : jit(pick(PANTS), 0.06).clone();
    for (const m of [legs, thighs, shins]) {
      m.setColorAt(i * 2, pants);
      m.setColorAt(i * 2 + 1, pants);
    }
    head.setColorAt(i, jit(pick(SKINS), 0.04));
    const hc = p.hair === CAP ? top.clone().multiplyScalar(0.8) : jit(pick(HAIRS), 0.04).clone();
    hair.setColorAt(i, hc);
    hairBack.setColorAt(i, hc);
    bun.setColorAt(i, hc);
    brim.setColorAt(i, hc);
    shirt.setColorAt(i, col.setHex(0xe6e6e2));
    tie.setColorAt(i, jit(pick(TIES), 0.04));
  });

  // ---------- phones ----------
  const phones = new THREE.InstancedMesh(new RoundedBoxGeometry(0.3, 0.5, 0.07, 1, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, phoneCount));
  phones.frustumCulled = false;
  phones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let k = 0; k < phoneCount; k++) {
    col.setHex(Math.random() < 0.85 ? 0xcfe0ff : 0xffe2b0).multiplyScalar(1.3);
    phones.setColorAt(k, col);
  }
  scene.add(phones);
  const phoneBlink = Array.from({ length: phoneCount }, () => ({ ph: Math.random() * 10, sp: 0.8 + Math.random() * 1.6 }));

  /** TRS matrix: pos = base + Ry(yaw)*local ; rot = Ry * Rx(ax) * Rz(az) ; uniform scale */
  const put = (m: THREE.InstancedMesh, idx: number, bx: number, by: number, bz: number, c: number, s: number, lx: number, ly: number, lz: number, ax: number, az: number, sc: number) => {
    const te = m.instanceMatrix.array as Float32Array;
    const o = idx * 16;
    let a00 = 1,
      a01 = 0,
      a10 = 0,
      a11 = 1,
      a12 = 0,
      a20 = 0,
      a21 = 0,
      a22 = 1;
    if (ax !== 0 || az !== 0) {
      const ca = Math.cos(ax);
      const sa = Math.sin(ax);
      const cb = Math.cos(az);
      const sb = Math.sin(az);
      a00 = cb;
      a01 = -sb;
      a10 = ca * sb;
      a11 = ca * cb;
      a12 = -sa;
      a20 = sa * sb;
      a21 = sa * cb;
      a22 = ca;
    }
    te[o] = (c * a00 + s * a20) * sc;
    te[o + 1] = a10 * sc;
    te[o + 2] = (-s * a00 + c * a20) * sc;
    te[o + 3] = 0;
    te[o + 4] = (c * a01 + s * a21) * sc;
    te[o + 5] = a11 * sc;
    te[o + 6] = (-s * a01 + c * a21) * sc;
    te[o + 7] = 0;
    te[o + 8] = s * a22 * sc;
    te[o + 9] = a12 * sc;
    te[o + 10] = c * a22 * sc;
    te[o + 11] = 0;
    te[o + 12] = bx + c * lx + s * lz;
    te[o + 13] = by + ly;
    te[o + 14] = bz - s * lx + c * lz;
    te[o + 15] = 1;
  };
  const sstep = (a: number, b: number, x: number) => {
    const u = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return u * u * (3 - 2 * u);
  };
  const H = 0.0001; // "hidden" scale

  const update = (t: number, hype: number) => {
    const amp = 0.025 + hype * 0.2; // small, slow hops
    const spdMul = 1 + hype * 0.22;
    for (let i = 0; i < N; i++) {
      const p = people[i];
      const cheer = sstep(p.thr, p.thr + 0.3, hype * 1.15);
      const beat = Math.sin(t * p.sp * spdMul + p.ph);
      const jump = p.seated ? 0 : Math.max(0, beat) * amp * (0.25 + cheer * 0.75);
      const k = p.k;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      // standing fans stand just in front of their chair so their legs don't clip through the seat
      const fwd = p.seated ? 0 : 0.78;
      const bx = p.x + s * fwd;
      const by = p.y + jump;
      const bz = p.z + c * fwd;
      const bob = Math.sin(t * 1.6 + p.ph) * 0.012 + (p.seated ? Math.max(0, beat) * 0.02 * cheer : 0);
      // heads glance around slowly; every face part turns together
      const yawH = p.yaw + Math.sin(t * 0.4 + p.ph) * 0.3 * (1 - cheer * 0.6);
      const ch = Math.cos(yawH);
      const sh = Math.sin(yawH);
      const sit = p.seated;

      const torsoY = sit ? 0.94 : 1.21;
      const headY = sit ? 1.85 : 2.12;
      const shY = sit ? 1.35 : 1.62;

      put(torso, i, bx, by, bz, c, s, 0, torsoY * k + bob, sit ? -0.02 : 0, sit ? -0.04 * cheer : 0, 0, k);
      put(head, i, bx, by, bz, ch, sh, 0, headY * k + bob, 0, 0, 0, k);
      put(eyeW, i * 2, bx, by, bz, ch, sh, -0.17 * k, (headY + 0.05) * k + bob, 0.44 * k, 0, 0, k);
      put(eyeW, i * 2 + 1, bx, by, bz, ch, sh, 0.17 * k, (headY + 0.05) * k + bob, 0.44 * k, 0, 0, k);
      put(pupil, i * 2, bx, by, bz, ch, sh, -0.17 * k, (headY + 0.045) * k + bob, 0.478 * k, 0, 0, k);
      put(pupil, i * 2 + 1, bx, by, bz, ch, sh, 0.17 * k, (headY + 0.045) * k + bob, 0.478 * k, 0, 0, k);
      put(mouth, i, bx, by, bz, ch, sh, 0, (headY - 0.17) * k + bob, 0.45 * k, 0, 0, k * (0.4 + cheer * 0.7 * (0.5 + 0.5 * Math.max(0, beat))));

      // hair: bald / short crop / long (hangs behind the head) / bun on top / big curly / cap
      const hs = p.hair;
      const domeSc = hs === BALD ? H : hs === CURLY ? k * 1.24 : hs === LONG ? k * 1.05 : k;
      const domeY = hs === CURLY ? 0.06 : 0.02;
      put(hair, i, bx, by, bz, ch, sh, 0, (headY + domeY) * k + bob, (hs === CURLY ? -0.05 : -0.02) * k, 0, 0, domeSc);
      put(hairBack, i, bx, by, bz, ch, sh, 0, (headY - 0.16) * k + bob, -0.38 * k, 0, 0, hs === LONG ? k : H);
      put(bun, i, bx, by, bz, ch, sh, 0, (headY + 0.5) * k + bob, -0.2 * k, 0, 0, hs === BUN ? k : H);
      put(brim, i, bx, by, bz, ch, sh, 0, (headY + 0.21) * k + bob, 0.44 * k, 0.08, 0, hs === CAP ? k : H);

      // suit: white shirt front + tie
      put(shirt, i, bx, by, bz, c, s, 0, (torsoY + 0.2) * k + bob, 0.33 * k, 0, 0, p.suit ? k : H);
      put(tie, i, bx, by, bz, c, s, 0, (torsoY + 0.14) * k + bob, 0.355 * k, 0, 0, p.suit ? k : H);

      // legs: standing = one straight pair; seated = thighs forward on the chair + shins hanging down
      if (sit) {
        put(legs, i * 2, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(legs, i * 2 + 1, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(thighs, i * 2, bx, by, bz, c, s, -0.23 * k, 0.41 * k, 0.3 * k, Math.PI / 2, 0, k);
        put(thighs, i * 2 + 1, bx, by, bz, c, s, 0.23 * k, 0.41 * k, 0.3 * k, Math.PI / 2, 0, k);
        put(shins, i * 2, bx, by, bz, c, s, -0.23 * k, 0.275 * k, 0.56 * k, 0, 0, k);
        put(shins, i * 2 + 1, bx, by, bz, c, s, 0.23 * k, 0.275 * k, 0.56 * k, 0, 0, k);
      } else {
        put(legs, i * 2, bx, by, bz, c, s, -0.23 * k, 0.39 * k, 0, 0, 0, k);
        put(legs, i * 2 + 1, bx, by, bz, c, s, 0.23 * k, 0.39 * k, 0, 0, 0, k);
        put(thighs, i * 2, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(thighs, i * 2 + 1, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(shins, i * 2, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(shins, i * 2 + 1, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
      }

      // arms
      const idleSway = Math.sin(t * 1.3 + p.ph) * 0.07;
      const wave = Math.sin(t * p.sp * 0.9 * spdMul + p.ph) * 0.3;
      let axL: number;
      let axR: number;
      let azL: number;
      let azR: number;
      if (sit) {
        if (p.pump) {
          // excited: both arms up while still seated
          const up = cheer * cheer;
          axL = THREE.MathUtils.lerp(-0.85, -2.65 + wave, up);
          axR = THREE.MathUtils.lerp(-0.85, -2.65 - wave, up);
          azL = THREE.MathUtils.lerp(0.2, -0.22, up);
          azR = -azL;
        } else {
          // calm → hands on lap; excited → applauding
          axL = axR = THREE.MathUtils.lerp(-0.85, -1.3, cheer);
          azL = THREE.MathUtils.lerp(0.2, 0.52 + 0.3 * Math.sin(t * 4.4 + p.ph), cheer);
          azR = -azL;
        }
      } else {
        axL = THREE.MathUtils.lerp(idleSway, -2.7 + wave, cheer);
        axR = THREE.MathUtils.lerp(-idleSway, -2.7 - wave, cheer);
        azL = THREE.MathUtils.lerp(-0.08, -0.26, cheer);
        azR = -azL;
      }
      if (p.phone >= 0) {
        axR = -2.1 + Math.sin(t * 1.4 + p.ph) * 0.05;
        azR = 0.12;
      }
      put(arms, i * 2, bx, by, bz, c, s, -0.6 * k, shY * k + bob, 0, axL, azL, k);
      put(arms, i * 2 + 1, bx, by, bz, c, s, 0.6 * k, shY * k + bob, 0, axR, azR, k);

      if (p.phone >= 0) {
        const bl = phoneBlink[p.phone];
        const on = Math.sin(t * bl.sp + bl.ph) > -0.4 ? 1 : 0;
        const ca = Math.cos(axR);
        const sa = Math.sin(axR);
        const cb = Math.cos(azR);
        const sb = Math.sin(azR);
        const hx = 0.6 + 0.78 * sb;
        const hy = shY - 0.78 * cb * ca;
        const hz = -0.78 * cb * sa;
        put(phones, p.phone, bx, by, bz, c, s, hx * k, (hy + 0.18) * k + bob, (hz + 0.14) * k, 0, 0, on * (0.95 + hype * 0.2) * k + H);
      }
    }
    for (const m of [torso, head, eyeW, pupil, mouth, arms, legs, thighs, shins, hair, hairBack, bun, brim, shirt, tie, phones]) m.instanceMatrix.needsUpdate = true;
  };

  update(0, 0.1);
  return { update };
}
