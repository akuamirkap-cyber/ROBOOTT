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

export interface SkinMeta {
  id: number;
  name: string;
  sub: string;
  rarity: 'SIGNATURE' | 'RARE' | 'EPIC' | 'ULTRA RARE' | 'LEGENDARY' | 'MYTHIC' | 'DIVINE' | 'APEX';
  color: string;
  accent: string;
}

export const HELMET_SKINS: SkinMeta[] = [
  { id: 0, name: 'ATOM PRIME', sub: 'G2 Sparring Mesh & Radiator Crown', rarity: 'SIGNATURE', color: '#45d6ff', accent: '#1e50a2' },
  { id: 1, name: 'ZEUS SOVEREIGN', sub: 'WRB King Monolith & Jaw Pistons', rarity: 'MYTHIC', color: '#5effb0', accent: '#1a2430' },
  { id: 2, name: 'NOISY BOY SHOGUN', sub: 'Samurai Kabuto & Oni Fanged Mask', rarity: 'LEGENDARY', color: '#ff3b7a', accent: '#ffb703' },
  { id: 3, name: 'MIDAS GOLDHAWK', sub: '24K Gold Mohawk & Fang Visor', rarity: 'ULTRA RARE', color: '#ffcc33', accent: '#9e2a2b' },
  { id: 4, name: 'TWIN CITIES HYDRA', sub: 'Tri-Optic Cyclops & Twin Turbos', rarity: 'LEGENDARY', color: '#ff5a36', accent: '#3a4252' },
  { id: 5, name: 'AMBUSH CRUSHER', sub: 'Hydraulic Iron-Jaw & Roll-Bar', rarity: 'RARE', color: '#ff9b3d', accent: '#4a5568' },
  { id: 6, name: 'METRO SIEGE CAGE', sub: 'Welded Steel Roll-Cage & Beacon', rarity: 'EPIC', color: '#ffd166', accent: '#5c4d3c' },
  { id: 7, name: 'BLACKJACK VIPER', sub: 'Aero Valkyrie Wings & V-Visor', rarity: 'ULTRA RARE', color: '#00f5d4', accent: '#1b263b' },
  { id: 8, name: 'CENTURION SPARTAN', sub: 'Titanium Brush-Crest & T-Slit', rarity: 'LEGENDARY', color: '#60a5fa', accent: '#cbd5e1' },
  { id: 9, name: 'OVERLORD OMEGA', sub: 'Cyber-Demon Horns & Magma Crown', rarity: 'MYTHIC', color: '#ff2a4b', accent: '#ffb703' },
  { id: 10, name: 'ZEUS THUNDERLORD', sub: 'Olympian Lightning Crown, Tesla Temples & Storm-Beard Jaw', rarity: 'DIVINE', color: '#b8f0ff', accent: '#ffd36b' },
  { id: 11, name: 'RED METAL REAPER', sub: 'Candy-Red Chrome Blade-Fin, V8 Grille Jaw & Side Pipes', rarity: 'APEX', color: '#ff2d3a', accent: '#e6e8ec' },
];

export const ARMOR_SKINS: SkinMeta[] = [
  { id: 0, name: 'G2 TITANIUM APEX', sub: 'Standard Carbon-Titanium & Arc Core', rarity: 'SIGNATURE', color: '#45d6ff', accent: '#1540a8' },
  { id: 1, name: 'ZEUS MONOLITH MK-X', sub: 'Obsidian Juggernaut & Nitro Pistons', rarity: 'MYTHIC', color: '#5effb0', accent: '#1e293b' },
  { id: 2, name: 'NOISY BOY DAIMYO', sub: 'Samurai Do-Maru & Neon Kanji Matrix', rarity: 'LEGENDARY', color: '#ff3b7a', accent: '#ffb703' },
  { id: 3, name: 'MIDAS 24K IMPERIAL', sub: 'Solid 24K Gold Cuirass & Spiked Caps', rarity: 'ULTRA RARE', color: '#ffcc33', accent: '#991b1b' },
  { id: 4, name: 'TWIN CITIES TURBO', sub: 'Dual Chest Reactors & Quad Jet-Stacks', rarity: 'LEGENDARY', color: '#ff5a36', accent: '#b91c1c' },
  { id: 5, name: 'METRO SIEGE EXOSUIT', sub: 'Heavy Roll-Cage Chest & Smokestacks', rarity: 'EPIC', color: '#ffd166', accent: '#d97706' },
  { id: 6, name: 'AMBUSH SCRAP-TITAN', sub: 'Cross-Harness Plating & Boiler Pack', rarity: 'RARE', color: '#ff9b3d', accent: '#4b5563' },
  { id: 7, name: 'VIPER STEALTH AERO', sub: 'Carbon Stealth Wing-Pauldrons & Core', rarity: 'ULTRA RARE', color: '#00f5d4', accent: '#0f172a' },
  { id: 8, name: 'CENTURION AEGIS', sub: 'Mirror-Chrome Paladin & Winged Shield', rarity: 'LEGENDARY', color: '#60a5fa', accent: '#e2e8f0' },
  { id: 9, name: 'OVERLORD HELLFORGE', sub: 'Horned Demon Pauldrons & Magma Core', rarity: 'MYTHIC', color: '#ff2a4b', accent: '#f59e0b' },
  { id: 10, name: 'ZEUS THUNDERLORD AEGIS', sub: 'Storm-Titanium Cuirass, Sternum Thunderbolt & Twin Tesla Coils', rarity: 'DIVINE', color: '#b8f0ff', accent: '#ffd36b' },
  { id: 11, name: 'RED METAL JUGGERNAUT', sub: 'Candy-Red Chrome Plating, Hood-Scoop Chest & V8 Header Exhausts', rarity: 'APEX', color: '#ff2d3a', accent: '#e6e8ec' },
];

export const GLOVE_SKINS: SkinMeta[] = [
  { id: 0, name: 'G2 TITANIUM PRO', sub: 'WRB Heavy Titanium & Arc Cuff', rarity: 'SIGNATURE', color: '#45d6ff', accent: '#1e50a2' },
  { id: 1, name: 'ZEUS NITRO PISTON', sub: 'Twin Hydraulic Rams & Emerald Vents', rarity: 'MYTHIC', color: '#5effb0', accent: '#2b3440' },
  { id: 2, name: 'NOISY BOY KANJI', sub: 'Neon LED Matrix & Golden Shogun Studs', rarity: 'LEGENDARY', color: '#ff3b7a', accent: '#6b1d3f' },
  { id: 3, name: 'MIDAS 24K GOLD', sub: '24K Gold Spiked Cestus & Ruby Guard', rarity: 'ULTRA RARE', color: '#ffcc33', accent: '#b91c1c' },
  { id: 4, name: 'METRO SLEDGEHAMMER', sub: 'Octagonal Siege Anvil & Side Weights', rarity: 'EPIC', color: '#ff9f1c', accent: '#475569' },
  { id: 5, name: 'TWIN CITIES TURBINE', sub: 'Rotary Jet-Turbine & Twin Exhausts', rarity: 'LEGENDARY', color: '#ff4d4d', accent: '#334155' },
  { id: 6, name: 'AMBUSH IRON CAGE', sub: 'Exoskeleton Roll-Cage & Spike Bar', rarity: 'RARE', color: '#f97316', accent: '#52525b' },
  { id: 7, name: 'ATOM OVERCLOCK CORE', sub: 'Exposed Blue Arc-Reactor & Fins', rarity: 'MYTHIC', color: '#38bdf8', accent: '#0284c7' },
  { id: 8, name: 'VIPER VENOM TALON', sub: '4 Razor Cyber-Claws & Plasma Tubes', rarity: 'ULTRA RARE', color: '#10b981', accent: '#064e3b' },
  { id: 9, name: 'OMEGA HELLFIRE', sub: 'Dragon-Scale Armor & 4 Doom-Spikes', rarity: 'MYTHIC', color: '#ff2a4b', accent: '#f59e0b' },
  { id: 10, name: 'ZEUS THUNDERFIST', sub: 'Tesla-Coil Cuff, Gold Thunderbolt & 4 Lightning Prongs', rarity: 'DIVINE', color: '#b8f0ff', accent: '#ffd36b' },
  { id: 11, name: 'RED METAL PISTON KNUCKLE', sub: 'Chrome Piston Knuckle-Duster, Red Chrome Shell & Side Pipes', rarity: 'APEX', color: '#ff2d3a', accent: '#e6e8ec' },
];

// fs = fist & wrist size: enlarged (+35%) heavy-duty champion boxing gloves & wrist cuffs
export const ATOM_OPT: Opt = { variant: 'atom', th: 0.78, cw: 0.8, fs: 1.04, lt: 0.82 };
export const BRUTE_OPT: Opt = { variant: 'brute', th: 0.96, cw: 0.98, fs: 1.18, lt: 0.94 };

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
/** a classic jagged thunderbolt in the XY plane (unit height, tip pointing down), extruded along Z */
const BOLT: Pts = [[0.02, 0.5], [-0.17, 0.05], [-0.03, 0.05], [-0.13, -0.5], [0.17, -0.07], [0.04, -0.07], [0.15, 0.5]];
const bolt = (h: number, depth: number, bevel = 0.006) => plate(BOLT.map(([x, y]) => [x * h, y * h] as [number, number]), depth, bevel);

// ---------------------------------------------------------------- batching (keeps draw calls low)
class Batch {
  constructor(private tag = '') {}
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
      if (this.tag) mesh.userData.kit = this.tag;
      parent.add(mesh);
    }
    this.map.clear();
  }
}

// ---------------------------------------------------------------- public entry
export function applyArmorPalette(r: Robot, c: Ctx, o: Opt) {
  if (o.variant !== 'atom') return;
  const skin = c.style.armorSkin ?? 0;
  const palettes: Record<number, { main: number; sec: number; accent: number; glow: number; mMet: number; mRough: number }> = {
    0: { main: c.style.main, sec: c.style.secondary, accent: c.style.accent, glow: c.style.glow, mMet: 0.5, mRough: 0.3 }, // G2 TITANIUM APEX (factory colours)
    1: { main: 0x171d26, sec: 0x2a3342, accent: 0x94a3b8, glow: 0x5effb0, mMet: 0.88, mRough: 0.22 }, // ZEUS MONOLITH MK-X
    2: { main: 0x321430, sec: 0x1e1122, accent: 0xffb703, glow: 0xff2a7a, mMet: 0.82, mRough: 0.24 }, // NOISY BOY DAIMYO
    3: { main: 0xfbbf24, sec: 0x6b1218, accent: 0xffe066, glow: 0xffd700, mMet: 0.94, mRough: 0.16 }, // MIDAS 24K IMPERIAL
    4: { main: 0x333c4d, sec: 0x1b202b, accent: 0xd93829, glow: 0xff5a36, mMet: 0.8, mRough: 0.28 },  // TWIN CITIES TURBO
    5: { main: 0x4f4639, sec: 0x26221e, accent: 0xeab308, glow: 0xffd166, mMet: 0.76, mRough: 0.34 }, // METRO SIEGE EXOSUIT
    6: { main: 0x434d56, sec: 0x22272e, accent: 0xd97706, glow: 0xff9b3d, mMet: 0.78, mRough: 0.32 }, // AMBUSH SCRAP-TITAN
    7: { main: 0x0f172a, sec: 0x1e293b, accent: 0x00f5d4, glow: 0x00f5d4, mMet: 0.86, mRough: 0.2 },  // VIPER STEALTH AERO
    8: { main: 0xe2e8f0, sec: 0x334155, accent: 0x2563eb, glow: 0x60a5fa, mMet: 0.92, mRough: 0.18 }, // CENTURION AEGIS
    9: { main: 0x1a1116, sec: 0x3f0d1c, accent: 0xf59e0b, glow: 0xff2a4b, mMet: 0.88, mRough: 0.22 }, // OVERLORD HELLFORGE
    10: { main: 0x27405e, sec: 0x0f1826, accent: 0xffd36b, glow: 0xb8f0ff, mMet: 0.9, mRough: 0.2 }, // ZEUS THUNDERLORD AEGIS (storm titanium + Olympian gold + lightning)
    11: { main: 0xc1121f, sec: 0x1f2227, accent: 0xe6e8ec, glow: 0xff4040, mMet: 0.97, mRough: 0.1 }, // RED METAL JUGGERNAUT (candy-apple red chrome + mirror chrome)
  };
  const p = palettes[skin] || palettes[0];
  c.main.color.setHex(p.main);
  r.armorColor = p.main;
  c.main.metalness = p.mMet;
  c.main.roughness = p.mRough;
  c.sec.color.setHex(p.sec);
  c.accent.color.setHex(p.accent);
  const polished = skin === 2 || skin === 3 || skin === 9 || skin === 10 || skin === 11;
  c.accent.metalness = polished ? (skin === 11 ? 0.98 : 0.92) : 0.65;
  c.accent.roughness = polished ? (skin === 11 ? 0.08 : 0.18) : 0.28;
  c.glow.color.setHex(p.glow);
  c.glow.emissive.setHex(p.glow);
}

export function buildRobot(r: Robot, c: Ctx, o: Opt) {
  applyArmorPalette(r, c, o);
  const b = new Batch();
  r.pelvis.position.y = UP; // longer legs lift everything above the hips
  buildPelvis(r, b, c);
  buildLegs(r, b, c, o);
  buildWaist(r, b, c);
  buildChest(r, b, c, o);
  buildNeckAndHead(r, b, c, o);
  buildArms(r, b, c, o);
  b.flush();
  addBodyKit(r, c, o);
}

/** strip a previously fitted body kit (every merged mesh tagged by its Batch) off the whole rig */
function removeBodyKit(r: Robot) {
  const gone: THREE.Mesh[] = [];
  r.root.traverse((n) => {
    if (n instanceof THREE.Mesh && n.userData.kit) gone.push(n);
  });
  for (const m of gone) {
    m.geometry.dispose();
    m.removeFromParent();
  }
}

/**
 * FULL-BODY KITS. The signature skins do not just repaint the robot: they bolt a whole new silhouette onto the
 * rig — pelvis skirt, thigh and shin plates, arm bands and bracers, and a big dorsal piece — so the machine
 * reads as a different fighter from across the arena. Kits live on the SAME joints as the base armour (thigh
 * and shin groups are stretched to the real bone lengths exactly like the base plates), so they move with it.
 *  10 ZEUS THUNDERLORD — Olympian: pteruges skirt, golden greave bands, winged talaria shins, armbands, studded
 *     bracers, thunderbolts everywhere and a great STORM HALO disc behind the shoulders.
 *  11 RED METAL JUGGERNAUT — muscle machine: chrome bumper + fog lights + rear exhausts on the hips, hood-scoop
 *     thighs, wheel-rim knee caps, side-exit exhaust stacks on the shins, chrome fin blades on the arms and a
 *     full-width REAR SPOILER WING across the back.
 */
function addBodyKit(r: Robot, c: Ctx, o: Opt) {
  const skin = o.variant === 'atom' ? (c.style.armorSkin ?? 0) : 0;
  if (skin < 10) return;
  const b = new Batch('kit');
  const lt = o.lt;
  const th = o.th;
  const fa = th * 0.88;
  const P = r.pelvis;
  const C = r.chest;
  const groupOf = (j: THREE.Group, skip: THREE.Group) => j.children.find((ch) => ch !== skip && (ch as THREE.Group).isGroup) as THREE.Group;
  const thighOf = (i: number) => groupOf(r.hipJ[i], r.kneeJ[i]);
  const shinOf = (i: number) => groupOf(r.kneeJ[i], r.footJ[i]);

  if (skin === 10) {
    // ---------- ZEUS THUNDERLORD ----------
    // pteruges: eight hanging armour strips round the hips, gold-tipped, with a thunderbolt sigil on the trunks
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.sin(a) * 0.74;
      const z = Math.cos(a) * 0.5;
      b.add(P, RB(0.17, 0.48, 0.05, 0.02), c.main, x, 3.08, z, [Math.sin(a) * 0.0 + 0.12 * Math.cos(a), a, -0.12 * Math.sin(a)]);
      b.add(P, RB(0.17, 0.08, 0.055, 0.015), c.accent, x * 1.04, 2.86, z * 1.06, [0.12 * Math.cos(a), a, -0.12 * Math.sin(a)]);
      b.add(P, sph(0.028, 8, 6), c.glow, x * 1.05, 3.2, z * 1.1);
    }
    b.add(P, bolt(0.26, 0.05, 0.003), c.glow, 0, 3.06, 0.52);
    b.add(P, torus(0.74, 0.03, 36).rotateX(Math.PI / 2), c.accent, 0, 3.33, 0, [0, 0, 0], [1, 1, 0.68]);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const T = thighOf(i);
      const S = shinOf(i);
      // thighs: golden greave band + lightning sigil
      b.add(T, arcPlate(0.575 * lt, 0.635 * lt, 2.3, 0.1, 0.012), c.accent, 0, -0.98, 0);
      b.add(T, arcPlate(0.575 * lt, 0.635 * lt, 1.6, 0.06, 0.01), c.accent, 0, -0.18, 0);
      b.add(T, bolt(0.4, 0.05, 0.004), c.accent, 0, -0.62, 0.6 * lt, [0.04, 0, 0]);
      b.add(T, bolt(0.3, 0.07, 0.002), c.glow, 0, -0.62, 0.62 * lt, [0.04, 0, 0]);
      // shins: winged talaria fins sweeping back from the ankle + golden ankle band + sigil
      b.add(S, sideSolid([[0.02, -1.02], [-0.5, -0.56], [-0.66, -0.64], [-0.36, -1.0], [-0.14, -1.34], [0.06, -1.34]], 0.05, 0.012), c.accent, s * 0.36 * lt, 0, 0, [0, 0, -s * 0.12]);
      b.add(S, sideSolid([[-0.02, -1.08], [-0.44, -0.72], [-0.52, -0.78], [-0.22, -1.1]], 0.02, 0.004), c.glow, s * 0.39 * lt, 0, 0, [0, 0, -s * 0.12]);
      b.add(S, arcPlate(0.4 * lt, 0.46 * lt, 2.4, 0.09, 0.01), c.accent, 0, -1.28, 0, [0.1, 0, 0]);
      b.add(S, bolt(0.3, 0.05, 0.003), c.glow, 0, -0.5, 0.44 * lt, [0.06, 0, 0]);
      // arms: golden armband, studded bracer with a lightning core, crackling arc at the shoulder
      const A = r.shoulders[i];
      const E = r.elbows[i];
      b.add(A, torus(0.5 * th, 0.035, 24).rotateX(Math.PI / 2), c.accent, 0, -0.72, 0);
      b.add(A, bolt(0.28, 0.05, 0.003), c.glow, 0, -0.45, 0.53 * th);
      b.add(A, RB(0.02, 0.26, 0.02, 0.005), c.glow, s * 0.5 * th, -0.18, 0.1, [0.4, 0, s * 0.5]);
      b.add(E, arcPlate(0.5 * fa, 0.57 * fa, 2.4, 0.5, 0.015), c.accent, 0, -0.62, 0);
      for (let st = 0; st < 3; st++) b.add(E, sph(0.04, 10, 8), c.glow, 0, -0.42 - st * 0.2, 0.58 * fa);
      b.add(E, bolt(0.34, 0.05, 0.003), c.glow, s * 0.3 * fa, -0.62, 0.5 * fa, [0, s * 0.6, 0]);
      // hands: a flared golden vambrace cuff with four lightning prongs round the wrist and an arc coil
      const Wr = r.wrists[i];
      const k = o.fs;
      b.add(Wr, tcyl(0.5 * k, 0.6 * k, 0.22 * k, 24), c.accent, 0, 0.12 * k, 0);
      b.add(Wr, torus(0.6 * k, 0.025 * k, 28).rotateX(Math.PI / 2), c.glow, 0, 0.23 * k, 0);
      for (let pr = 0; pr < 4; pr++) {
        const a = (pr / 4) * Math.PI * 2 + Math.PI / 4;
        b.add(Wr, bolt(0.3 * k, 0.04 * k, 0.003), c.accent, Math.cos(a) * 0.58 * k, 0.26 * k, Math.sin(a) * 0.58 * k, [0.35, -a + Math.PI / 2, 0]);
      }
      // legs: golden knee boss with a lightning core, and sandal straps + heel wings on the boots
      const K = r.kneeJ[i];
      b.add(K, tcyl(0.3 * lt, 0.3 * lt, 0.06, 20).rotateZ(Math.PI / 2), c.accent, s * 0.3, 0, 0);
      b.add(K, bolt(0.26, 0.04, 0.003), c.glow, s * 0.34, 0.02, 0, [0, s * Math.PI / 2, 0]);
      const F = r.footJ[i];
      const bw = 0.74 + lt * 0.06;
      b.add(F, RB(bw * 1.02, 0.05, 0.08, 0.012), c.accent, 0, 0.1, 0.1, [0.2, 0, 0]);
      b.add(F, RB(bw * 1.02, 0.05, 0.08, 0.012), c.accent, 0, 0.02, 0.4, [-0.1, 0, 0]);
      b.add(F, bolt(0.2, 0.03, 0.002), c.glow, 0, 0.1, 0.22, [1.2, 0, 0]);
      b.add(F, sideSolid([[-0.5, 0.05], [-0.98, 0.5], [-1.08, 0.42], [-0.62, -0.02]], 0.04, 0.01), c.accent, s * bw * 0.5, 0, 0, [0, 0, -s * 0.1]);
      b.add(F, sideSolid([[-0.55, 0.08], [-0.9, 0.42], [-0.96, 0.36], [-0.64, 0.03]], 0.015, 0.003), c.glow, s * bw * 0.52, 0, 0, [0, 0, -s * 0.1]);
    }
    // STORM HALO: a great golden disc behind the shoulders with eight spokes and a lightning core
    b.add(C, torus(0.96, 0.05, 56), c.accent, 0, 1.45, -1.14);
    b.add(C, torus(0.86, 0.02, 56), c.glow, 0, 1.45, -1.12);
    b.add(C, torus(0.42, 0.03, 32), c.accent, 0, 1.45, -1.14);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = 0.66;
      if (k % 2 === 0) b.add(C, RB(0.05, 0.5, 0.035, 0.01), c.accent, Math.sin(a) * rr, 1.45 + Math.cos(a) * rr, -1.14, [0, 0, -a]);
      else b.add(C, bolt(0.5, 0.03, 0.003), c.glow, Math.sin(a) * rr, 1.45 + Math.cos(a) * rr, -1.12, [0, 0, -a]);
    }
    b.add(C, sph(0.16, 16, 12), c.glow, 0, 1.45, -1.1);
  } else {
    // ---------- RED METAL JUGGERNAUT ----------
    // hips: chrome front bumper with fog lights, rear dual exhaust tips, chrome belt trim
    b.add(P, RB(1.5, 0.12, 0.22, 0.05), c.accent, 0, 2.96, 0.46);
    for (const s of [-1, 1]) {
      b.add(P, tcyl(0.075, 0.075, 0.06, 14).rotateX(Math.PI / 2), c.glow, s * 0.5, 2.96, 0.58);
      b.add(P, tcyl(0.09, 0.1, 0.32, 14).rotateX(Math.PI / 2), c.accent, s * 0.34, 2.9, -0.56);
      b.add(P, tcyl(0.06, 0.06, 0.04, 14).rotateX(Math.PI / 2), c.glow, s * 0.34, 2.9, -0.73);
    }
    b.add(P, RB(1.4, 0.03, 0.88, 0.01), c.accent, 0, 3.42, 0);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const T = thighOf(i);
      const S = shinOf(i);
      const K = r.kneeJ[i];
      // thighs: hood scoop + chrome vent slats on the front, a red fin blade behind
      b.add(T, RB(0.5 * lt, 0.14, 0.2, 0.04), c.accent, 0, -0.5, 0.5 * lt, [-0.2, 0, 0]);
      b.add(T, RB(0.36 * lt, 0.06, 0.08, 0.015), c.dark, 0, -0.47, 0.6 * lt, [-0.2, 0, 0]);
      for (let v = 0; v < 3; v++) b.add(T, RB(0.44 * lt, 0.03, 0.05, 0.008), c.accent, 0, -0.86 - v * 0.1, 0.56 * lt);
      b.add(T, sideSolid([[-0.44, -0.3], [-0.76, -0.1], [-0.74, -0.24], [-0.46, -1.0]], 0.05, 0.012), c.main, 0, 0, 0);
      // knees: chrome wheel-rim caps with five spokes
      b.add(K, tcyl(0.31 * lt, 0.31 * lt, 0.07, 12).rotateZ(Math.PI / 2), c.accent, s * 0.3, 0, 0);
      for (let sp = 0; sp < 5; sp++) b.add(K, RB(0.05, 0.52 * lt, 0.05, 0.01), c.accent, s * 0.33, 0, 0, [(sp / 5) * Math.PI, 0, 0]);
      b.add(K, tcyl(0.09 * lt, 0.09 * lt, 0.05, 10).rotateZ(Math.PI / 2), c.glow, s * 0.36, 0, 0);
      // shins: twin side-exit exhaust stacks with hot tips behind a heat shield
      b.add(S, RB(0.06, 0.6, 0.34, 0.02), c.dark, s * 0.44 * lt, -0.6, -0.04, [0.05, 0, 0]);
      for (let pp = 0; pp < 2; pp++) {
        b.add(S, tcyl(0.05, 0.056, 0.92, 12), c.accent, s * 0.5 * lt, -0.56, -0.12 + pp * 0.16, [0.05, 0, 0]);
        b.add(S, torus(0.05, 0.012, 12).rotateX(Math.PI / 2), c.glow, s * 0.5 * lt, -0.1, -0.1 + pp * 0.16);
      }
      // arms: chrome rings and a red fin on the upper arm, three chrome fin blades + red slit on the forearm
      const A = r.shoulders[i];
      const E = r.elbows[i];
      b.add(A, torus(0.5 * th, 0.03, 24).rotateX(Math.PI / 2), c.accent, 0, -0.3, 0);
      b.add(A, torus(0.48 * th, 0.03, 24).rotateX(Math.PI / 2), c.accent, 0, -0.92, 0);
      b.add(A, sideSolid([[-0.22, -0.3], [-0.58, -0.44], [-0.54, -0.56], [-0.22, -0.82]], 0.04, 0.01), c.main, s * 0.3 * th, 0, 0);
      for (let k = 0; k < 3; k++) b.add(E, sideSolid([[-0.16, 0], [-0.46, -0.1], [-0.43, -0.19], [-0.16, -0.26]], 0.035, 0.008), c.accent, s * 0.44 * fa, -0.32 - k * 0.26, 0);
      b.add(E, RB(0.03, 0.5, 0.03, 0.008), c.glow, 0, -0.56, 0.5 * fa);
      // hands: a chrome turbo flange round the wrist with six red lug bolts and a red glow ring
      const Wr = r.wrists[i];
      const k = o.fs;
      b.add(Wr, tcyl(0.56 * k, 0.5 * k, 0.16 * k, 24), c.accent, 0, 0.12 * k, 0);
      b.add(Wr, torus(0.56 * k, 0.02 * k, 28).rotateX(Math.PI / 2), c.glow, 0, 0.2 * k, 0);
      for (let lg = 0; lg < 6; lg++) {
        const a = (lg / 6) * Math.PI * 2;
        b.add(Wr, tcyl(0.04 * k, 0.04 * k, 0.05 * k, 6), c.glow, Math.cos(a) * 0.54 * k, 0.12 * k, Math.sin(a) * 0.54 * k, [Math.PI / 2, 0, -a]);
      }
      // feet: chrome toe bumper, red under-glow strips along the sole and a hot exhaust tip out of the heel
      const F = r.footJ[i];
      const bw = 0.74 + lt * 0.06;
      b.add(F, RB(bw * 0.9, 0.08, 0.1, 0.025), c.accent, 0, -0.1, 0.84, [-0.2, 0, 0]);
      b.add(F, RB(bw * 0.9, 0.05, 0.06, 0.015), c.accent, 0, 0.1, 0.56, [0.3, 0, 0]);
      for (const gs of [-1, 1]) b.add(F, RB(0.025, 0.02, 1.0, 0.006), c.glow, gs * bw * 0.52, -0.17, 0.1);
      b.add(F, tcyl(0.07, 0.08, 0.2, 14).rotateX(Math.PI / 2), c.accent, 0, 0.0, -0.64);
      b.add(F, tcyl(0.045, 0.045, 0.03, 14).rotateX(Math.PI / 2), c.glow, 0, 0.0, -0.75);
      b.add(F, sideSolid([[-0.5, 0.2], [-0.76, 0.46], [-0.72, 0.52], [-0.4, 0.3]], 0.04, 0.01), c.main, 0, 0, 0);
    }
    // REAR SPOILER WING: red uprights, chrome wing, end plates and a red LED strip along the trailing edge
    for (const s of [-1, 1]) {
      b.add(C, RB(0.08, 0.5, 0.26, 0.02), c.main, s * 0.7, 1.55, -1.0, [0.25, 0, 0]);
      b.add(C, RB(0.04, 0.3, 0.46, 0.01), c.main, s * 1.16, 1.82, -1.12, [0.35, 0, 0]);
    }
    b.add(C, RB(2.3, 0.07, 0.42, 0.025), c.accent, 0, 1.82, -1.12, [0.35, 0, 0]);
    b.add(C, RB(2.1, 0.025, 0.03, 0.006), c.glow, 0, 1.76, -1.3, [0.35, 0, 0]);
  }
  b.flush();
}

// ---------------------------------------------------------------- pelvis
// v6 — HIGH-CUT ATHLETIC BOXER PELVIS (Matching Front & Rear V-Trunks Armor).
// Symmetrical high-cut V-plate on both front and back so the rear pelvis has the exact same clean, athletic
// robotic V-silhouette as the front pelvis (without the front blue accent badge, and with zero butt-cheek domes).
function buildPelvis(r: Robot, b: Batch, c: Ctx) {
  const P = r.pelvis;
  // ---- HIGH-CUT ANATOMICAL CORE (sits high at y = 2.78..3.38 so upper thighs are fully exposed) ----
  b.add(
    P,
    sideSolid([[-0.36, 0.34], [0.36, 0.34], [0.42, 0.0], [0.24, -0.26], [-0.24, -0.26], [-0.42, 0.0]], 0.96, 0.06),
    c.sec,
    0,
    3.04,
    0,
  );
  // High-cut front boxer V-trunks plate + front blue accent shield
  const vPlate = [
    [-0.48, 0.28],
    [0.48, 0.28],
    [0.36, 0.02],
    [0.16, -0.26],
    [-0.16, -0.26],
    [-0.36, 0.02],
  ] as Pts;
  b.add(P, plate(vPlate, 0.14, 0.04), c.main, 0, 3.04, 0.38);
  b.add(P, plate([[-0.22, 0.12], [0.22, 0.12], [0.14, -0.1], [-0.14, -0.1]], 0.06, 0.024), c.accent, 0, 3.08, 0.45);

  // High-cut rear boxer V-trunks plate — EXACT same shape as the front V-plate, without the blue box
  b.add(P, plate(vPlate, 0.14, 0.04), c.main, 0, 3.04, -0.38);

  // Championship belt + subtle front glow hairline
  b.add(P, RB(1.36, 0.11, 0.84, 0.05), c.steel, 0, 3.36, 0);
  b.add(P, RB(0.96, 0.026, 0.05, 0.01), c.glow, 0, 3.41, 0.41);

  // Sprinter's V-line steel ribs on both front and rear V-plates
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    b.add(P, RB(0.06, 0.42, 0.05, 0.018), c.steel, s * 0.32, 3.08, 0.41, [0, 0, s * 0.44]);
    b.add(P, RB(0.06, 0.42, 0.05, 0.018), c.steel, s * 0.32, 3.08, -0.41, [0, 0, s * 0.44]);
  }

  // ---- HIGH-CUT CROTCH ARCH: compact, high inseam at y = 2.78 so the legs look long and unobstructed ----
  b.add(P, sideSolid([[-0.34, 0.16], [0.34, 0.16], [0.22, -0.14], [-0.22, -0.14]], 0.36, 0.04), c.main, 0, 2.78, 0);
  b.add(P, RB(0.06, 0.24, 0.28, 0.018), c.joint, 0, 2.76, 0);

  // ---- TUCKED HIP AXLES: flush internal bearings that never stick out past the thighs ----
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    b.add(P, tcyl(0.24, 0.24, 0.28, 20).rotateZ(Math.PI / 2), c.joint, s * 0.58, 2.85, 0);
    b.add(P, tcyl(0.32, 0.32, 0.2, 22).rotateZ(Math.PI / 2), c.joint, s * 0.7, 2.85, 0);
  }
}
// ---------------------------------------------------------------- legs
// LONG, ATHLETIC BOXER/SPRINTER LEGS: high-swept quad & glute-hamstring tie-in, tapered knee, high calf peak,
// and long lean Achilles taper down to the ankle.
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
    // compact internal hip drum tucked cleanly inside the upper thigh sweep
    b.add(hip, tcyl(0.31 * lt, 0.31 * lt, 0.38, 22).rotateZ(Math.PI / 2), c.steel);
    b.add(hip, tcyl(0.26 * lt, 0.26 * lt, 0.44, 20).rotateZ(Math.PI / 2), c.joint);

    // =========================== 2. THIGH ===========================
    const thigh = new THREE.Group();
    thigh.scale.set(1, sy1, 1);
    hip.add(thigh);

    // athlete's quad & hamstring core: full high sweep at the hip, lean athletic taper into the knee
    b.add(
      thigh,
      lathe(
        [
          [0, -1.5],
          [0.25, -1.5],
          [0.28, -1.34],
          [0.33, -1.04],
          [0.41, -0.66],
          [0.47, -0.32],
          [0.45, -0.08],
          [0.36, 0.04],
          [0, 0.06],
        ],
        lt,
      ),
      c.sec,
    );
    // High-swept front & outer quad armor shell (reaches high up into the hip-flexor line)
    b.add(thigh, arcPlate(0.44 * lt, 0.57 * lt, 2.45, 1.08), c.main, 0, -0.56, 0);
    // Top accent trim along the high quad sweep
    b.add(thigh, arcPlate(0.575 * lt, 0.6 * lt, 1.9, 0.032), c.accent, 0, -0.34, 0);
    // Full sculpted hamstring shell behind (reaches up to y = -0.06 so it tucks seamlessly under the glute cheek)
    b.add(thigh, arcPlate(0.42 * lt, 0.55 * lt, 2.25, 1.04), c.main, 0, -0.58, 0, [0, Math.PI, 0]);
    b.add(thigh, RB(0.46 * lt, 0.045, 0.055, 0.018), c.steel, 0, -0.44, -0.49 * lt);
    // Knee shroud that steps the thigh down to the joint
    b.add(thigh, arcPlate(0.34 * lt, 0.46 * lt, 2.0, 0.26), c.main, 0, -1.32, 0);

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

    // Sprinter's calf: high gastrocnemius muscle peak (-0.28..-0.56), lean Achilles taper (-0.82..-1.12), flare into boot cuff
    b.add(
      shin,
      lathe(
        [
          [0, -1.42],
          [0.29, -1.42],
          [0.32, -1.32],
          [0.33, -1.08],
          [0.26, -0.82],
          [0.31, -0.56],
          [0.38, -0.34],
          [0.35, -0.14],
          [0.33, -0.03],
          [0, 0],
        ],
        lt,
      ),
      c.sec,
    );
    // Sleek elongated greave shell over the front of the shin
    b.add(shin, arcPlate(0.29 * lt, 0.4 * lt, 2.4, 0.8), c.main, 0, -0.42, 0, [0.04, 0, 0]);
    // Ankle cuff shell that flares cleanly over the boot
    b.add(shin, arcPlate(0.31 * lt, 0.44 * lt, 2.25, 0.42), c.main, 0, -1.17, 0.02, [0.11, 0, 0]);
    // High athletic calf armor shell behind (sits high on the upper shin like a sprinter's gastrocnemius)
    b.add(shin, arcPlate(0.29 * lt, 0.4 * lt, 2.05, 0.64), c.main, 0, -0.46, -0.02, [0.08, Math.PI, 0]);
    // Accent ring + glow hairline down the greave
    b.add(shin, arcPlate(0.41 * lt, 0.44 * lt, 2.05, 0.048), c.accent, 0, -0.84, 0, [0.04, 0, 0]);
    b.add(shin, RB(0.03, 0.5, 0.03, 0.01), c.glow, 0, -0.6, 0.41 * lt);
    // Twin Achilles hydraulic struts tapering down the lower calf
    for (let j = 0; j < 2; j++) {
      const cs = j === 0 ? 1 : -1;
      b.add(shin, RB(0.065 * lt, 0.96, 0.11, 0.02), c.steel, cs * 0.13 * lt, -0.78, -0.28 * (lt / 0.82), [0.07, 0, 0]);
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
  buildChestMesh(C, b, c, o);
}

function buildChestMesh(C: THREE.Group, b: Batch, c: Ctx, o: Opt) {
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

  // ================= FRONT: two sculpted breastplate halves, clean central sternum channel =================
  const tilt: V3 = [-0.08, 0, 0]; // upper edge of each pectoral leans back slightly
  const pecScale: V3 = [1.26, 1, 1];
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const px = s * 0.54 * W;
    // sculpted pectoral shell — leaves a clean sternum channel in the middle so nothing ever z-fights
    put(arcPlate(0.49, 0.59, 2.15, 0.88), c.main, px, 1.17, 0, tilt, pecScale);
    // lower pectoral accent trim
    put(arcPlate(0.595, 0.64, 2.12, 0.055), c.accent, px, 0.79, 0, tilt, pecScale);
    // upper chest / clavicle bevel plate
    put(plate([[0.12 * W, 1.56], [0.84 * W, 1.52], [0.76 * W, 1.34], [0.16 * W, 1.38]].map(([x, y]) => [x * s, y]), 0.08, 0.022), c.steel, 0, 0, 0.51, [-0.12, s * -0.08, 0]);
    // trapezius: sloping yoke into the neck
    put(RB(0.96 * W, 0.38, 0.88, 0.16), c.main, s * 0.72 * W, 1.64, -0.07, [0, 0, s * -0.3]);
  }

  // ================= STERNUM KEEL & ARC-PLASMA CHEST REACTOR (strictly stepped Z, zero z-fighting) =================
  put(plate([[-0.16, 1.56], [0.16, 1.56], [0.22, 1.04], [0, 0.66], [-0.22, 1.04]], 0.1, 0.024), c.dark, 0, 0, 0.53);
  // Reactor outer octagonal steel bezel (front face at z = 0.63)
  put(tcyl(0.25, 0.275, 0.08, 8).rotateX(Math.PI / 2), c.steel, 0, 1.06, 0.59);
  // Reactor recessed dark chamber (front face at z = 0.648)
  put(tcyl(0.2, 0.2, 0.036, 16).rotateX(Math.PI / 2), c.dark, 0, 1.06, 0.63);
  // Glowing outer plasma ring & energy disc (front face at z = 0.668)
  put(tcyl(0.165, 0.165, 0.032, 28).rotateX(Math.PI / 2), c.glow, 0, 1.06, 0.652);
  put(torus(0.185, 0.02, 24), c.accent, 0, 1.06, 0.655);
  // White-hot inner reactor core lens (front face at z = 0.69)
  put(tcyl(0.085, 0.095, 0.04, 20).rotateX(Math.PI / 2), c.core, 0, 1.06, 0.67);

  // ================= SCULPTED ATHLETIC ABDOMEN & RIBCAGE (flush tapered armor, no protruding blocks) =================
  // Main abdominal shield tapering into the waist
  put(
    plate(X([[-0.68, 0.68], [0.68, 0.68], [0.56, 0.12], [0.34, -0.08], [-0.34, -0.08], [-0.56, 0.12]]), 0.1, 0.028),
    c.dark,
    0,
    0,
    0.45,
  );
  // Sculpted segmented abdominal armor plates (upper & lower abs pair) sitting cleanly at z = 0.50
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    // Upper abdominal plate
    put(
      plate([[0.05 * W, 0.64], [0.48 * W, 0.62], [0.42 * W, 0.38], [0.05 * W, 0.36]].map(([x, y]) => [x * s, y]), 0.08, 0.022),
      c.main,
      0,
      0,
      0.5,
      [0.04, s * -0.1, 0],
    );
    // Lower abdominal plate
    put(
      plate([[0.05 * W, 0.32], [0.4 * W, 0.32], [0.32 * W, 0.08], [0.05 * W, 0.06]].map(([x, y]) => [x * s, y]), 0.08, 0.02),
      c.main,
      0,
      0,
      0.48,
      [0.05, s * -0.1, 0],
    );
    // Lateral oblique / rib flank armor (wraps the side of the torso, never sticks out in front)
    put(
      plate([[0.46 * W, 0.68], [0.78 * W, 0.64], [0.66 * W, 0.16], [0.38 * W, 0.12]].map(([x, y]) => [x * s, y]), 0.09, 0.024),
      c.steel,
      0,
      0,
      0.38,
      [0, s * -0.32, 0],
    );
  }
  // Central abdominal power conduit & belt latch
  put(RB(0.036, 0.48, 0.04, 0.012), c.glow, 0, 0.35, 0.515);
  put(RB(0.52 * W, 0.06, 0.06, 0.02), c.accent, 0, 0.04, 0.5);
  // Collar-bone yoke steps back behind the sternum keel
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

  const armorSkin = c.style.armorSkin ?? 0;
  if (atom && armorSkin > 0) {
    addCustomChestArmor(C, b, c, o, armorSkin);
  }
}

/**
 * 9 Custom 3D Body Armor Skins (1..9) on the Chest & Back:
 * 1: ZEUS MONOLITH MK-X — Obsidian Monolith Breastplates, Emerald Core Shield & Quad Dorsal Hydraulic Pistons
 * 2: NOISY BOY DAIMYO — Layered Samurai Do-Maru Plates, Golden Crest & Neon LED Kanji Chest Strips
 * 3: MIDAS 24K IMPERIAL — Sculpted 24K Gold Gladiator Lorica Ribs, Ruby Core Bezel & Golden Back Crest
 * 4: TWIN CITIES TURBO — Dual Twin-Reactor Chest Cores & Quad Rear Jet-Exhaust Stacks
 * 5: METRO SIEGE EXOSUIT — Heavy Tubular Roll-Cage Chest Exoskeleton, Rib Bars & Dual Smokestacks
 * 6: AMBUSH SCRAP-TITAN — Cross-Strapped Hydraulic Chest Harness, Reinforced Belly Shield & Overdrive Boiler
 * 7: VIPER STEALTH AERO — Angular Stealth Chevron Breastplates, Dorsal Aero-Fins & Cyan Spine Capacitor
 * 8: CENTURION AEGIS — Winged Paladin Sternum Shield, Ribbed Knight Cuirass & Dual Solar Thrusters
 * 9: OVERLORD HELLFORGE — Jagged Demon-Rib Exoskeleton, Horned Collar Spikes & Quad Magma Back Vents
 */
function addCustomChestArmor(C: THREE.Group, b: Batch, c: Ctx, o: Opt, skin: number) {
  const W = o.cw;
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rot?: V3, scl?: V3) => b.add(C, g, m, x, y, z, rot, scl);

  if (skin === 1) {
    // 1. ZEUS MONOLITH MK-X: Beveled Monolith Chest Shields, Emerald Core Armor & Quad Rear Hydraulic Pistons
    for (const s of [-1, 1]) {
      put(RB(0.58 * W, 0.46, 0.1, 0.03), c.main, s * 0.52 * W, 1.22, 0.56, [-0.08, s * -0.14, 0]);
      put(RB(0.48 * W, 0.045, 0.06, 0.015), c.glow, s * 0.52 * W, 1.02, 0.61, [-0.08, s * -0.14, 0]);
      put(tcyl(0.065, 0.065, 0.56, 14), c.steel, s * 0.52 * W, 0.52, 0.49, [0, 0, s * -0.18]);
      // Rear dorsal nitro pistons
      put(tcyl(0.09, 0.1, 0.72, 16), c.steel, s * 0.42, 1.24, -0.96, [-0.15, 0, s * -0.1]);
      put(torus(0.1, 0.02, 16).rotateX(Math.PI / 2 - 0.15), c.glow, s * 0.45, 1.54, -1.0);
    }
    put(torus(0.24, 0.032, 8), c.accent, 0, 1.06, 0.67);
  } else if (skin === 2) {
    // 2. NOISY BOY DAIMYO: 3-Tier Samurai Do-Maru Abdominal Plates, Golden Collar Crest & Neon LED Chest Strips
    for (let t = 0; t < 3; t++) {
      put(RB((1.16 - t * 0.12) * W, 0.12, 0.12, 0.03), c.accent, 0, 0.62 - t * 0.18, 0.51);
      put(RB((1.04 - t * 0.12) * W, 0.032, 0.06, 0.01), c.glow, 0, 0.62 - t * 0.18, 0.56);
    }
    for (const s of [-1, 1]) {
      put(RB(0.06, 0.48, 0.06, 0.015), c.glow, s * 0.44 * W, 1.22, 0.59, [-0.08, 0, s * 0.22]);
      put(RB(0.06, 0.42, 0.06, 0.015), c.glow, s * 0.64 * W, 1.2, 0.56, [-0.08, 0, s * 0.22]);
      // Samurai back banner fins
      put(sideSolid([[-0.12, 0.9], [-0.38, 1.68], [-0.22, 1.74], [0.02, 1.1]], 0.07, 0.02), c.accent, s * 0.42, 0, -0.88, [0, -s * 0.18, 0]);
    }
  } else if (skin === 3) {
    // 3. MIDAS 24K IMPERIAL: Sculpted Golden Gladiator Pectoral Reliefs, Studded Belt & Sunburst Back Crest
    put(torus(0.26, 0.036, 12), c.main, 0, 1.06, 0.67);
    for (let st = 0; st < 6; st++) {
      const a = (st / 6) * Math.PI * 2;
      put(new THREE.ConeGeometry(0.045, 0.12, 4).rotateX(Math.PI / 2), c.accent, Math.cos(a) * 0.28, 1.06 + Math.sin(a) * 0.28, 0.66);
    }
    for (const s of [-1, 1]) {
      for (let r = 0; r < 3; r++) {
        put(RB(0.46 * W, 0.08, 0.09, 0.025), c.accent, s * 0.42 * W, 0.62 - r * 0.17, 0.52, [0, s * -0.14, s * 0.1]);
      }
      put(sideSolid([[-0.1, 1.1], [-0.36, 1.72], [-0.18, 1.78], [0.04, 1.25]], 0.08, 0.02), c.main, s * 0.36, 0, -0.88);
    }
  } else if (skin === 4) {
    // 4. TWIN CITIES TURBO: Dual Left+Right Chest Reactors & Quad Rear Jet-Exhaust Stacks
    for (const s of [-1, 1]) {
      put(tcyl(0.18, 0.2, 0.09, 18).rotateX(Math.PI / 2), c.steel, s * 0.48 * W, 1.18, 0.57, [-0.08, s * -0.12, 0]);
      put(tcyl(0.13, 0.13, 0.11, 18).rotateX(Math.PI / 2), c.glow, s * 0.48 * W, 1.18, 0.58, [-0.08, s * -0.12, 0]);
      put(torus(0.15, 0.022, 18), c.accent, s * 0.48 * W, 1.18, 0.62, [-0.08, s * -0.12, 0]);
      // Twin upper + lower rear turbo stacks per side
      put(tcyl(0.11, 0.13, 0.68, 16), c.steel, s * 0.48, 1.56, -0.94, [-0.18, 0, s * -0.16]);
      put(torus(0.11, 0.02, 16).rotateX(Math.PI / 2 - 0.18), c.glow, s * 0.54, 1.88, -1.0);
    }
  } else if (skin === 5) {
    // 5. METRO SIEGE EXOSUIT: Heavy Tubular Steel Roll-Cage over Chest & Dual Industrial Smokestacks
    for (let rb = 0; rb < 3; rb++) {
      put(RB((1.36 - rb * 0.14) * W, 0.065, 0.08, 0.02), c.steel, 0, 1.42 - rb * 0.38, 0.64);
    }
    for (const s of [-1, 1]) {
      put(tcyl(0.045, 0.045, 1.18, 12), c.steel, s * 0.62 * W, 0.96, 0.6, [0, 0, s * -0.12]);
      put(tcyl(0.045, 0.045, 1.05, 12), c.accent, s * 0.26 * W, 1.02, 0.64);
      // Heavy rear diesel smokestack
      put(tcyl(0.13, 0.15, 0.85, 16), c.dark, s * 0.52, 1.58, -0.92, [-0.12, 0, s * -0.12]);
      put(torus(0.135, 0.024, 16).rotateX(Math.PI / 2 - 0.12), c.glow, s * 0.57, 1.96, -0.97);
    }
  } else if (skin === 6) {
    // 6. AMBUSH SCRAP-TITAN: Cross-Belt Hydraulic Chest Straps, Studded Rib Guards & Overdrive Boiler Pack
    for (const s of [-1, 1]) {
      put(RB(0.14, 1.22, 0.08, 0.025), c.accent, 0, 0.98, 0.62, [0, 0, s * 0.52]);
      put(tcyl(0.06, 0.06, 0.64, 12), c.steel, s * 0.56 * W, 0.62, 0.48, [0, 0, s * -0.2]);
    }
    put(tcyl(0.28, 0.28, 0.78, 18).rotateZ(Math.PI / 2), c.steel, 0, 1.18, -1.04);
    put(torus(0.29, 0.028, 18).rotateY(Math.PI / 2), c.glow, -0.22, 1.18, -1.04);
    put(torus(0.29, 0.028, 18).rotateY(Math.PI / 2), c.glow, 0.22, 1.18, -1.04);
  } else if (skin === 7) {
    // 7. VIPER STEALTH AERO: Razor Chevron Chest Fins & Glowing Cyan Dorsal Aero-Wings
    for (const s of [-1, 1]) {
      put(RB(0.56 * W, 0.06, 0.1, 0.018), c.glow, s * 0.44 * W, 1.28, 0.6, [0, s * -0.14, s * 0.34]);
      put(RB(0.48 * W, 0.05, 0.09, 0.015), c.glow, s * 0.4 * W, 0.92, 0.6, [0, s * -0.14, s * 0.34]);
      // Swept dorsal aero-wing fins on the back
      put(sideSolid([[-0.08, 0.75], [-0.58, 1.72], [-0.42, 1.82], [0.06, 1.25]], 0.06, 0.018), c.main, s * 0.44, 0, -0.82, [0, -s * 0.28, -s * 0.18]);
      put(RB(0.03, 0.82, 0.06, 0.01), c.glow, s * 0.52, 1.32, -1.08, [-0.36, 0, -s * 0.18]);
    }
  } else if (skin === 8) {
    // 8. CENTURION AEGIS: Winged Paladin Sternum Shield & Twin Solar Halo Back Thrusters
    put(plate([[-0.22, 1.38], [0.22, 1.38], [0.28, 0.98], [0, 0.72], [-0.28, 0.98]], 0.08, 0.024), c.accent, 0, 0, 0.62);
    for (const s of [-1, 1]) {
      put(RB(0.48 * W, 0.1, 0.08, 0.022), c.main, s * 0.46 * W, 1.24, 0.6, [0, s * -0.14, s * 0.26]);
      put(RB(0.42 * W, 0.08, 0.08, 0.02), c.glow, s * 0.42 * W, 1.08, 0.61, [0, s * -0.14, s * 0.26]);
      put(torus(0.22, 0.03, 24), c.glow, s * 0.42, 1.26, -1.06, [0, s * 0.22, 0]);
    }
  } else if (skin === 9) {
    // 9. OVERLORD HELLFORGE: Jagged Demon-Rib Exoskeleton, Collar War-Horns & Molten Back Spikes
    for (const s of [-1, 1]) {
      for (let rb = 0; rb < 3; rb++) {
        put(new THREE.ConeGeometry(0.065, 0.42, 6).rotateZ(s * 1.28), c.accent, s * 0.36 * W, 1.28 - rb * 0.26, 0.59, [0.2, s * -0.2, 0]);
      }
      // Collar war-horns & dorsal magma spikes
      put(new THREE.ConeGeometry(0.075, 0.42, 8), c.accent, s * 0.52, 1.92, -0.22, [-0.25, 0, -s * 0.35]);
      put(new THREE.ConeGeometry(0.08, 0.48, 8).rotateX(-0.9), c.glow, s * 0.36, 1.38, -1.08);
    }
  } else if (skin === 10) {
    // 10. ZEUS THUNDERLORD AEGIS: a great golden thunderbolt down the sternum with a lightning core, Olympian
    // meander collar, storm pectoral plates cracked by lightning, and twin Tesla coils rising off the back
    put(bolt(0.92, 0.07, 0.01), c.accent, 0, 1.0, 0.6, [-0.05, 0, 0]);
    put(bolt(0.68, 0.1, 0.004), c.glow, 0, 1.0, 0.63, [-0.05, 0, 0]);
    put(RB(1.12 * W, 0.045, 0.06, 0.012), c.accent, 0, 1.5, 0.6);
    for (let k = -3; k <= 3; k++) put(RB(0.06, 0.06, 0.05, 0.01), c.accent, k * 0.16 * W, 1.44 - (k % 2 === 0 ? 0 : 0.03), 0.6);
    for (const s of [-1, 1]) {
      put(RB(0.5 * W, 0.42, 0.1, 0.04), c.main, s * 0.52 * W, 1.2, 0.56, [-0.08, s * -0.14, 0]);
      put(bolt(0.3, 0.06, 0.003), c.glow, s * 0.5 * W, 1.2, 0.62, [-0.08, s * -0.14, s * 0.35]);
      // Tesla coil towers on the back: a steel core with stacked electric rings and a crackling cap
      put(tcyl(0.08, 0.11, 0.84, 14), c.steel, s * 0.42, 1.3, -0.95, [-0.12, 0, s * -0.1]);
      for (let i = 0; i < 4; i++) put(torus(0.11, 0.016, 16).rotateX(Math.PI / 2), c.glow, s * (0.42 + i * 0.012), 1.0 + i * 0.2, -0.95 - i * 0.025);
      put(sph(0.11, 14, 10), c.glow, s * 0.47, 1.76, -1.0);
      put(RB(0.02, 0.3, 0.02, 0.005), c.glow, s * 0.52, 1.74, -0.88, [0.5, 0, s * 0.7]);
    }
  } else {
    // 11. RED METAL JUGGERNAUT: candy-red chrome pectorals with chrome rivet lines, a chrome hood-scoop intake
    // on the sternum, six-pack chrome rib slats and a V8 header — four chrome exhaust pipes per side — on the back
    put(RB(0.5 * W, 0.2, 0.24, 0.05), c.accent, 0, 1.3, 0.6, [-0.22, 0, 0]);
    put(RB(0.38 * W, 0.09, 0.1, 0.02), c.dark, 0, 1.34, 0.71, [-0.22, 0, 0]);
    put(RB(0.034, 0.62, 0.06, 0.01), c.glow, 0, 0.8, 0.58);
    for (let rb = 0; rb < 4; rb++) put(RB(0.5 * W, 0.045, 0.08, 0.014), c.accent, 0, 1.0 - rb * 0.15, 0.56);
    for (const s of [-1, 1]) {
      put(RB(0.52 * W, 0.4, 0.1, 0.04), c.main, s * 0.52 * W, 1.2, 0.56, [-0.08, s * -0.14, 0]);
      for (let rv = 0; rv < 3; rv++) put(sph(0.028, 10, 8), c.accent, s * (0.3 + rv * 0.16) * W, 1.36, 0.6);
      put(RB(0.12, 0.42, 0.14, 0.03), c.accent, s * 0.78 * W, 1.18, 0.5, [0, s * -0.3, 0]);
      // V8 headers: a chrome collector and four pipes sweeping up past the shoulder blades
      put(RB(0.56, 0.1, 0.14, 0.03), c.accent, s * 0.44, 0.9, -0.94);
      for (let i = 0; i < 4; i++) {
        const x = s * (0.24 + i * 0.14);
        put(tcyl(0.05, 0.06, 0.64 + i * 0.06, 12), c.accent, x, 1.22 + i * 0.05, -0.98, [-0.22, 0, s * -0.1]);
        put(torus(0.05, 0.012, 12).rotateX(Math.PI / 2 - 0.22), c.glow, x + s * 0.01, 1.54 + i * 0.08, -1.05);
      }
    }
  }
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
  buildHeadMesh(r, H, b, c, o);
}

function buildHeadMesh(r: Robot, H: THREE.Group, b: Batch, c: Ctx, o: Opt) {
  const skin = c.style.helmetSkin ?? 0;
  if (skin > 0 && o.variant === 'atom') {
    customAtomHelmet(r, H, b, c, skin);
  } else if (o.variant === 'atom') {
    atomHelmet(r, H, b, c);
  } else {
    bruteHelmet(r, H, b, c);
  }
}

function addAtomEyes(r: Robot, H: THREE.Group, b: Batch, c: Ctx, glowHex = c.style.glow, eyeY = -0.02, eyeZ = 0.43, tiltGain = 0.24) {
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: V3, scl?: V3) => b.add(H, g, m, x, y, z, rot, scl);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const x = s * 0.155;
    const y = eyeY;
    const tilt: V3 = [0, 0, s * tiltGain];
    put(tcyl(0.135, 0.135, 0.04, 6).rotateX(Math.PI / 2), c.steel, x, y, eyeZ - 0.03, tilt);
    put(tcyl(0.11, 0.11, 0.03, 6).rotateX(Math.PI / 2), c.dark, x, y, eyeZ - 0.012, tilt);

    const eye = new THREE.Group();
    eye.position.set(x, y, eyeZ);
    eye.rotation.set(0, 0, s * (tiltGain + 0.02));
    H.add(eye);
    r.eyeOptics.push(eye);

    const irisMat = new THREE.MeshBasicMaterial({ color: glowHex });
    const iris = new THREE.Mesh(tcyl(0.086, 0.086, 0.012, 6).rotateX(Math.PI / 2), irisMat);
    eye.add(iris);
    r.eyeIris.push(iris);

    const pupil = new THREE.Group();
    eye.add(pupil);
    r.eyePupils.push(pupil);

    const slit = new THREE.Mesh(RB(0.024, 0.095, 0.016, 0.006), c.core);
    slit.position.z = 0.01;
    pupil.add(slit);

    const cross = new THREE.Mesh(RB(0.05, 0.016, 0.016, 0.005), c.core);
    cross.position.z = 0.01;
    pupil.add(cross);

    const ringMat = new THREE.MeshBasicMaterial({ color: glowHex });
    const ring = new THREE.Mesh(torus(0.044, 0.006, 16), ringMat);
    ring.position.z = 0.008;
    pupil.add(ring);

    const scanMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const scanBar = new THREE.Mesh(RB(0.13, 0.008, 0.008, 0.002), scanMat);
    scanBar.position.z = 0.014;
    eye.add(scanBar);
    r.eyeScanners.push(scanBar);

    const flareMat = new THREE.MeshBasicMaterial({
      color: glowHex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const flare = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.038), flareMat);
    flare.position.z = 0.02;
    eye.add(flare);
    r.eyeFlares.push(flare);

    const pulseMat = new THREE.MeshBasicMaterial({
      color: glowHex,
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

    const beamMat = new THREE.MeshBasicMaterial({
      color: glowHex,
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

    const eyeLight = new THREE.PointLight(glowHex, 1.2, 1.4, 2.0);
    eyeLight.position.set(0, 0, 0.04);
    eye.add(eyeLight);
    r.eyeLights.push(eyeLight);
  }
}

/**
 * 9 Custom Fierce Real Steel Helmet Skins (1..9) for the player's robot:
 * 1: ZEUS SOVEREIGN — Obsidian-Tungsten Juggernaut Monolith & Hydraulic Pistons
 * 2: NOISY BOY SHOGUN — Samurai Kabuto, Swept Golden Kuwagata Horns & Oni Mempo Mask
 * 3: MIDAS GOLDHAWK — 24K Gold Spiked Mohawk Gladiator & Fanged Jaw
 * 4: TWIN CITIES HYDRA — Tri-Optic Cyclops Laser Core & Twin Rear Turbo Stacks
 * 5: AMBUSH CRUSHER — Hydraulic Underbite Iron-Jaw & Forehead Roll-Cage
 * 6: METRO SIEGE CAGE — Heavy Steel Bar Roll-Cage & Riveted Asymmetric Armor
 * 7: BLACKJACK VIPER — Aerodynamic Stealth Valkyrie Wing-Ears & Razor V-Visor
 * 8: CENTURION SPARTAN — Titanium Brush-Crest & Corinthian T-Slit Battle Faceplate
 * 9: OVERLORD OMEGA — Apex Cyber-Demon Curved War Horns & Molten Reactor Crown
 */
function customAtomHelmet(r: Robot, H: THREE.Group, b: Batch, c: Ctx, skin: number) {
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: V3, scl?: V3) => b.add(H, g, m, x, y, z, rot, scl);
  const mkBody = (color: number, metalness = 0.85, roughness = 0.25) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: 0xffffff, emissiveIntensity: 0 });
    r.bodyMats.push(m);
    return m;
  };
  const mkGlow = (color: number, intensity = 2.4) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
    r.glowMats.push(m);
    return m;
  };

  const skinCfg: Record<number, { shell: number; sec: number; acc: number; glow: number; tilt: number }> = {
    1: { shell: 0x161b22, sec: 0x2b3440, acc: 0x94a3b8, glow: 0x5effb0, tilt: 0.32 }, // ZEUS SOVEREIGN
    2: { shell: 0x2b1328, sec: 0x4a153b, acc: 0xffb703, glow: 0xff2a7a, tilt: 0.28 }, // NOISY BOY SHOGUN
    3: { shell: 0x6e1414, sec: 0x241616, acc: 0xffc82c, glow: 0xffd040, tilt: 0.3 },  // MIDAS GOLDHAWK
    4: { shell: 0x2d3440, sec: 0x1a1e26, acc: 0xd93829, glow: 0xff5a36, tilt: 0.25 }, // TWIN CITIES HYDRA
    5: { shell: 0x3b444b, sec: 0x24292e, acc: 0xd97706, glow: 0xff9b3d, tilt: 0.22 }, // AMBUSH CRUSHER
    6: { shell: 0x4a4238, sec: 0x26231f, acc: 0xeab308, glow: 0xffd166, tilt: 0.26 }, // METRO SIEGE CAGE
    7: { shell: 0x111827, sec: 0x1e293b, acc: 0x00f5d4, glow: 0x00f5d4, tilt: 0.34 }, // BLACKJACK VIPER
    8: { shell: 0xcbd5e1, sec: 0x334155, acc: 0x3b82f6, glow: 0x60a5fa, tilt: 0.28 }, // CENTURION SPARTAN
    9: { shell: 0x181218, sec: 0x3b0d1e, acc: 0xf59e0b, glow: 0xff2a4b, tilt: 0.36 }, // OVERLORD OMEGA
    10: { shell: 0x27405e, sec: 0x0f1826, acc: 0xffd36b, glow: 0xb8f0ff, tilt: 0.44 }, // ZEUS THUNDERLORD (wrath squint)
    11: { shell: 0xc1121f, sec: 0x1f2227, acc: 0xe6e8ec, glow: 0xff4040, tilt: 0.48 }, // RED METAL REAPER (slit headlamps)
  };
  const cfg = skinCfg[skin] || skinCfg[1];
  const shiny = skin === 3 || skin === 8 || skin === 10 || skin === 11;
  const mShell = mkBody(cfg.shell, skin === 11 ? 0.97 : shiny ? 0.92 : 0.82, skin === 11 ? 0.1 : shiny ? 0.18 : 0.28);
  const mSec = mkBody(cfg.sec, 0.78, 0.36);
  const mAcc = mkBody(cfg.acc, 0.94, 0.18);
  const mGlow = mkGlow(cfg.glow, 2.5);
  r.eyeBase.setHex(cfg.glow);

  // Core Armored Cranium, Parietal Plates, Temple Comms Pods & Rear Occipital Heatsink Fins
  put(RB(0.74, 0.56, 0.76, 0.18), mShell, 0, 0.28, -0.02);
  put(RB(0.68, 0.28, 0.52, 0.12), mSec, 0, -0.04, -0.12);
  put(sideSolid([[0.32, 0.28], [0.41, 0.1], [0.41, -0.08], [-0.02, -0.08]], 0.54, 0.03), c.dark, 0, 0.0, 0);
  put(RB(0.64, 0.48, 0.12, 0.07), mShell, 0, 0.16, -0.37);
  put(RB(0.36, 0.2, 0.22, 0.06), c.joint, 0, -0.3, -0.12);
  // Rear occipital cooling ribs & glowing neural spine bar
  for (let rf = 0; rf < 3; rf++) {
    put(RB(0.46, 0.03, 0.06, 0.012), c.steel, 0, 0.34 - rf * 0.12, -0.42);
  }
  put(RB(0.036, 0.34, 0.04, 0.012), mGlow, 0, 0.22, -0.44);

  // Recessed lower face wire-mesh & hydraulic cheek-damper pistons (Real Steel signature detail)
  put(RB(0.48, 0.28, 0.08, 0.03), c.dark, 0, -0.24, 0.34);
  for (let mx = -2; mx <= 2; mx++) {
    put(RB(0.014, 0.26, 0.014, 0.004), c.rubber, mx * 0.09, -0.24, 0.38);
  }
  for (let my = -1; my <= 1; my++) {
    put(RB(0.44, 0.014, 0.014, 0.004), c.rubber, 0, -0.24 + my * 0.08, 0.38);
  }

  // Dynamic Ocular System (full pupil tracking, scanlines, lock-on pulse, strike beam)
  addAtomEyes(r, H, b, c, cfg.glow, -0.02, 0.43, cfg.tilt);

  // SIGNATURE OPTICS — the two rare skins get their own eye architecture on top of the tracking optics
  if (skin === 10) {
    // ZEUS: wrath of Olympus — heavy golden brow blades slanted hard down over each eye, a golden orbit ring,
    // an electric underline and a lightning tear-streak burning down each cheek
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(torus(0.17, 0.02, 24), mAcc, s * 0.155, -0.02, 0.425, [0, 0, s * cfg.tilt]);
      put(RB(0.34, 0.075, 0.12, 0.02), mAcc, s * 0.18, 0.12, 0.44, [0.3, 0, s * 0.6]);
      put(RB(0.3, 0.018, 0.03, 0.005), mGlow, s * 0.18, 0.085, 0.485, [0.3, 0, s * 0.6]);
      put(bolt(0.22, 0.03, 0.002), mGlow, s * 0.27, -0.2, 0.445, [0.08, 0, s * 0.18]);
      put(sph(0.028, 10, 8), mGlow, s * 0.31, 0.01, 0.44);
    }
  } else if (skin === 11) {
    // RED METAL: slit headlamp housings — a hooded chrome upper lid and a chrome lower lid squeeze each eye into an
    // angry slit; red DRL light strips run under the eye and streak back to the temple like a race car's lamps
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.36, 0.1, 0.13, 0.02), mAcc, s * 0.17, 0.115, 0.42, [0.32, 0, s * 0.46]);
      put(RB(0.32, 0.06, 0.1, 0.015), mAcc, s * 0.17, -0.135, 0.42, [-0.3, 0, -s * 0.1]);
      put(RB(0.3, 0.014, 0.02, 0.004), mGlow, s * 0.18, -0.1, 0.47, [0, 0, -s * 0.1]);
      put(RB(0.2, 0.014, 0.02, 0.004), mGlow, s * 0.36, 0.0, 0.39, [0, 0, s * 1.05]);
      put(RB(0.05, 0.012, 0.02, 0.003), mGlow, s * 0.12, 0.09, 0.485, [0, 0, s * 0.46]);
    }
  }

  // Fierce Brow Armor Slash + Side Temple Turbines & Cheek Hydraulic Pistons
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    put(RB(0.25, 0.048, 0.075, 0.016), mAcc, s * 0.16, 0.13, 0.435, [0, 0, s * cfg.tilt]);
    put(tcyl(0.11, 0.11, 0.09, 18).rotateZ(Math.PI / 2), c.steel, s * 0.41, 0.08, -0.06);
    put(torus(0.068, 0.016, 16).rotateY(Math.PI / 2), mGlow, s * 0.46, 0.08, -0.06);
    put(tcyl(0.036, 0.036, 0.36, 12), c.steel, s * 0.38, -0.14, 0.14, [0.38, 0, -s * 0.1]);
  }

  if (skin === 1) {
    // 1. ZEUS SOVEREIGN: Wide Hammer-Skull, Triple Monolithic Crown Blades, Twin Hydraulic Side Pistons & Fortress Jaw
    put(sideSolid([[0.32, 0.64], [0.48, 0.44], [0.5, 0.14], [0.3, 0.12]], 0.86, 0.04), mShell);
    put(RB(0.32, 0.24, 0.78, 0.06), mAcc, 0, 0.62, -0.02);
    put(RB(0.12, 0.05, 0.8, 0.015), mGlow, 0, 0.74, -0.02);
    for (const s of [-1, 1]) {
      put(RB(0.08, 0.18, 0.68, 0.025), mAcc, s * 0.24, 0.58, -0.04, [0, 0, -s * 0.18]);
    }
    // Heavy fortress jaw shield with vertical glowing reactor slits & chin bumper
    put(sideSolid([[0.34, -0.14], [0.44, -0.22], [0.42, -0.48], [0.1, -0.5], [0.06, -0.14]], 0.68, 0.04), mShell);
    put(RB(0.46, 0.09, 0.12, 0.03), mAcc, 0, -0.44, 0.42);
    for (let k = -2; k <= 2; k++) put(RB(0.026, 0.18, 0.04, 0.008), mGlow, k * 0.09, -0.32, 0.44);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.14, 0.14, 0.14, 20).rotateZ(Math.PI / 2), c.steel, s * 0.44, 0.04, -0.04);
      put(torus(0.09, 0.02, 18).rotateY(Math.PI / 2), mGlow, s * 0.51, 0.04, -0.04);
      put(tcyl(0.05, 0.05, 0.42, 12), c.steel, s * 0.42, -0.14, 0.14, [0.35, 0, 0]);
    }
  } else if (skin === 2) {
    // 2. NOISY BOY SHOGUN: Samurai Kabuto Helmet, Golden Crescent Kuwagata Horns, Layered Shikoro & Oni Mempo Mask
    put(dome(0.45, 0.52), mShell, 0, 0.34, -0.02, [0, 0, 0], [1.08, 0.85, 1.12]);
    put(RB(0.84, 0.045, 0.24, 0.018), mAcc, 0, 0.2, 0.38, [0.2, 0, 0]); // Kabuto peak
    put(sideSolid([[-0.38, 0.52], [-0.14, 0.82], [0.26, 0.78], [0.32, 0.52]], 0.08, 0.02), mAcc); // Central Shogun crest
    // Twin sweeping golden Kuwagata samurai horns + central jewel crest
    put(RB(0.12, 0.18, 0.08, 0.02), mGlow, 0, 0.42, 0.42);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.07, 0.58, 0.12, 0.02), mAcc, s * 0.24, 0.62, 0.36, [-0.18, 0, -s * 0.38]);
      put(new THREE.ConeGeometry(0.055, 0.28, 6), mAcc, s * 0.38, 0.9, 0.3, [-0.18, 0, -s * 0.48]);
      // 3-tier layered Samurai Shikoro neck-guard plates
      for (let t = 0; t < 3; t++) {
        put(RB(0.08, 0.14, 0.58, 0.02), mShell, s * (0.39 + t * 0.035), 0.02 - t * 0.14, -0.06, [0, 0, -s * 0.22]);
        put(RB(0.025, 0.03, 0.54, 0.008), mGlow, s * (0.43 + t * 0.035), 0.02 - t * 0.14, -0.06, [0, 0, -s * 0.22]);
      }
      // Oni tusks (upper + lower fangs)
      put(new THREE.ConeGeometry(0.045, 0.2, 8), c.steel, s * 0.24, -0.28, 0.45, [0.6, 0, -s * 0.25]);
      put(new THREE.ConeGeometry(0.035, 0.14, 8), mAcc, s * 0.14, -0.34, 0.46, [0.4, 0, -s * 0.15]);
    }
    put(sideSolid([[0.32, -0.14], [0.43, -0.24], [0.38, -0.48], [0.08, -0.46]], 0.58, 0.03), mSec);
  } else if (skin === 3) {
    // 3. MIDAS GOLDHAWK: Tall 7-Spike 24K Gold Mohawk Crest, Studded Brow & Gladiator Fanged Jaw
    put(sideSolid([[0.3, 0.58], [0.44, 0.42], [0.46, 0.16], [0.3, 0.1]], 0.78, 0.03), mShell);
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      const z = 0.34 - u * 0.72;
      const y = 0.64 + Math.sin(u * Math.PI) * 0.18;
      const ang = 0.35 - u * 0.85;
      put(sideSolid([[-0.08, -0.16], [0.08, -0.16], [0.02, 0.26], [-0.04, 0.22]], 0.09, 0.018), mAcc, 0, y, z, [ang, 0, 0]);
      put(RB(0.11, 0.04, 0.09, 0.01), mGlow, 0, y - 0.08, z);
    }
    // Golden gladiator jaw + 4 gold fangs + studded cheek bars
    put(sideSolid([[0.34, -0.14], [0.44, -0.28], [0.38, -0.5], [0.06, -0.46]], 0.62, 0.035), mAcc);
    for (let fg = 0; fg < 4; fg++) {
      put(new THREE.ConeGeometry(0.038, 0.14, 4), mAcc, (fg - 1.5) * 0.13, -0.14, 0.45);
    }
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.12, 0.38, 0.48, 0.04), mShell, s * 0.36, 0.02, -0.02);
      for (let st = 0; st < 3; st++) {
        put(new THREE.ConeGeometry(0.045, 0.11, 4).rotateZ(-s * Math.PI / 2), mAcc, s * 0.44, 0.12 - st * 0.12, 0.14 - st * 0.08);
      }
    }
  } else if (skin === 4) {
    // 4. TWIN CITIES HYDRA: Tri-Optic Cyclops Central Forehead Cannon + Twin Rear Turbo Stacks + Respirator Grille
    put(sideSolid([[0.32, 0.6], [0.46, 0.44], [0.48, 0.16], [0.3, 0.1]], 0.82, 0.035), mShell);
    // Central Cyclops High-Output Forehead Optic
    put(tcyl(0.17, 0.19, 0.12, 20).rotateX(Math.PI / 2), c.steel, 0, 0.34, 0.41);
    put(tcyl(0.12, 0.12, 0.14, 20).rotateX(Math.PI / 2), mGlow, 0, 0.34, 0.42);
    put(torus(0.14, 0.02, 20), mAcc, 0, 0.34, 0.46);
    // Heavy riot-visor jaw, vertical respirator grille & twin rear exhaust stacks
    put(sideSolid([[0.34, -0.12], [0.44, -0.2], [0.42, -0.48], [0.04, -0.48]], 0.68, 0.04), mSec);
    for (let vg = -2; vg <= 2; vg++) {
      put(RB(0.025, 0.22, 0.04, 0.008), c.steel, vg * 0.085, -0.32, 0.44);
    }
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.14, 0.42, 0.52, 0.04), mShell, s * 0.38, 0.04, -0.02);
      put(tcyl(0.09, 0.11, 0.52, 16), c.steel, s * 0.32, 0.58, -0.28, [-0.35, 0, -s * 0.18]);
      put(torus(0.09, 0.018, 16).rotateX(Math.PI / 2 - 0.35), mGlow, s * 0.36, 0.82, -0.37);
    }
  } else if (skin === 5) {
    // 5. AMBUSH CRUSHER: Massive Hydraulic Underbite Crusher Jaw with 5 Upward Iron Teeth & Forehead Roll-Bar
    put(sideSolid([[0.3, 0.58], [0.44, 0.42], [0.46, 0.16], [0.3, 0.1]], 0.78, 0.03), mShell);
    put(torus(0.39, 0.04, 20), c.steel, 0, 0.44, 0.06, [Math.PI / 2 - 0.2, 0, 0]);
    put(RB(0.56, 0.055, 0.08, 0.02), mAcc, 0, 0.48, 0.38);
    // Massive protruding underbite crusher jaw + 5 upward steel teeth
    put(sideSolid([[0.34, -0.14], [0.52, -0.18], [0.5, -0.48], [0.06, -0.48]], 0.7, 0.04), mAcc);
    for (let k = 0; k < 5; k++) {
      const tx = (k - 2) * 0.125;
      put(new THREE.ConeGeometry(0.048, 0.19, 4), c.steel, tx, -0.09, 0.48);
    }
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.08, 0.08, 0.48, 14), c.steel, s * 0.39, -0.06, 0.08, [0.4, 0, 0]);
      put(torus(0.085, 0.018, 16).rotateX(Math.PI / 2), mGlow, s * 0.39, 0.04, 0.12);
    }
  } else if (skin === 6) {
    // 6. METRO SIEGE CAGE: Brutal Tubular Steel Roll-Cage Face & Crown + Twin Floodlights + Hazard Beacon
    put(sideSolid([[0.3, 0.56], [0.42, 0.4], [0.44, 0.16], [0.3, 0.1]], 0.76, 0.03), mShell);
    // Horizontal & vertical steel roll-cage bars wrapping the face
    for (let rBar = 0; rBar < 4; rBar++) {
      put(RB(0.76, 0.04, 0.06, 0.015), c.steel, 0, 0.24 - rBar * 0.18, 0.46);
    }
    for (let vBar = -2; vBar <= 2; vBar++) {
      put(RB(0.04, 0.68, 0.05, 0.012), c.steel, vBar * 0.15, -0.02, 0.46);
    }
    // Roof hazard beacon + twin forehead floodlights + heavy side armor
    put(tcyl(0.13, 0.16, 0.16, 16), mAcc, 0, 0.64, 0.04);
    put(dome(0.12, 0.5), mGlow, 0, 0.72, 0.04);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.14, 0.44, 0.52, 0.04), mShell, s * 0.38, 0.0, -0.02);
      put(tcyl(0.075, 0.085, 0.08, 14).rotateX(Math.PI / 2), mAcc, s * 0.22, 0.42, 0.42);
      put(tcyl(0.055, 0.055, 0.09, 14).rotateX(Math.PI / 2), c.core, s * 0.22, 0.42, 0.43);
    }
  } else if (skin === 7) {
    // 7. BLACKJACK VIPER: Aerodynamic Stealth Valkyrie Wing-Ears, Razor V-Visor & Mandible Fangs
    put(sideSolid([[0.28, 0.62], [0.5, 0.36], [0.48, 0.14], [0.28, 0.1]], 0.74, 0.025), mShell);
    put(RB(0.1, 0.26, 0.78, 0.02), mGlow, 0, 0.58, -0.04);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      // Swept-back Valkyrie Wing-Ears + secondary upper fin
      put(sideSolid([[-0.42, 0.58], [0.22, 0.22], [0.26, -0.12], [-0.36, 0.18]], 0.07, 0.02), mAcc, s * 0.39, 0.16, -0.08, [0, s * 0.18, -s * 0.2]);
      put(sideSolid([[-0.32, 0.76], [0.14, 0.44], [0.16, 0.28], [-0.28, 0.48]], 0.05, 0.015), mGlow, s * 0.32, 0.18, -0.08, [0, s * 0.14, -s * 0.15]);
      put(RB(0.32, 0.04, 0.08, 0.012), mGlow, s * 0.16, 0.12, 0.46, [0, -s * 0.2, s * 0.38]);
      // Mandible fangs
      put(sideSolid([[0.26, -0.12], [0.46, -0.22], [0.38, -0.48], [0.1, -0.44]], 0.16, 0.025), mShell, s * 0.2, 0, 0);
      put(RB(0.03, 0.22, 0.06, 0.01), mGlow, s * 0.2, -0.28, 0.44, [0, 0, -s * 0.2]);
    }
  } else if (skin === 8) {
    // 8. CENTURION SPARTAN: Tall Longitudinal Titanium Brush-Crest & Corinthian T-Slit Battle Faceplate
    put(sideSolid([[0.32, 0.6], [0.46, 0.42], [0.46, 0.16], [0.3, 0.1]], 0.78, 0.03), mShell);
    // Tall sweeping Spartan Crest Base + Glowing Plasma Comb + Golden Side Trim
    put(sideSolid([[-0.42, 0.48], [-0.36, 0.88], [0.28, 0.92], [0.46, 0.54], [0.32, 0.48]], 0.12, 0.025), mAcc);
    put(sideSolid([[-0.45, 0.54], [-0.4, 0.98], [0.32, 1.02], [0.5, 0.6]], 0.06, 0.015), mGlow);
    // Corinthian Cheek-Plates framing a T-Slit opening
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.24, 0.38, 0.1, 0.025), mShell, s * 0.19, -0.25, 0.41, [0, -s * 0.22, 0]);
      put(RB(0.04, 0.34, 0.04, 0.01), mGlow, s * 0.075, -0.25, 0.45);
      put(RB(0.12, 0.42, 0.48, 0.04), mSec, s * 0.36, 0.0, -0.02);
    }
  } else if (skin === 9) {
    // 9. OVERLORD OMEGA: Apex Cyber-Demon Curved War Horns, Triple Crown Blades & Predator Fang Mask
    put(sideSolid([[0.32, 0.62], [0.48, 0.42], [0.48, 0.14], [0.3, 0.1]], 0.8, 0.035), mShell);
    // Central + twin dorsal reactor blades + forehead Hell-Core diamond
    put(sideSolid([[-0.38, 0.52], [-0.1, 0.84], [0.36, 0.74], [0.28, 0.52]], 0.09, 0.02), mGlow);
    put(new THREE.OctahedronGeometry(0.095, 0), mGlow, 0, 0.34, 0.46);
    // Twin Massive Forward-Swept Cyber-Demon Horns
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(tcyl(0.09, 0.13, 0.42, 14), mAcc, s * 0.36, 0.54, 0.04, [0.45, 0, -s * 0.52]);
      put(torus(0.11, 0.02, 16), mGlow, s * 0.28, 0.42, -0.04, [0.45, s * 0.5, 0]);
      put(torus(0.095, 0.018, 16), mGlow, s * 0.42, 0.62, 0.12, [0.65, s * 0.4, 0]);
      put(new THREE.ConeGeometry(0.09, 0.52, 12), mAcc, s * 0.5, 0.78, 0.28, [0.95, 0, -s * 0.22]);
      // Predator jaw plates + glowing fangs
      put(sideSolid([[0.32, -0.12], [0.48, -0.22], [0.42, -0.5], [0.08, -0.46]], 0.26, 0.03), mShell, s * 0.18, 0, 0);
      put(new THREE.ConeGeometry(0.045, 0.18, 6), mGlow, s * 0.16, -0.22, 0.47, [Math.PI, 0, 0]);
    }
  } else if (skin === 10) {
    // 10. ZEUS THUNDERLORD: the king of Olympus — a golden laurel band under a crown of five lightning bolts with
    // electric cores, a thunderbolt sigil on the brow, Tesla electrodes crackling at the temples and a layered
    // golden storm-beard wrapping the jaw down to a chin point
    put(sideSolid([[0.3, 0.6], [0.46, 0.42], [0.48, 0.16], [0.3, 0.1]], 0.8, 0.035), mShell);
    put(torus(0.41, 0.035, 30), mAcc, 0, 0.46, -0.02, [Math.PI / 2, 0, 0]); // laurel band
    for (let k = -2; k <= 2; k++) {
      const u = Math.abs(k) / 2;
      const h = 0.46 - u * 0.14;
      put(bolt(h, 0.05, 0.008), mAcc, k * 0.17, 0.56 + h * 0.5 - u * 0.04, -0.04 - u * 0.06, [-0.1, 0, -k * 0.26]);
      put(bolt(h * 0.68, 0.07, 0.003), mGlow, k * 0.17, 0.56 + h * 0.5 - u * 0.04, -0.03 - u * 0.06, [-0.1, 0, -k * 0.26]);
    }
    put(bolt(0.24, 0.05, 0.003), mGlow, 0, 0.3, 0.45, [0, 0, 0.12]); // brow sigil
    // storm-beard: three tiers of golden arc plates round the jaw + the chin point
    for (let t = 0; t < 3; t++) {
      put(arcPlate(0.34 + t * 0.015, 0.4 + t * 0.015, 2.4 - t * 0.35, 0.09, 0.012), mAcc, 0, -0.2 - t * 0.11, 0.02);
      put(arcPlate(0.405 + t * 0.015, 0.425 + t * 0.015, 2.1 - t * 0.35, 0.02, 0.004), mGlow, 0, -0.24 - t * 0.11, 0.02);
    }
    put(new THREE.ConeGeometry(0.09, 0.22, 8), mAcc, 0, -0.6, 0.3, [Math.PI, 0, 0]);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.1, 0.36, 0.46, 0.03), mSec, s * 0.37, -0.02, -0.02);
      // Tesla temple electrodes with a crackling arc
      put(tcyl(0.1, 0.12, 0.1, 16).rotateZ(Math.PI / 2), mAcc, s * 0.42, 0.14, -0.04);
      put(sph(0.07, 14, 10), mGlow, s * 0.5, 0.14, -0.04);
      put(RB(0.02, 0.28, 0.02, 0.005), mGlow, s * 0.49, 0.32, 0.06, [0.5, 0, s * 0.55]);
      put(RB(0.02, 0.18, 0.02, 0.005), mGlow, s * 0.52, 0.0, 0.1, [-0.6, 0, s * 0.3]);
    }
  } else {
    // 11. RED METAL REAPER: candy-apple red chrome skull with a single tall mirror-chrome blade fin, twin hood-scoop
    // intakes, a chrome V8 grille for a jaw, chrome brow bar, rivet lines and side exhaust pipes behind the ears
    put(sideSolid([[0.3, 0.6], [0.46, 0.44], [0.48, 0.16], [0.3, 0.1]], 0.78, 0.03), mShell);
    put(sideSolid([[-0.44, 0.5], [-0.3, 1.0], [0.18, 0.92], [0.4, 0.5]], 0.05, 0.012), mAcc); // blade fin
    put(sideSolid([[-0.38, 0.72], [-0.3, 0.96], [0.14, 0.88], [0.24, 0.72]], 0.02, 0.004), mGlow, 0, 0.02, 0); // its red edge
    put(RB(0.62, 0.05, 0.08, 0.015), mAcc, 0, 0.21, 0.44); // chrome brow bar
    // V8 grille jaw: chrome frame + horizontal chrome slats
    put(RB(0.6, 0.04, 0.06, 0.012), mAcc, 0, -0.1, 0.42);
    put(RB(0.6, 0.04, 0.06, 0.012), mAcc, 0, -0.42, 0.42);
    for (let g = 0; g < 4; g++) put(RB(0.52, 0.022, 0.05, 0.006), mAcc, 0, -0.16 - g * 0.065, 0.455);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      put(RB(0.04, 0.36, 0.06, 0.01), mAcc, s * 0.29, -0.26, 0.42);
      put(RB(0.12, 0.4, 0.5, 0.03), mShell, s * 0.37, 0.0, -0.02); // red chrome cheek plates
      for (let rv = 0; rv < 3; rv++) put(sph(0.024, 10, 8), mAcc, s * 0.43, 0.14 - rv * 0.14, 0.12 - rv * 0.1);
      // hood-scoop intakes on the temples
      put(RB(0.12, 0.14, 0.34, 0.035), mAcc, s * 0.4, 0.32, 0.1, [0, 0, -s * 0.08]);
      put(RB(0.07, 0.08, 0.3, 0.015), c.dark, s * 0.43, 0.32, 0.12, [0, 0, -s * 0.08]);
      // twin side exhaust pipes behind the ears, tips glowing hot
      for (let pp = 0; pp < 2; pp++) {
        put(tcyl(0.04, 0.046, 0.48, 12), mAcc, s * (0.26 + pp * 0.11), 0.46 + pp * 0.04, -0.3 - pp * 0.04, [-0.95, 0, -s * 0.15]);
        put(torus(0.04, 0.011, 12).rotateX(Math.PI / 2 - 0.95), mGlow, s * (0.3 + pp * 0.11), 0.66 + pp * 0.04, -0.49 - pp * 0.04);
      }
    }
  }
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
    buildCapMesh(cap, b, c, o, s);

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

    // muscular forearm taper: thick near the elbow -> beefy boxing wrist
    b.add(
      el,
      lathe(
        [
          [0, -1.3],
          [0.25, -1.3],
          [0.29, -1.16],
          [0.35, -0.88],
          [0.42, -0.52],
          [0.45, -0.28],
          [0.38, -0.08],
          [0.3, -0.01],
          [0, 0],
        ],
        fa,
      ),
      c.sec,
    );
    // one bracer plate over the forearm + one thin light line + the heavy wrist collar
    b.add(el, arcPlate(0.42 * fa, 0.49 * fa, 2.5, 0.58), c.main, 0, -0.52, 0);
    b.add(el, arcPlate(0.4 * fa, 0.47 * fa, 2.2, 0.56), c.main, 0, -0.54, 0, [0, Math.PI, 0]);
    b.add(el, RB(0.03, 0.38, 0.03, 0.01), c.glow, s * 0.47 * fa, -0.56, 0);
    b.add(el, arcPlate(0.32 * fa, 0.4 * fa, 2.5, 0.07), c.steel, 0, -1.12, 0);

    // =========================== 5. WRIST & PRO BOXING GLOVES ===========================
    const wr = new THREE.Group();
    wr.position.y = -1.3;
    el.add(wr);
    r.wrists.push(wr);

    const fist = new THREE.Group();
    wr.add(fist);
    r.fists.push(fist);

    buildFistMesh(r, fist, b, c, o, s);
  }
}

/** Deltoid pauldron: base dome + per-armor-skin signature shoulder details (skin 0 = clean G2 default) */
function buildCapMesh(cap: THREE.Group, b: Batch, c: Ctx, o: Opt, s: number) {
  const th = o.th;
  const skin = o.variant === 'atom' ? (c.style.armorSkin ?? 0) : 0;
  // one smooth deltoid dome, one under-plate and a single accent ribbon
  b.add(cap, dome(0.5 * th, 0.54), c.main, 0, 0.06, 0, [0, 0, 0], [1, 0.84, 1.06]);
  b.add(cap, arcPlate(0.5 * th, 0.575 * th, 1.9, 0.38), c.main, 0, -0.03, 0);
  b.add(cap, arcPlate(0.52 * th, 0.585 * th, 1.5, 0.055), c.accent, 0, -0.17, 0);
  if (skin === 0) return;
  const put = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rot?: V3, scl?: V3) => b.add(cap, g, m, x, y, z, rot, scl);
  const top = 0.06 + 0.5 * th * 0.84;
  if (skin === 1) {
    // ZEUS: monolithic crown block + glowing ridge
    put(RB(0.36 * th, 0.14, 0.62 * th, 0.03), c.accent, 0, top - 0.02, 0);
    put(RB(0.1 * th, 0.03, 0.56 * th, 0.01), c.glow, 0, top + 0.06, 0);
  } else if (skin === 2) {
    // NOISY BOY: 3 layered samurai sode plates
    for (let t = 0; t < 3; t++) {
      put(RB(0.5 * th, 0.07, 0.66 * th, 0.02), c.accent, s * 0.1 * th * t, top - 0.02 - t * 0.14, 0, [0, 0, -s * (0.32 + t * 0.12)]);
      put(RB(0.46 * th, 0.02, 0.6 * th, 0.008), c.glow, s * 0.1 * th * t, top + 0.03 - t * 0.14, 0, [0, 0, -s * (0.32 + t * 0.12)]);
    }
  } else if (skin === 3) {
    // MIDAS: golden spiked gladiator cap + 3 studs
    put(dome(0.42 * th, 0.5), c.accent, 0, top - 0.1, 0, [0, 0, 0], [1, 0.6, 1]);
    for (let st = -1; st <= 1; st++) put(new THREE.ConeGeometry(0.06 * th, 0.26, 6), c.accent, s * 0.12 * th, top + 0.14, st * 0.22 * th, [0, 0, -s * 0.3]);
  } else if (skin === 4) {
    // TWIN CITIES: jet-intake pod on the shoulder
    put(tcyl(0.16 * th, 0.19 * th, 0.3, 18).rotateX(Math.PI / 2), c.steel, s * 0.08 * th, top - 0.1, -0.02);
    put(tcyl(0.11 * th, 0.11 * th, 0.32, 18).rotateX(Math.PI / 2), c.glow, s * 0.08 * th, top - 0.1, -0.02);
  } else if (skin === 5) {
    // METRO: welded roll-bar hoops + hazard chevrons
    put(torus(0.5 * th, 0.035, 24), c.steel, 0, 0.0, 0, [Math.PI / 2, 0, 0]);
    put(RB(0.08, 0.05, 0.56 * th, 0.015), c.steel, 0, top + 0.01, 0);
    put(RB(0.36 * th, 0.03, 0.08, 0.01), c.glow, 0, top - 0.02, 0.3 * th, [0, 0, -s * 0.5]);
  } else if (skin === 6) {
    // AMBUSH: riveted scrap plate + strap buckle
    put(RB(0.48 * th, 0.08, 0.5 * th, 0.02), c.steel, s * 0.06 * th, top - 0.04, 0, [0, 0, -s * 0.28]);
    for (let rv = -1; rv <= 1; rv++) put(sph(0.035, 10, 8), c.accent, s * 0.1 * th, top + 0.01, rv * 0.18 * th);
  } else if (skin === 7) {
    // VIPER: swept aero wing-blade
    put(sideSolid([[-0.3 * th, 0.0], [-0.56 * th, 0.28], [-0.42 * th, 0.34], [0.26 * th, 0.06]], 0.05, 0.015), c.main, 0, top - 0.02, 0, [0, 0, -s * 0.2]);
    put(RB(0.03, 0.03, 0.6 * th, 0.01), c.glow, s * 0.02 * th, top + 0.02, -0.1 * th, [0, 0, -s * 0.2]);
  } else if (skin === 8) {
    // CENTURION: winged paladin pauldron with chrome trim
    put(sideSolid([[-0.36 * th, 0.0], [-0.44 * th, 0.3], [0.1 * th, 0.26], [0.36 * th, 0.0]], 0.07, 0.02), c.accent, 0, top - 0.02, 0);
    put(torus(0.46 * th, 0.03, 24), c.steel, 0, -0.1, 0, [Math.PI / 2, 0, 0]);
  } else if (skin === 9) {
    // OVERLORD: twin demon horn spikes + magma ring
    put(new THREE.ConeGeometry(0.075 * th, 0.42, 8), c.accent, s * 0.14 * th, top + 0.14, 0.12 * th, [0.25, 0, -s * 0.5]);
    put(new THREE.ConeGeometry(0.06 * th, 0.32, 8), c.accent, s * 0.1 * th, top + 0.08, -0.2 * th, [-0.3, 0, -s * 0.4]);
    put(torus(0.44 * th, 0.03, 24), c.glow, 0, -0.08, 0, [Math.PI / 2, 0, 0]);
  } else if (skin === 10) {
    // ZEUS: golden storm pauldron — a gold cap plate, three lightning prongs flaring outwards and an electric ring
    put(RB(0.32 * th, 0.06, 0.52 * th, 0.02), c.accent, 0, top - 0.02, 0);
    for (let k = -1; k <= 1; k++) put(new THREE.ConeGeometry(0.05 * th, 0.3, 6), c.accent, s * 0.2 * th, top + 0.1, k * 0.2 * th, [k * 0.4, 0, -s * 0.95]);
    put(bolt(0.22 * th, 0.03, 0.003), c.glow, s * 0.02 * th, top + 0.1, 0.3 * th, [0, 0, -s * 0.2]);
    put(torus(0.46 * th, 0.028, 24), c.glow, 0, -0.08, 0, [Math.PI / 2, 0, 0]);
  } else {
    // RED METAL: chrome bumper hoop, a candy-red fin blade and chrome rivets
    put(torus(0.5 * th, 0.04, 24), c.accent, 0, -0.02, 0, [Math.PI / 2, 0, 0]);
    put(sideSolid([[-0.32 * th, 0.0], [-0.22 * th, 0.3], [0.1 * th, 0.3], [0.32 * th, 0.0]], 0.05, 0.012), c.main, 0, top - 0.02, 0);
    put(RB(0.02, 0.02, 0.44 * th, 0.005), c.glow, 0, top + 0.28, -0.04 * th);
    for (let rv = -1; rv <= 1; rv++) put(sph(0.034, 10, 8), c.accent, s * 0.16 * th, top + 0.0, rv * 0.18 * th);
  }
}

/**
 * 10 Ultra-Rare Real Steel Boxing Glove Skins (0..9):
 * 0: G2 TITANIUM PRO (Default WRB Heavy-Duty Fist)
 * 1: ZEUS NITRO PISTON (Dual Hydraulic Crusher Rams & Emerald Vents)
 * 2: NOISY BOY KANJI (Neon Plasma Strip Samurai Gauntlet & Katana Cuff)
 * 3: MIDAS 24K GOLD (Solid 24K Gold Championship Shell & 4 Diamond Pyramid Knuckle Studs)
 * 4: METRO SLEDGEHAMMER (Colossal Octagonal Siege Anvil Smasher & Side Counterweights)
 * 5: TWIN CITIES TURBINE (Rear Jet-Thruster Rocket Nozzle & Splitter Fins)
 * 6: AMBUSH IRON CAGE (Steel Reinforcement Bands & 3 Armor-Piercing Knuckle Spikes)
 * 7: ATOM OVERCLOCK CORE (Dorsal Arc-Reactor Turbine Core & High-Voltage Plasma Rails)
 * 8: VIPER VENOM TALON (Stealth Carbon Facets & 3 Forward-Swept Plasma Claws)
 * 9: OMEGA HELLFIRE (Volcanic Obsidian Dragon-Scale Plates & Molten Magma Knuckle Drivers)
 */
function buildFistMesh(r: Robot, fist: THREE.Group, b: Batch, c: Ctx, o: Opt, s: number) {
  const k = o.fs;
  const skin = c.style.gloveSkin ?? 0;
  if (skin === 0 || o.variant !== 'atom') {
    // tapered wrist cuff + one glow ring (scaled together with the enlarged boxing glove `k = o.fs`)
    b.add(fist, tcyl(0.29 * k, 0.39 * k, 0.32 * k, 26), c.steel, 0, -0.04 * k, 0);
    b.add(fist, torus(0.39 * k, 0.028 * k, 30), c.glow, 0, -0.18 * k, 0, [Math.PI / 2, 0, 0]);
    // padded lace-strap cuff band + 3 lace stitches on the palm side
    b.add(fist, RB(0.82 * k, 0.14 * k, 0.84 * k, 0.05 * k), c.rubber, 0, -0.28 * k, 0.02 * k);
    for (let lc = 0; lc < 3; lc++) b.add(fist, RB(0.3 * k, 0.025 * k, 0.03 * k, 0.008 * k), c.steel, 0, (-0.22 - lc * 0.06) * k, -0.42 * k);
    // ONE smooth heavy-duty glove body (full-sized robot boxing fist)
    b.add(fist, RB(0.84 * k, 0.88 * k, 0.86 * k, 0.35 * k), c.dark, 0, -0.58 * k, 0.02 * k);
    // rounded knuckle dome wrapping the striking face (true boxing-glove silhouette, not a brick)
    b.add(fist, sph(0.4 * k, 22, 14), c.dark, 0, -0.84 * k, 0.1 * k, [0, 0, 0], [1.02, 0.58, 1.0]);
    // ONE knuckle bar across the striking face of the fist (protrudes like a real glove's knuckle pad)
    b.add(fist, RB(0.64 * k, 0.18 * k, 0.52 * k, 0.085 * k), c.main, 0, -0.92 * k, 0.15 * k);
    // dorsal armor shield with accent chevron
    b.add(fist, RB(0.6 * k, 0.5 * k, 0.1 * k, 0.05 * k), c.main, 0, -0.56 * k, 0.44 * k, [0.1, 0, 0]);
    b.add(fist, RB(0.3 * k, 0.04 * k, 0.04 * k, 0.012 * k), c.accent, 0, -0.56 * k, 0.5 * k);
    // tucked thumb (proper boxing form)
    b.add(fist, new THREE.CapsuleGeometry(0.14 * k, 0.32 * k, 6, 14), c.rubber, -s * 0.46 * k, -0.68 * k, 0.03 * k, [0, 0, -s * 0.14]);
    b.add(fist, RB(0.14 * k, 0.16 * k, 0.2 * k, 0.04 * k), c.main, -s * 0.5 * k, -0.6 * k, 0.1 * k, [0, 0, -s * 0.14]);
    return;
  }

  const mkBody = (color: number, metalness = 0.86, roughness = 0.24) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: 0xffffff, emissiveIntensity: 0 });
    r.bodyMats.push(m);
    return m;
  };
  const mkGlow = (color: number, intensity = 2.5) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.28 });
    r.glowMats.push(m);
    return m;
  };

  const gCfg: Record<number, { body: number; plate: number; trim: number; glow: number }> = {
    1: { body: 0x12161c, plate: 0x2a3340, trim: 0xcbd5e1, glow: 0x5effb0 }, // ZEUS NITRO PISTON
    2: { body: 0x261024, plate: 0x6b1539, trim: 0xffb703, glow: 0xff2a7a }, // NOISY BOY KANJI
    3: { body: 0x6b1218, plate: 0xffc72c, trim: 0xffe066, glow: 0xffd700 }, // MIDAS 24K GOLD
    4: { body: 0x272a30, plate: 0x525866, trim: 0xd97706, glow: 0xff9f1c }, // METRO SLEDGEHAMMER
    5: { body: 0x1e2430, plate: 0xb91c1c, trim: 0x94a3b8, glow: 0xff4d4d }, // TWIN CITIES TURBINE
    6: { body: 0x23272e, plate: 0x4b5563, trim: 0xa1a1aa, glow: 0xf97316 }, // AMBUSH IRON CAGE
    7: { body: 0x0f172a, plate: 0x1d4ed8, trim: 0xe2e8f0, glow: 0x38bdf8 }, // ATOM OVERCLOCK CORE
    8: { body: 0x0b131e, plate: 0x111827, trim: 0x059669, glow: 0x10b981 }, // VIPER VENOM TALON
    9: { body: 0x181014, plate: 0x450a0a, trim: 0xf59e0b, glow: 0xff2a4b }, // OMEGA HELLFIRE
    10: { body: 0x1b2a3f, plate: 0x27405e, trim: 0xffd36b, glow: 0xb8f0ff }, // ZEUS THUNDERFIST
    11: { body: 0x7a0c16, plate: 0xc1121f, trim: 0xe6e8ec, glow: 0xff4040 }, // RED METAL PISTON KNUCKLE
  };
  const gc = gCfg[skin] || gCfg[1];
  const chrome = skin === 11;
  const mBody = mkBody(gc.body, chrome ? 0.92 : skin === 3 ? 0.85 : 0.78, chrome ? 0.16 : skin === 3 ? 0.26 : 0.34);
  const mPlate = mkBody(gc.plate, chrome ? 0.98 : skin === 3 ? 0.96 : 0.88, chrome ? 0.08 : skin === 3 ? 0.14 : 0.22);
  const mTrim = mkBody(gc.trim, chrome ? 0.98 : 0.94, chrome ? 0.08 : 0.18);
  const mGlow = mkGlow(gc.glow, 2.6);

  // Heavy-duty Wrist Cuff + Energy Ring + Padded Strap Band + Core Fist Volume + Knuckle Dome + Thumb
  b.add(fist, tcyl(0.3 * k, 0.41 * k, 0.34 * k, 26), mTrim, 0, -0.04 * k, 0);
  b.add(fist, torus(0.4 * k, 0.03 * k, 30), mGlow, 0, -0.18 * k, 0, [Math.PI / 2, 0, 0]);
  b.add(fist, RB(0.84 * k, 0.14 * k, 0.86 * k, 0.05 * k), c.rubber, 0, -0.28 * k, 0.02 * k);
  for (let lc = 0; lc < 3; lc++) b.add(fist, RB(0.3 * k, 0.025 * k, 0.03 * k, 0.008 * k), mTrim, 0, (-0.22 - lc * 0.06) * k, -0.43 * k);
  b.add(fist, RB(0.86 * k, 0.9 * k, 0.88 * k, 0.34 * k), mBody, 0, -0.58 * k, 0.02 * k);
  b.add(fist, sph(0.41 * k, 22, 14), mBody, 0, -0.84 * k, 0.1 * k, [0, 0, 0], [1.02, 0.58, 1.0]); // rounded knuckle dome
  b.add(fist, RB(0.76 * k, 0.62 * k, 0.26 * k, 0.08 * k), mPlate, 0, -0.56 * k, 0.38 * k); // Dorsal armor shield
  // side palm/thumb-guard plates + bolted thumb
  b.add(fist, RB(0.1 * k, 0.5 * k, 0.6 * k, 0.03 * k), mPlate, s * 0.44 * k, -0.6 * k, 0.02 * k);
  b.add(fist, new THREE.CapsuleGeometry(0.15 * k, 0.34 * k, 6, 14), mPlate, -s * 0.47 * k, -0.68 * k, 0.04 * k, [0, 0, -s * 0.14]);
  b.add(fist, tcyl(0.07 * k, 0.07 * k, 0.1 * k, 12).rotateZ(Math.PI / 2), mTrim, -s * 0.56 * k, -0.6 * k, 0.1 * k);

  if (skin === 1) {
    // 1. ZEUS NITRO PISTON: Twin Dorsal Hydraulic Nitro-Pistons & Triple Titanium Knuckle Ribs
    for (const px of [-0.22, 0.22]) {
      b.add(fist, tcyl(0.085 * k, 0.085 * k, 0.56 * k, 16), mTrim, px * k, -0.44 * k, 0.46 * k);
      b.add(fist, tcyl(0.05 * k, 0.05 * k, 0.76 * k, 12), c.steel, px * k, -0.56 * k, 0.46 * k);
      b.add(fist, torus(0.09 * k, 0.02 * k, 16), mGlow, px * k, -0.32 * k, 0.46 * k, [Math.PI / 2, 0, 0]);
    }
    for (let kr = -1; kr <= 1; kr++) {
      b.add(fist, RB(0.2 * k, 0.22 * k, 0.58 * k, 0.05 * k), mTrim, kr * 0.23 * k, -0.94 * k, 0.16 * k);
    }
    b.add(fist, RB(0.68 * k, 0.06 * k, 0.54 * k, 0.02 * k), mGlow, 0, -0.82 * k, 0.2 * k);
    for (let v = 0; v < 3; v++) b.add(fist, RB(0.03 * k, 0.04 * k, 0.3 * k, 0.01 * k), mGlow, s * 0.5 * k, (-0.42 - v * 0.12) * k, 0.04 * k);
  } else if (skin === 2) {
    // 2. NOISY BOY KANJI: Flared Samurai Cuff & 4 Blazing Neon-Magenta Plasma Strips across Dorsal & Knuckles
    b.add(fist, RB(0.92 * k, 0.12 * k, 0.92 * k, 0.04 * k), mTrim, 0, -0.16 * k, 0.02 * k);
    for (let st = 0; st < 4; st++) {
      const x = (st - 1.5) * 0.17 * k;
      b.add(fist, RB(0.055 * k, 0.64 * k, 0.06 * k, 0.015 * k), mGlow, x, -0.58 * k, 0.49 * k);
      b.add(fist, RB(0.13 * k, 0.21 * k, 0.56 * k, 0.04 * k), mTrim, x, -0.93 * k, 0.16 * k);
      b.add(fist, sph(0.035 * k, 10, 8), mTrim, x, -0.2 * k, 0.46 * k);
    }
    b.add(fist, RB(0.74 * k, 0.72 * k, 0.03 * k, 0.012 * k), mTrim, 0, -0.58 * k, 0.5 * k, [0, 0, 0], [1, 1, 1]);
    b.add(fist, RB(0.62 * k, 0.6 * k, 0.02 * k, 0.01 * k), mGlow, 0, -0.58 * k, 0.505 * k);
  } else if (skin === 3) {
    // 3. MIDAS 24K GOLD: Solid 24K Gold Armor Shell + 4 Diamond-Beveled Golden Pyramid Knuckle Studs
    b.add(fist, torus(0.42 * k, 0.032 * k, 30), mPlate, 0, -0.08 * k, 0, [Math.PI / 2, 0, 0]);
    b.add(fist, RB(0.72 * k, 0.2 * k, 0.56 * k, 0.07 * k), mPlate, 0, -0.92 * k, 0.16 * k);
    for (let st = 0; st < 4; st++) {
      const x = (st - 1.5) * 0.165 * k;
      b.add(fist, new THREE.ConeGeometry(0.085 * k, 0.2 * k, 4).rotateX(Math.PI), mTrim, x, -1.06 * k, 0.18 * k);
      b.add(fist, RB(0.09 * k, 0.05 * k, 0.09 * k, 0.015 * k), mGlow, x, -0.56 * k, 0.49 * k);
    }
    b.add(fist, new THREE.OctahedronGeometry(0.11 * k, 0), mBody, 0, -0.56 * k, 0.52 * k);
    b.add(fist, torus(0.2 * k, 0.02 * k, 24), mTrim, 0, -0.56 * k, 0.5 * k);
    b.add(fist, torus(0.44 * k, 0.03 * k, 30), mTrim, 0, -0.34 * k, 0.02 * k, [Math.PI / 2, 0, 0]);
  } else if (skin === 4) {
    // 4. METRO SLEDGEHAMMER: Protruding Octagonal Siege-Anvil Block & Twin Side Counterweights
    b.add(fist, RB(0.82 * k, 0.28 * k, 0.68 * k, 0.06 * k), mTrim, 0, -0.95 * k, 0.18 * k);
    for (const sx of [-1, 1]) {
      b.add(fist, tcyl(0.18 * k, 0.18 * k, 0.24 * k, 18).rotateZ(Math.PI / 2), mPlate, sx * 0.46 * k, -0.56 * k, 0.04 * k);
      b.add(fist, torus(0.13 * k, 0.025 * k, 18).rotateY(Math.PI / 2), mGlow, sx * 0.56 * k, -0.56 * k, 0.04 * k);
    }
    b.add(fist, RB(0.66 * k, 0.07 * k, 0.12 * k, 0.02 * k), mGlow, 0, -0.95 * k, 0.49 * k);
    for (let rv = -1; rv <= 1; rv++) {
      b.add(fist, sph(0.04 * k, 10, 8), c.steel, rv * 0.24 * k, -0.4 * k, 0.5 * k);
      b.add(fist, sph(0.04 * k, 10, 8), c.steel, rv * 0.24 * k, -0.72 * k, 0.5 * k);
    }
    b.add(fist, RB(0.56 * k, 0.05 * k, 0.03 * k, 0.01 * k), mTrim, 0, -0.56 * k, 0.51 * k, [0, 0, 0.5]);
  } else if (skin === 5) {
    // 5. TWIN CITIES TURBINE: Dorsal Jet-Thruster Rocket Nozzle & Aerodynamic Side Splitter Fins
    b.add(fist, tcyl(0.24 * k, 0.28 * k, 0.18 * k, 24).rotateX(Math.PI / 2), mTrim, 0, -0.54 * k, 0.48 * k);
    b.add(fist, tcyl(0.17 * k, 0.17 * k, 0.2 * k, 20).rotateX(Math.PI / 2), mGlow, 0, -0.54 * k, 0.49 * k);
    b.add(fist, torus(0.21 * k, 0.026 * k, 24), mPlate, 0, -0.54 * k, 0.55 * k);
    for (let bl = 0; bl < 6; bl++) b.add(fist, RB(0.03 * k, 0.3 * k, 0.03 * k, 0.008 * k), mTrim, 0, -0.54 * k, 0.56 * k, [0, 0, (bl / 6) * Math.PI]);
    b.add(fist, RB(0.7 * k, 0.22 * k, 0.56 * k, 0.07 * k), mPlate, 0, -0.93 * k, 0.16 * k);
    for (const sx of [-1, 1]) {
      b.add(fist, tcyl(0.08 * k, 0.1 * k, 0.3 * k, 14).rotateX(Math.PI / 2), c.steel, sx * 0.3 * k, -0.34 * k, -0.42 * k);
      b.add(fist, tcyl(0.055 * k, 0.055 * k, 0.04 * k, 14).rotateX(Math.PI / 2), mGlow, sx * 0.3 * k, -0.34 * k, -0.58 * k);
      b.add(fist, sideSolid([[-0.2, 0.0], [0.22, 0.0], [0.26, 0.14], [-0.12, 0.1]], 0.04 * k, 0.01 * k), mPlate, sx * 0.46 * k, -0.42 * k, 0.1 * k);
    }
  } else if (skin === 6) {
    // 6. AMBUSH IRON CAGE: 3 Heavy Steel Reinforcement Straps & 3 Armor-Piercing Knuckle Wedges
    for (let st = -1; st <= 1; st++) {
      b.add(fist, RB(0.92 * k, 0.1 * k, 0.92 * k, 0.03 * k), mTrim, 0, (-0.38 + st * 0.2) * k, 0.02 * k);
      b.add(fist, new THREE.ConeGeometry(0.1 * k, 0.24 * k, 4).rotateX(Math.PI), mTrim, st * 0.22 * k, -1.06 * k, 0.18 * k);
    }
    b.add(fist, RB(0.72 * k, 0.2 * k, 0.56 * k, 0.06 * k), mPlate, 0, -0.92 * k, 0.16 * k);
    b.add(fist, RB(0.56 * k, 0.06 * k, 0.08 * k, 0.015 * k), mGlow, 0, -0.58 * k, 0.49 * k);
    for (const vx of [-0.3, 0.3]) b.add(fist, RB(0.06 * k, 0.72 * k, 0.07 * k, 0.015 * k), c.steel, vx * k, -0.58 * k, 0.47 * k);
    for (const vx of [-0.3, 0.3]) for (const vy of [-0.3, -0.84]) b.add(fist, tcyl(0.05 * k, 0.05 * k, 0.04 * k, 6).rotateX(Math.PI / 2), mTrim, vx * k, vy * k, 0.51 * k);
  } else if (skin === 7) {
    // 7. ATOM OVERCLOCK CORE: Glowing Circular Arc-Reactor Core & Triple High-Voltage Plasma Knuckle Rails
    b.add(fist, tcyl(0.22 * k, 0.22 * k, 0.08 * k, 24).rotateX(Math.PI / 2), mTrim, 0, -0.54 * k, 0.47 * k);
    b.add(fist, tcyl(0.15 * k, 0.15 * k, 0.1 * k, 24).rotateX(Math.PI / 2), c.core, 0, -0.54 * k, 0.48 * k);
    b.add(fist, torus(0.18 * k, 0.025 * k, 24), mGlow, 0, -0.54 * k, 0.51 * k);
    for (let kr = -1; kr <= 1; kr++) {
      b.add(fist, RB(0.12 * k, 0.24 * k, 0.58 * k, 0.03 * k), mGlow, kr * 0.22 * k, -0.93 * k, 0.16 * k);
    }
    b.add(fist, RB(0.68 * k, 0.19 * k, 0.54 * k, 0.07 * k), mPlate, 0, -0.92 * k, 0.15 * k);
    for (let fn = 0; fn < 4; fn++) b.add(fist, RB(0.03 * k, 0.1 * k, 0.4 * k, 0.008 * k), mTrim, (fn - 1.5) * 0.08 * k, -0.24 * k, 0.1 * k);
    b.add(fist, RB(0.4 * k, 0.03 * k, 0.03 * k, 0.01 * k), mGlow, 0, -0.78 * k, 0.5 * k);
    b.add(fist, RB(0.06 * k, 0.3 * k, 0.04 * k, 0.01 * k), mGlow, s * 0.49 * k, -0.6 * k, 0.1 * k);
  } else if (skin === 8) {
    // 8. VIPER VENOM TALON: Stealth Facets & 3 Forward-Swept Emerald Plasma Claws
    b.add(fist, RB(0.68 * k, 0.2 * k, 0.54 * k, 0.06 * k), mTrim, 0, -0.92 * k, 0.16 * k);
    for (let cl = 0; cl < 4; cl++) {
      const x = (cl - 1.5) * 0.17 * k;
      b.add(fist, sideSolid([[-0.08, 0.12], [0.16, 0.08], [0.26, -0.24], [-0.04, -0.14]], 0.06 * k, 0.012 * k), mGlow, x, -0.98 * k, 0.26 * k);
      b.add(fist, tcyl(0.02 * k, 0.02 * k, 0.5 * k, 8), mGlow, x, -0.52 * k, 0.48 * k);
    }
    b.add(fist, RB(0.52 * k, 0.06 * k, 0.08 * k, 0.015 * k), mGlow, 0, -0.26 * k, 0.49 * k);
    for (let sc = 0; sc < 3; sc++) b.add(fist, RB(0.2 * k, 0.08 * k, 0.05 * k, 0.015 * k), mPlate, s * 0.46 * k, (-0.42 - sc * 0.16) * k, 0.1 * k, [0, 0, 0.6]);
  } else if (skin === 9) {
    // 9. OMEGA HELLFIRE: 3 Overlapping Dragon-Scale Dorsal Plates & 4 Molten Magma Knuckle Drivers
    for (let sc = 0; sc < 3; sc++) {
      b.add(fist, RB((0.76 - sc * 0.06) * k, 0.22 * k, 0.14 * k, 0.04 * k), mTrim, 0, (-0.36 - sc * 0.2) * k, 0.45 * k, [0.22, 0, 0]);
    }
    b.add(fist, RB(0.72 * k, 0.22 * k, 0.58 * k, 0.07 * k), mPlate, 0, -0.93 * k, 0.16 * k);
    for (let st = 0; st < 4; st++) {
      const x = (st - 1.5) * 0.165 * k;
      b.add(fist, tcyl(0.065 * k, 0.08 * k, 0.24 * k, 8), mGlow, x, -0.98 * k, 0.2 * k);
    }
    for (let cr = 0; cr < 3; cr++) b.add(fist, RB(0.03 * k, 0.26 * k, 0.03 * k, 0.008 * k), mGlow, (cr - 1) * 0.24 * k, -0.6 * k, 0.49 * k, [0, 0, (cr - 1) * 0.5]);
    b.add(fist, new THREE.ConeGeometry(0.07 * k, 0.3 * k, 8), mTrim, s * 0.46 * k, -0.4 * k, 0.1 * k, [0, 0, -s * 1.3]);
    b.add(fist, new THREE.ConeGeometry(0.06 * k, 0.24 * k, 8), mTrim, s * 0.46 * k, -0.7 * k, 0.1 * k, [0, 0, -s * 1.3]);
  } else if (skin === 10) {
    // 10. ZEUS THUNDERFIST: a Tesla-coil cuff ringed by six electrodes, a golden thunderbolt with a lightning core
    // down the back of the hand, and four golden lightning prongs on the striking face
    b.add(fist, torus(0.45 * k, 0.034 * k, 30), mTrim, 0, -0.1 * k, 0, [Math.PI / 2, 0, 0]);
    for (let e = 0; e < 6; e++) {
      const a = (e / 6) * Math.PI * 2 + 0.3;
      b.add(fist, sph(0.05 * k, 12, 8), mGlow, Math.cos(a) * 0.46 * k, -0.1 * k, Math.sin(a) * 0.46 * k);
    }
    b.add(fist, bolt(0.54 * k, 0.06 * k, 0.006 * k), mTrim, 0, -0.56 * k, 0.5 * k, [0.1, 0, 0]);
    b.add(fist, bolt(0.4 * k, 0.08 * k, 0.003 * k), mGlow, 0, -0.56 * k, 0.52 * k, [0.1, 0, 0]);
    b.add(fist, RB(0.7 * k, 0.2 * k, 0.54 * k, 0.06 * k), mTrim, 0, -0.93 * k, 0.16 * k);
    for (let st = 0; st < 4; st++) {
      const x = (st - 1.5) * 0.17 * k;
      b.add(fist, new THREE.ConeGeometry(0.05 * k, 0.22 * k, 6), mTrim, x, -1.1 * k, 0.18 * k, [Math.PI, 0, 0]);
      b.add(fist, RB(0.03 * k, 0.1 * k, 0.03 * k, 0.006 * k), mGlow, x, -1.0 * k, 0.3 * k);
    }
    b.add(fist, RB(0.02 * k, 0.3 * k, 0.02 * k, 0.005 * k), mGlow, s * 0.5 * k, -0.4 * k, 0.1 * k, [0, 0, s * 0.4]);
  } else {
    // 11. RED METAL PISTON KNUCKLE: a mirror-chrome knuckle-duster bar with four chrome piston drivers and hot red
    // caps, a chrome racing stripe and red slit on the back of the hand, and twin chrome side pipes
    b.add(fist, RB(0.76 * k, 0.2 * k, 0.56 * k, 0.07 * k), mTrim, 0, -0.94 * k, 0.16 * k);
    for (let st = 0; st < 4; st++) {
      const x = (st - 1.5) * 0.17 * k;
      b.add(fist, tcyl(0.065 * k, 0.075 * k, 0.2 * k, 12), mTrim, x, -1.06 * k, 0.2 * k);
      b.add(fist, tcyl(0.045 * k, 0.045 * k, 0.05 * k, 12), mGlow, x, -1.17 * k, 0.2 * k);
    }
    b.add(fist, RB(0.1 * k, 0.5 * k, 0.04 * k, 0.012 * k), mTrim, 0, -0.56 * k, 0.51 * k);
    b.add(fist, RB(0.42 * k, 0.04 * k, 0.04 * k, 0.01 * k), mGlow, 0, -0.3 * k, 0.51 * k);
    for (let rv = -1; rv <= 1; rv++) b.add(fist, sph(0.03 * k, 10, 8), mTrim, rv * 0.26 * k, -0.78 * k, 0.5 * k);
    for (let pp = 0; pp < 2; pp++) {
      b.add(fist, tcyl(0.045 * k, 0.05 * k, 0.5 * k, 12), mTrim, s * 0.52 * k, (-0.5 - pp * 0.16) * k, (0.12 - pp * 0.2) * k, [0, 0, s * 0.18]);
      b.add(fist, torus(0.045 * k, 0.012 * k, 12).rotateX(Math.PI / 2), mGlow, s * 0.56 * k, (-0.26 - pp * 0.16) * k, (0.12 - pp * 0.2) * k);
    }
  }
}

/** remove (and dispose) every merged Mesh directly under `g`, leaving child joint Groups untouched */
function clearMeshes(g: THREE.Object3D, groupsToo = false) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const ch = g.children[i];
    if (ch instanceof THREE.Mesh) {
      ch.geometry.dispose();
      g.remove(ch);
    } else if (groupsToo) {
      ch.traverse((n) => {
        if (n instanceof THREE.Mesh) n.geometry.dispose();
      });
      g.remove(ch);
    }
  }
}

export function rebuildHelmetAndGloves(r: Robot, c: Ctx, o: Opt) {
  // 0. Repaint the shared body materials for the selected armor skin
  applyArmorPalette(r, c, o);

  // 1. Clear and rebuild Helmet on r.head (eye optic groups are rebuilt too)
  clearMeshes(r.head, true);
  r.eyeOptics.length = 0;
  r.eyeIris.length = 0;
  r.eyePupils.length = 0;
  r.eyeScanners.length = 0;
  r.eyeFlares.length = 0;
  r.eyePulses.length = 0;
  r.eyeBeams.length = 0;
  r.eyeLights.length = 0;

  // 2. Clear Gloves on r.fists[0..1], chest armor meshes (keeps neck/clavicle joint groups) and the pauldrons
  for (const fist of r.fists) clearMeshes(fist);
  clearMeshes(r.chest);
  for (const cap of r.caps) clearMeshes(cap);

  const b = new Batch();
  buildHeadMesh(r, r.head, b, c, o);
  for (let i = 0; i < r.fists.length; i++) {
    buildFistMesh(r, r.fists[i] as THREE.Group, b, c, o, i === 0 ? 1 : -1);
  }
  buildChestMesh(r.chest, b, c, o);
  for (let i = 0; i < r.caps.length; i++) buildCapMesh(r.caps[i], b, c, o, i === 0 ? 1 : -1);
  b.flush();
  // 3. the full-body kit of the signature skins (pelvis skirt, leg and arm plates, dorsal piece)
  removeBodyKit(r);
  addBodyKit(r, c, o);
}
