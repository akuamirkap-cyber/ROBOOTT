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

// fs = fist size: compact gloves on tapered arms read as athletic champion boxers
// Atom: a lean, athletic sparring bot — sharp V-taper, sculpted limbs, compact gloves (champion boxer build)
export const ATOM_OPT: Opt = { variant: 'atom', th: 0.78, cw: 0.8, fs: 0.76, lt: 0.82 };
export const BRUTE_OPT: Opt = { variant: 'brute', th: 0.96, cw: 0.98, fs: 0.88, lt: 0.94 };

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
  buildPelvis(r, b, c);
  buildLegs(r, b, c, o);
  buildWaist(r, b, c);
  buildChest(r, b, c, o);
  buildNeckAndHead(r, b, c, o);
  buildArms(r, b, c, o);
  b.flush();
}

// ---------------------------------------------------------------- pelvis
// v4 — a COMPACT CORE, narrower than the hip joints. There is deliberately no armour between or over the
// thighs: nothing can read as a skirt or a diaper. The hips are exposed bearings hanging off the core's sides,
// the seat is a light sculpted plate, and the crotch is closed by one narrow bridge. Materials unchanged.
function buildPelvis(r: Robot, b: Batch, c: Ctx) {
  const P = r.pelvis;
  // ---- CORE: tapered, chamfered volume (x ±0.66 — inside the hip joints at ±0.74) ----
  b.add(
    P,
    sideSolid([[-0.44, 0.42], [0.42, 0.38], [0.5, 0.0], [0.34, -0.38], [-0.38, -0.38], [-0.5, 0.0]], 1.32, 0.08),
    c.main,
    0,
    2.94,
    0,
  );
  // front accent chip + the belt with a glow hairline
  b.add(P, plate([[-0.22, 0.14], [0.22, 0.14], [0.16, -0.1], [-0.16, -0.1]], 0.08, 0.028), c.accent, 0, 3.02, 0.44);
  b.add(P, RB(1.5, 0.11, 0.86, 0.05), c.steel, 0, 3.36, 0);
  b.add(P, RB(1.06, 0.028, 0.06, 0.012), c.glow, 0, 3.41, 0.42);
  // ---- SEAT: one light sculpted plate + a steel seam + a glow hairline (all the seat is armour, no dark mass) ----
  b.add(P, plate([[-0.46, 0.34], [0.46, 0.34], [0.54, -0.04], [0.28, -0.3], [-0.28, -0.3], [-0.54, -0.04]], 0.16, 0.05), c.main, 0, 3.06, -0.46);
  b.add(P, RB(0.78, 0.05, 0.06, 0.02), c.steel, 0, 2.92, -0.56);
  b.add(P, RB(0.035, 0.34, 0.035, 0.012), c.glow, 0, 3.06, -0.6);
  // V-ribs on the front face: a designed "sprinter's hip" line from the belt down to the bridge (front and back)
  for (let i = 0; i < 2; i++) {
    const s2 = i === 0 ? 1 : -1;
    b.add(P, RB(0.07, 0.5, 0.06, 0.02), c.steel, s2 * 0.3, 3.06, 0.42, [0, 0, s2 * 0.42]);
    b.add(P, RB(0.06, 0.42, 0.05, 0.02), c.steel, s2 * 0.28, 3.04, -0.44, [0, 0, s2 * 0.42]);
  }
  // ---- CROTCH BRIDGE: one narrow piece spanning exactly the gap between the two thighs ----
  b.add(P, sideSolid([[-0.24, 0.24], [0.26, 0.22], [0.2, -0.2], [-0.2, -0.2]], 0.74, 0.05), c.main, 0, 2.42, 0);
  b.add(P, RB(0.06, 0.34, 0.34, 0.02), c.joint, 0, 2.44, 0.03);
  b.add(P, RB(0.05, 0.26, 0.05, 0.015), c.steel, 0, 2.44, 0.2);
  // ---- HIP AXLES: short housings out of the core's sides into the exposed bearings ----
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    b.add(P, tcyl(0.26, 0.26, 0.32, 20).rotateZ(Math.PI / 2), c.joint, s * 0.62, 2.85, 0);
    b.add(P, tcyl(0.4, 0.4, 0.26, 24).rotateZ(Math.PI / 2), c.joint, s * 0.78, 2.85, 0);
    b.add(P, tcyl(0.31, 0.31, 0.16, 24).rotateZ(Math.PI / 2), c.steel, s * 0.95, 2.85, 0);
    b.add(P, torus(0.25, 0.035, 26).rotateY(Math.PI / 2), c.accent, s * 1.01, 2.85, 0);
    b.add(P, tcyl(0.08, 0.08, 0.06, 16).rotateZ(Math.PI / 2), c.glow, s * 1.05, 2.85, 0);
  }
}
// ---------------------------------------------------------------- legs
// MODERN ATHLETIC LEGS, built in the same language as the arms: a smooth muscle core, ONE armour shell per
// segment, one accent line, one glow hairline — plus the real mechanical joints kept visible (hip bearing,
// knee axle, calf struts, ankle axle, three-toed boot).
// Joint centres, limb lengths and the sole plane (SOLE below the ankle) are untouched.
function buildLegs(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const lt = o.lt;
  const sy1 = L1 / 1.5; // thigh meshes are modelled at 1.5 length and stretched to the real bone length
  const sy2 = L2 / 1.42;

  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;

    // =========================== 1. HIP BEARING ===========================
    const hip = new THREE.Group();
    hip.position.set(s * 0.74, HIP_Y, 0);
    hip.rotation.order = 'ZXY';
    r.pelvis.add(hip);
    r.hipJ.push(hip);
    // the drum the thigh swings on — one polished drum, one dark collar
    b.add(hip, tcyl(0.36 * lt, 0.36 * lt, 0.5, 22).rotateZ(Math.PI / 2), c.steel);
    b.add(hip, tcyl(0.3 * lt, 0.3 * lt, 0.56, 20).rotateZ(Math.PI / 2), c.joint);

    // =========================== 2. THIGH ===========================
    const thigh = new THREE.Group();
    thigh.scale.set(1, sy1, 1);
    hip.add(thigh);

    // athlete's quad: thick at the hip, lean at the knee (same construction as the bicep)
    b.add(
      thigh,
      lathe(
        [
          [0, -1.5],
          [0.26, -1.5],
          [0.29, -1.34],
          [0.33, -1.04],
          [0.4, -0.68],
          [0.46, -0.34],
          [0.44, -0.12],
          [0.32, -0.02],
          [0, 0],
        ],
        lt,
      ),
      c.sec,
    );
    // ONE armour shell over the front and outer thigh
    b.add(thigh, arcPlate(0.45 * lt, 0.58 * lt, 2.45, 1.0), c.main, 0, -0.62, 0);
    // its top edge: a single accent line
    b.add(thigh, arcPlate(0.585 * lt, 0.61 * lt, 1.9, 0.032), c.accent, 0, -0.42, 0);
    // dark shield closing the back of the thigh
    b.add(thigh, arcPlate(0.42 * lt, 0.55 * lt, 2.2, 0.92), c.main, 0, -0.66, 0, [0, Math.PI, 0]); // hamstring shell
    b.add(thigh, RB(0.5 * lt, 0.05, 0.06, 0.02), c.steel, 0, -0.5, -0.5 * lt);
    // knee shroud that steps the thigh down to the joint
    b.add(thigh, arcPlate(0.35 * lt, 0.47 * lt, 2.0, 0.26), c.main, 0, -1.32, 0);

    // =========================== 3. KNEE ===========================
    const knee = new THREE.Group();
    knee.position.y = -L1;
    hip.add(knee);
    r.kneeJ.push(knee);

    // the axle itself, visible from both sides, with a bearing disc and a bolt on each end
    b.add(knee, tcyl(0.3 * lt, 0.3 * lt, 0.54, 24).rotateZ(Math.PI / 2), c.steel);
    b.add(knee, tcyl(0.23 * lt, 0.23 * lt, 0.6, 20).rotateZ(Math.PI / 2), c.steel);
    // light plate closing the back of the knee, the axle showing below it
    b.add(knee, arcPlate(0.3 * lt, 0.4 * lt, 1.35, 0.34), c.main, 0, -0.04, 0, [0, Math.PI, 0]);
    for (let j = 0; j < 2; j++) {
      const ks = j === 0 ? 1 : -1;
      b.add(knee, tcyl(0.15 * lt, 0.15 * lt, 0.09, 20).rotateZ(Math.PI / 2), c.steel, ks * 0.33, 0, 0);
      b.add(knee, sph(0.06), c.dark, ks * 0.39, 0, 0);
    }

    // floating knee cap (still animated by the robot): one faceted plate with a glow core
    const cap = new THREE.Group();
    cap.position.set(0, 0, 0.28 * lt);
    knee.add(cap);
    r.kneeCaps.push(cap);
    b.add(
      cap,
      sideSolid(
        [
          [-0.26, -0.3],
          [0.16, -0.24],
          [0.34, 0.02],
          [0.22, 0.28],
          [-0.18, 0.3],
          [-0.32, 0],
        ],
        0.6 * lt,
        0.045,
      ),
      c.main,
    );
    b.add(
      cap,
      plate(
        [
          [-0.06, 0.06],
          [0.06, 0.06],
          [0.09, 0.0],
          [0, -0.11],
          [-0.09, 0.0],
        ],
        0.05,
        0.012,
      ),
      c.glow,
      0,
      0.02,
      0.36 * lt,
    );

    // =========================== 4. SHIN ===========================
    const shin = new THREE.Group();
    shin.scale.set(1, sy2, 1);
    knee.add(shin);

    // calf that narrows under the knee, then flares down into the boot cuff (one continuous volume)
    b.add(
      shin,
      lathe(
        [
          [0, -1.42],
          [0.3, -1.42],
          [0.34, -1.32],
          [0.37, -1.06],
          [0.31, -0.76],
          [0.27, -0.5],
          [0.33, -0.2],
          [0.34, -0.03],
          [0, 0],
        ],
        lt,
      ),
      c.sec,
    );
    // ONE greave shell over the front of the shin
    b.add(shin, arcPlate(0.3 * lt, 0.41 * lt, 2.45, 0.74), c.main, 0, -0.4, 0, [0.05, 0, 0]);
    // the cuff: a second shell that flares over the ankle
    b.add(shin, arcPlate(0.32 * lt, 0.46 * lt, 2.3, 0.44), c.main, 0, -1.16, 0.02, [0.12, 0, 0]);
    // calf shell behind: armour front and back, dark only in the narrow inner channel
    b.add(shin, arcPlate(0.28 * lt, 0.38 * lt, 2.0, 0.66), c.main, 0, -0.62, 0, [0.06, Math.PI, 0]);
    // one accent ring between the two shells + one glow hairline down the greave
    b.add(shin, arcPlate(0.42 * lt, 0.45 * lt, 2.05, 0.05), c.accent, 0, -0.79, 0, [0.05, 0, 0]);
    b.add(shin, RB(0.03, 0.46, 0.03, 0.01), c.glow, 0, -0.62, 0.42 * lt);
    // open calf frame behind: two clean struts with the under-suit showing between them
    for (let j = 0; j < 2; j++) {
      const cs = j === 0 ? 1 : -1;
      b.add(shin, RB(0.07 * lt, 0.94, 0.12, 0.02), c.steel, cs * 0.14 * lt, -0.76, -0.3 * (lt / 0.82), [0.06, 0, 0]);
    }

    // =========================== 5. ANKLE & BOOT ===========================
    const ankle = new THREE.Group();
    ankle.position.y = -L2;
    knee.add(ankle);
    r.footJ.push(ankle);

    // exposed ankle axle + the dark instep housing
    b.add(ankle, RB(0.48 * lt, 0.3, 0.44, 0.08), c.dark, 0, -0.03, 0.1);
    b.add(ankle, tcyl(0.19 * lt, 0.19 * lt, 0.44 * lt, 20).rotateZ(Math.PI / 2), c.steel, 0, 0.06, 0);
    b.add(ankle, tcyl(0.13 * lt, 0.13 * lt, 0.5 * lt, 18).rotateZ(Math.PI / 2), c.joint, 0, 0.06, 0);

    const bw = 0.74 + lt * 0.06;
    // sole pad (its underside sits exactly SOLE below the ankle)
    b.add(ankle, RB(bw, 0.07, 0.96, 0.03), c.rubber, 0, -0.175, -0.02);
    // heel block + a steel spur behind it
    b.add(ankle, sideSolid([[-0.48, -0.14], [-0.52, 0.06], [-0.34, 0.18], [-0.08, 0.2], [-0.08, -0.14]], bw * 0.92, 0.05), c.main);
    b.add(ankle, RB(0.26, 0.1, 0.18, 0.03), c.steel, 0, 0.0, -0.52);
    // top deck, one clean wedge, with an accent stripe across the instep
    b.add(ankle, sideSolid([[-0.1, 0.2], [0.3, 0.18], [0.6, 0.06], [0.64, -0.03], [-0.1, -0.03]], bw * 0.96, 0.05), c.main);
    b.add(ankle, RB(bw * 0.5, 0.035, 0.07, 0.012), c.accent, 0, 0.19, 0.34);
    // toe base + ONE hinge bar shared by all three toes
    b.add(ankle, sideSolid([[0.58, 0.06], [0.84, -0.02], [0.88, -0.1], [0.58, -0.12]], bw * 0.86, 0.04), c.dark);
    b.add(ankle, tcyl(0.045, 0.045, bw * 0.9, 14).rotateZ(Math.PI / 2), c.steel, 0, -0.07, 0.7);
    // THREE toes, fanned, one claw and one rubber pad each
    for (let j = 0; j < 3; j++) {
      const t = j - 1;
      const toe = new THREE.Group();
      toe.position.set(s * t * 0.22, -0.05, 0.66);
      toe.rotation.y = -s * t * 0.2;
      ankle.add(toe);
      b.add(toe, sideSolid([[-0.06, 0.05], [0.26, 0.02], [0.52, -0.05], [0.56, -0.09], [-0.06, -0.09]], 0.2, 0.03), c.main);
      b.add(toe, RB(0.19, 0.06, 0.42, 0.025), c.rubber, 0, -0.13, 0.3); // underside on the sole plane
    }
  }
}

// ---------------------------------------------------------------- waist
function buildWaist(r: Robot, b: Batch, c: Ctx) {
  const W = r.waist;
  W.position.set(0, 3.45, 0);
  r.pelvis.add(W);
  // one short mechanical collar (exposed grey, not a black band) under one polished ring — no wasp-waist pinch
  b.add(W, tcyl(0.52, 0.54, 0.26, 30), c.joint, 0, 0.06, 0.02, [0, 0, 0], [1, 1, 0.86]);
  b.add(W, torus(0.53, 0.05, 32), c.steel, 0, 0.2, 0.02, [Math.PI / 2, 0, 0]);
}

// ---------------------------------------------------------------- chest + back
// Chest-local coordinates: y = 0 at the waist joint, ~1.7 at the top of the shoulders; +z is the front.
// CLEAN PASS: every surface here is one deliberate, softly-chamfered volume. The only small parts left are the
// reactor in the sternum and the shoulder-blade plates — the vents, hoses, pistons and LED strips are gone.
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
  const coreG = new THREE.ExtrudeGeometry(core, { depth: 0.84, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, steps: 1 });
  coreG.translate(0, 0, -0.42);
  put(coreG, c.sec, 0, 0, 0);

  // ================= FRONT: two big breastplate halves, one accent line each =================
  const tilt: V3 = [-0.1, 0, 0]; // the upper edge of each pectoral leans back a little
  const pecScale: V3 = [1.32, 1, 1];
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const px = s * 0.5 * W;
    // one tall, smooth pectoral shell — wraps far enough that only a narrow dark channel shows between them
    put(arcPlate(0.5, 0.6, 2.5, 0.9), c.main, px, 1.16, 0, tilt, pecScale);
    // its lower rim: a single accent line
    put(arcPlate(0.61, 0.665, 2.5, 0.05), c.accent, px, 0.79, 0, tilt, pecScale);
    // trapezius: a big sloping yoke into the neck
    put(RB(1.0 * W, 0.4, 0.9, 0.18), c.main, s * 0.72 * W, 1.64, -0.07, [0, 0, s * -0.3]);
  }
  // sternum keel: one crisp tapered column with the reactor set into it
  put(plate([[-0.17, 1.52], [0.17, 1.52], [0.21, 0.94], [0, 0.62], [-0.21, 0.94]], 0.12, 0.025), c.steel, 0, 0, 0.5);
  put(tcyl(0.3, 0.3, 0.1, 6).rotateX(Math.PI / 2), c.steel, 0, 0.99, 0.56);
  put(tcyl(0.245, 0.245, 0.03, 6).rotateX(Math.PI / 2), c.dark, 0, 0.99, 0.585);
  put(tcyl(0.19, 0.19, 0.03, 30).rotateX(Math.PI / 2), c.glow, 0, 0.99, 0.595);
  put(tcyl(0.085, 0.085, 0.05, 20).rotateX(Math.PI / 2), c.core, 0, 0.99, 0.615);
  // abdomen: ONE clean plate + a vent band (the old three-plate stack is what read as a zigzag)
  put(
    plate(X([[-0.72, 0.54], [0.72, 0.54], [0.54, 0.06], [0.3, -0.12], [-0.3, -0.12], [-0.54, 0.06]]), 0.1, 0.03),
    atom ? c.main : c.sec,
    0,
    0,
    0.48,
  );
  // lower ribs: light plates closing the flanks under the pecs (the dark V that showed there is now gone)
  for (let i = 0; i < 2; i++) {
    const s2 = i === 0 ? 1 : -1;
    put(sideSolid([[0.62, 0.72], [0.72, 0.42], [0.58, 0.16], [0.1, 0.12], [0.1, 0.7]], 0.16, 0.03), c.main, s2 * 0.5 * W, 0, 0.34);
  }
  put(RB(0.74 * W, 0.075, 0.05, 0.02), c.dark, 0, 0.2, 0.54);
  // collar-bone yoke steps back behind the sternum keel (no coplanar plates)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    put(plate(X([[0.06, 1.68], [0.9, 1.66], [0.74, 1.46], [0.06, 1.5]]), 0.09, 0.028), c.steel, s, 0, 0.46);
  }

  // ================= BACK =================
  // main back plate (shoulder → waist), wide and smooth
  put(plate(X([[-0.98, 1.62], [0.98, 1.62], [1.06, 1.1], [0.62, 0.1], [-0.62, 0.1], [-1.06, 1.1]]), 0.15, 0.045), c.main, 0, 0, -0.58);
  // one spine ridge with a single thin light line down it
  put(plate(X([[-0.3, 1.52], [0.3, 1.52], [0.34, 0.34], [0, 0.14], [-0.34, 0.34]]), 0.12, 0.04), c.dark, 0, 0, -0.74);
  put(RB(0.035, 1.15, 0.035, 0.015), c.glow, 0, 0.92, -0.9);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    // shoulder-blade plates, angled outwards
    const blade: Pts = [[0.1, 1.55], [0.95, 1.5], [0.98, 1.0], [0.55, 0.75], [0.1, 0.9]].map(([x, y]): [number, number] => [x * s * W, y]);
    put(plate(blade, 0.12, 0.038), c.main, 0, 0, -0.68, [0.06, s * 0.16, 0]);
  }
  if (atom) {
    // one clean power pack with a light bar and two recessed thruster rings
    put(RB(0.86, 0.58, 0.32, 0.14), c.dark, 0, 1.12, -0.94);
    put(RB(0.72, 0.05, 0.06, 0.02), c.accent, 0, 1.43, -1.1);
    put(RB(0.6, 0.035, 0.05, 0.014), c.glow, 0, 0.9, -1.12);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.11, 0.14, 0.1, 20).rotateX(-Math.PI / 2), c.steel, s * 0.3, 0.78, -1.02);
      put(tcyl(0.075, 0.075, 0.03, 20).rotateX(-Math.PI / 2), c.glow, s * 0.3, 0.75, -1.05);
    }
  } else {
    // heavy radiator block + two angled exhaust stacks
    put(RB(1.12 * W, 0.5, 0.32, 0.12), c.dark, 0, 1.05, -0.88);
    put(RB(0.86 * W, 0.05, 0.06, 0.02), c.accent, 0, 1.31, -1.06);
    put(RB(0.7 * W, 0.035, 0.05, 0.014), c.glow, 0, 0.86, -1.06);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.16, 0.2, 1.0, 18), c.steel, s * 0.62, 1.5, -0.92, [0, 0, s * -0.14]);
      put(tcyl(0.105, 0.105, 0.05, 16), c.glow, s * 0.69, 2.0, -0.92);
    }
  }

  // ================= collar: a ring round the neck + a raised guard behind the head =================
  put(torus(0.42, 0.075, 30), c.steel, 0, 1.74, 0, [Math.PI / 2, 0, 0]);
  put(plate([[-0.5, 1.66], [0.5, 1.66], [0.44, 1.96], [-0.44, 1.96]], 0.11, 0.036), c.main, 0, 0, -0.38);
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
  if (o.variant === 'atom') atomHelmet(r, H, b, c);
  else bruteHelmet(r, H, b, c);
}

/**
 * ATOM-style head (the reference build): a tall, rounded-rectangular chrome helmet whose whole roof is a
 * radiator crown of vertical fins, a deeply recessed dark WIRE-MESH face under an overhanging brow, and two
 * round, ringed cyan eyes glowing through the mesh. No visor slit, no jaw — the mesh is the face.
 */
function atomHelmet(r: Robot, H: THREE.Group, b: Batch, c: Ctx) {
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: V3, scl?: V3) => b.add(H, g, m, x, y, z, rot, scl);

  // ================= helmet shell: tall, soft-cornered box that tapers down towards the mesh =================
  put(RB(0.72, 0.56, 0.76, 0.2), c.main, 0, 0.3, -0.02); // upper skull
  put(RB(0.7, 0.26, 0.5, 0.14), c.main, 0, -0.02, -0.14); // lower band — pulled back so the mesh face stays open
  // bevelled front face of the helmet, overhanging the mesh like a cap peak
  put(sideSolid([[0.3, 0.6], [0.44, 0.44], [0.46, 0.16], [0.3, 0.1]], 0.78, 0.03), c.main);
  put(RB(0.8, 0.035, 0.08, 0.012), c.steel, 0, 0.12, 0.43); // brow trim
  put(RB(0.5, 0.025, 0.05, 0.01), c.accent, 0, 0.17, 0.45); // accent stripe on the brow
  for (let i = 0; i < 2; i++) {
    const s2 = i === 0 ? 1 : -1;
    put(RB(0.28, 0.03, 0.05, 0.012), c.accent, s2 * 0.15, 0.34, 0.42, [0, 0, -s2 * 0.5]); // forehead chevron
  }

  // ================= crown: a low radiator grille that IS the roof =================
  // (no frame or rails around it — a cage on top of the head read as a weird floating box)
  const FINS = 11;
  for (let i = 0; i < FINS; i++) {
    const u = (i / (FINS - 1)) * 2 - 1; // -1 … 1 across the head
    const h = 0.19 - u * u * 0.12; // domes over the middle, almost flat at the edges
    const d = 0.7 - u * u * 0.24; // and shortens towards the sides → a rounded crown, not a block
    put(RB(0.028, h, d, 0.012), c.steel, u * 0.33, 0.58 + h / 2, -0.02);
  }
  // a thin plinth exactly as wide as the skull, so the grille sits flush instead of perching on top
  put(RB(0.74, 0.05, 0.76, 0.025), c.main, 0, 0.585, -0.02);
  put(RB(0.4, 0.026, 0.03, 0.01), c.glow, 0, 0.6, 0.36); // crest light bar

  // ================= face: recessed dark wire mesh =================
  put(RB(0.52, 0.32, 0.1, 0.04), c.dark, 0, -0.24, 0.33); // the dark cavity behind the mesh (now the lower half of the face)
  const MX = 9;
  const MY = 6;
  for (let i = 0; i < MX; i++) put(RB(0.012, 0.3, 0.012, 0.004), c.rubber, (i / (MX - 1) - 0.5) * 0.48, -0.24, 0.38);
  for (let j = 0; j < MY; j++) put(RB(0.49, 0.012, 0.012, 0.004), c.rubber, 0, -0.24 + (j / (MY - 1) - 0.5) * 0.28, 0.38);
  put(RB(0.56, 0.34, 0.03, 0.02), c.steel, 0, -0.24, 0.35, [0, 0, 0], [1, 1, 0.4]); // mesh frame
  // ================= the EYE VISOR: one wide angled trapezoid plate the optics sit in =================
  put(sideSolid([[0.34, 0.28], [0.4, 0.1], [0.4, -0.06], [-0.02, -0.06]], 0.5, 0.03), c.dark, 0, 0.0, 0);

  // ================= eyes: angular hex optics, tilted into a glare =================
  // Layered camera optics with dynamic motion: hex bezel → socket → iris → moving pupil → scanning laser → anamorphic lens flare
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const x = s * 0.155;
    const y = -0.02;
    const tilt: V3 = [0, 0, s * 0.24]; // outer corner lifted → an aggressive glare
    put(tcyl(0.135, 0.135, 0.04, 6).rotateX(Math.PI / 2), c.steel, x, y, 0.4, tilt); // hex bezel
    put(tcyl(0.11, 0.11, 0.03, 6).rotateX(Math.PI / 2), c.dark, x, y, 0.418, tilt); // socket
    put(RB(0.18, 0.026, 0.022, 0.008), c.accent, x, y + 0.125, 0.43, [0, 0, s * 0.3]); // angled brow slash

    // Dynamic Ocular Eye Group on head
    const eye = new THREE.Group();
    eye.position.set(x, y, 0.43);
    eye.rotation.set(0, 0, s * 0.26);
    H.add(eye);
    r.eyeOptics.push(eye);

    // Glowing Iris base plate
    const irisMat = new THREE.MeshBasicMaterial({ color: c.style.glow });
    const iris = new THREE.Mesh(tcyl(0.086, 0.086, 0.012, 6).rotateX(Math.PI / 2), irisMat);
    eye.add(iris);
    r.eyeIris.push(iris);

    // Moving Pupil / Ocular Core group (tracks target and saccades)
    const pupil = new THREE.Group();
    eye.add(pupil);
    r.eyePupils.push(pupil);

    // Dynamic slit core + hot cross glint
    const slit = new THREE.Mesh(RB(0.024, 0.095, 0.016, 0.006), c.core);
    slit.position.z = 0.01;
    pupil.add(slit);

    const cross = new THREE.Mesh(RB(0.05, 0.016, 0.016, 0.005), c.core);
    cross.position.z = 0.01;
    pupil.add(cross);

    // Micro aperture ring around the pupil
    const ringMat = new THREE.MeshBasicMaterial({ color: c.style.glow });
    const ring = new THREE.Mesh(torus(0.044, 0.006, 16), ringMat);
    ring.position.z = 0.008;
    pupil.add(ring);

    // Active Laser Scanline Bar (sweeps up and down inside the socket)
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const scanBar = new THREE.Mesh(RB(0.13, 0.008, 0.008, 0.002), scanMat);
    scanBar.position.z = 0.014;
    eye.add(scanBar);
    r.eyeScanners.push(scanBar);

    // Anamorphic Lens Flare (shimmering horizontal optical flare across the lens)
    const flareGeo = new THREE.PlaneGeometry(0.36, 0.038);
    const flareMat = new THREE.MeshBasicMaterial({
      color: c.style.glow,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flare = new THREE.Mesh(flareGeo, flareMat);
    flare.position.z = 0.02;
    eye.add(flare);
    r.eyeFlares.push(flare);

    // STRIKE OPTICS 1: the lock-on pulse ring — a single ring that pops out of the socket the instant a punch
    // leaves the guard (scale + opacity are driven by robot.ts)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: c.style.glow,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(torus(0.1, 0.012, 26), pulseMat);
    pulse.position.z = 0.03;
    eye.add(pulse);
    r.eyePulses.push(pulse);

    // STRIKE OPTICS 2: the motion streak — a thin additive ribbon off the socket that stretches forward with
    // the throw (motion blur of the eye light)
    const beamMat = new THREE.MeshBasicMaterial({
      color: c.style.glow,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.5).rotateX(Math.PI / 2), beamMat);
    beam.position.set(0, 0, 0.3);
    eye.add(beam);
    r.eyeBeams.push(beam);

    // Subtle Ocular Glare Light
    const eyeLight = new THREE.PointLight(c.style.glow, 1.2, 1.4, 2.0);
    eyeLight.position.set(0, 0, 0.04);
    eye.add(eyeLight);
    r.eyeLights.push(eyeLight);
  }

  // ================= sides and back =================
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    put(RB(0.11, 0.38, 0.44, 0.06), c.main, s * 0.33, 0.06, -0.02); // temple armour
    put(RB(0.02, 0.3, 0.16, 0.008), c.dark, s * 0.39, 0.06, 0.06); // temple vent
    put(tcyl(0.095, 0.095, 0.07, 18).rotateZ(Math.PI / 2), c.steel, s * 0.4, 0.06, -0.08); // temple pod
    put(torus(0.05, 0.013, 16).rotateY(Math.PI / 2), c.glow, s * 0.45, 0.06, -0.08);
    put(RB(0.07, 0.2, 0.26, 0.03), c.main, s * 0.34, -0.2, -0.08); // jaw hinge bracket
    put(RB(0.02, 0.14, 0.2, 0.008), c.dark, s * 0.38, -0.2, -0.08);
  }
  // back of the skull: armour shell with a narrow dark spine and steel slats (it used to be one black box)
  put(RB(0.62, 0.5, 0.12, 0.08), c.main, 0, 0.16, -0.37);
  put(RB(0.22, 0.44, 0.1, 0.04), c.dark, 0, 0.16, -0.42);
  for (let k = 0; k < 3; k++) put(RB(0.56, 0.035, 0.05, 0.012), c.steel, 0, 0.3 - k * 0.1, -0.44);
  put(RB(0.34, 0.2, 0.22, 0.06), c.joint, 0, -0.3, -0.12); // neck collar under the helmet
  // jaw: a chamfered chin wedge under the grille + a steel chin strip
  put(sideSolid([[0.3, -0.36], [0.34, -0.42], [0.2, -0.5], [-0.04, -0.48], [0.02, -0.36]], 0.46, 0.03), c.main, 0, 0, 0);
  put(RB(0.3, 0.03, 0.06, 0.012), c.steel, 0, -0.46, 0.3);
  // face sides: one tall armour cheek on each side (this is what closes the helmet — the visor and the grille
  // are recessed between them, so nothing black shows from the side)
  for (let i = 0; i < 2; i++) {
    const s2 = i === 0 ? 1 : -1;
    put(sideSolid([[0.44, 0.3], [0.46, 0.06], [0.36, -0.3], [0.08, -0.46], [-0.02, -0.46], [0.0, 0.3]], 0.09, 0.025), c.main, s2 * 0.34, 0, 0);
  }
}

/** Heavier Jaeger head for the opponents: a wide hammer-head slab, an angry V-glare, forward fangs and horn fins. */
function bruteHelmet(r: Robot, H: THREE.Group, b: Batch, c: Ctx) {
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
    // eye marker: punches aimed at the head land right here, between the optics
    const optic = new THREE.Group();
    optic.position.set(x0, 0.02, 0.69);
    H.add(optic);
    r.eyeOptics.push(optic);

    // Ocular Glare Flare
    const flareGeo = new THREE.PlaneGeometry(0.32, 0.038);
    const flareMat = new THREE.MeshBasicMaterial({
      color: c.style.glow,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flare = new THREE.Mesh(flareGeo, flareMat);
    flare.position.set(x0, 0.02, 0.706);
    H.add(flare);
    r.eyeFlares.push(flare);

    // STRIKE OPTICS: the lock-on pulse ring + the motion streak (driven from robot.ts on every punch)
    const pulseMat = new THREE.MeshBasicMaterial({
      color: c.style.glow,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pulse = new THREE.Mesh(torus(0.11, 0.013, 26), pulseMat);
    pulse.position.set(x0, 0.02, 0.71);
    H.add(pulse);
    r.eyePulses.push(pulse);

    const beamMat = new THREE.MeshBasicMaterial({
      color: c.style.glow,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.5).rotateX(Math.PI / 2), beamMat);
    beam.position.set(x0, 0.02, 0.98);
    H.add(beam);
    r.eyeBeams.push(beam);

    const eyeLight = new THREE.PointLight(c.style.glow, 1.0, 1.3, 2.0);
    eyeLight.position.set(x0, 0.02, 0.72);
    H.add(eyeLight);
    r.eyeLights.push(eyeLight);

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
// CLEAN PASS: the arm is a sculpted muscle core, ONE armour plate over it and ONE accent line per segment.
// The triceps pistons, tendon rods, glow veins and the four-piece knuckle stack are gone; the glove is now a
// single smooth fist with one knuckle bar.
function buildArms(r: Robot, b: Batch, c: Ctx, o: Opt) {
  const th = o.th;
  const k = o.fs;
  const fa = th * (o.variant === 'atom' ? 0.88 : 0.94); // athletic forearm taper

  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;

    // =========================== 1. CLAVICLE & SHOULDER PIVOT ===========================
    const clav = new THREE.Group();
    clav.position.set(s * 0.88, 1.9 - CY, 0);
    r.chest.add(clav);
    r.clavs.push(clav);
    b.add(clav, RB(0.7, 0.24, 0.44, 0.1), c.joint, s * 0.3, 0, 0);

    const sh = new THREE.Group();
    sh.position.set(s * 0.8, -0.32, 0);
    sh.rotation.order = 'YXZ';
    clav.add(sh);
    r.shoulders.push(sh);

    // =========================== 2. ATHLETIC DELTOID PAULDRON ===========================
    const cap = new THREE.Group();
    cap.position.copy(sh.position);
    clav.add(cap);
    r.caps.push(cap);

    // one smooth deltoid dome, one under-plate and a single accent ribbon
    b.add(cap, dome(0.5 * th, 0.54), c.main, 0, 0.06, 0, [0, 0, 0], [1, 0.84, 1.06]);
    b.add(cap, arcPlate(0.5 * th, 0.575 * th, 1.9, 0.38), c.main, 0, -0.03, 0);
    b.add(cap, arcPlate(0.52 * th, 0.585 * th, 1.5, 0.055), c.accent, 0, -0.17, 0);

    // =========================== 3. BICEPS & TRICEPS (UPPER ARM) ===========================
    // shoulder ball joint
    b.add(sh, sph(0.38 * th), c.joint);

    // chiseled bicep peak and horseshoe triceps muscular profile
    b.add(
      sh,
      lathe(
        [
          [0, -1.12],
          [0.21, -1.12],
          [0.26, -1.0],
          [0.34, -0.78],
          [0.44, -0.5],
          [0.46, -0.28],
          [0.4, -0.1],
          [0.32, -0.02],
          [0, 0],
        ],
        th,
      ),
      c.sec,
    );
    // front bicep plate + posterior triceps shield + one accent ring
    b.add(sh, arcPlate(0.45 * th, 0.53 * th, 2.3, 0.68), c.main, 0, -0.4, 0.02);
    b.add(sh, arcPlate(0.44 * th, 0.53 * th, 2.3, 0.74), c.main, 0, -0.43, 0, [0, Math.PI, 0]); // triceps shell
    b.add(sh, RB(0.03, 0.42, 0.03, 0.01), c.dark, 0, -0.5, -0.52 * th);
    b.add(sh, arcPlate(0.43 * th, 0.485 * th, 1.6, 0.05), c.accent, 0, -0.86, 0.01);

    // =========================== 4. ELBOW & FOREARM (TAPERED ATHLETIC BRACER) ===========================
    const el = new THREE.Group();
    el.position.y = -1.1;
    sh.add(el);
    r.elbows.push(el);

    // rotary elbow: bearing, one side disc, a smooth strike cap
    b.add(el, sph(0.28 * th), c.joint);
    b.add(el, tcyl(0.23 * th, 0.23 * th, 0.09, 22).rotateZ(Math.PI / 2), c.steel, s * 0.28 * th, 0, 0);
    b.add(el, dome(0.19 * th, 0.5).rotateX(-Math.PI / 2), c.steel, 0, 0.0, -0.22 * th);

    // muscular forearm taper: thick near the elbow -> lean wrist
    b.add(
      el,
      lathe(
        [
          [0, -1.3],
          [0.19, -1.3],
          [0.22, -1.16],
          [0.29, -0.88],
          [0.4, -0.52],
          [0.45, -0.28],
          [0.38, -0.08],
          [0.3, -0.01],
          [0, 0],
        ],
        fa,
      ),
      c.sec,
    );
    // one bracer plate over the forearm + one thin light line + the wrist collar
    b.add(el, arcPlate(0.42 * fa, 0.49 * fa, 2.5, 0.58), c.main, 0, -0.52, 0);
    b.add(el, arcPlate(0.4 * fa, 0.47 * fa, 2.2, 0.56), c.main, 0, -0.54, 0, [0, Math.PI, 0]);
    b.add(el, RB(0.03, 0.38, 0.03, 0.01), c.glow, s * 0.47 * fa, -0.56, 0);
    b.add(el, arcPlate(0.25 * fa, 0.32 * fa, 2.5, 0.055), c.steel, 0, -1.12, 0);

    // =========================== 5. WRIST & PRO BOXING GLOVES ===========================
    const wr = new THREE.Group();
    wr.position.y = -1.3;
    el.add(wr);
    r.wrists.push(wr);

    const fist = new THREE.Group();
    wr.add(fist);
    r.fists.push(fist);

    // tapered wrist cuff + one glow ring
    b.add(fist, tcyl(0.27 * k, 0.37 * k, 0.3, 26), c.steel, 0, -0.04, 0);
    b.add(fist, torus(0.37 * k, 0.026, 30), c.glow, 0, -0.18, 0, [Math.PI / 2, 0, 0]);

    // ONE smooth glove body (tight aerodynamic boxer fist)
    b.add(fist, RB(0.8 * k, 0.84 * k, 0.82 * k, 0.34 * k), c.dark, 0, -0.58 * k, 0.02);
    // ONE knuckle bar across the striking face of the fist (protrudes like a real glove's knuckle pad)
    b.add(fist, RB(0.6 * k, 0.16 * k, 0.5 * k, 0.08 * k), c.main, 0, -0.9 * k, 0.14);
    // tucked thumb (proper boxing form)
    b.add(fist, new THREE.CapsuleGeometry(0.13 * k, 0.3 * k, 6, 14), c.rubber, -s * 0.44 * k, -0.68 * k, 0.02, [0, 0, -s * 0.14]);
  }
}
