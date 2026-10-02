import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Robot, RobotStyle } from './robot';
import { L1, L2, HIP_Y, CY, UP } from './rig';

export interface Ctx {
  main: THREE.MeshStandardMaterial; // outer armour
  sec: THREE.MeshStandardMaterial; // under-suit / secondary panels
  dark: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  joint: THREE.MeshStandardMaterial; // exposed mechanics
  rubber: THREE.MeshStandardMaterial; // matte black rubber / cables
  visor: THREE.MeshStandardMaterial; // glossy dark glass
  core: THREE.MeshStandardMaterial; // white-hot centre of the eyes / LEDs
  style: RobotStyle;
}

export interface Opt {
  variant: 'atom' | 'brute';
  th: number; // limb thickness
  cw: number; // chest width
  fs: number; // fist size
  lt: number; // leg thickness (slimmer = more athletic)
}

// fs = fist size: smaller gloves on a slimmer, tapered arm read as athletic instead of cartoonish
// Atom: a lean, athletic sparring bot — narrow chest, slim limbs, compact gloves (the reference build)
export const ATOM_OPT: Opt = { variant: 'atom', th: 0.84, cw: 0.8, fs: 0.84, lt: 0.9 };
export const BRUTE_OPT: Opt = { variant: 'brute', th: 1.06, cw: 1.0, fs: 1.0, lt: 1.04 };

type V3 = [number, number, number];
type Pts = [number, number][];

// ---- brute eye shapes (head-local, centred on each eye; s = +1 right / -1 left) ----
/** brute: angry glare — the inner end sits lower than the outer end */
const glarePts = (s: number, k = 1, dx = 0): Pts =>
  (
    [
      [-0.1, 0.012],
      [0.085, 0.09],
      [0.135, 0.05],
      [0.0, -0.05],
      [-0.09, -0.036],
    ] as Pts
  ).map(([x, y]) => [(x + dx) * s * k, y * k]);
const glareBrow = (s: number): Pts =>
  (
    [
      [-0.13, 0.02],
      [0.15, 0.1],
      [0.17, 0.06],
      [-0.11, -0.012],
    ] as Pts
  ).map(([x, y]) => [x * s, y]);

// ---------------------------------------------------------------- geometry helpers
const RB = (w: number, h: number, d: number, r = 0.07) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const tcyl = (rt: number, rb: number, h: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const torus = (r: number, t: number, seg = 28) => new THREE.TorusGeometry(r, t, 8, seg);
/** surface of revolution; profile = [radius, y] listed bottom → top */
const lathe = (pts: Pts, k = 1, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * k, y)), seg);

/** beveled polygon plate in the XY plane, extruded along Z (centred) */
const plate = (pts: Pts, depth: number, bevel = 0.04) => {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
};
/** side-profile solid: points are (z, y); extruded across X (centred) */
const sideSolid = (pts: Pts, width: number, bevel = 0.05) => {
  const g = plate(pts, width, bevel);
  g.rotateY(-Math.PI / 2);
  return g;
};
/** curved armour shell wrapping a cylinder, centred on +Z, height along Y */
const arcPlate = (rIn: number, rOut: number, theta: number, h: number, bevel = 0.025) => {
  const sh = new THREE.Shape();
  const a0 = -theta / 2;
  const a1 = theta / 2;
  sh.moveTo(rOut * Math.cos(a0), rOut * Math.sin(a0));
  sh.absarc(0, 0, rOut, a0, a1, false);
  sh.absarc(0, 0, rIn, a1, a0, true);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 22 });
  g.translate(0, 0, -h / 2);
  g.rotateX(-Math.PI / 2);
  g.rotateY(-Math.PI / 2);
  return g;
};
/** hemisphere facing +Y */
const dome = (r: number, cover = 0.5) => new THREE.SphereGeometry(r, 26, 14, 0, Math.PI * 2, 0, Math.PI * cover);

// ---------------------------------------------------------------- batching (keeps draw calls low)
class Batch {
  private map = new Map<string, { parent: THREE.Object3D; mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private m4 = new THREE.Matrix4();

  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]) {
    this.e.set(rot[0], rot[1], rot[2], 'XYZ');
    this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scl[0], scl[1], scl[2]));
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(this.m4);
    const key = parent.uuid + '|' + mat.uuid;
    let ent = this.map.get(key);
    if (!ent) {
      ent = { parent, mat, geos: [] };
      this.map.set(key, ent);
    }
    ent.geos.push(g);
  }

  flush() {
    for (const { parent, mat, geos } of this.map.values()) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.map.clear();
  }
}

// ---------------------------------------------------------------- public entry
export function buildRobot(r: Robot, c: Ctx, o: Opt) {
  const b = new Batch();
  r.pelvis.position.y = UP; // longer legs lift everything above the hips
  buildPelvis(r, b, c, o);
  buildLegs(r, b, c, o);
  buildWaist(r, b, c);
  buildChest(r, b, c, o);
  buildNeckAndHead(r, b, c, o);
  buildArms(r, b, c, o);
  b.flush();
}

const piston = (b: Batch, c: Ctx, parent: THREE.Object3D, x: number, y: number, z: number, len: number, rad: number) => {
  b.add(parent, tcyl(rad * 1.8, rad * 1.8, len * 0.55, 12), c.joint, x, y + len * 0.22, z);
  b.add(parent, tcyl(rad, rad, len, 10), c.steel, x, y - len * 0.12, z);
};

// ---------------------------------------------------------------- pelvis
function buildPelvis(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const P = r.pelvis;
  const atom = o.variant === 'atom';
  // hip girdle: wider at the iliac crest, tapering to the thighs
  b.add(P, plate([[-0.8, -0.32], [0.8, -0.32], [1.0, 0.22], [-1.0, 0.22]], 0.8, 0.1), c.sec, 0, 2.95, 0);
  b.add(P, RB(2.04, 0.07, 1.0, 0.03), c.steel, 0, 3.2, 0);
  b.add(P, RB(0.56, 0.42, 0.9, 0.12), c.dark, 0, 2.66, 0);
  // belt buckle plate
  b.add(P, plate([[-0.34, 0.2], [0.34, 0.2], [0.5, 0.0], [0.3, -0.28], [-0.3, -0.28], [-0.5, 0.0]], 0.07, 0.035), atom ? c.accent : c.accent, 0, 2.95, 0.55);
  b.add(P, plate([[0, 0.12], [0.16, 0], [0, -0.12], [-0.16, 0]], 0.04, 0.02), c.glow, 0, 2.95, 0.66);
  b.add(P, RB(2.0, 0.05, 0.06, 0.02), c.glow, 0, 3.11, 0.52);
  // spine mount
  b.add(P, tcyl(0.46, 0.54, 0.5, 20), c.joint, 0, 3.3, 0);
  // hanging hip armour – swings with the thigh
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const fa = new THREE.Group();
    fa.position.set(s * 0.74, 2.8, 0.54);
    P.add(fa);
    b.add(fa, plate([[-0.38, 0], [0.38, 0], [0.33, -0.78], [0, -0.92], [-0.33, -0.78]], 0.07, 0.035), c.main, 0, 0, 0);
    b.add(fa, plate([[-0.3, -0.18], [0.3, -0.18], [0.28, -0.26], [-0.28, -0.26]], 0.04, 0.02), c.accent, 0, 0, 0.06);
    r.faulds.push(fa);
  }
}

// ---------------------------------------------------------------- legs
function buildLegs(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const lt = o.lt;
  const atom = o.variant === 'atom';
  const sy1 = L1 / 1.5; // the thigh / shin meshes are modelled at the old length and stretched
  const sy2 = L2 / 1.42;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const hip = new THREE.Group();
    hip.position.set(s * 0.76, HIP_Y, 0);
    hip.rotation.order = 'ZXY';
    r.pelvis.add(hip);
    r.hipJ.push(hip);
    b.add(hip, sph(0.44 * lt), c.joint);

    // ----- thigh: a quad sweep that is full at the top and slim at the knee
    const thigh = new THREE.Group();
    thigh.scale.set(1, sy1, 1);
    hip.add(thigh);
    b.add(thigh, lathe([[0, -1.5], [0.27, -1.5], [0.33, -1.38], [0.41, -1.1], [0.53, -0.72], [0.62, -0.4], [0.61, -0.16], [0.46, -0.03], [0, 0]], lt), c.sec);
    b.add(thigh, arcPlate(0.6 * lt, 0.68 * lt, 1.6, 0.8), c.main, 0, -0.6, 0);
    b.add(thigh, arcPlate(0.42 * lt, 0.49 * lt, 2.2, 0.2), c.accent, 0, -1.22, 0);
    b.add(thigh, arcPlate(0.53 * lt, 0.59 * lt, 2.0, 0.07), c.steel, 0, -0.1, 0);
    b.add(thigh, RB(0.05, 0.75, 0.05, 0.02), c.glow, s * 0.6 * lt, -0.7, 0.1);
    piston(b, c, thigh, s * 0.18 * lt, -0.7, -0.52 * lt, 1.0, 0.055);

    // ----- knee
    const knee = new THREE.Group();
    knee.position.y = -L1;
    hip.add(knee);
    r.kneeJ.push(knee);
    b.add(knee, sph(0.38 * lt), c.joint, 0, 0, 0.02);
    const cap = new THREE.Group();
    cap.position.set(0, 0.0, 0.32 * lt);
    knee.add(cap);
    b.add(cap, dome(0.36 * lt, 0.5).rotateX(Math.PI / 2), c.main, 0, 0, 0, [0, 0, 0], [1.05, 1.1, 0.75]);
    b.add(cap, torus(0.36 * lt, 0.028, 24), c.accent, 0, 0, 0.0);
    r.kneeCaps.push(cap);

    // ----- calf: diamond-shaped muscle, shin guard
    const shin = new THREE.Group();
    shin.scale.set(1, sy2, 1);
    knee.add(shin);
    b.add(shin, lathe([[0, -1.42], [0.25, -1.42], [0.29, -1.3], [0.35, -1.0], [0.45, -0.62], [0.5, -0.36], [0.42, -0.1], [0, 0]], lt), c.sec);
    b.add(shin, new THREE.CapsuleGeometry(0.21 * lt, 0.46, 6, 14), atom ? c.dark : c.main, 0, -0.5, -0.36 * lt, [0, 0, 0], [1.15, 1, 0.9]);
    b.add(shin, arcPlate(0.47 * lt, 0.54 * lt, 1.5, 0.98), c.main, 0, -0.78, -0.02 * lt, [0.15, 0, 0]);
    b.add(shin, RB(0.06, 0.88, 0.05, 0.02), c.accent, 0, -0.8, 0.5 * lt, [0.15, 0, 0]);
    b.add(shin, RB(0.05, 0.65, 0.05, 0.02), c.glow, s * 0.5 * lt, -0.85, 0.05);

    // ----- ankle (bellows) + boot
    const ankle = new THREE.Group();
    ankle.position.y = -L2;
    knee.add(ankle);
    r.footJ.push(ankle);
    b.add(ankle, tcyl(0.28 * lt, 0.28 * lt, 0.34, 18), c.joint, 0, 0.1, 0);
    for (let k = 0; k < 3; k++) b.add(ankle, torus(0.28 * lt, 0.035, 20), c.rubber, 0, 0.22 - k * 0.1, 0, [Math.PI / 2, 0, 0]);
    const bw = 0.82 + lt * 0.08;
    b.add(ankle, sideSolid([[-0.5, -0.1], [-0.54, 0.1], [-0.38, 0.27], [0.32, 0.3], [0.7, 0.15], [1.1, 0.0], [1.2, -0.1]], bw, 0.06), c.dark);
    b.add(ankle, sideSolid([[0.55, 0.2], [1.0, 0.07], [1.2, -0.04], [1.2, -0.12], [0.55, -0.12]], bw + 0.07, 0.045), c.main, 0, 0.0, 0);
    b.add(ankle, RB(bw + 0.04, 0.1, 0.4, 0.05), c.accent, 0, 0.27, 0.0);
    b.add(ankle, RB(bw + 0.1, 0.1, 1.82, 0.05), c.rubber, 0, -0.16, 0.36);
    b.add(ankle, RB(0.66, 0.07, 0.06, 0.02), c.glow, 0, 0.05, -0.56);
  }
}

// ---------------------------------------------------------------- waist
function buildWaist(r: Robot, b: Batch, c: Ctx) {
  const W = r.waist;
  W.position.set(0, 3.45, 0);
  r.pelvis.add(W);
  for (let k = 0; k < 4; k++) b.add(W, tcyl(0.5, 0.5, 0.13, 24), k % 2 ? c.steel : c.dark, 0, -0.1 + k * 0.145, 0.02, [0, 0, 0], [1, 1, 0.82]);
  b.add(W, RB(0.3, 0.55, 0.2, 0.08), c.rubber, 0, 0.1, -0.4);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.44, 0.4, 0.3),
      new THREE.Vector3(s * 0.5, 0.2, 0.34),
      new THREE.Vector3(s * 0.44, -0.02, 0.3),
      new THREE.Vector3(s * 0.42, -0.2, 0.24),
    ]);
    b.add(W, new THREE.TubeGeometry(curve, 14, 0.032, 6), c.glow);
  }
}

// ---------------------------------------------------------------- chest + back
// Chest-local coordinates: y = 0 at the waist joint, ~1.7 at the top of the shoulders; +z is the front.
function buildChest(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const C = r.chest;
  C.position.set(0, CY, 0);
  r.waist.add(C);
  const W = o.cw;
  const atom = o.variant === 'atom';
  const X = (p: Pts): Pts => p.map(([x, y]) => [x * W, y]);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: V3, scl?: V3) => b.add(C, g, m, x, y, z, rot, scl);

  // ================= under-armour core: a sculpted V-taper (broad shoulders → narrow waist) =================
  const core = new THREE.Shape();
  const outline: Pts = X([[-0.48, 0.0], [0.48, 0.0], [0.82, 0.5], [1.14, 1.05], [1.22, 1.42], [1.02, 1.68], [0.44, 1.74], [-0.44, 1.74], [-1.02, 1.68], [-1.22, 1.42], [-1.14, 1.05], [-0.82, 0.5]]);
  outline.forEach(([x, y], i) => (i ? core.lineTo(x, y) : core.moveTo(x, y)));
  core.closePath();
  const coreG = new THREE.ExtrudeGeometry(core, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 4, steps: 1 });
  coreG.translate(0, 0, -0.4);
  put(coreG, c.sec, 0, 0, 0);

  // ================= FRONT =================
  const tilt: V3 = [-0.1, 0, 0]; // the upper edge of each pectoral leans back a little
  const pecScale: V3 = [1.3, 1, 1];
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const px = s * 0.55 * W;
    // curved breastplate halves: they bulge forward, curve round the ribs and leave a trough in the middle
    put(arcPlate(0.5, 0.59, 1.9, 0.62), c.main, px, 1.15, 0, tilt, pecScale);
    put(arcPlate(0.5, 0.6, 1.9, 0.07), c.accent, px, 0.83, 0, tilt, pecScale);
    put(arcPlate(0.5, 0.6, 1.9, 0.05), c.steel, px, 1.47, 0, tilt, pecScale);
    // armoured flank panel with cooling vents
    put(RB(0.16, 0.74, 0.62, 0.07), c.dark, s * 1.1 * W, 0.72, 0, [0, 0, s * 0.26]);
    for (let k = 0; k < 4; k++) put(RB(0.05, 0.07, 0.36, 0.02), c.steel, s * 1.18 * W, 0.45 + k * 0.17, 0, [0, 0, s * 0.26]);
    // trapezius: a big sloping yoke into the neck
    put(RB(1.0 * W, 0.4, 0.9, 0.16), c.main, s * 0.72 * W, 1.66, -0.04, [0, 0, s * -0.3]);
    // LED bars flanking the reactor
    put(RB(0.035, 0.5, 0.04, 0.012), c.glow, s * 0.21, 1.2, 0.56);
  }
  // collar-bone yoke across the top of the chest
  put(plate(X([[-0.9, 1.68], [0.9, 1.68], [0.7, 1.52], [-0.7, 1.52]]), 0.08, 0.03), c.sec, 0, 0, 0.5);
  // sternum keel + reactor housing in the trough between the pecs
  put(plate([[-0.16, 1.52], [0.16, 1.52], [0.2, 0.88], [0, 0.6], [-0.2, 0.88]], 0.1, 0.03), c.dark, 0, 0, 0.5);
  put(tcyl(0.3, 0.3, 0.1, 6).rotateX(Math.PI / 2), c.dark, 0, 0.98, 0.53);
  put(torus(0.25, 0.04, 28), c.steel, 0, 0.98, 0.585);
  put(tcyl(0.17, 0.17, 0.05, 28).rotateX(Math.PI / 2), c.glow, 0, 0.98, 0.58);
  put(tcyl(0.08, 0.08, 0.07, 20).rotateX(Math.PI / 2), c.core, 0, 0.98, 0.6);
  // rib bars between the pecs and the abdomen
  for (let k = 0; k < 3; k++) put(RB(0.9 * W, 0.045, 0.1, 0.015), c.dark, 0, 0.6 + k * 0.08, 0.55);
  // abdomen: three stacked, tapering plates with dark gaps between them → a defined, athletic midsection
  const abs: Pts[] = [
    [[-0.5, 0.52], [0.5, 0.52], [0.46, 0.34], [-0.46, 0.34]],
    [[-0.45, 0.31], [0.45, 0.31], [0.4, 0.14], [-0.4, 0.14]],
    [[-0.39, 0.11], [0.39, 0.11], [0.26, -0.08], [0, -0.14], [-0.26, -0.08]],
  ];
  abs.forEach((pts, i) => {
    put(plate(X(pts), 0.08, 0.03), atom ? c.main : c.sec, 0, 0, 0.5);
    put(RB((0.9 - i * 0.08) * W, 0.025, 0.09, 0.01), c.steel, 0, 0.52 - i * 0.2, 0.55);
  });
  put(RB(0.05, 0.62, 0.1, 0.02), c.dark, 0, 0.22, 0.54); // centre seam

  // ================= BACK =================
  // main back plate (shoulder → waist)
  put(plate(X([[-0.98, 1.62], [0.98, 1.62], [1.06, 1.1], [0.62, 0.1], [-0.62, 0.1], [-1.06, 1.1]]), 0.12, 0.035), c.main, 0, 0, -0.56);
  // spine ridge + vertebrae + glow line
  put(RB(0.22, 1.5, 0.2, 0.08), c.dark, 0, 0.9, -0.74);
  for (let k = 0; k < 5; k++) put(RB(0.36, 0.07, 0.12, 0.03), c.steel, 0, 0.18 + k * 0.14, -0.83);
  put(RB(0.04, 1.3, 0.04, 0.015), c.glow, 0, 0.95, -0.86);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    // shoulder-blade plates, angled outwards, with an accent edge
    const blade: Pts = [[0.1, 1.55], [0.95, 1.5], [0.98, 1.0], [0.55, 0.75], [0.1, 0.9]].map(([x, y]): [number, number] => [x * s * W, y]);
    put(plate(blade, 0.1, 0.03), c.sec, 0, 0, -0.66, [0.06, s * 0.16, 0]);
    put(RB(0.05, 0.8, 0.14, 0.02), c.accent, s * 0.14 * W, 1.2, -0.71);
    // lower-back cooling vents
    for (let k = 0; k < 5; k++) put(RB(0.4 * W, 0.04, 0.06, 0.015), c.steel, s * 0.45 * W, 0.2 + k * 0.1, -0.68);
    // hydraulic hose from the pack down to the waist + a flank piston
    const cable = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.3, 0.9, -0.95),
      new THREE.Vector3(s * 0.52, 0.45, -0.88),
      new THREE.Vector3(s * 0.52, 0.0, -0.62),
      new THREE.Vector3(s * 0.42, -0.22, -0.4),
    ]);
    put(new THREE.TubeGeometry(cable, 16, 0.045, 6), c.rubber, 0, 0, 0);
    piston(b, c, C, s * 1.12 * W, 0.78, -0.34, 0.9, 0.05);
  }
  if (atom) {
    // sleek power pack with light strips and two thruster nozzles
    put(RB(0.84, 0.56, 0.3, 0.12), c.dark, 0, 1.12, -0.92);
    put(RB(0.78, 0.05, 0.2, 0.02), c.accent, 0, 1.43, -0.92);
    for (let k = 0; k < 3; k++) put(RB(0.66, 0.03, 0.04, 0.01), c.glow, 0, 0.98 + k * 0.14, -1.08);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.1, 0.13, 0.5, 14), c.steel, s * 0.3, 0.62, -0.92);
      put(tcyl(0.09, 0.09, 0.04, 14), c.glow, s * 0.3, 0.36, -0.92);
    }
  } else {
    // heavy radiator block + two angled exhaust stacks
    put(RB(1.1 * W, 0.46, 0.3, 0.1), c.dark, 0, 1.05, -0.86);
    for (let k = 0; k < 4; k++) put(RB(0.95 * W, 0.05, 0.06, 0.015), c.steel, 0, 0.9 + k * 0.12, -1.03);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.15, 0.19, 1.0, 14), c.steel, s * 0.62, 1.5, -0.9, [0, 0, s * -0.14]);
      put(tcyl(0.1, 0.1, 0.06, 12), c.glow, s * 0.69, 2.0, -0.9);
    }
  }

  // ================= collar: a ring round the neck + a raised guard behind the head =================
  put(torus(0.42, 0.07, 28), c.steel, 0, 1.74, 0, [Math.PI / 2, 0, 0]);
  put(plate([[-0.5, 1.66], [0.5, 1.66], [0.4, 1.98], [-0.4, 1.98]], 0.1, 0.03), c.main, 0, 0, -0.36);
}

// ---------------------------------------------------------------- neck + helmet
function buildNeckAndHead(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const N = r.neck;
  N.position.set(0, 2.14 - CY, 0.08);
  r.chest.add(N);
  b.add(N, tcyl(0.27, 0.34, 0.5, 18), c.joint, 0, 0.02, -0.04);
  for (let k = 0; k < 3; k++) b.add(N, torus(0.3 - k * 0.01, 0.035, 20), c.rubber, 0, -0.1 + k * 0.1, -0.04, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    b.add(N, tcyl(0.04, 0.04, 0.6, 6), c.glow, s * 0.2, 0.1, 0.16);
  }
  const H = r.head;
  H.position.set(0, 0.5, 0.06);
  H.scale.setScalar(1.04); // head is 20% smaller than before (1.3 → 1.04)
  N.add(H);
  if (o.variant === 'atom') atomHelmet(H, b, c);
  else bruteHelmet(H, b, c);
}

/**
 * ATOM-style head (the reference build): a tall, rounded-rectangular chrome helmet whose whole roof is a
 * radiator crown of vertical fins, a deeply recessed dark WIRE-MESH face under an overhanging brow, and two
 * round, ringed cyan eyes glowing through the mesh. No visor slit, no jaw — the mesh is the face.
 */
function atomHelmet(H: THREE.Group, b: Batch, c: Ctx) {
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: V3, scl?: V3) => b.add(H, g, m, x, y, z, rot, scl);

  // ================= helmet shell: tall, soft-cornered box that tapers down towards the mesh =================
  put(RB(0.78, 0.6, 0.8, 0.2), c.main, 0, 0.3, -0.02); // upper skull
  put(RB(0.7, 0.26, 0.5, 0.14), c.main, 0, -0.02, -0.14); // lower band — pulled back so the mesh face stays open
  // bevelled front face of the helmet, overhanging the mesh like a cap peak
  put(sideSolid([[0.3, 0.6], [0.44, 0.44], [0.46, 0.16], [0.3, 0.1]], 0.78, 0.03), c.main);
  put(RB(0.8, 0.035, 0.08, 0.012), c.steel, 0, 0.12, 0.43); // brow trim
  put(RB(0.5, 0.025, 0.05, 0.01), c.accent, 0, 0.17, 0.45); // accent stripe on the brow

  // ================= crown: a low radiator grille that IS the roof =================
  // (no frame or rails around it — a cage on top of the head read as a weird floating box)
  const FINS = 13;
  for (let i = 0; i < FINS; i++) {
    const u = (i / (FINS - 1)) * 2 - 1; // -1 … 1 across the head
    const h = 0.13 - u * u * 0.085; // domes over the middle, almost flat at the edges
    const d = 0.7 - u * u * 0.24; // and shortens towards the sides → a rounded crown, not a block
    put(RB(0.028, h, d, 0.012), c.steel, u * 0.33, 0.58 + h / 2, -0.02);
  }
  // a thin plinth exactly as wide as the skull, so the grille sits flush instead of perching on top
  put(RB(0.78, 0.05, 0.8, 0.025), c.main, 0, 0.585, -0.02);

  // ================= face: recessed dark wire mesh =================
  put(RB(0.6, 0.62, 0.1, 0.05), c.dark, 0, -0.14, 0.33); // the dark cavity behind the mesh
  const MX = 9;
  const MY = 9;
  for (let i = 0; i < MX; i++) put(RB(0.012, 0.6, 0.012, 0.004), c.rubber, (i / (MX - 1) - 0.5) * 0.56, -0.14, 0.385);
  for (let j = 0; j < MY; j++) put(RB(0.57, 0.012, 0.012, 0.004), c.rubber, 0, -0.14 + (j / (MY - 1) - 0.5) * 0.58, 0.385);
  put(RB(0.64, 0.66, 0.03, 0.02), c.steel, 0, -0.14, 0.355, [0, 0, 0], [1, 1, 0.4]); // mesh frame

  // ================= eyes: angular hex optics, tilted into a glare =================
  // (plain circles looked flat — these are layered camera lenses: hex bezel → socket → iris → scan lines →
  //  a white-hot slit pupil, each pair tilted so the outer corner rides up)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const x = s * 0.16;
    const y = -0.02;
    const tilt: V3 = [0, 0, s * 0.26]; // outer corner lifted → an aggressive glare
    put(tcyl(0.12, 0.12, 0.035, 6).rotateX(Math.PI / 2), c.steel, x, y, 0.368, tilt); // hex bezel
    put(tcyl(0.1, 0.1, 0.03, 6).rotateX(Math.PI / 2), c.dark, x, y, 0.384, tilt); // socket
    put(tcyl(0.086, 0.086, 0.025, 6).rotateX(Math.PI / 2), c.glow, x, y, 0.396, tilt); // glowing iris
    // dark scan lines across the lens + a bright vertical slit pupil
    for (let k = -1; k <= 1; k++) put(RB(0.15, 0.014, 0.015, 0.005), c.dark, x, y + k * 0.034, 0.404, tilt);
    put(RB(0.024, 0.095, 0.018, 0.007), c.core, x, y, 0.409, tilt);
    put(RB(0.05, 0.016, 0.016, 0.005), c.core, x, y, 0.409, tilt); // hot cross-glint
    // angled brow slash over the eye
    put(RB(0.19, 0.024, 0.022, 0.008), c.accent, x, y + 0.115, 0.4, [0, 0, s * 0.32]);
  }

  // ================= sides and back =================
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    put(RB(0.1, 0.44, 0.5, 0.06), c.sec, s * 0.37, 0.06, 0.02); // temple plate
    put(tcyl(0.1, 0.1, 0.07, 18).rotateZ(Math.PI / 2), c.steel, s * 0.42, 0.12, -0.14); // ear disc
    put(torus(0.055, 0.014, 16).rotateY(Math.PI / 2), c.glow, s * 0.47, 0.12, -0.14);
    put(RB(0.05, 0.2, 0.26, 0.02), c.dark, s * 0.4, -0.16, -0.08); // jaw hinge block
  }
  put(RB(0.6, 0.4, 0.1, 0.05), c.dark, 0, 0.2, -0.42); // back plate
  for (let k = 0; k < 3; k++) put(RB(0.46, 0.03, 0.05, 0.01), c.steel, 0, 0.3 - k * 0.1, -0.46);
  put(RB(0.34, 0.2, 0.22, 0.06), c.joint, 0, -0.3, -0.12); // neck collar under the helmet
}

/** Heavier Jaeger head for the opponents: a wide hammer-head slab, an angry V-glare, forward fangs and horn fins. */
function bruteHelmet(H: THREE.Group, b: Batch, c: Ctx) {
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: V3, scl?: V3) => b.add(H, g, m, x, y, z, rot, scl);

  // ---- skull + a wide forehead slab
  put(
    sideSolid([[-0.5, -0.32], [-0.56, 0.22], [-0.44, 0.46], [0.0, 0.5], [0.34, 0.48], [0.56, 0.3], [0.62, 0.1], [0.6, -0.12], [0.66, -0.3], [0.4, -0.46], [-0.26, -0.42]], 0.9, 0.035),
    c.main,
  );
  put(sideSolid([[-0.3, 0.44], [0.4, 0.48], [0.7, 0.3], [0.72, 0.16], [0.5, 0.2], [-0.3, 0.26]], 1.0, 0.03), c.sec);

  // ---- face plate + angry glare eyes
  put(plate([[-0.46, 0.14], [0.46, 0.14], [0.4, -0.12], [-0.4, -0.12]], 0.03, 0.01), c.steel, 0, 0, 0.652);
  put(plate([[-0.42, 0.11], [0.42, 0.11], [0.36, -0.09], [-0.36, -0.09]], 0.04, 0.01), c.dark, 0, 0, 0.664);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const x0 = s * 0.2;
    put(plate(glarePts(s, 1.32), 0.02, 0.006), c.steel, x0, 0.02, 0.676);
    put(plate(glarePts(s, 1.2), 0.03, 0.006), c.dark, x0, 0.02, 0.682);
    put(plate(glarePts(s, 1.0), 0.04, 0.006), c.glow, x0, 0.02, 0.688);
    put(plate(glarePts(s, 0.5, s * 0.03), 0.05, 0.004), c.core, x0, 0.02, 0.694);
    put(plate(glareBrow(s), 0.05, 0.01), c.sec, x0, 0.16, 0.672);
    put(plate(glareBrow(s).map(([x, y]): [number, number] => [x * 0.94, y * 0.2 - 0.015]), 0.03, 0.004), c.accent, x0, 0.16, 0.7);
    // side block, vent disc and forward-swept cheek fang
    put(RB(0.14, 0.4, 0.58, 0.05), c.sec, s * 0.5, -0.1, 0.02);
    put(tcyl(0.14, 0.14, 0.1, 22).rotateZ(Math.PI / 2), c.steel, s * 0.6, 0.02, -0.1);
    put(torus(0.07, 0.02, 20).rotateY(Math.PI / 2), c.glow, s * 0.66, 0.02, -0.1);
    put(new THREE.ConeGeometry(0.08, 0.28, 6), c.steel, s * 0.42, -0.34, 0.42, [Math.PI / 2 + 0.5, 0, 0]);
    // horn fin on the roof
    put(sideSolid([[0.1, 0.46], [0.52, 0.8], [0.4, 0.44]], 0.07, 0.02), c.sec, s * 0.42, 0, 0);
  }
  // ---- nose ridge + heavy jaw with a glowing grille
  put(RB(0.06, 0.22, 0.07, 0.02), c.steel, 0, 0.0, 0.69);
  put(plate([[-0.34, -0.14], [0.34, -0.14], [0.28, -0.42], [-0.28, -0.42]], 0.06, 0.02), c.dark, 0, 0, 0.67);
  for (let k = -2; k <= 3; k++) put(RB(0.04, 0.1, 0.03, 0.01), c.glow, (k - 0.5) * 0.07, -0.28, 0.725);
  // ---- roof blade crest + rear plate
  put(sideSolid([[-0.5, 0.46], [-0.3, 0.74], [0.16, 0.78], [0.46, 0.5]], 0.14, 0.03), c.accent);
  put(plate([[-0.46, 0.14], [0.46, 0.14], [0.4, -0.36], [-0.4, -0.36]], 0.1, 0.03), c.dark, 0, 0, -0.58);
  for (let k = 0; k < 3; k++) put(RB(0.6, 0.03, 0.05, 0.01), c.steel, 0, 0.04 - k * 0.1, -0.66);
}

// ---------------------------------------------------------------- arms
function buildArms(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const th = o.th;
  const k = o.fs;
  const fa = th * (o.variant === 'atom' ? 0.9 : 0.98); // forearm thickness (the tapered profile does the slimming)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const clav = new THREE.Group();
    clav.position.set(s * 0.9, 1.9 - CY, 0);
    r.chest.add(clav);
    r.clavs.push(clav);
    b.add(clav, RB(0.8, 0.28, 0.5, 0.12), c.joint, s * 0.34, 0, 0);

    const sh = new THREE.Group();
    sh.position.set(s * 0.82, -0.35, 0);
    sh.rotation.order = 'YXZ';
    clav.add(sh);
    r.shoulders.push(sh);

    // pauldron: layered dome + rim, rides on the shoulder
    const cap = new THREE.Group();
    cap.position.copy(sh.position);
    clav.add(cap);
    r.caps.push(cap);
    // three overlapping shells, like the layered shoulder armour on the reference bot
    b.add(cap, dome(0.6 * th, 0.5), c.main, 0, 0.14, 0, [0, 0, 0], [1, 0.72, 1.12]);
    b.add(cap, dome(0.64 * th, 0.42), c.sec, 0, 0.02, 0, [0, 0, 0], [1, 0.62, 1.14]);
    b.add(cap, dome(0.66 * th, 0.34), c.main, 0, -0.12, 0, [0, 0, 0], [1, 0.52, 1.16]);
    b.add(cap, torus(0.63 * th, 0.035, 32), c.accent, 0, -0.08, 0, [Math.PI / 2, 0, 0], [1, 1.14, 1]);
    b.add(cap, RB(0.18, 0.05, 0.85, 0.025), c.steel, 0, 0.5 * th + 0.08, 0);
    b.add(cap, RB(0.035, 0.035, 0.55, 0.014), c.glow, s * 0.13, 0.5 * th + 0.11, 0);

    // ---- athletic upper arm: round deltoid → full biceps/triceps belly → slim at the elbow
    b.add(sh, sph(0.46 * th), c.joint);
    b.add(sh, lathe([[0, -1.12], [0.27, -1.12], [0.31, -1.0], [0.4, -0.78], [0.5, -0.5], [0.52, -0.3], [0.46, -0.12], [0.38, -0.02], [0, 0]], th), c.sec);
    b.add(sh, arcPlate(0.53 * th, 0.6 * th, 1.5, 0.46), c.main, 0, -0.46, 0);
    b.add(sh, arcPlate(0.5 * th, 0.55 * th, 1.7, 0.06), c.accent, 0, -0.84, 0);
    // triceps hose + piston on the back of the arm
    piston(b, c, sh, 0, -0.55, -0.4 * th, 0.9, 0.05);

    // ---- elbow + forearm: thick near the elbow (extensors), tapering to a slim, strong wrist
    const el = new THREE.Group();
    el.position.y = -1.1;
    sh.add(el);
    r.elbows.push(el);
    b.add(el, sph(0.33 * th), c.joint);
    b.add(el, dome(0.26 * th, 0.5).rotateX(-Math.PI / 2), c.accent, 0, 0.0, -0.26 * th);
    b.add(el, lathe([[0, -1.3], [0.22, -1.3], [0.26, -1.15], [0.34, -0.88], [0.46, -0.52], [0.52, -0.28], [0.44, -0.08], [0.34, -0.01], [0, 0]], fa), c.sec);
    // bracer follows the swell of the forearm; ridges give it a tendon / muscle read
    b.add(el, arcPlate(0.49 * fa, 0.55 * fa, 2.3, 0.54), c.main, 0, -0.52, 0, [0, 0, 0]);
    b.add(el, RB(0.04, 0.42, 0.04, 0.015), c.glow, s * 0.55 * fa, -0.55, 0.0);
    b.add(el, arcPlate(0.52 * fa, 0.58 * fa, 2.4, 0.06), c.accent, 0, -0.2, 0);
    for (let j = -1; j <= 1; j++) b.add(el, RB(0.035, 0.72, 0.035, 0.012), c.steel, j * 0.15 * fa, -0.66, 0.43 * fa, [0.18, 0, 0]);
    b.add(el, arcPlate(0.29 * fa, 0.35 * fa, 2.4, 0.07), c.steel, 0, -1.1, 0);
    piston(b, c, el, s * 0.3 * fa, -0.6, 0.4 * fa, 0.8, 0.045);

    // wrist + glove
    const wr = new THREE.Group();
    wr.position.y = -1.3;
    el.add(wr);
    r.wrists.push(wr);
    const fist = new THREE.Group();
    wr.add(fist);
    r.fists.push(fist);
    // slim wrist cuff that flares into a compact glove
    b.add(fist, tcyl(0.34 * k, 0.46 * k, 0.32, 24), c.steel, 0, -0.04, 0);
    b.add(fist, torus(0.46 * k, 0.03, 30), c.glow, 0, -0.19, 0, [Math.PI / 2, 0, 0]);
    // glove body (narrower and more compact than before)
    b.add(fist, RB(1.0 * k, 0.86 * k, 1.0 * k, 0.4 * k), c.dark, 0, -0.64 * k, 0.02);
    b.add(fist, RB(0.9 * k, 0.5 * k, 0.86 * k, 0.3 * k), c.rubber, 0, -0.9 * k, 0.04);
    // outer armour plate + stripes
    b.add(fist, RB(0.1 * k, 0.5 * k, 0.6 * k, 0.05), c.accent, s * 0.58 * k, -0.64 * k, 0.04);
    b.add(fist, RB(0.7 * k, 0.05, 0.05, 0.02), c.glow, 0, -0.34 * k, 0.5 * k);
    b.add(fist, RB(0.7 * k, 0.05, 0.05, 0.02), c.glow, 0, -0.34 * k, -0.5 * k);
    // segmented knuckle guards
    for (let j = 0; j < 4; j++) b.add(fist, RB(0.25 * k, 0.28 * k, 0.68 * k, 0.09 * k), c.steel, (j - 1.5) * 0.27 * k, -1.04 * k, 0.02);
    // thumb on the inner side
    b.add(fist, new THREE.CapsuleGeometry(0.15 * k, 0.34 * k, 6, 12), c.dark, -s * 0.52 * k, -0.76 * k, 0.0, [0, 0, -s * 0.12]);
    b.add(fist, RB(0.1 * k, 0.1 * k, 0.28 * k, 0.04), c.steel, -s * 0.54 * k, -1.02 * k, 0.0);
  }
}
