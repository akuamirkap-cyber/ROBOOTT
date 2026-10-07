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
// team / fan colours: a block of neighbouring seats shares one, so the stands have real colour patches
const FAN = [0xb03a33, 0x2c4a8f, 0xbfa03a, 0x2f7a4e, 0xa8622a, 0x5a4a86, 0xb9bcc2, 0x22242c];

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
  girth: number; // shoulder width / chest depth
  fan: number; // -1 = ordinary clothes, otherwise an index into FAN (a block of fans in team colours)
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
      girth: 0.92 + Math.random() * 0.22,
      fan: Math.random() < 0.18 ? Math.floor(Math.random() * FAN.length) : -1,
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

  // ---------- geometry (every part is instanced: one draw call each) ----------
  /** a rounded box tapered towards the waist, so a torso reads as a body and not as a crate */
  const tapered = (w: number, h: number, d: number, r: number, waist: number, seg = 3) => {
    const g = new RoundedBoxGeometry(w, h, d, seg, r);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(0.5 - pos.getY(i) / h, 0, 1); // 0 at the shoulders, 1 at the waist
      const k = THREE.MathUtils.lerp(1, waist, t * t);
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const torsoG = tapered(0.76, 1.02, 0.54, 0.15, 0.7, 2);
  const shoulderG = new THREE.SphereGeometry(0.165, 8, 6);
  const neckG = new THREE.CylinderGeometry(0.125, 0.16, 0.2, 6);
  const headG = new THREE.SphereGeometry(0.345, 12, 8);
  headG.scale(1.0, 1.08, 1.03);
  // the face sits ON the skull (every feature is a small lens placed at the surface of the head ellipsoid, so
  // nothing is buried inside the head or pokes out of the cheeks)
  const browG = new THREE.SphereGeometry(1, 8, 4);
  browG.scale(0.2, 0.042, 0.085); // one soft brow ridge that follows the curve of the forehead
  const eyeG = new THREE.SphereGeometry(1, 7, 5);
  eyeG.scale(0.052, 0.04, 0.034); // two dark eyes
  const noseG = new THREE.BoxGeometry(0.06, 0.11, 0.08);
  const mouthG = new THREE.SphereGeometry(0.062, 6, 4);
  mouthG.scale(1.5, 0.7, 0.5);
  const armUpG = new THREE.CapsuleGeometry(0.105, 0.2, 2, 6); // pivot at the shoulder
  armUpG.translate(0, -0.17, 0);
  const armLoG = new THREE.CapsuleGeometry(0.09, 0.22, 2, 6); // pivot at the elbow
  armLoG.translate(0, -0.2, 0);
  const handG = new THREE.SphereGeometry(0.1, 7, 5); // a real hand at the end of the forearm
  handG.scale(1, 1.15, 0.7);
  const legG = new THREE.BoxGeometry(0.3, 0.78, 0.36); // legs are mostly behind the seats: plain boxes are enough
  const thighG = new THREE.BoxGeometry(0.3, 0.6, 0.36);
  const shinG = new THREE.BoxGeometry(0.28, 0.54, 0.32);
  // hair: a cap that hugs the skull (radius a hair above the head, rim just above the brow) — not a floating helmet
  const hairG = new THREE.SphereGeometry(0.366, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const hairBackG = new RoundedBoxGeometry(0.58, 0.6, 0.2, 1, 0.08); // long hair hanging down behind the head
  const bunG = new THREE.SphereGeometry(0.125, 7, 5);
  const brimG = new THREE.BoxGeometry(0.44, 0.045, 0.3);
  // suit: the shirt front and the tie are thin tapered shells that follow the chest instead of floating off it
  const shirtG = tapered(0.26, 0.92, 0.57, 0.04, 0.7, 1);
  shirtG.translate(0, 0, 0.022);
  const tieG = tapered(0.085, 0.62, 0.6, 0.02, 0.72, 1);
  tieG.translate(0, 0, 0.036);

  const torso = mk(torsoG, N);
  const shoulders = mk(shoulderG, N * 2);
  const neck = mk(neckG, N);
  const head = mk(headG, N);
  const brow = mk(browG, N);
  const eyes = mk(eyeG, N * 2, std(0.45));
  (eyes.material as THREE.MeshStandardMaterial).color.set(0x1a1b20);
  const nose = mk(noseG, N);
  const mouth = mk(mouthG, N, std(0.6));
  (mouth.material as THREE.MeshStandardMaterial).color.set(0x3a1418);
  const armUp = mk(armUpG, N * 2);
  const armLo = mk(armLoG, N * 2, std(0.72));
  const hands = mk(handG, N * 2, std(0.75));
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
    // a block of neighbouring seats wears the same colour once in a while: that is what a real arena looks like
    const top = (p.fan >= 0 ? jit(FAN[p.fan], 0.07) : jit(p.suit ? pick(SUITS) : pick(TEES), 0.05)).clone();
    torso.setColorAt(i, top);
    shoulders.setColorAt(i * 2, top);
    shoulders.setColorAt(i * 2 + 1, top);
    armUp.setColorAt(i * 2, top);
    armUp.setColorAt(i * 2 + 1, top);
    const pants = p.suit ? top.clone().multiplyScalar(0.9) : jit(pick(PANTS), 0.06).clone();
    for (const m of [legs, thighs, shins]) {
      m.setColorAt(i * 2, pants);
      m.setColorAt(i * 2 + 1, pants);
    }
    const skin = jit(pick(SKINS), 0.04).clone();
    head.setColorAt(i, skin);
    hands.setColorAt(i * 2, skin);
    hands.setColorAt(i * 2 + 1, skin);
    neck.setColorAt(i, skin.clone().multiplyScalar(0.92));
    nose.setColorAt(i, skin.clone().multiplyScalar(0.96));
    // bare forearms for the short-sleeved tee crowd, sleeves for the suits
    const lo = p.suit ? top.clone() : skin.clone().multiplyScalar(0.97);
    armLo.setColorAt(i * 2, lo);
    armLo.setColorAt(i * 2 + 1, lo);
    const hc = (p.hair === CAP ? top.clone().multiplyScalar(0.8) : jit(pick(HAIRS), 0.04)).clone();
    hair.setColorAt(i, hc);
    hairBack.setColorAt(i, hc);
    bun.setColorAt(i, hc);
    brim.setColorAt(i, hc);
    brow.setColorAt(i, hc.clone().multiplyScalar(0.72)); // the brow sits in the hair colour, a shade darker
    shirt.setColorAt(i, col.setHex(0xe6e6e2));
    tie.setColorAt(i, jit(pick(TIES), 0.04));
  });

  // ---------- phones ----------
  const phones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.5, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, phoneCount));
  phones.frustumCulled = false;
  phones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let k = 0; k < phoneCount; k++) {
    col.setHex(Math.random() < 0.85 ? 0xcfe0ff : 0xffe2b0).multiplyScalar(1.3);
    phones.setColorAt(k, col);
  }
  scene.add(phones);
  const phoneBlink = Array.from({ length: phoneCount }, () => ({ ph: Math.random() * 10, sp: 0.8 + Math.random() * 1.6 }));

  /** TRS matrix: pos = base + Ry(yaw)*local ; rot = Ry * Rx(ax) * Rz(az) ; uniform scale (+ optional girth) */
  const put = (m: THREE.InstancedMesh, idx: number, bx: number, by: number, bz: number, c: number, s: number, lx: number, ly: number, lz: number, ax: number, az: number, sc: number, sw = 1) => {
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
    te[o] = (c * a00 + s * a20) * sc * sw;
    te[o + 1] = a10 * sc;
    te[o + 2] = (-s * a00 + c * a20) * sc * sw;
    te[o + 3] = 0;
    te[o + 4] = (c * a01 + s * a21) * sc * sw;
    te[o + 5] = a11 * sc;
    te[o + 6] = (-s * a01 + c * a21) * sc * sw;
    te[o + 7] = 0;
    te[o + 8] = s * a22 * sc * sw;
    te[o + 9] = a12 * sc;
    te[o + 10] = c * a22 * sc * sw;
    te[o + 11] = 0;
    te[o + 12] = bx + c * lx + s * lz;
    te[o + 13] = by + ly;
    te[o + 14] = bz - s * lx + c * lz;
    te[o + 15] = 1;
  };
  /** the exact same transform applied to a point — used to hang the forearm off the elbow */
  const at = (bx: number, by: number, bz: number, c: number, s: number, lx: number, ly: number, lz: number, ax: number, az: number, sc: number) => {
    const ca = Math.cos(ax);
    const sa = Math.sin(ax);
    const cb = Math.cos(az);
    const sb = Math.sin(az);
    const a00 = cb;
    const a01 = -sb;
    const a10 = ca * sb;
    const a11 = ca * cb;
    const a12 = -sa;
    const a20 = sa * sb;
    const a21 = sa * cb;
    const a22 = ca;
    return {
      x: bx + ((c * a00 + s * a20) * lx + (c * a01 + s * a21) * ly + s * a22 * lz) * sc,
      y: by + (a10 * lx + a11 * ly + a12 * lz) * sc,
      z: bz + ((-s * a00 + c * a20) * lx + (-s * a01 + c * a21) * ly + c * a22 * lz) * sc,
    };
  };
  const sstep = (a: number, b: number, x: number) => {
    const u = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return u * u * (3 - 2 * u);
  };
  const H = 0.0001; // "hidden" scale
  // Split animation into cohorts so the doubled audience does not double per-frame CPU work.
  // Arena updates three cohorts in rotation (20 Hz per person at 60 FPS); tests can still update everyone at once.
  const update = (t: number, hype: number, cohort?: number, cohortCount = 2) => {
    const amp = 0.025 + hype * 0.2; // small, slow hops
    const spdMul = 1 + hype * 0.22;
    const di = cohort === undefined ? 1 : Math.max(1, Math.floor(cohortCount));
    const i0 = cohort === undefined ? 0 : ((Math.floor(cohort) % di) + di) % di;
    for (let i = i0; i < N; i += di) {
      const p = people[i];
      const cheer = sstep(p.thr, p.thr + 0.3, hype * 1.15);
      const beat = Math.sin(t * p.sp * spdMul + p.ph);
      const jump = p.seated ? 0 : Math.max(0, beat) * amp * (0.25 + cheer * 0.75);
      const k = p.k;
      const gw = p.girth;
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

      const torsoY = sit ? 0.98 : 1.24;
      const headY = sit ? 1.84 : 2.1;
      const shY = sit ? 1.38 : 1.64;

      // body: shoulders first, then the neck, then the head with its own features
      put(torso, i, bx, by, bz, c, s, 0, torsoY * k + bob, sit ? -0.02 : 0, sit ? -0.04 * cheer : 0, 0, k, gw);
      put(neck, i, bx, by, bz, c, s, 0, (headY - 0.31) * k + bob, 0.02 * k, 0, 0, k);
      put(shoulders, i * 2, bx, by, bz, c, s, -0.39 * gw * k, (shY - 0.03) * k + bob, 0, 0, 0, k, gw);
      put(shoulders, i * 2 + 1, bx, by, bz, c, s, 0.39 * gw * k, (shY - 0.03) * k + bob, 0, 0, 0, k, gw);
      put(head, i, bx, by, bz, ch, sh, 0, headY * k + bob, 0, 0, 0, k);
      // face: brow ridge, two eyes, a nose and a mouth — each one sitting on the surface of the skull
      put(brow, i, bx, by, bz, ch, sh, 0, (headY + 0.11) * k + bob, 0.33 * k, 0.25, 0, k);
      put(eyes, i * 2, bx, by, bz, ch, sh, -0.115 * k, (headY + 0.035) * k + bob, 0.33 * k, 0, 0, k);
      put(eyes, i * 2 + 1, bx, by, bz, ch, sh, 0.115 * k, (headY + 0.035) * k + bob, 0.33 * k, 0, 0, k);
      put(nose, i, bx, by, bz, ch, sh, 0, (headY - 0.045) * k + bob, 0.345 * k, 0.1, 0, k);
      put(mouth, i, bx, by, bz, ch, sh, 0, (headY - 0.165) * k + bob, 0.322 * k, 0, 0, k * (0.4 + cheer * 0.7 * (0.5 + 0.5 * Math.max(0, beat))));

      // hair: bald / short crop / long (hangs behind the head) / bun on top / big curly / cap
      const hs = p.hair;
      const domeSc = hs === BALD ? H : hs === CURLY ? k * 1.17 : hs === LONG ? k * 1.03 : k;
      const domeY = hs === CURLY ? 0.0 : 0.03;
      put(hair, i, bx, by, bz, ch, sh, 0, (headY + domeY) * k + bob, (hs === CURLY ? -0.04 : -0.02) * k, 0, 0, domeSc);
      put(hairBack, i, bx, by, bz, ch, sh, 0, (headY - 0.12) * k + bob, -0.27 * k, 0, 0, hs === LONG ? k : H);
      put(bun, i, bx, by, bz, ch, sh, 0, (headY + 0.4) * k + bob, -0.15 * k, 0, 0, hs === BUN ? k : H);
      put(brim, i, bx, by, bz, ch, sh, 0, (headY + 0.14) * k + bob, 0.34 * k, 0.1, 0, hs === CAP ? k : H);

      // suit: the shirt front hugs the chest under the open jacket, the tie hangs from the collar
      const tz = sit ? -0.02 : 0;
      const tax = sit ? -0.04 * cheer : 0;
      put(shirt, i, bx, by, bz, c, s, 0, (torsoY + 0.03) * k + bob, tz, tax, 0, p.suit ? k : H, gw);
      put(tie, i, bx, by, bz, c, s, 0, (torsoY + 0.12) * k + bob, tz, tax, 0, p.suit ? k : H, gw);

      // legs: standing = one straight pair; seated = thighs forward on the chair + shins hanging down
      if (sit) {
        put(legs, i * 2, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(legs, i * 2 + 1, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(thighs, i * 2, bx, by, bz, c, s, -0.17 * k, 0.42 * k, 0.28 * k, Math.PI / 2, 0, k);
        put(thighs, i * 2 + 1, bx, by, bz, c, s, 0.17 * k, 0.42 * k, 0.28 * k, Math.PI / 2, 0, k);
        put(shins, i * 2, bx, by, bz, c, s, -0.17 * k, 0.26 * k, 0.54 * k, 0, 0, k);
        put(shins, i * 2 + 1, bx, by, bz, c, s, 0.17 * k, 0.26 * k, 0.54 * k, 0, 0, k);
      } else {
        put(legs, i * 2, bx, by, bz, c, s, -0.17 * k, 0.39 * k, 0, 0, 0, k);
        put(legs, i * 2 + 1, bx, by, bz, c, s, 0.17 * k, 0.39 * k, 0, 0, 0, k);
        put(thighs, i * 2, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(thighs, i * 2 + 1, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(shins, i * 2, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
        put(shins, i * 2 + 1, bx, by, bz, c, s, 0, 0, 0, 0, 0, H);
      }

      // ---- arms: upper arm + forearm with a real elbow, so hands rest, clap, hold phones and go up ----
      const idleSway = Math.sin(t * 1.3 + p.ph) * 0.07;
      const wave = Math.sin(t * p.sp * 0.9 * spdMul + p.ph) * 0.3;
      let axL: number;
      let axR: number;
      let azL: number;
      let azR: number;
      let ebL: number; // elbow flexion (>0 brings the hand up towards the shoulder)
      let ebR: number;
      if (sit) {
        if (p.pump) {
          // excited: both arms up while still seated
          const up = cheer * cheer;
          axL = THREE.MathUtils.lerp(-0.5, -2.6 + wave, up);
          axR = THREE.MathUtils.lerp(-0.5, -2.6 - wave, up);
          azL = THREE.MathUtils.lerp(0.16, -0.2, up);
          azR = -azL;
          ebL = ebR = THREE.MathUtils.lerp(0.55, 0.4 + Math.abs(wave) * 0.6, up);
        } else {
          // calm → the hands rest on the knees (a nearly straight arm); excited → a compact applause in front of the chest
          axL = axR = THREE.MathUtils.lerp(-0.5, -1.0, cheer);
          azL = THREE.MathUtils.lerp(0.1, 0.34 + 0.22 * Math.sin(t * 4.4 + p.ph), cheer);
          azR = -azL;
          ebL = ebR = THREE.MathUtils.lerp(0.02, 1.1 + 0.3 * Math.sin(t * 4.4 + p.ph + 1.2), cheer);
        }
      } else {
        axL = THREE.MathUtils.lerp(idleSway, -2.65 + wave, cheer);
        axR = THREE.MathUtils.lerp(-idleSway, -2.65 - wave, cheer);
        azL = THREE.MathUtils.lerp(-0.06, -0.24, cheer);
        azR = -azL;
        ebL = THREE.MathUtils.lerp(0.3 + Math.abs(idleSway) * 0.5, 0.4 + Math.abs(wave) * 0.7, cheer);
        ebR = THREE.MathUtils.lerp(0.3 + Math.abs(idleSway) * 0.5, 0.4 + Math.abs(wave) * 0.7, cheer);
      }
      if (p.phone >= 0) {
        axR = -2.05 + Math.sin(t * 1.4 + p.ph) * 0.05;
        azR = 0.12;
        ebR = 0.95;
      }
      const shYk = shY * k + bob;
      const shX = 0.41 * gw * k;
      // upper arm from the shoulder, forearm hung off the elbow, hand on the end of the forearm.
      // The elbow is the SHOULDER POINT plus the upper-arm vector rotated by the arm angles (the shoulder offset
      // itself only turns with the body yaw — rotating it by the arm angles used to throw the forearms off the body).
      put(armUp, i * 2, bx, by, bz, c, s, -shX, shYk, 0, axL, azL, k);
      put(armUp, i * 2 + 1, bx, by, bz, c, s, shX, shYk, 0, axR, azR, k);
      const sLx = bx - c * shX;
      const sLz = bz + s * shX;
      const sRx = bx + c * shX;
      const sRz = bz - s * shX;
      const UPPER = 0.36; // shoulder → elbow
      const FORE = 0.4; // elbow → hand
      const elL = at(sLx, by + shYk, sLz, c, s, 0, -UPPER, 0, axL, azL, k);
      const elR = at(sRx, by + shYk, sRz, c, s, 0, -UPPER, 0, axR, azR, k);
      const exL = axL - ebL;
      const exR = axR - ebR;
      put(armLo, i * 2, elL.x, elL.y, elL.z, c, s, 0, 0, 0, exL, azL, k);
      put(armLo, i * 2 + 1, elR.x, elR.y, elR.z, c, s, 0, 0, 0, exR, azR, k);
      const hL = at(elL.x, elL.y, elL.z, c, s, 0, -FORE, 0, exL, azL, k);
      const hR = at(elR.x, elR.y, elR.z, c, s, 0, -FORE, 0, exR, azR, k);
      put(hands, i * 2, hL.x, hL.y, hL.z, c, s, 0, 0, 0, exL, azL, k);
      put(hands, i * 2 + 1, hR.x, hR.y, hR.z, c, s, 0, 0, 0, exR, azR, k);

      if (p.phone >= 0) {
        const bl = phoneBlink[p.phone];
        const on = Math.sin(t * bl.sp + bl.ph) > -0.4 ? 1 : 0;
        // the phone is held in the right hand, screen towards the face
        put(phones, p.phone, hR.x, hR.y, hR.z, c, s, 0, 0.14 * k, 0.1 * k, exR + 0.35, azR, on * (0.95 + hype * 0.2) * k + H);
      }
    }
    for (const m of [torso, neck, head, brow, eyes, nose, mouth, shoulders, armUp, armLo, hands, legs, thighs, shins, hair, hairBack, bun, brim, shirt, tie, phones]) m.instanceMatrix.needsUpdate = true;
  };

  update(0, 0.1);
  return { update };
}
