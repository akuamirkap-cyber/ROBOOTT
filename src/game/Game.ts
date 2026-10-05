import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { MeterPass, makeGradePass } from './grade';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Robot, type Pose, type RobotStyle } from './robot';
import { ARMOR_SKINS, GLOVE_SKINS, HELMET_SKINS } from './build';
import { FREESTYLE, fallStages, freestyleByKey, freestylePose, getupFoot, riseArms } from './poses';
import { buildArena, type Arena } from './arena';
import { HANGAR_POS, buildHangar, type Hangar } from './hangar';
import { Effects, Trail } from './fx';
import { Decap } from './decap';
import { Sfx, type SfxProfile } from './audio';
import { Spring } from './spring';
import { nextShot, shotCamera, type Shot } from './demo';
import {
  CAM_MODES,
  fighterBox,
  fitShot,
  gameplayShot,
  newFrame,
  reachAlong,
  RIP_DUR,
  ripShot,
  type RipOut,
} from './cammath';
export { CAM_MODES, type CamMode } from './cammath';
// the strike data + the samplers, exported for the harness that guards them (striketest.mjs): the numbers the test
// asserts against ARE the numbers the game runs, so a retune can never quietly break the balance rules
export { MOVES, MOVE_EXTRA, UNBLOCKABLE, TELL, sampleKeys };

// ------------------------------------------------------------------ data
export type HeroPose = 'ready' | 'stand' | 'guard' | 'victory' | 'taunt' | 'vs' | 'menace';

export interface OpponentDef {
  name: string;
  title: string;
  hp: number;
  speed: number;
  dmg: number;
  react: number;
  dodge: number; // prefers evading over blocking
  punish: number; // chance to counter after a whiff / blocked or dodged move
  adapt: number; // how strongly it learns spammed moves
  aggro: number; // tendency to go into pressure phases
  rest: number;
  tscale: number;
  scale: number;
  combo: number;
  slam: boolean;
  style: RobotStyle;
  color: string;
  iq?: number; // the AI IQ multiplier this tuning was built with (see smartDef)
}

// ------------------------------------------------------------------ footwork speed
/** Multiplies the player's walking, running and dash speed and how quickly it reacts to the keys. */
export const FOOTWORK_STEPS = [1, 1.5, 2, 3] as const;
const LS_FW = 'steel-titans-footwork-v4'; // v4: default to 3× fast footwork
export const loadFootwork = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_FW));
    return (FOOTWORK_STEPS as readonly number[]).includes(v) ? v : 3;
  } catch {
    return 3;
  }
};

const LS_CAM = 'steel-titans-camera-v1';
/** the mode the player picked last time. SIARAN (the calm, roomy one) is the default. */
export const loadCamMode = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_CAM));
    return Number.isFinite(v) ? Math.max(0, Math.min(CAM_MODES.length - 1, v)) : 0;
  } catch {
    return 0;
  }
};

// ------------------------------------------------------------------ difficulty
export type Difficulty = 'normal' | 'ultra';
const LS_DIFF = 'steel-titans-difficulty';
export const loadDifficulty = (): Difficulty => {
  try {
    return localStorage.getItem(LS_DIFF) === 'ultra' ? 'ultra' : 'normal';
  } catch {
    return 'normal';
  }
};

/**
 * ULTRA HARD: the same four champions, but upgraded across the board — tougher chassis, harder hits, faster
 * attacks, near-instant reads, relentless counters, and every one of them carries Overdrive.
 * Fairness rules still apply: defence fatigue, dodge cooldown/stamina and short punish windows are untouched,
 * so a clean, patient fighter can still win.
 */
export const ultraDef = (d: OpponentDef): OpponentDef => ({
  ...d,
  title: d.title,
  hp: Math.round(d.hp * 1.4),
  speed: d.speed * 1.15,
  dmg: d.dmg * 1.3,
  react: Math.min(0.98, d.react + 0.16),
  dodge: Math.min(0.88, d.dodge + 0.16),
  punish: Math.min(0.98, d.punish + 0.18),
  adapt: d.adapt * 1.65 + 0.35,
  aggro: Math.min(0.96, d.aggro + 0.16),
  rest: d.rest * 0.55,
  tscale: d.tscale * 0.86,
  combo: d.combo + 1,
  slam: true,
});
// ------------------------------------------------------------------ enemy intelligence (AI IQ)
/**
 * How many times smarter the opponents are. 1× = normal, 2× = clever, 3× = genius, 10× = near-perfect.
 * The IQ only changes the BRAIN (reading, defending, punishing, mixing up) — never hp, damage or attack speed.
 */
export const STRATEGIST = 12; // the top tier: max reflexes PLUS a real game plan (see updatePlan)
export const IQ_STEPS = [1, 2, 3, 10, STRATEGIST] as const;

/** the opponent's current game plan — shown on the HUD so you can read what it is doing */
export type Plan = 'scout' | 'pressure' | 'counter' | 'trap' | 'finish' | 'recover' | 'stall';
export const PLAN_LABEL: Record<Plan, string> = {
  scout: 'MENGAMATI',
  pressure: 'MENEKAN',
  counter: 'MEMANCING',
  trap: 'MENYUDUTKAN',
  finish: 'MENGHABISI',
  recover: 'MEMULIHKAN',
  stall: 'MENGULUR WAKTU',
};
const LS_IQ = 'steel-titans-iq-v2'; // v2: defaults to STRATEGIST (12x Genius AI)
export const loadIq = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_IQ));
    return (IQ_STEPS as readonly number[]).includes(v) ? v : STRATEGIST;
  } catch {
    return STRATEGIST;
  }
};

/** the opponent's tuning after the IQ multiplier: every skill moves towards its ceiling as the IQ grows */
export const smartDef = (d: OpponentDef, iq: number): OpponentDef => {
  const effIq = Math.max(2, iq);
  const k = 1 - 1 / effIq; // 2× → 0.5, 3× → 0.67, 10× → 0.9, 12× → 0.92 of the way to the ceiling
  const toward = (v: number, goal: number) => v + (goal - v) * k;
  return {
    ...d,
    iq,
    react: toward(d.react, 0.985), // reads your attacks with razor-sharp precision
    dodge: toward(d.dodge, 0.86), // actively slips & weaves like a master boxer
    punish: toward(d.punish, 0.98), // instant counter-strikes after slipping, parrying, or blocking
    adapt: d.adapt * (1 + (effIq - 1) * 0.42), // rapidly adapts to any move you repeat
    aggro: toward(d.aggro, 0.92), // relentless offensive pressure
    rest: d.rest / Math.pow(effIq, 0.58), // minimal downtime between offensive flurries
    combo: d.combo + (effIq >= 3 ? 1 : 0) + (effIq >= 10 ? 1 : 0),
    slam: true,
  };
};

export const ULTRA_COLOR = '#ff2a4a';

export const PLAYER_NAME = 'ATLAS';
export const PLAYER_STYLE: RobotStyle = { variant: 'atom', main: 0xc3c9d4, secondary: 0x262a33, accent: 0x1f66ff, glow: 0x3fd8ff };

const LS_HELMET = 'steel-titans-helmet-v1';
const LS_GLOVE = 'steel-titans-glove-v1';
const LS_ARMOR = 'steel-titans-armor-v1';
export const loadArmorSkin = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_ARMOR));
    if (Number.isFinite(v) && v >= 0 && v < ARMOR_SKINS.length) return Math.round(v);
  } catch {
    /* ignore */
  }
  return 0;
};
export const loadHelmetSkin = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_HELMET));
    return Number.isFinite(v) && v >= 0 && v < HELMET_SKINS.length ? Math.round(v) : 0;
  } catch {
    return 0;
  }
};
export const loadGloveSkin = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_GLOVE));
    return Number.isFinite(v) && v >= 0 && v < GLOVE_SKINS.length ? Math.round(v) : 0;
  } catch {
    return 0;
  }
};

export const OPPONENTS: OpponentDef[] = [
  { name: 'SCRAP-9', title: 'Si Tukang Pukul Rongsokan', hp: 95, speed: 3.3, dmg: 0.88, react: 0.68, dodge: 0.52, punish: 0.72, adapt: 0.95, aggro: 0.74, rest: 0.68, tscale: 1.16, scale: 1.0, combo: 3, slam: true, color: '#ff8a2a', style: { main: 0x8a6a4a, secondary: 0x4b4038, accent: 0xff8a2a, glow: 0xff7a1a } },
  { name: 'CRIMSON FANG', title: 'Predator Ring Bawah Tanah', hp: 115, speed: 3.55, dmg: 0.98, react: 0.78, dodge: 0.62, punish: 0.82, adapt: 1.25, aggro: 0.82, rest: 0.54, tscale: 1.1, scale: 1.1, combo: 4, slam: true, color: '#ff3b3b', style: { main: 0x9c1c22, secondary: 0x2a2d36, accent: 0xe8e8e8, glow: 0xff2a2a } },
  { name: 'VOLT TITAN', title: 'Raksasa Bertenaga Petir', hp: 135, speed: 3.75, dmg: 1.04, react: 0.84, dodge: 0.66, punish: 0.86, adapt: 1.45, aggro: 0.86, rest: 0.48, tscale: 1.05, scale: 1.2, combo: 4, slam: true, color: '#d6ff2a', style: { main: 0xc2a826, secondary: 0x23262d, accent: 0x111111, glow: 0xd6ff2a } },
  { name: 'OMEGA ZEUS', title: 'Juara Dunia Tak Terkalahkan', hp: 150, speed: 3.95, dmg: 1.08, react: 0.9, dodge: 0.72, punish: 0.92, adapt: 1.7, aggro: 0.9, rest: 0.42, tscale: 1.0, scale: 1.22, combo: 5, slam: true, color: '#c070ff', style: { main: 0x3b2370, secondary: 0x15121f, accent: 0xffc83a, glow: 0xb050ff } },
];

export type Phase = 'menu' | 'walk' | 'intro' | 'fight' | 'ko' | 'matchEnd';
/**
 * RING WALK — the PARKOUR ENTRANCE (≈ 9 s, Enter/Space skips it): every machine comes out of the tunnel with both
 * arms up, STRUTS down the runway playing to the crowd without ever stopping (fist pumps left and right with pyro,
 * a double chest pound, a point at the ring), breaks into a SPRINT, hits the launch wedge at the end of the runway
 * (the runway stops short of the ring: there is a gap), flies over the top rope in a tucked front flip, lands on the
 * canvas in a firm crouch — one fist down — drives up, arms up at his opponent, and backs into his corner.
 * One keyframed track per fighter; the beats:
 *   0 the gate (arms up) · 1 the strut · 2 the sprint (→ the wedge) · 3 the flight · 4 the landing crouch
 *   5 rise + arms up · 6 back to the corner · 7 home
 */
interface WalkTrack {
  f: Fighter;
  from: THREE.Vector2;
  mark: THREE.Vector2; // the end of the strut / the start of the sprint
  take: THREE.Vector2; // the lip of the launch wedge
  land: THREE.Vector2;
  home: THREE.Vector2;
  homeYaw: number;
  t: [number, number, number, number, number, number, number];
  cue: number; // how many of the strut's crowd cues have fired
  landed: boolean;
  raised: boolean;
  apex: boolean;
  inward: THREE.Vector2;
  perp: THREE.Vector2;
}
const WALK_T = 9.4;
const FLIGHT_H = 4.5; // how high the centre of mass rises above the straight line take-off → landing
const COM_H = 3.5; // centre of mass above the feet (× scale): the flip pivots here
/** how far the walkways slide out when the ring is bigger (TEAM MATCH) — see arena.ts setRingScale */
const entryShift = () => (RING_IN / RING_IN_BASE - 1) * 15.5;
/** height of the entrance runway under a point at radius r from the ring centre (see arena.ts buildEntrance) */
const rampY = (r0: number) => {
  const r = r0 - entryShift();
  return r >= 23.5 ? -1.4 : r <= 19.8 ? -0.9 : THREE.MathUtils.lerp(-0.9, -1.4, (r - 19.8) / 3.7);
};
/** per-match fight sheet: [0] = player, [1] = enemy */
export interface MatchStats {
  thrown: [number, number];
  landed: [number, number];
  dmg: [number, number];
  maxCombo: number;
  dodges: number;
  counters: number;
  knockdowns: [number, number];
  time: number;
}
const freshStats = (): MatchStats => ({ thrown: [0, 0], landed: [0, 0], dmg: [0, 0], maxCombo: 0, dodges: 0, counters: 0, knockdowns: [0, 0], time: 0 });
export interface HudState {
  phase: Phase;
  round: number;
  timeLeft: number;
  pHp: number;
  pMax: number;
  eHp: number;
  eMax: number;
  stam: number;
  meter: number;
  combo: number;
  wins: [number, number];
  eName: string;
  eTitle: string;
  eColor: string;
  banner: { id: number; text: string; sub: string; kind: string } | null;
  paused: boolean;
  result: 'win' | 'lose' | null;
  oppIndex: number;
  ultra: boolean;
  fw: number; // footwork speed multiplier (1, 1.5, 2, 3)
  cam: number; // camera preset index (see CAM_MODES)
  iq: number; // enemy AI IQ multiplier (1, 2, 3, 10, STRATEGIST)
  ePlan: string; // the strategist's current game plan, '' when not in strategist mode
  roll: number; // Dempsey-roll charge 0..1
  ippo: boolean; // the peek-a-boo stance is active
  hand: number; // which fist the next strike comes out of (0 = left, 1 = right)
  handFlash: number; // > 0 while the "hand switched" flash is on screen
  parry: boolean; // the counter stance's catch window is open right now
  parryCd: number; // > 0 while the counter stance is still on cooldown
  aim: number; // the point of impact the NEXT punch is aimed at (0 = head, 1 = body)
  aimMode: number; // the target mode the player chose: 0 = head, 1 = body, 2 = REMIX (mixed head/body combinations)
  aimFlash: number; // > 0 while the "target switched" flash is on screen
  rage?: boolean; // Rage Mode (G): hyper-aggressive fighting speed & power
  rageFlash?: number; // > 0 while the Rage Mode badge flashes on screen
  heroPose?: HeroPose;
  menuCamMode?: 'hero' | 'arena' | 'full';
  helmetSkin?: number;
  gloveSkin?: number;
  armorSkin?: number;
  /** the live frame rate of the last half-second window */
  fps?: number;
  /** the quality rung the picture is running on right now ('MAKSIMAL' … 'RINGAN') */
  gfx?: string;
  /** the graphics mode the player pinned ('auto' = the 60 fps governor) */
  gfxMode?: GfxMode;
  /** the manual exposure step (0.85 … 1.25) */
  bright?: number;
  stats?: MatchStats; // the fight sheet shown on the result screen
  /** TEAM MATCH (2v2): the second robot on each side */
  team?: {
    ally: { name: string; hp: number; max: number; color: string; ko: boolean };
    enemy2: { name: string; hp: number; max: number; color: string; ko: boolean };
  } | null;
}

type MoveId = 'jab' | 'cross' | 'hook' | 'upper' | 'slam' | 'bolt' | 'windmill' | 'grab' | 'counter';
const isOD = (id: MoveId) => id === 'slam' || id === 'bolt' || id === 'windmill'; // overdrive moves
type Ease = 'in' | 'out' | 'io';
interface Key {
  t: number;
  p: Pose;
  twist: number;
  lean: number;
  lunge: number;
  dip: number;
  e: Ease;
}
interface Move {
  id: MoveId;
  arm: 0 | 1 | 2;
  dur: number;
  strikeAt: number;
  impact: number;
  cancel: number;
  dmg: number;
  reach: number;
  cost: number;
  stun: number;
  knock: number;
  blockMul: number;
  power: number;
  hitY: number;
  step: number;
  kind: 'front' | 'side' | 'up';
  keys: Key[];
}

function createCinematicVignetteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Smooth cinematic radial vignette:
  // Center is translucent dark blue-black so background arena fight is clearly visible,
  // then seamlessly falls off to deep atmospheric black at outer edges.
  const grad = ctx.createRadialGradient(512, 512, 140, 512, 512, 512);
  grad.addColorStop(0, 'rgba(2, 5, 14, 0.52)');
  grad.addColorStop(0.42, 'rgba(2, 5, 14, 0.68)');
  grad.addColorStop(0.72, 'rgba(1, 3, 10, 0.90)');
  grad.addColorStop(1, 'rgba(0, 1, 5, 0.99)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const GUARD: Pose = { sx: -0.72, sy: -0.5, sz: 0.04, ex: -2.0 };
const BLOCK: Pose = { sx: -1.0, sy: -0.75, sz: 0, ex: -2.2 };
const STAGGER: Pose = { sx: -0.25, sy: -0.2, sz: 0.55, ex: -0.7 };
const LIMP: Pose = { sx: 0.1, sy: 0, sz: 0.35, ex: -0.25 };
const TAUNT: Pose = { sx: -0.3, sy: -0.1, sz: 1.3, ex: -2.3 };
const VICTORY: Pose = { sx: -3.0, sy: 0, sz: 0.5, ex: -0.3 };

const k = (t: number, p: Pose, twist = 0, lean = 0.08, lunge = 0, dip = 0.12, e: Ease = 'io'): Key => ({ t, p, twist, lean, lunge, dip, e });

const P = (sx: number, sy: number, sz: number, ex: number): Pose => ({ sx, sy, sz, ex });
/** sprint arm pose: elbows bent ~100°, fists driving beside the ribs (the robot adds the pumping swing on top) */
const RUNARM = P(-0.45, -0.2, 0.06, -1.75);

const MOVES: Record<MoveId, Move> = {
  // Every strike is built as: COIL (pull the whole body back the other way) → RELEASE (whip everything through
  // the punch at once) → OVERSHOOT (the rotation keeps going past the target) → SNAP BACK (a short recoil pull)
  // → settle to guard. The overshoot + recoil pair is what makes a punch read as heavy on camera.
  jab: {
    id: 'jab', arm: 0, dur: 0.56, strikeAt: 0.07, impact: 0.15, cancel: 0.28, dmg: 6, reach: 4.1, cost: 5, stun: 0.5, knock: 3.5, blockMul: 0.15, power: 0.3, hitY: 4.5, step: 1.1, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.07, P(-0.34, -0.02, 0.14, -2.7), 0.42, -0.1, -0.34, 0.26, 'out'), // coil back
      k(0.15, P(-1.68, -0.36, 0, -0.02), -0.78, 0.4, 0.98, 0.06, 'in'), // full extension
      k(0.21, P(-1.74, -0.36, 0, 0.02), -0.88, 0.44, 1.08, 0.04), // overshoot whip
      k(0.34, P(-1.15, -0.3, 0.12, -0.75), -0.15, 0.18, 0.35, 0.13), // snap back off the target
      k(0.56, GUARD),
    ],
  },
  cross: {
    id: 'cross', arm: 1, dur: 0.86, strikeAt: 0.17, impact: 0.28, cancel: 0.46, dmg: 11, reach: 4.2, cost: 10, stun: 0.64, knock: 6, blockMul: 0.15, power: 0.55, hitY: 4.2, step: 1.9, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.17, P(-0.08, 0.85, 0.42, -2.6), -1.15, -0.26, -0.6, 0.36, 'out'), // shoulder loaded all the way back
      k(0.28, P(-1.66, -0.95, 0, -0.02), 1.3, 0.5, 1.35, 0.06, 'in'), // the cross lands with the hips
      k(0.36, P(-1.72, -0.9, 0, 0.02), 1.46, 0.54, 1.5, 0.04), // the rotation keeps travelling
      k(0.54, P(-1.1, -0.5, 0.14, -0.95), 0.28, 0.2, 0.45, 0.15), // recoil
      k(0.86, GUARD),
    ],
  },
  hook: {
    id: 'hook', arm: 0, dur: 0.92, strikeAt: 0.2, impact: 0.33, cancel: 0.5, dmg: 13, reach: 3.9, cost: 12, stun: 0.66, knock: 7, blockMul: 0.15, power: 0.62, hitY: 4.5, step: 1.4, kind: 'side',
    keys: [
      k(0, GUARD),
      k(0.2, P(-0.25, 1.05, 1.5, -1.7), 1.15, -0.05, -0.5, 0.34, 'out'), // wind the arc up wide
      k(0.33, P(-0.32, -1.35, 1.5, -1.3), -1.5, 0.2, 0.95, 0.08, 'in'), // sweep it through the target
      k(0.42, P(-0.36, -1.5, 1.45, -1.2), -1.7, 0.24, 1.05, 0.06), // follow-through, still turning
      k(0.6, P(-0.62, -0.7, 0.8, -1.7), -0.45, 0.12, 0.3, 0.17),
      k(0.92, GUARD),
    ],
  },
  upper: {
    id: 'upper', arm: 1, dur: 0.95, strikeAt: 0.2, impact: 0.33, cancel: 0.52, dmg: 15, reach: 3.7, cost: 14, stun: 0.8, knock: 8, blockMul: 0.2, power: 0.72, hitY: 4.8, step: 1.2, kind: 'up',
    keys: [
      k(0, GUARD),
      k(0.2, P(-0.02, 0.2, 0.3, -0.5), -0.78, 0.62, -0.42, 0.82, 'out'), // sink into the legs
      k(0.33, P(-2.18, -0.55, 0, -0.9), 0.98, -0.36, 1.02, -0.02, 'in'), // explode up through the jaw
      k(0.4, P(-2.34, -0.5, 0, -0.72), 1.08, -0.42, 1.08, -0.06), // torso whips up after it
      k(0.56, P(-1.45, -0.4, 0.12, -1.3), 0.32, -0.04, 0.32, 0.2),
      k(0.95, GUARD),
    ],
  },
  slam: {
    id: 'slam', arm: 2, dur: 1.5, strikeAt: 0.52, impact: 0.64, cancel: 99, dmg: 34, reach: 4.4, cost: 0, stun: 1.2, knock: 12, blockMul: 0.45, power: 1, hitY: 4.2, step: 2.4, kind: 'up',
    keys: [
      k(0, GUARD),
      k(0.34, P(-2.95, -0.1, 0.3, -0.5), 0, -0.3, -0.1, 0.0, 'out'),
      k(0.52, P(-3.1, -0.1, 0.35, -0.4), 0, -0.6, -0.4, 0.0, 'io'),
      k(0.64, P(-1.4, -0.15, 0.1, -0.12), 0, 0.7, 1.1, 0.55, 'in'),
      k(1.0, P(-1.4, -0.15, 0.1, -0.12), 0, 0.7, 1.1, 0.55),
      k(1.5, GUARD),
    ],
  },
  // OVERDRIVE (straight): deep coil, then a huge lunging straight that crosses the whole gap
  bolt: {
    id: 'bolt', arm: 1, dur: 1.3, strikeAt: 0.44, impact: 0.54, cancel: 99, dmg: 32, reach: 5.2, cost: 0, stun: 1.2, knock: 12, blockMul: 0.5, power: 1, hitY: 4.1, step: 3.6, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.22, P(-0.1, 0.95, 0.42, -2.65), -1.3, -0.28, -0.6, 0.5, 'out'),
      k(0.42, P(-0.06, 1.02, 0.46, -2.72), -1.42, -0.32, -0.72, 0.56, 'io'),
      k(0.54, P(-1.66, -0.92, 0, -0.02), 1.38, 0.56, 1.55, 0.1, 'in'),
      k(0.9, P(-1.66, -0.92, 0, -0.02), 1.38, 0.56, 1.55, 0.1),
      k(1.3, GUARD),
    ],
  },
  // FREESTYLE OVERDRIVE (windmill): spins the arms in full 360° circles (muter-muter tangan) with blazing sparks,
  // then unleashes a devastating lunging haymaker smash! Both Player and Enemy can unleash it.
  windmill: {
    id: 'windmill', arm: 1, dur: 1.48, strikeAt: 0.56, impact: 0.68, cancel: 99, dmg: 35, reach: 5.1, cost: 0, stun: 1.25, knock: 13.5, blockMul: 0.5, power: 1, hitY: 4.3, step: 3.5, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.16, P(-1.8, 0.35, 0.55, -0.35), -0.75, -0.18, -0.35, 0.24, 'io'),
      k(0.34, P(-3.1, 0.45, 0.6, -0.3), -1.15, -0.25, -0.52, 0.38, 'io'),
      k(0.54, P(-0.08, 1.05, 0.48, -2.5), -1.48, -0.34, -0.75, 0.56, 'out'),
      k(0.68, P(-1.66, -0.92, 0, -0.02), 1.46, 0.58, 1.62, 0.08, 'in'),
      k(1.02, P(-1.66, -0.92, 0, -0.02), 1.46, 0.58, 1.62, 0.08),
      k(1.48, GUARD),
    ],
  },
  grab: {
    id: 'grab', arm: 2, dur: 1.25, strikeAt: 0.1, impact: 0.3, cancel: 99, dmg: 20, reach: 3.5, cost: 14, stun: 1, knock: 8, blockMul: 1, power: 0.85, hitY: 3.6, step: 1.4, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.1, P(-1.35, 0.35, 0.75, -0.55), 0, 0.1, -0.2, 0.3, 'out'),
      k(0.22, P(-1.55, -0.62, 0.08, -0.45), 0, 0.4, 0.6, 0.15, 'in'),
      k(0.34, P(-2.85, -0.4, 0.2, -0.3), 0, -0.25, 0.3, 0.0, 'out'),
      k(0.72, P(-2.9, -0.4, 0.2, -0.3), 0, -0.3, 0.2, 0.0),
      k(0.86, P(-0.9, -0.2, 0.1, -0.45), 0, 0.75, 0.9, 0.5, 'in'),
      k(1.25, GUARD),
    ],
  },
  // COUNTER STRAIGHT (L) — THE OVERDRIVE'S LITTLE BROTHER, AT EXACTLY HALF ITS POWER.
  // Same punch, same line: the wind-up loads the shoulder all the way back and the fist crosses on the very key
  // pose the Overdrive (see `bolt`) throws, so it reads as an Overdrive straight — then the load drops off a cliff
  // (a deep fold into the coil, a lunge over a shorter distance) and it arrives with HALF the Overdrive's punch:
  // 16 vs 32 damage, power 0.5, half the knockback, half the stun, half the chip on a guard. `striketest.mjs`
  // asserts all five of those against `bolt` itself, so "half the Overdrive" can never quietly drift.
  // It comes straight out of your own punches (H/J/K → L): a landed hit lets the next move cancel early, so the
  // counter is the natural combo ender. It is a normal strike and NOT unblockable — blocking, sidestepping and a
  // timed dodge all work on it, and the AI answers it the way it answers the Overdrive: it steps off the line.
  // The first frames are still a read: an incoming strike that lands inside the (short) parry window is CAUGHT —
  // then the straight fires instantly with the 1.6× COUNTER bonus.
  counter: {
    id: 'counter', arm: 1, dur: 0.95, strikeAt: 0.3, impact: 0.4, cancel: 0.6, dmg: 16, reach: 4.6, cost: 10, stun: 0.6, knock: 6, blockMul: 0.25, power: 0.5, hitY: 4.3, step: 2.6, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.08, P(-0.44, -0.2, 0.42, -2.5), -0.5, -0.1, -0.28, 0.28, 'out'), // hands up, weight back (the catch)
      k(0.18, P(-0.3, 0.92, 0.42, -2.55), -1.0, -0.22, -0.55, 0.42, 'io'), // load the straight all the way back
      k(0.3, P(-1.66, -0.92, 0, -0.02), 1.3, 0.54, 1.5, 0.09, 'in'), // the long straight (the Overdrive's line EXACTLY)
      // ...and then it STOPS there: the Overdrive's rotation keeps travelling past the target (1.42 / 1.56), the
      // counter's dies on the fist — half the punch has to look like half the punch, not a bigger one.
      k(0.42, P(-1.66, -0.9, 0, 0.0), 1.0, 0.42, 1.05, 0.1),
      k(0.62, P(-1.1, -0.5, 0.14, -0.95), 0.3, 0.2, 0.45, 0.15), // recoil
      k(0.95, GUARD),
    ],
  },
};

// width = lateral half-width of the strike (sidestep physics). launch = pops opponent into the air.
const MOVE_EXTRA: Record<MoveId, { width: number; launch: boolean; unblock: boolean }> = {
  jab: { width: 1.5, launch: false, unblock: false },
  cross: { width: 1.6, launch: false, unblock: false },
  hook: { width: 3.6, launch: false, unblock: false },
  upper: { width: 2.2, launch: true, unblock: false },
  slam: { width: 5.0, launch: true, unblock: false },
  bolt: { width: 1.55, launch: true, unblock: false },
  windmill: { width: 2.2, launch: true, unblock: true },
  grab: { width: 2.4, launch: true, unblock: true },
  counter: { width: 1.7, launch: false, unblock: false },
};
const GRAVITY = 34;

/**
 * STABILITY (poise). A giant steel boxer does not fall over from a few ordinary punches: he eats them, staggers,
 * and keeps his feet. Every clean hit drains this meter; only when it is empty does a normal punch put you down
 * (a "KNOCKDOWN"). It refills quickly once the flurry stops, so scattered hits never drop you — only a sustained
 * beating does. Designated launchers (uppercut, throw, Overdrive) still launch regardless, by design.
 */
const POISE_MAX = 125; // ~6–7 clean hits in a row before a knockdown (it used to be ~5)
const POISE_REGEN = 38; // per second
const POISE_DELAY = 1.0; // seconds of no damage before it starts refilling
const poiseCost = (power: number) => 8 + power * 22; // jab ≈ 15, cross ≈ 20, hook ≈ 22 → ~5 clean hits in a row

/**
 * ENEMY ATTACK WARNING ("tell"). The moment the enemy commits to a move it freezes in its wind-up pose for this long
 * (seconds, before difficulty scaling) and the attack indicator pops up over its head. Press DODGE any time between
 * the start of the warning and the moment the strike lands (≈ 0.6–1.0 s in total) and the attack cannot hit you.
 * Unblockable / heavy moves (grab, Overdrive) get the longest warning.
 */
const TELL: Record<MoveId, number> = { jab: 0.48, cross: 0.55, hook: 0.6, upper: 0.62, grab: 0.68, slam: 0.9, bolt: 0.9, windmill: 0.92, counter: 0.5 };
const TELL_CHAIN = 0.2; // follow-up hits in a combo or counter flow fast while staying readable to the human eye
const UNBLOCKABLE: MoveId[] = ['grab', 'slam', 'bolt', 'windmill']; // shown with a RED indicator, like God of War's unblockable attacks
// how much a strike re-aims at the opponent's *current* position when it launches (1 = homing)
const TRACK: Record<MoveId, number> = { jab: 0.35, cross: 0.42, hook: 0.9, upper: 0.55, slam: 0.5, bolt: 0.25, windmill: 0.42, grab: 0.52, counter: 0.45 };

/**
 * HOW THE AI MEETS A MOVE. Blocking is the right answer to most punches, but anything that comes down a STRAIGHT
 * LINE — the Overdrive and the counter straight that copies it — has to be stepped off instead: that is what keeps
 * them dodgeable, and it is why the counter is a fair punch and not a free hit. Pure and exported so `striketest`
 * can assert it (the AI may never simply stand there and guard it) instead of trusting the reader.
 */
export const defenceAgainst = (id: MoveId, dodge: number): 'block' | 'side' | 'back' => {
  if (id === 'grab') return Math.random() < 0.5 ? 'back' : 'side'; // blocking is useless vs throws
  if (id === 'slam') return Math.random() < 0.7 ? 'back' : 'side';
  if (id === 'bolt') return Math.random() < 0.65 ? 'side' : 'back'; // a straight: sidestepping it is the answer
  if (id === 'windmill') return Math.random() < 0.65 ? 'side' : 'back';
  if (id === 'counter') return Math.random() < 0.7 ? 'side' : 'back'; // the counter straight is the same punch
  if (id === 'hook') return Math.random() < dodge ? 'back' : 'block'; // wide sweep: a sidestep cannot clear it
  if (id === 'upper') return Math.random() < dodge * 0.8 ? 'back' : 'block';
  return Math.random() < dodge ? 'side' : 'block'; // straights are sidestepped
};

/**
 * COUNTER STRAIGHT (L). L is a punch — a lunging straight on the Overdrive's line at half its power, made to be
 * chained out of your own jab/cross/hook. On top of that, the first frames are a short read: a strike that reaches
 * the player inside this window is *caught* — no damage, the attacker is knocked out of the swing, time slows down
 * and the straight fires immediately with the 1.6× COUNTER bonus. The window is short because the move is now a
 * real strike that has to come out fast; you have to already be throwing it when the punch arrives.
 */
const PARRY_ACTIVE = 0.3; // = the move's strikeAt: the whole wind-up is the catch window

/**
 * WHERE YOU AIM. A tap on SPACE (or T) switches the point of impact between the HEAD and the BODY, and every
 * punch then follows: the pose drops onto the target, the sparks / flash / shock ring happen AT that point of
 * impact, and the damage profile changes with it.
 *   HEAD — more damage, more stun (the fast KO road)
 *   BODY — less damage, but it drains stamina hard and rocks stability (breaks guards, sets up knockdowns)
 */
const AIM_HEAD = 0;
const AIM_BODY = 1;
const AIM_MIX = 2; // REMIX: every punch picks its own target — head and body are mixed up like a real combination
const AIM_DROP = 1.15; // how much lower the impact point sits when the body is the target (robot units)
const AIM_HEAD_LIFT = 0.14; // straights/hooks pitch this much higher so the fist actually travels at the optics
const AIM_DMG = [1.12, 0.82];
const AIM_STUN = [1.06, 0.78];
const AIM_POISE = [1.0, 1.5];
const AIM_STAM = [1.0, 1.9]; // guard-chip stamina multiplier — body shots exhaust a guard
const AIM_DRAIN = [0.0, 1.2]; // stamina torn off on a clean hit (body only, wear the opponent down)
const AIM_KNOCK = [1.06, 0.78]; // body shots push less: they sit you down by draining you, not by shoving you

/**
 * DODGE ADVANTAGE — the "whoever dodges first gets the hit" rule. A dodge (SPACE) can be cancelled straight into a
 * punch, and for a short window after a dodge your next strike comes out faster and lands harder. The fighter who
 * reads the exchange first owns the opening, while a dodge that leads nowhere just costs stamina.
 */
const DODGE_WIN = 0.5; // how long after a dodge the advantage stays alive
const DODGE_WIN_SPD = 1.18; // the next strike plays faster out of a dodge while staying readable
const DODGE_WIN_DMG = 1.22; // ...and lands this much harder
const DODGE_CANCEL_AT = 0.6; // you may cancel out of a dodge once this much of it has played (its i-frames are spent)

/**
 * CINEMATIC CAMERAS. The fight camera is a broadcast operator; these beats are the director stepping in to make
 * sure the big moments actually read on screen.
 *   od  — a short low hero angle as the Overdrive charges (then it hands back before the strike)
 *   hit — a punch-in on the point of impact the instant an Overdrive lands
 *   rip — a long four-angle shot for a decapitation: the cut, the head in flight, the sparking stump, then the
 *         fall back to the aftermath
 * Beats run on WORLD time, so when the game slows down for the impact the camera slows down with it.
 */
type CineKind = 'od' | 'hit' | 'rip';
const CINE_DUR: Record<CineKind, number> = { od: 0.8, hit: 0.55, rip: RIP_DUR };

/** STAMINA: a fight is about reading, not about running dry — strikes cost 40% less and everything recovers faster */
const STAM_SCALE = 0.6;
const REGEN_IDLE = 30; // per second, standing
const REGEN_BLOCK = 9; // per second, behind the guard
const REGEN_AI = 32; // per second, for the opponent (supports relentless offense + active slip defense)

// ------------------------------------------------------------------ helpers
const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ sx: lerp(a.sx, b.sx, t), sy: lerp(a.sy, b.sy, t), sz: lerp(a.sz, b.sz, t), ex: lerp(a.ex, b.ex, t) });

const applyEase = (u: number, e: Ease) => (e === 'in' ? Math.pow(u, 2.6) : e === 'out' ? 1 - Math.pow(1 - u, 2.4) : smooth(u));

function sampleKeys(keys: Key[], t: number): Key {
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t < b.t) {
      const u = applyEase((t - a.t) / (b.t - a.t), b.e);
      return { t, e: b.e, p: lerpPose(a.p, b.p, u), twist: lerp(a.twist, b.twist, u), lean: lerp(a.lean, b.lean, u), lunge: lerp(a.lunge, b.lunge, u), dip: lerp(a.dip, b.dip, u) };
    }
  }
  return keys[keys.length - 1];
}

type FState = 'idle' | 'attack' | 'stagger' | 'ko' | 'air' | 'down';

class Fighter {
  pos = new THREE.Vector2();
  vel = new THREE.Vector2();
  kb = new THREE.Vector2();
  wish = new THREE.Vector2();
  yaw = 0;
  state: FState = 'idle';
  move: Move | null = null;
  moveT = 0;
  impacted = false;
  whooshed = false;
  queued: MoveId | null = null;
  queuedT = 0;
  blocking = false;
  stunT = 0;
  stunImmune = 0;
  dodgeT = 0;
  dodgeCd = 0;
  dodgeDir = new THREE.Vector2();
  invuln = 0;
  counterT = 0;
  hp: number;
  stam = 100;
  meter = 0;
  hit = 0;
  hitSign = 1;
  hitUp = 0;
  // THE GEOMETRY OF THE LAST HIT, in the defender's own frame — the reaction is built from these (see resolveHit)
  hitF = -1; // + = the force drives him forward, minus = he is knocked backwards
  hitL = 0; // + = the force drives him across to his own left
  hitPt = 0.5; // 1 = the fist landed on the head, 0 = it landed on the chest plate
  hitSpin = 0; // yaw torque (an angled / hooking shot twists him round)
  hitV = 0; // smoothed copies used for the visuals
  hitUpV = 0;
  softT = 0; // time left in the 'easing back to normal' window
  ropeIn = [false, false];
  // ---- ROPE PHYSICS (the ropes are part of the fight: they stretch, hold him up, and throw him back)
  ropeDepth = 0; // how far the ropes are pushed out by him this frame (0 = not touching)
  ropeNx = 0; // outward normal of the rope he is against
  ropeNz = 0;
  ropeW = 0; // smoothed "on the ropes" weight for the pose (fast in, slow out)
  ropeBack = 1; // smoothed: +1 = the ropes are at his back (draped over them), -1 = he ran into them chest first
  slingT = 0; // ROPE CATAPULT: time until the stretched ropes fling him back into the ring
  slingV = 0; // speed of that fling
  slingX = 0; // its direction (unit, towards the ring)
  slingZ = 0;
  fallS = new Spring();
  flash = 0;
  dash = new THREE.Vector2();
  attackDir = new THREE.Vector2(0, 1);
  y = 0;
  vy = 0;
  bounced = false;
  airSpin = 0; // yaw rate while knocked flying (a hook spins him; decays in the air, dies on the canvas)
  juggle = 0;
  comboTaken = 0;
  hitConfirmed = false;
  moveSeq = 0;
  downT = 0;
  wallT = 0;
  wallCd = 0;
  wakeT = 0;
  tilt = 0;
  tiltZ = 0; // sideways lay-over in the air (+ = over his left shoulder)
  tiltLand = 0; // the lean he hit the canvas with (traded for the staged lie as the collapse plays)
  tiltZLand = 0;
  dodgeDur = 0.34;
  dodgeSpeed = 11;
  dodgeInv = true;
  dodgeKind: 'evade' | 'fwd' | 'back' | 'side' = 'evade';
  trails: Trail[] = [];
  fallT = 0;
  animT = Math.random() * 10;
  glowBoost = 0;
  mode: 'normal' | 'taunt' | 'victory' = 'normal';
  tauntT = 0; // FREESTYLE: time left of the show-off
  tauntDur = 0;
  tauntStyle = 0; // index into the freestyle book (poses.ts) — M N B U I Y O pick one each
  // GET-UP: the staged rise off the canvas (see riseStages in poses.ts)
  riseU = 0; // 0 = flat on the floor, 1 = back on his feet
  riseDir = 1; // the shoulder he rolls onto and pushes off
  riseOut = 0; // 1 → 0 over the beat after he stands (the loose settle)
  riseSteps = 0; // how many of the two re-plants have fired
  downDur = 2.0; // total time on the floor, get-up included
  poise = POISE_MAX; // stability: how much punishment is left before a normal punch can knock you down
  poiseT = 0; // delay before the poise starts refilling
  poiseMax = POISE_MAX;
  hand: 0 | 1 = 0; // PLAYER: which fist the next strike is thrown with (0 = left, 1 = right) — set by the last step
  handT = 0; // how long the "hand switched" flash stays up (HUD)
  counterCd = 0; // PLAYER: cooldown before the counter straight can be thrown again (it is a hard puncher, so no spam)
  aim: 0 | 1 = 0; // 0 = the HEAD is the target, 1 = the BODY — the punch being thrown aims there (pose, impact point, damage)
  aimMode: 0 | 1 | 2 = 0; // PLAYER: the chosen target mode; 2 = REMIX — the target is re-picked for every punch
  mixN = 0; // REMIX: punches thrown so far in the current combination (drives the head/body pattern)
  aimT = 0; // how long the "target switched" flash stays up (HUD)
  dodgeWinT = 0; // DODGE ADVANTAGE: time left in which the next strike is faster & heavier (after a dodge)
  atkSpd = 1; // duration multiplier of the move being played (> 1 = thrown faster, out of a dodge)
  winStrike = false; // the move currently playing is a dodge-advantage strike
  rage = false; // RAGE MODE (G): hyper-aggressive fighting speed, movement, and heavy knockback
  rageFlash = 0; // > 0 while the Rage Mode badge flashes on HUD
  strikeVar = 0; // 0..3 biomechanical punch variation index so spam never looks monotonous
  spamCount = 0; // consecutive rapid attacks counter for natural flow & rhythm
  lastAtkAt = -10; // animT of previous attack
  aliSign = 1; // alternating weave direction for Muhammad Ali pendulum dodges
  dodgeTail = 0; // smooth post-dodge follow-through timer so springs & poses never snap at dodge end
  decapitated = false; // HEAD RIP: this robot is fighting (or lying) without its head
  // ---- IMPACT FEEDBACK (attacker side): the fist RECOILS off a solid hit — the shock travels back up the arm
  recoilT = 0; // time left in the recoil
  recoilTot = 0.18;
  recoilArm: 0 | 1 | 2 = 1;
  recoilAmt = 0;
  // ---- IMPACT FEEDBACK (defender side): the wound keeps dripping embers for a moment after a heavy blow
  emberT = 0;
  emberP = new THREE.Vector3();
  emberLocal = new THREE.Vector3(); // the wound in the defender's own frame, so it travels with him
  skidAcc = 0; // dust accumulator while his feet are skidding under a knockback
  arms: Pose[] = [{ ...GUARD }, { ...GUARD }];
  twist = 0;
  lean = 0.08;
  lunge = 0;
  dip = 0.12;
  roll = 0;
  speed = 0;
  sprinting = false; // holding a sprint (drains stamina)
  ippo = false; // PEEK-A-BOO stance (hold E)
  rollCharge = 0; // DEMPSEY ROLL charge 0..1 (builds while weaving)
  ippoStrike = false; // the current punch is a charged Dempsey punch
  strikeCharge = 0; // how much charge that punch carries
  slipCd = 0; // short cooldown between two slips
  tellT = 0; // ENEMY wind-up warning left (the attack indicator is on screen while this runs)
  tellTotal = 0;
  dodgeFor = -1; // PLAYER: the enemy attack (moveSeq) this dodge was timed against → it cannot hit
  parryFor = -1; // PLAYER: the enemy attack (moveSeq) this L counter was timed against → caught & countered!
  weavePh = 0; // phase of the weaving animation
  swagger = 0; // RING WALK strut progress: −1..0 raising the arms at the gate, 0..1 down the runway, 1..2 fading into the sprint
  headYaw = 0; // extra head turn requested by the pose layer (the strut plays to the stands)
  pkPre = 0; // RING WALK (parkour entrance): 1 in the loaded crouch just before take-off
  pkTuck = 0; // RING WALK (parkour entrance): 1 while tucked in the flip
  pkLand = 0; // RING WALK: 1 in the landing crouch
  flip = 0; // RING WALK: pitch of the whole body (the front flip), radians
  runStrike = false; // the current punch was thrown at full run → heavier, longer, launches
  yawRate = 0;
  prevV = new THREE.Vector2();
  acc = new THREE.Vector2();
  armS: Spring[][] = [0, 1].map(() => [new Spring(), new Spring(), new Spring(), new Spring()]);
  bodyS = { twist: new Spring(), lean: new Spring(0.08), lunge: new Spring(), dip: new Spring(0.12), roll: new Spring() };

  team: 0 | 1; // 0 = the player's corner, 1 = the opposition (TEAM MATCH puts two robots in each)
  constructor(
    public robot: Robot,
    public isPlayer: boolean,
    public scale: number,
    public maxHp: number,
    public dmgMul: number,
    public tscale: number,
  ) {
    this.hp = maxHp;
    this.team = isPlayer ? 0 : 1;
    this.resetSprings();
  }

  resetSprings() {
    for (let i = 0; i < 2; i++) {
      const g = [GUARD.sx, GUARD.sy, GUARD.sz, GUARD.ex];
      this.armS[i].forEach((sp, k) => sp.set(g[k]));
    }
    this.bodyS.twist.set(0);
    this.bodyS.lean.set(0.08);
    this.bodyS.lunge.set(0);
    this.bodyS.dip.set(0.12);
    this.bodyS.roll.set(0);
    this.yawRate = 0;
    this.sprinting = false;
    this.runStrike = false;
    this.ippo = false;
    this.rollCharge = 0;
    this.ippoStrike = false;
    this.strikeCharge = 0;
    this.slipCd = 0;
    this.tellT = 0;
    this.tellTotal = 0;
    this.dodgeFor = -1;
    this.parryFor = -1;
    this.tauntT = 0;
    this.tauntDur = 0;
    this.tauntStyle = 0;
    this.swagger = 0;
    this.headYaw = 0;
    this.pkPre = 0;
    this.pkTuck = 0;
    this.pkLand = 0;
    this.flip = 0;
    this.riseU = 0;
    this.riseDir = 1;
    this.riseOut = 0;
    this.riseSteps = 0;
    this.downDur = 1.8;
    this.poiseMax = POISE_MAX * (this.isPlayer ? 1.25 : 1); // you are a little sturdier than the opponents
    this.poise = this.poiseMax;
    this.poiseT = 0;
    this.weavePh = 0;
    this.fallS.set(0);
    this.hitV = 0;
    this.hitUpV = 0;
    this.softT = 0;
    this.ropeIn = [false, false];
    this.ropeDepth = 0;
    this.ropeW = 0;
    this.ropeBack = 1;
    this.slingT = 0;
    this.slingV = 0;
    this.acc.set(0, 0);
    this.prevV.set(0, 0);
  }

  reset(x: number, z: number, yaw: number) {
    this.pos.set(x, z);
    this.vel.set(0, 0);
    this.kb.set(0, 0);
    this.wish.set(0, 0);
    this.yaw = yaw;
    this.state = 'idle';
    this.move = null;
    this.queued = null;
    this.blocking = false;
    this.stunT = 0;
    this.stunImmune = 0;
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.invuln = 0;
    this.counterT = 0;
    this.hp = this.maxHp;
    this.stam = 100;
    this.meter = 0;
    this.hit = 0;
    this.hitUp = 0;
    this.flash = 0;
    this.dash.set(0, 0);
    this.y = 0;
    this.vy = 0;
    this.bounced = false;
    this.airSpin = 0;
    this.juggle = 0;
    this.comboTaken = 0;
    this.hitConfirmed = false;
    this.downT = 0;
    this.wallT = 0;
    this.wallCd = 0;
    this.wakeT = 0;
    this.tilt = 0;
    this.tiltZ = 0;
    this.tiltLand = 0;
    this.tiltZLand = 0;
    this.fallT = 0;
    this.glowBoost = 0;
    this.mode = 'normal';
    this.handT = 0;
    this.counterCd = 0;
    this.aim = AIM_HEAD;
    this.aimMode = AIM_HEAD;
    this.mixN = 0;
    this.aimT = 0;
    this.dodgeWinT = 0;
    this.atkSpd = 1;
    this.winStrike = false;
    this.rage = false;
    this.rageFlash = 0;
    this.strikeVar = 0;
    this.spamCount = 0;
    this.lastAtkAt = -10;
    this.aliSign = 1;
    this.dodgeTail = 0;
    this.decapitated = false;
    this.arms = [{ ...GUARD }, { ...GUARD }];
    this.twist = 0;
    this.lean = 0.08;
    this.lunge = 0;
    this.dip = 0.12;
    this.roll = 0;
    this.resetSprings();
    this.robot.snapFeet();
  }
}

const RING_IN_BASE = 13.45; // inner face of the ropes at rest (1v1 ring)
const POST_H_BASE = 13.6; // the corner posts (where the ropes are tied off) sit on this square
/**
 * How much a rope can give at a point along it: the full FLEX mid-rope, almost nothing at the posts (the rope is
 * tied off there). `along` is the coordinate along the rope, scaled by the current ring size. Game logic and the
 * drawn rope use the same curve, so a body never ends up beyond the rope it is supposed to be leaning on.
 */
const ropeGive = (along: number) => {
  const u = along / (POST_H_BASE * (RING_IN / RING_IN_BASE));
  return FLEX * THREE.MathUtils.clamp(1 - u * u, 0.06, 1);
};
let RING_IN = RING_IN_BASE;
const BODY_R = 0.9; // how far the back of the chest / upper back sits behind the body centre at top-rope height (per unit of scale) — measured on the rig
const FLEX = 0.95; // how far the ropes can stretch before they hold
const ROPE_K = 105; // rope stiffness
const ROPE_C = 9.5; // rope damping (slightly under-damped → a soft, small rebound)
const TIP_LEN = 6.0; // height of a robot, used for its fall footprint
const RING_BASE = 11.9;
let RING = RING_BASE; // TEAM MATCH grows the ring (see Game.setRingScale)
export const TEAM_RING_SCALE = 1.18; // the 2v2 ring is 18% wider on each axis (the corner pyro towers stay clear)
const PACE = 1.24; // global animation pace: heavier, well-timed, and clearly readable
const RUN_SPEED = 11.2; // sprint speed (walking forward is 5.7)
// PEEK-A-BOO (hold E) movement speeds: slower than walking, but it closes the distance on its own
const IPPO_FWD = 4.6;
const IPPO_SIDE = 3.4;
const IPPO_BACK = 2.6;
const SPRINT_DRAIN = 2.0; // stamina per second while sprinting (it used to be 9, which ended a run after a few seconds)
const WALK_FWD = 5.7;
const WALK_BACK = 4.3;
const WALK_SIDE = 4.9;
const ROUND_TIME = 75;
const INTRO_T = 3.4; // ROUND card → both machines taunt → 3 · 2 · 1 → FIGHT!
const INTRO_TAUNT_AT = 0.45; // when both fighters kick off their pre-fight show-off
const INTRO_COUNT = [0.95, 1.75, 2.55]; // when the 3 · 2 · 1 cards drop

// ------------------------------------------------------------------ THE GRAPHICS LADDER
/**
 * The picture is meant to look like this on purpose, and it is meant to hold 60 every second of the fight. Five
 * rungs, each one giving up exactly one thing — the hall reflection, the MSAA samples, the render scale, the
 * shadow map — so the fall from MAKSIMAL to RINGAN is a soft one and every rung still looks like the same show.
 */
export interface QualityTier {
  key: string;
  name: string;
  /** the glossy floors: 2 = the canvas AND the hall, 1 = the canvas only, 0 = matte */
  mirror: 0 | 1 | 2;
  /** multisample count on the HDR scene target (0 = none — the FXAA in the grade pass still cleans the edges) */
  samples: number;
  /** render scale, multiplied onto the device pixel ratio cap */
  scale: number;
  /** shadow map size for the key light */
  shadow: number;
  /** the cinematic bloom pass on/off... */
  bloom: boolean;
  /** ...and the resolution of its mip chain, as a fraction of the frame */
  bloomScale: number;
}
export const QUALITY_TIERS: QualityTier[] = [
  { key: 'max', name: 'MAKSIMAL', mirror: 2, samples: 4, scale: 1.0, shadow: 2048, bloom: true, bloomScale: 0.5 },
  { key: 'high', name: 'TINGGI', mirror: 2, samples: 2, scale: 1.0, shadow: 2048, bloom: true, bloomScale: 0.5 },
  { key: 'balanced', name: 'SEIMBANG', mirror: 1, samples: 2, scale: 1.0, shadow: 1536, bloom: true, bloomScale: 0.34 },
  { key: 'performance', name: 'KINERJA', mirror: 0, samples: 0, scale: 0.88, shadow: 1024, bloom: true, bloomScale: 0.25 },
  { key: 'lite', name: 'RINGAN', mirror: 0, samples: 0, scale: 0.72, shadow: 1024, bloom: false, bloomScale: 0.25 },
];

export type GfxMode = 'auto' | 'max' | 'balanced' | 'performance';
export const GFX_MODES: { id: GfxMode; name: string; hint: string }[] = [
  { id: 'auto', name: 'OTOMATIS', hint: '60 fps dipegang otomatis' },
  { id: 'max', name: 'MAKSIMAL', hint: 'semua efek, paling indah' },
  { id: 'balanced', name: 'SEIMBANG', hint: 'cantik & ringan' },
  { id: 'performance', name: 'KINERJA', hint: 'paling lancar' },
];
const LS_GFX = 'steel-titans-graphics-v1';
const LS_BRIGHT = 'steel-titans-brightness-v1';
/** the manual exposure steps. 1.0 is the tuned picture; the two either side are for a bright room and a dark one. */
export const BRIGHTNESS_STEPS = [0.85, 0.95, 1.0, 1.12, 1.25] as const;
export const loadBrightness = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_BRIGHT));
    return (BRIGHTNESS_STEPS as readonly number[]).includes(v) ? v : 1.0;
  } catch {
    return 1.0;
  }
};
/** the pinned graphics mode from last time ('auto' = let the governor hold 60 by itself) */
export const loadGfxMode = (): GfxMode => {
  try {
    const v = localStorage.getItem(LS_GFX) as GfxMode | null;
    return v && GFX_MODES.some((m) => m.id === v) ? v : 'auto';
  } catch {
    return 'auto';
  }
};
const gfxTier = (m: GfxMode): number => (m === 'max' ? 0 : m === 'balanced' ? 2 : m === 'performance' ? 3 : 0);

export class Game {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ReturnType<typeof makeGradePass>;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  private arena: Arena;
  private fx: Effects;
  private decap: Decap; // torn-off heads + the live cables left behind
  readonly sfx = new Sfx();
  private onHud: (h: HudState) => void;

  private player!: Fighter;
  private enemy!: Fighter;
  private oppIndex = 0;
  private ultra = loadDifficulty() === 'ultra';
  private fwMul = loadFootwork();
  private camMode = loadCamMode();
  private iq = loadIq(); // enemy AI IQ multiplier (1, 2, 3, 10)
  private helmetSkin = loadHelmetSkin();
  private gloveSkin = loadGloveSkin();
  private armorSkin = loadArmorSkin();
  private def: OpponentDef = OPPONENTS[0];

  private phase: Phase = 'menu';
  private phaseT = 0;
  private introStep = 0; // which pre-fight beat (taunt / 3 / 2 / 1) has already fired
  private round = 1;
  private wins: [number, number] = [0, 0];
  private roundTime = ROUND_TIME;
  private timeUp = false;
  private result: 'win' | 'lose' | null = null;
  private banner: HudState['banner'] = null;
  private bannerT = 0;
  private bannerId = 0;
  private paused = false;

  private keys = new Set<string>();
  private time = 0;
  private timeScale = 1;
  private slowT = 0;
  private slowScale = 1;
  private freeze = 0;
  private frozenFighter: Fighter | null = null;
  private trauma = 0;
  private fovKick = 0;
  private camPush = 0;
  private camBump = 0;
  private camRoll = 0;
  private camImp = new THREE.Vector3();
  private camImpVel = new THREE.Vector3();
  private shakePh = 0;
  private dynOrbit = 0;
  private smoothVelP = new THREE.Vector2();
  private smoothVelE = new THREE.Vector2();
  private fpsEma = 16;
  private fpsT = 0;
  private fps = 60; // the measured frame rate of the last sample window (shown on the HUD)
  private frames = 0; // frames in the window...
  private longFrames = 0; // ...and how many of them missed the 60 Hz beat
  private dprCap = 1.5; // the device pixel ratio this screen is allowed to render at (see bootDprCap)
  private quality = 1.0; // the render scale of the CURRENT tier
  private mirrorsOn = true;
  private hallMirrorOn = true;
  // THE QUALITY LADDER: the frame budget is a locked 60. Each rung (0 = everything on) trades one thing for speed —
  // the floor reflections, the multisample count, the render scale, the shadow map — and the governor climbs back up
  // when the frame time has been solid for a while, never retrying a rung that already failed.
  private qTier = 0;
  private qAuto = true; // false = the player pinned a tier from the graphics menu
  private qMode: GfxMode = 'auto';
  private qTierFailed = -1;
  private qSteady = 0;
  private qCooldown = 0;
  private qWarm = 2.2; // seconds of grace at boot: shader compilation and the first uploads are not the GPU's fault
  // THE AUTO-EXPOSURE: the frame's own brightness drives the grade's exposure, the way a broadcast camera rides its
  // iris. It is deliberately slow (about a second to settle) and its range is small — it cannot rescue a scene that
  // was badly lit, it only keeps a hard-strobing rig, a flash or a bloom surge from blowing the picture out.
  private meter: MeterPass;
  private aeDead = false; // the readback failed on this driver: stop asking for it
  private aeFrames = 0; // frames since the last readback (the GPU is at least a frame behind)
  private aeBuf = new Uint8Array(4);
  private aeKey = 0.28; // display-referred: 0.26 ≈ a normally exposed frame, 0.5 = running hot
  private aeGain = 1;
  private aeHold = 0; // paused while a cinematic flash / white-out is on screen (a strobe is not an exposure)
  private aePause = 0;
  private bright = 1.0; // the manual exposure step from the graphics panel (the auto-exposure never fights it)
  private enemyCache = new Map<number, Fighter>();
  private flashAmt = 0;
  private hype = 0;
  private combo = 0;
  private comboT = 0;
  private stats: MatchStats = freshStats();
  private walk: WalkTrack[] = [];
  private walkPyroT = 0;
  private camPos = new THREE.Vector3(0, 6, 14);
  private camLook = new THREE.Vector3(0, 3, 0);
  private camInit = false;
  private lastHud = 0;
  private raf = 0;
  private last = performance.now();
  private popupLayer: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private warnEl: HTMLDivElement; // God-of-War-style attack indicator (a ring that shrinks onto a button prompt)
  private warnRing: HTMLElement;
  private warnRing2: HTMLElement;
  private warnTag: HTMLElement;
  private warnSeq = -1;
  private warnTotal = 1;
  private warnOn = false;
  private warnKind = '';
  private ro: ResizeObserver;
  private meterReadyShown = false;
  private lastTap: Record<string, number> = {};
  private aimTmp = new THREE.Vector3(); // scratch: the point of impact
  private eyeTmp = new THREE.Vector3(); // scratch: one eye at a time

  // ---------------- cinematic camera state ----------------
  private cine: { kind: CineKind; t: number; dur: number } | null = null;
  private cineFrom = new THREE.Vector3(); // where the lens was when the beat was called
  private cineFromLook = new THREE.Vector3();
  private cineFocus = new THREE.Vector3(); // the point being shot (impact / neck / flying head)
  private cineDir = new THREE.Vector2(0, 1); // the direction the blow was travelling
  private cineFov = 58; // the lens while a beat is running
  private cineFovT = 58; // ...and where it is heading
  private camClose = 0; // 0 = fighters apart, 1 = stood on each other's toes
  private baseFov = 58; // the gameplay lens, breathing with the distance
  private handPh = 0; // phase of the handheld drift
  private runLatch = false; // double-tap W and keep holding → sprint
  private shiftHeld = false; // mirrors KeyboardEvent.shiftKey
  private sprintLock = false; // out of breath: no sprinting until some stamina has recovered
  private lastRoar = 0;
  private runFov = 0;
  private focus = new THREE.Vector3(0, 3.4, 0); // the middle of the fight: judges and TV cameras look at it  // attract-mode state: a brain for each robot and the camera director
  private demoP = { cool: 0.6, strafe: 1, strafeT: 0, blockT: 0 };
  private demoE = { cool: 1.1, strafe: -1, strafeT: 0, blockT: 0 };
  // ---- TEAM MATCH (2v2): your tag partner and the second opponent; `enemy` is always the opponent engaging YOU
  private teamMode = false;
  private ally: Fighter | null = null;
  private enemy2: Fighter | null = null;
  private def2: OpponentDef | null = null;
  private allyName = `${PLAYER_NAME} MK-II`;
  private swapped = false;
  private squadA = { cool: 0.6, strafe: 1, strafeT: 0, blockT: 0 };
  private squadE = { cool: 1.0, strafe: -1, strafeT: 0, blockT: 0 };
  private shot: Shot = nextShot();
  private shotT = 0;
  private shotCut = true;
  private odToggle = Math.random() < 0.5;

  private ai = this.makeAi();

  // Foreground Hero Robot in main menu (standing front view)
  private menuHero: Robot;
  private hangar: Hangar;
  /** the VS screen: the opponent (and the 2v2 partner) standing opposite the hero in the hangar */
  private vs: { idx: number; idx2: number; stage: 'search' | 'found' | 'lock' } | null = null;
  private vsPunch = 0; // the lens punch-in on the reveal / the lock, decays
  private vsFoe: Fighter | null = null;
  private vsFoe2: Fighter | null = null;
  private menuHeroPedestal: THREE.Group;
  private menuHeroSpot: THREE.SpotLight;
  private menuHeroRim: THREE.SpotLight;
  private menuHeroFill: THREE.PointLight;
  private menuScrimPlane: THREE.Mesh;
  private heroPose: HeroPose = 'ready';
  private heroYaw = 0;
  private heroYawTarget = 0;
  private heroMouseX = 0;
  private heroMouseY = 0;
  private menuCamMode: 'hero' | 'arena' | 'full' = 'hero';

  constructor(container: HTMLElement, onHud: (h: HudState) => void) {
    this.container = container;
    this.onHud = onHud;
    this.qMode = loadGfxMode();
    this.qAuto = this.qMode === 'auto';
    this.bright = loadBrightness();

    // anti-aliasing: a light 2× MSAA on the composer's HDR target for the long geometry edges, plus the compact
    // FXAA inside the grade pass for everything the samples miss. The HDR target is where the frame goes through
    // the grade, so the default framebuffer stays single-sampled — no second MSAA resolve every frame.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.dprCap = Game.bootDprCap();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // one map, plain PCF: half the shadow cost of the soft kernel
    // PBR-NEUTRAL TONE MAP: it keeps the saturation and the hue of the lights (ACES washes the reds and the blues
    // out into pastels as they brighten) while still rolling the highlights off softly — the reason the arena can
    // now be pushed much brighter without the picture turning milky.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.38; // metal lives on its reflections — a touch above the old 0.34 without lifting the whole picture

    this.arena = buildArena(this.scene);
    this.hangar = buildHangar(this.scene);
    this.fx = new Effects(this.scene);
    this.decap = new Decap(this.scene);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    // the first rung is chosen from the hardware (or from the mode the player pinned), so a weak GPU never has to
    // eat a few seconds of stutter before the governor has worked out how to save it
    this.applyTier(this.qAuto ? this.bootTier() : gfxTier(this.qMode), true);
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.tierCfg().samples, depthBuffer: true, stencilBuffer: false });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // CINEMATIC BLOOM — HIGHLIGHT-ONLY. The threshold sits well above diffuse white in the linear HDR buffer, so
    // the canvas, the steel and the crowd stay exactly as lit as they were and only the things that are genuinely
    // over-bright (a lamp lens, an LED strip, a jumbotron, a hot spark) bleed a soft glow into the dark of the
    // hall. That is the whole trick: the arena is not brighter, the LIGHTS are.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.6, 1.16);
    this.bloom.enabled = this.tierCfg().bloom;
    const baseBloomSize = UnrealBloomPass.prototype.setSize;
    const bloom = this.bloom;
    // the bloom pyramid is run at a FRACTION of the render size: the mips only carry the wide glow, so nothing
    // of value is lost and the pass costs a few tenths of a millisecond even at 1440p
    this.bloom.setSize = (bw: number, bh: number) => {
      const k = QUALITY_TIERS[this.qTier].bloomScale;
      baseBloomSize.call(bloom, Math.max(64, Math.round(bw * k)), Math.max(64, Math.round(bh * k)));
    };
    this.composer.addPass(this.bloom);
    this.grade = makeGradePass();
    this.composer.addPass(this.grade);
    // THE LIGHT METER: one pixel of the graded frame, for the auto-exposure. It sits between the grade and the
    // tone map and never touches the chain (see MeterPass).
    this.meter = new MeterPass();
    this.composer.addPass(this.meter);
    this.composer.addPass(new OutputPass());

    // Foreground menu hero robot (standing front view on illuminated platform)
    this.menuHero = new Robot({ ...PLAYER_STYLE, helmetSkin: this.helmetSkin, gloveSkin: this.gloveSkin, armorSkin: this.armorSkin }, 1.0);
    // Remove point lights from menuHero so it adds zero extra dynamic lights or shader recompilations
    for (const l of this.menuHero.eyeLights) l.removeFromParent();
    this.scene.add(this.menuHero.root);

    this.menuHeroPedestal = new THREE.Group();
    const platGeo = new THREE.CylinderGeometry(2.35, 2.55, 0.14, 36);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.2,
    });
    const platMesh = new THREE.Mesh(platGeo, platMat);
    platMesh.position.y = 0.07;
    platMesh.receiveShadow = true;
    this.menuHeroPedestal.add(platMesh);

    const ringGeo = new THREE.RingGeometry(2.12, 2.28, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.145;
    this.menuHeroPedestal.add(ringMesh);

    const innerRingGeo = new THREE.RingGeometry(1.35, 1.43, 36);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x1d4ed8,
      side: THREE.DoubleSide,
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRingMesh.rotation.x = -Math.PI / 2;
    innerRingMesh.position.y = 0.146;
    this.menuHeroPedestal.add(innerRingMesh);

    // 8 glowing cyber node markers around the pedestal perimeter
    const nodeGeo = new THREE.BoxGeometry(0.28, 0.04, 0.1);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      node.position.set(Math.cos(ang) * 1.82, 0.15, Math.sin(ang) * 1.82);
      node.rotation.y = -ang;
      this.menuHeroPedestal.add(node);
    }
    this.scene.add(this.menuHeroPedestal);

    // Keep references detached from scene so they add zero GPU light/shadow overhead or shader recompilations
    this.menuHeroSpot = new THREE.SpotLight(0xd8eeff, 0, 30, Math.PI / 3.2, 0.45, 1.15);
    this.menuHeroRim = new THREE.SpotLight(0x3fd8ff, 0, 25, Math.PI / 3, 0.5, 1.15);
    this.menuHeroFill = new THREE.PointLight(0x60b0ff, 0, 12, 1.4);

    // Darkening Scrim Plane with Cinematic Vignette: placed between hero (z=6.0) and background ring (z<=0)
    // Applies a rich cinematic radial vignette solely to the background gameplay arena without darkening the front hero!
    const scrimGeo = new THREE.PlaneGeometry(120, 70);
    const scrimTex = createCinematicVignetteTexture();
    const scrimMat = new THREE.MeshBasicMaterial({
      map: scrimTex,
      transparent: true,
      depthWrite: false,
    });
    this.menuScrimPlane = new THREE.Mesh(scrimGeo, scrimMat);
    this.menuScrimPlane.position.set(0, 4.5, 3.0);
    this.scene.add(this.menuScrimPlane);

    // DOM layers
    this.popupLayer = document.createElement('div');
    this.popupLayer.className = 'popup-layer';
    container.appendChild(this.popupLayer);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'fx-flash';
    container.appendChild(this.flashEl);

    // attack indicator: [ shrinking ring ] around a [ key / button prompt ] with a tag under it
    const touchUi = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    this.warnEl = document.createElement('div');
    this.warnEl.className = 'warn warn-yellow';
    this.warnEl.innerHTML = `<div class="warn-ring"></div><div class="warn-ring warn-ring2"></div><div class="warn-key"><span${touchUi ? '' : ' class="kw"'}>${touchUi ? '◎' : 'SPACE'}</span></div><div class="warn-tag">DODGE!</div>`;
    container.appendChild(this.warnEl);
    this.warnRing = this.warnEl.children[0] as HTMLElement;
    this.warnRing2 = this.warnEl.children[1] as HTMLElement;
    this.warnTag = this.warnEl.children[3] as HTMLElement;

    this.player = this.makeFighter(true, { ...PLAYER_STYLE, helmetSkin: this.helmetSkin, gloveSkin: this.gloveSkin, armorSkin: this.armorSkin }, 1, 100, 1, 1);
    this.prepareEnemy(0);
    this.toMenu();

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisible);

    (window as unknown as { __game?: Game }).__game = this;
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ setup
  private makeFighter(isPlayer: boolean, style: RobotStyle, scale: number, hp: number, dmg: number, ts: number) {
    const robot = new Robot(style, scale);
    this.scene.add(robot.root);
    const f = new Fighter(robot, isPlayer, scale, hp, dmg, ts);
    const tc = isPlayer ? 0x6fd8ff : style.glow;
    f.trails = [new Trail(this.scene, tc), new Trail(this.scene, tc)];
    let lastStepSfx = 0;
    robot.onStep = (_foot, spd, wx, wz) => {
      const now = performance.now();
      const v = new THREE.Vector3(wx, 0.1, wz);
      const light = Math.min(1, 0.35 + spd * 0.12);
      if (now - lastStepSfx > 110) {
        lastStepSfx = now;
        this.sfx.step(light * Math.min(1.7, 0.7 * scale + 0.25));
      }
      v.y = f.y + 0.1;
      if (spd > 1.5) {
        this.fx.ring(wx, wz, 0x7d8cab, 0.9 * scale + spd * 0.1, 0.3, f.y + 0.06);
        this.fx.spark(v, 2 + Math.floor(spd * 0.7), 1.4 + spd * 0.15, 0x8a8a99, undefined, 1.1, 0.3, 2);
      }
      // TONNAGE: a striding / sprinting machine makes the ring itself answer — the canvas gives a hair under each
      // footfall and the ropes shiver (a fraction of the landing slam), and a full sprint thumps through the camera
      if (spd > 3.5 && f.y < 0.05 && this.phase !== 'walk' && this.phase !== 'menu') {
        this.arena.canvasSlam(wx, wz, Math.min(0.42, 0.08 + spd * 0.03));
      }
      if (spd > 6.5 && f.y < 0.05 && (this.phase === 'fight' || this.phase === 'walk')) {
        this.camImpVel.y -= 0.14 * Math.min(1, spd / 10) * Math.min(1.3, scale);
      }
      if (this.phase === 'walk' && f.sprinting) {
        // a sprinting machine on the steel runway: every footfall throws sparks and thumps through the camera
        this.fx.spark(v, 10, 5 + spd * 0.3, 0xffb860, new THREE.Vector3(0, 0.6, 0), 0.5, 0.5, 10);
        this.trauma = Math.min(1, this.trauma + 0.045);
        this.sfx.step(1.3);
      }
    };
    return f;
  }

  private prepareEnemy(idx: number) {
    if (this.enemy) {
      this.scene.remove(this.enemy.robot.root);
      for (const tr of this.enemy.trails) this.scene.remove(tr.mesh);
    }
    this.oppIndex = idx;
    this.def = this.makeDef(idx);
    let cached = this.enemyCache.get(idx);
    if (!cached) {
      cached = this.makeFighter(false, this.def.style, this.def.scale, this.def.hp, this.def.dmg, this.def.tscale);
      this.enemyCache.set(idx, cached);
    } else {
      this.scene.add(cached.robot.root);
      for (const tr of cached.trails) this.scene.add(tr.mesh);
      cached.maxHp = this.def.hp;
      cached.hp = this.def.hp;
      cached.dmgMul = this.def.dmg;
      cached.tscale = this.def.tscale;
      cached.robot.head.visible = true;
    }
    this.enemy = cached;
    // Ultra opponents burn crimson-red so you can tell at a glance that this is the hard version
    this.enemy.robot.setStyleGlow(this.ultra ? 0xff1a3a : this.def.style.glow);
    this.arena.setScreen(PLAYER_NAME, this.def.name, this.roundLabel(), '#4da3ff', this.ultra ? ULTRA_COLOR : this.def.color);
    this.arena.rimRed.color.setHex(this.ultra ? 0xff1a3a : this.def.style.glow);
  }

  /** the opponent's tuning for the current difficulty AND IQ */
  private makeDef(idx: number) {
    return smartDef(this.ultra ? ultraDef(OPPONENTS[idx]) : OPPONENTS[idx], this.iq);
  }

  get iqLevel() {
    return this.iq;
  }

  /** Enemy AI IQ: 1× / 2× / 3× / 10×. Works in the menu, in the pause screen and during a fight. Remembered. */
  setIq(n: number) {
    const v = (IQ_STEPS as readonly number[]).includes(n) ? n : 1;
    if (v === this.iq) return;
    this.iq = v;
    try {
      localStorage.setItem(LS_IQ, String(v));
    } catch {
      /* ignore */
    }
    this.def = this.makeDef(this.oppIndex); // only the brain changes: hp / damage / attack speed stay as they are
    this.sfx.init();
    if (v >= 10) this.sfx.charge();
    else this.sfx.click();
    this.emitHud(true);
  }

  private roundLabel() {
    return `${this.ultra ? 'ULTRA HARD · ' : ''}ROUND ${this.round}`;
  }

  get isUltra() {
    return this.ultra;
  }

  get footwork() {
    return this.fwMul;
  }

  /** Footwork speed 1× / 1.5× / 2× / 3× (works in the menu, in the pause screen and during a fight). Remembered. */
  setFootwork(m: number) {
    const v = (FOOTWORK_STEPS as readonly number[]).includes(m) ? m : 1;
    if (v === this.fwMul) return;
    this.fwMul = v;
    try {
      localStorage.setItem(LS_FW, String(v));
    } catch {
      /* ignore */
    }
    this.sfx.init();
    this.sfx.click();
    this.emitHud(true);
  }

  get cameraMode() {
    return this.camMode;
  }

  get currentHelmetSkin() {
    return this.helmetSkin;
  }

  get currentGloveSkin() {
    return this.gloveSkin;
  }

  get currentArmorSkin() {
    return this.armorSkin;
  }

  setArmorSkin(id: number) {
    const v = Math.max(0, Math.min(ARMOR_SKINS.length - 1, Math.round(id)));
    this.armorSkin = v;
    try {
      localStorage.setItem(LS_ARMOR, String(v));
    } catch {
      /* ignore */
    }
    this.menuHero.setSkins(this.helmetSkin, this.gloveSkin, this.armorSkin);
    for (const l of this.menuHero.eyeLights) l.removeFromParent();
    this.player.robot.setSkins(this.helmetSkin, this.gloveSkin, this.armorSkin);
    this.player.glowBoost = Math.max(this.player.glowBoost, 2.2);
    this.sfx.init();
    this.sfx.servo();
    this.sfx.click();
    this.emitHud(true);
  }

  setHelmetSkin(id: number) {
    const v = Math.max(0, Math.min(HELMET_SKINS.length - 1, Math.round(id)));
    this.helmetSkin = v;
    try {
      localStorage.setItem(LS_HELMET, String(v));
    } catch {
      /* ignore */
    }
    this.menuHero.setSkins(this.helmetSkin, this.gloveSkin, this.armorSkin);
    for (const l of this.menuHero.eyeLights) l.removeFromParent();
    this.player.robot.setSkins(this.helmetSkin, this.gloveSkin, this.armorSkin);
    this.player.glowBoost = Math.max(this.player.glowBoost, 2.2);
    this.sfx.init();
    this.sfx.servo();
    this.sfx.click();
    this.emitHud(true);
  }

  setGloveSkin(id: number) {
    const v = Math.max(0, Math.min(GLOVE_SKINS.length - 1, Math.round(id)));
    this.gloveSkin = v;
    try {
      localStorage.setItem(LS_GLOVE, String(v));
    } catch {
      /* ignore */
    }
    this.menuHero.setSkins(this.helmetSkin, this.gloveSkin, this.armorSkin);
    for (const l of this.menuHero.eyeLights) l.removeFromParent();
    this.player.robot.setSkins(this.helmetSkin, this.gloveSkin, this.armorSkin);
    this.player.glowBoost = Math.max(this.player.glowBoost, 2.2);
    this.sfx.init();
    this.sfx.servo();
    this.sfx.click();
    this.emitHud(true);
  }

  /** Camera preset (see CAM_MODES). Applies instantly, in the menu, the pause screen or mid-fight. Remembered. */
  setCamMode(i: number) {
    const v = Math.max(0, Math.min(CAM_MODES.length - 1, Math.round(i)));
    if (v === this.camMode) return;
    this.camMode = v;
    try {
      localStorage.setItem(LS_CAM, String(v));
    } catch {
      /* ignore */
    }
    this.sfx.init();
    this.sfx.click();
    this.emitHud(true);
  }

  /** / and . change the camera preset in the middle of a fight */
  private cycleCamMode(dir: number) {
    const n = (this.camMode + dir + CAM_MODES.length) % CAM_MODES.length;
    this.setCamMode(n);
    const p = this.player;
    const m = CAM_MODES[n];
    this.popup(new THREE.Vector3(p.pos.x, 6.6, p.pos.y), `KAMERA ${m.name}`, 'pop-info');
  }

  /** [ and ] change the footwork speed in the middle of a fight */
  private cycleFootwork(dir: number) {
    const i = (FOOTWORK_STEPS as readonly number[]).indexOf(this.fwMul);
    const n = Math.max(0, Math.min(FOOTWORK_STEPS.length - 1, i + dir));
    if (n === i) return;
    this.setFootwork(FOOTWORK_STEPS[n]);
    const p = this.player;
    this.popup(new THREE.Vector3(p.pos.x, 6.6, p.pos.y), `FOOTWORK ${FOOTWORK_STEPS[n]}×`, 'pop-info');
  }

  /** Switch ULTRA HARD on/off (menu only). Remembered between visits. */
  setUltra(on: boolean) {
    if (this.ultra === on) return;
    this.ultra = on;
    this.hangar.setMood(on);
    try {
      localStorage.setItem(LS_DIFF, on ? 'ultra' : 'normal');
    } catch {
      /* ignore */
    }
    this.sfx.init();
    if (on) {
      this.sfx.charge();
      this.sfx.cheer(0.6);
    } else this.sfx.click();
    if (this.phase === 'menu') {
      this.prepareEnemy(this.oppIndex);
      this.placeMenu();
    }
    this.emitHud(true);
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.grade.uniforms.res.value.set(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.sfx.stopMusic();
    if (this.menuHero) {
      this.scene.remove(this.menuHero.root);
      this.scene.remove(this.menuHeroPedestal);
      this.scene.remove(this.menuHeroSpot);
      this.scene.remove(this.menuHeroRim);
      this.scene.remove(this.menuHeroFill);
      this.scene.remove(this.menuScrimPlane);
      this.menuScrimPlane.geometry.dispose();
      const mat = this.menuScrimPlane.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.container.innerHTML = '';
  }

  // ------------------------------------------------------------ public api
  startMatch(idx: number, team?: { enemy2: number }) {
    this.endTeam();
    if (this.menuHero) {
      this.menuHero.root.visible = false;
      this.menuHeroPedestal.visible = false;
      this.menuHeroSpot.visible = false;
      this.menuHeroRim.visible = false;
      this.menuHeroFill.visible = false;
      this.menuScrimPlane.visible = false;
    }
    this.sfx.init();
    this.sfx.startMusic();
    this.sfx.click();
    this.prepareEnemy(idx);
    // the giant face boards get tonight's two fighters (3×4 busts straight out of the portrait studio)
    try {
      const me = this.capturePortrait(240, 320, 'bust', false);
      const foe = this.captureOpponentPortrait(idx, 240, 320, 'bust', false);
      this.arena.setFaces({ name: PLAYER_NAME, color: '#4da3ff', img: me }, { name: this.def.name, color: this.ultra ? ULTRA_COLOR : this.def.color, img: foe });
    } catch {
      /* the boards keep their last picture */
    }
    if (team) this.beginTeam(team.enemy2);
    this.wins = [0, 0];
    this.round = 1;
    this.result = null;
    this.paused = false;
    this.startRound(true);
  }

  // ------------------------------------------------------------ TEAM MATCH (2v2 tag team)
  /** every robot that is in the ring right now */
  private fighters(): Fighter[] {
    const l = [this.player, this.enemy];
    if (this.teamMode) {
      if (this.ally) l.push(this.ally);
      if (this.enemy2) l.push(this.enemy2);
    }
    return l;
  }
  private alive(f: Fighter | null): f is Fighter {
    return !!f && f.state !== 'ko';
  }
  /** who this robot is fighting right now: your pair stays locked until somebody goes down, then the survivors regroup */
  private foeOf(f: Fighter): Fighter {
    if (!this.teamMode) return f === this.player ? this.enemy : this.player;
    if (f === this.player) return this.alive(this.enemy) ? this.enemy : (this.enemy2 ?? this.enemy);
    if (f === this.enemy) return this.alive(this.player) ? this.player : (this.ally ?? this.player);
    if (f === this.ally) return this.alive(this.enemy2) ? this.enemy2 : this.enemy;
    return this.alive(this.ally) ? this.ally : this.player;
  }
  /** the robot the camera lives on: you — unless you are down in a TEAM MATCH, then it rides with your partner */
  private camHero(): Fighter {
    if (this.teamMode && this.ally && this.player.state === 'ko' && this.ally.state !== 'ko' && this.phase === 'fight') return this.ally;
    return this.player;
  }
  private mateOf(f: Fighter): Fighter | null {
    if (!this.teamMode) return null;
    if (f === this.player) return this.ally;
    if (f === this.ally) return this.player;
    if (f === this.enemy) return this.enemy2;
    return this.enemy;
  }
  private nameOf(f: Fighter): string {
    if (f === this.player) return PLAYER_NAME;
    if (f === this.ally) return this.allyName;
    if (f === this.enemy) return this.def.name;
    return this.def2?.name ?? this.def.name;
  }
  private setRingScale(sc: number) {
    RING = RING_BASE * sc;
    RING_IN = RING_IN_BASE * sc;
    this.arena.setRingScale(sc);
  }
  private beginTeam(idx2: number) {
    this.teamMode = true;
    this.swapped = false;
    this.setRingScale(TEAM_RING_SCALE);
    // your partner: the same chassis in the team's second livery, a touch heavier-hitting so it pulls its weight
    const ally = this.makeFighter(
      false,
      { ...PLAYER_STYLE, accent: 0x18c48a, glow: 0x5effb0, helmetSkin: (this.helmetSkin + 3) % HELMET_SKINS.length, gloveSkin: (this.gloveSkin + 5) % GLOVE_SKINS.length, armorSkin: (this.armorSkin + 4) % ARMOR_SKINS.length },
      1.0,
      110,
      1.05,
      1,
    );
    ally.team = 0;
    this.ally = ally;
    this.def2 = this.makeDef(idx2);
    const e2 = this.makeFighter(false, this.def2.style, this.def2.scale, this.def2.hp, this.def2.dmg, this.def2.tscale);
    e2.robot.setStyleGlow(this.ultra ? 0xff1a3a : this.def2.style.glow);
    this.enemy2 = e2;
    this.squadA = { cool: 0.6, strafe: 1, strafeT: 0, blockT: 0 };
    this.squadE = { cool: 1.0, strafe: -1, strafeT: 0, blockT: 0 };
  }
  private endTeam() {
    if (!this.teamMode) return;
    if (this.swapped) this.swapEnemies();
    for (const f of [this.ally, this.enemy2]) {
      if (!f) continue;
      this.scene.remove(f.robot.root);
      for (const tr of f.trails) this.scene.remove(tr.mesh);
    }
    this.ally = null;
    this.enemy2 = null;
    this.def2 = null;
    this.teamMode = false;
    this.setRingScale(1);
  }
  /** the opponent engaging you went down: the second one steps in as `enemy` (the genius brain, the HUD, the camera) */
  private swapEnemies() {
    if (!this.enemy2 || !this.def2) return;
    const e = this.enemy;
    this.enemy = this.enemy2;
    this.enemy2 = e;
    const d = this.def;
    this.def = this.def2;
    this.def2 = d;
    this.swapped = !this.swapped;
    this.ai = this.makeAi();
    this.arena.setScreen(PLAYER_NAME, this.def.name, this.roundLabel(), '#4da3ff', this.ultra ? ULTRA_COLOR : this.def.color);
  }
  /** the tag partners' brain: a real fighter (no demo-reel healing), it spaces, blocks, slips and throws the whole book */
  private squadBrain(f: Fighter, o: Fighter, st: { cool: number; strafe: number; strafeT: number; blockT: number }, dt: number) {
    f.wish.set(0, 0);
    f.blocking = false;
    f.rage = false;
    st.cool -= dt;
    st.blockT -= dt;
    st.strafeT -= dt;
    if (f.state !== 'idle' || f.dodgeT > 0 || f.tauntT > 0) return;
    const dist = f.pos.distanceTo(o.pos);
    const toO = this.toward(f, o);
    const side = new THREE.Vector2(-toO.y, toO.x);
    const oDown = o.state === 'ko' || o.state === 'down';
    if (o.state === 'attack' && o.move && !o.impacted && dist < 5.5 && st.blockT <= 0 && Math.random() < dt * 11) {
      if (Math.random() < 0.5 && this.startDodge(f, side.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1), 'side')) return;
      st.blockT = 0.4 + Math.random() * 0.3;
    }
    f.blocking = st.blockT > 0;
    if (st.strafeT <= 0) {
      st.strafe = Math.random() < 0.5 ? 1 : -1;
      st.strafeT = 0.7 + Math.random() * 1.2;
    }
    const sp = 4.6;
    if (oDown) {
      // nothing to hit: keep a respectful distance and wait for the next one
      if (dist < 4.5) f.wish.addScaledVector(toO, -sp * 0.5);
    } else if (dist > 3.6) f.wish.addScaledVector(toO, sp);
    else if (dist < 2.8) f.wish.addScaledVector(toO, -sp * 0.6);
    f.wish.addScaledVector(side, st.strafe * sp * 0.45);
    const edge = Math.hypot(f.pos.x, f.pos.y);
    if (edge > RING - 3) f.wish.addScaledVector(new THREE.Vector2(-f.pos.x, -f.pos.y).normalize(), sp * 0.9);
    if (st.cool > 0 || f.blocking || oDown) return;
    if (dist <= 4.0 && f.stam > 18) {
      const r = Math.random();
      const id: MoveId = f.meter >= 100 ? (r < 0.5 ? 'windmill' : r < 0.8 ? 'bolt' : 'slam') : r < 0.36 ? 'jab' : r < 0.62 ? 'cross' : r < 0.84 ? 'hook' : 'upper';
      if (isOD(id)) f.meter = 0;
      this.startMove(f, id);
      st.cool = 0.22 + Math.random() * 0.45;
    }
  }

  /**
   * PROFILE PORTRAIT: a 3×4 "ID photo" of the player's own 3D robot — head down to the chest plate — rendered straight
   * off the live lobby hero (so it always wears the helmet / glove / armor skins that are equipped right now).
   * Renders into a scissored corner of the main canvas (tone mapping + sRGB exactly as on screen) and copies it out.
   */
  private portraitCam = new THREE.PerspectiveCamera(26, 3 / 4, 0.1, 60);
  private portraitCanvas: HTMLCanvasElement | null = null;
  capturePortrait(w = 240, h = 320, frame: 'bust' | 'torso' = 'bust', cutout = false): string | null {
    const hero = this.menuHero;
    if (!hero) return null;
    return this.captureRobot(hero, w, h, frame, cutout, -0.22);
  }

  /** a VS-screen portrait of one of the roster Titans: the cached fighter is staged, put in guard and photographed */
  captureOpponentPortrait(idx: number, w = 420, h = 520, frame: 'bust' | 'torso' = 'torso', cutout = true): string | null {
    if (idx < 0 || idx >= OPPONENTS.length) return null;
    let f = this.enemyCache.get(idx);
    if (!f) {
      const d = this.makeDef(idx);
      f = this.makeFighter(false, d.style, d.scale, d.hp, d.dmg, d.tscale);
      this.enemyCache.set(idx, f);
      if (f !== this.enemy) {
        this.scene.remove(f.robot.root);
        for (const tr of f.trails) this.scene.remove(tr.mesh);
      }
    }
    const robot = f.robot;
    const inScene = robot.root.parent === this.scene;
    if (!inScene) this.scene.add(robot.root);
    robot.setStyleGlow(this.ultra ? 0xff1a3a : OPPONENTS[idx].style.glow);
    robot.head.visible = true;
    // settle the guard ON THE CANVAS (the floor solve probes world space — a parked robot would be lifted 200 m):
    // the rig is spring-driven, so pump the pose for a couple of simulated seconds
    const pos = robot.root.position.clone();
    robot.root.position.set(HANGAR_POS.x, 0, HANGAR_POS.z);
    const st = this.heroAnimState('guard', 1.0, 0, 0);
    for (let i = 0; i < 48; i++) robot.animate(st, 0.05);
    const url = this.captureRobot(robot, w, h, frame, cutout, 0.22);
    robot.root.position.copy(pos);
    if (!inScene) this.scene.remove(robot.root);
    return url;
  }

  /** a wide establishing shot of the empty ring (the stage thumbnail of the VS screen) */
  captureArena(w = 320, h = 180): string | null {
    const r = this.renderer;
    const dpr = r.getPixelRatio();
    const cw = r.domElement.width / dpr;
    const ch = r.domElement.height / dpr;
    if (cw < w || ch < h) return null;
    const hero = this.menuHero;
    const heroVis = hero?.root.visible ?? false;
    const pedVis = this.menuHeroPedestal?.visible ?? false;
    const scrimVis = this.menuScrimPlane?.visible ?? false;
    if (hero) hero.root.visible = false;
    if (this.menuHeroPedestal) this.menuHeroPedestal.visible = false;
    if (this.menuScrimPlane) this.menuScrimPlane.visible = false;
    const cam = this.portraitCam;
    cam.layers.set(0);
    cam.fov = 38;
    cam.aspect = w / h;
    cam.position.set(-6, 15, 44);
    cam.lookAt(0, 5, 0);
    cam.updateProjectionMatrix();
    const url = this.grabCorner(w, h, () => r.render(this.scene, cam));
    cam.fov = 26;
    if (hero) hero.root.visible = heroVis;
    if (this.menuHeroPedestal) this.menuHeroPedestal.visible = pedVis;
    if (this.menuScrimPlane) this.menuScrimPlane.visible = scrimVis;
    return url;
  }

  /** render into the bottom-left corner of the live canvas and lift the pixels out before the next frame paints over it */
  private grabCorner(w: number, h: number, draw: () => void, read?: (ctx: CanvasRenderingContext2D) => void): string | null {
    const r = this.renderer;
    const dpr = r.getPixelRatio();
    const vp = new THREE.Vector4();
    r.getViewport(vp);
    const sc = new THREE.Vector4();
    r.getScissor(sc);
    const scTest = r.getScissorTest();
    r.setScissorTest(true);
    r.setScissor(0, 0, w, h);
    r.setViewport(0, 0, w, h);
    r.setRenderTarget(null);
    r.clear();
    draw();
    r.setScissorTest(scTest);
    r.setScissor(sc);
    r.setViewport(vp);
    let url: string | null = null;
    try {
      if (!this.portraitCanvas) this.portraitCanvas = document.createElement('canvas');
      const c = this.portraitCanvas;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(r.domElement, 0, r.domElement.height - h * dpr, w * dpr, h * dpr, 0, 0, w, h);
        read?.(ctx);
        url = c.toDataURL('image/png');
      }
    } catch {
      url = null;
    }
    return url;
  }

  private cutoutLayerReady = false;
  private static readonly CUTOUT_LAYER = 7;

  /**
   * The portrait studio. `bust` frames helmet → chest (account avatar), `torso` frames helmet → hips (VS screen).
   * `cutout` photographs the robot alone twice — over black and over white — and derives an exact alpha matte from
   * the difference, so the PNG has true transparency with clean anti-aliased edges (no chroma fringe).
   */
  private captureRobot(robot: Robot, w: number, h: number, frame: 'bust' | 'torso', cutout: boolean, yaw: number): string | null {
    const r = this.renderer;
    const dpr = r.getPixelRatio();
    const cw = r.domElement.width / dpr;
    const ch = r.domElement.height / dpr;
    if (cw < w || ch < h) return null;

    // stage the robot for the photo (whatever the lobby camera is doing right now)
    const wasVis = robot.root.visible;
    const pos = robot.root.position.clone();
    const rotY = robot.root.rotation.y;
    robot.root.visible = true;
    robot.root.position.set(HANGAR_POS.x, 0, HANGAR_POS.z);
    robot.root.rotation.y = yaw;
    const scrimVis = this.menuScrimPlane?.visible ?? false;
    if (this.menuScrimPlane) {
      this.menuScrimPlane.visible = !cutout;
      this.menuScrimPlane.position.set(HANGAR_POS.x, 4.5, HANGAR_POS.z - 3.0);
    }
    const pedVis = this.menuHeroPedestal?.visible ?? false;
    if (this.menuHeroPedestal) this.menuHeroPedestal.visible = false;
    robot.root.updateMatrixWorld(true);

    const headP = new THREE.Vector3();
    const chestP = new THREE.Vector3();
    const hipP = new THREE.Vector3();
    robot.head.getWorldPosition(headP);
    robot.chest.getWorldPosition(chestP);
    robot.pelvis.getWorldPosition(hipP);
    const top = headP.y + (frame === 'bust' ? 0.95 : 1.1);
    const bottom = frame === 'bust' ? chestP.y + 0.25 : hipP.y - 0.9;
    const mid = (top + bottom) / 2;
    const span = top - bottom;
    const cam = this.portraitCam;
    cam.fov = 26;
    cam.aspect = w / h;
    const dist = (span / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) * 1.08;
    const fwd = new THREE.Vector3(Math.sin(robot.root.rotation.y), 0, Math.cos(robot.root.rotation.y));
    const lookAt = new THREE.Vector3(headP.x * 0.5 + chestP.x * 0.5, mid, HANGAR_POS.z + 0.35);
    cam.position.copy(lookAt).addScaledVector(fwd, dist).add(new THREE.Vector3(0.25 * Math.sign(-yaw || 1), 0.35, 0));
    cam.lookAt(lookAt);
    cam.updateProjectionMatrix();

    let url: string | null;
    if (!cutout) {
      cam.layers.set(0);
      url = this.grabCorner(w, h, () => r.render(this.scene, cam));
    } else {
      const L = Game.CUTOUT_LAYER;
      if (!this.cutoutLayerReady) {
        this.cutoutLayerReady = true;
        this.scene.traverse((o) => {
          if ((o as THREE.Light).isLight) o.layers.enable(L);
        });
      }
      robot.root.traverse((o) => o.layers.enable(L));
      cam.layers.set(L);
      const clear = new THREE.Color();
      r.getClearColor(clear);
      const clearA = r.getClearAlpha();
      let black: ImageData | null = null;
      r.setClearColor(0x000000, 1);
      this.grabCorner(w, h, () => r.render(this.scene, cam), (ctx) => {
        black = ctx.getImageData(0, 0, w, h);
      });
      r.setClearColor(0xffffff, 1);
      url = this.grabCorner(
        w,
        h,
        () => r.render(this.scene, cam),
        (ctx) => {
          if (!black) return;
          const white = ctx.getImageData(0, 0, w, h);
          const bd = (black as ImageData).data;
          const wd = white.data;
          for (let i = 0; i < wd.length; i += 4) {
            // over white − over black = (1 − α)·255 per channel
            const a = Math.max(0, Math.min(1, 1 - (wd[i] - bd[i] + wd[i + 1] - bd[i + 1] + wd[i + 2] - bd[i + 2]) / 765));
            if (a <= 0.004) {
              wd[i + 3] = 0;
              continue;
            }
            // the shot over black is pre-multiplied — un-multiply for a straight-alpha PNG
            wd[i] = Math.min(255, bd[i] / a);
            wd[i + 1] = Math.min(255, bd[i + 1] / a);
            wd[i + 2] = Math.min(255, bd[i + 2] / a);
            wd[i + 3] = Math.round(a * 255);
          }
          ctx.putImageData(white, 0, 0);
        },
      );
      r.setClearColor(clear, clearA);
      cam.layers.set(0);
    }

    // put the stage back
    robot.root.visible = wasVis;
    robot.root.position.copy(pos);
    robot.root.rotation.y = rotY;
    if (this.menuScrimPlane) this.menuScrimPlane.visible = scrimVis;
    if (this.menuHeroPedestal) this.menuHeroPedestal.visible = pedVis;
    return url;
  }

  /** UI one-shots for the lobby flows (matchmaking radar, the bracket, the lock-in count) */
  uiCue(kind: 'click' | 'tick' | 'found' | 'lock' | 'go' | 'fanfare') {
    this.sfx.init();
    switch (kind) {
      case 'click':
        this.sfx.click();
        break;
      case 'tick':
        this.sfx.tick(0.7);
        break;
      case 'found':
        this.sfx.bell(1);
        this.sfx.servo();
        this.sfx.cheer(0.6);
        this.sfx.say('Opponent found');
        break;
      case 'lock':
        this.sfx.tick(1);
        this.sfx.charge();
        break;
      case 'go':
        this.sfx.ready();
        this.sfx.cheer(0.8);
        break;
      case 'fanfare':
        this.sfx.bell(2);
        this.sfx.cheer(1);
        this.sfx.pyro(0.8);
        break;
    }
  }

  selectOpponent(idx: number) {
    if (this.phase !== 'menu') return;
    this.prepareEnemy(idx);
    this.placeMenu();
  }

  toMenu() {
    this.endTeam();
    this.resetExposure();
    this.phase = 'menu';
    this.phaseT = 0;
    this.result = null;
    this.banner = null;
    this.paused = false;
    this.round = 1;
    this.wins = [0, 0];
    if (this.menuHero) {
      this.menuHero.root.visible = true;
      this.menuHeroPedestal.visible = false;
      this.menuHeroSpot.visible = true;
      this.menuHeroRim.visible = true;
      this.menuHeroFill.visible = true;
      this.menuScrimPlane.visible = false;
      this.heroPose = 'ready';
      this.heroYaw = -0.16;
      this.heroYawTarget = -0.16;
      this.menuCamMode = 'hero';
    }
    this.placeMenu();
    this.sfx.musicIntensity = 0.7;
    this.emitHud(true);
  }

  setHeroPose(pose: HeroPose) {
    if (this.heroPose === pose) return;
    this.heroPose = pose;
    this.sfx.init();
    this.sfx.click();
    this.emitHud(true);
  }

  getHeroPose() {
    return this.heroPose;
  }

  setMenuCamMode(mode: 'hero' | 'arena' | 'full') {
    if (this.menuCamMode === mode) return;
    const wasHero = this.menuCamMode !== 'arena';
    this.menuCamMode = mode;
    if (this.phase === 'menu' && wasHero !== (mode !== 'arena')) {
      this.placeMenu();
    }
    this.sfx.init();
    this.sfx.click();
    this.emitHud(true);
  }

  /**
   * THE VS SCREEN STAGE: the hero steps to the left mark, the opponent (and in 2v2 the second Titan) takes the
   * right mark, both in the hangar, both facing the lens. `found` reveals the opponent; null strikes the set.
   */
  setVsMode(idx: number | null, idx2 = -1, stage: 'search' | 'found' | 'lock' = 'search') {
    if (idx === null) {
      for (const f of [this.vsFoe, this.vsFoe2]) {
        if (!f) continue;
        if (f !== this.enemy) {
          this.scene.remove(f.robot.root);
          for (const tr of f.trails) this.scene.remove(tr.mesh);
        }
      }
      this.vs = null;
      this.vsFoe = null;
      this.vsFoe2 = null;
      this.hangar.setVsBackdrop(false);
      if (this.menuHero) this.menuHero.root.rotation.y = this.heroYaw;
      return;
    }
    this.hangar.setVsBackdrop(true);
    if (this.menuCamMode === 'arena') this.setMenuCamMode('hero');
    const foeOf = (i: number) => {
      if (i < 0 || i >= OPPONENTS.length) return null;
      let f = this.enemyCache.get(i);
      if (!f) {
        const d = this.makeDef(i);
        f = this.makeFighter(false, d.style, d.scale, d.hp, d.dmg, d.tscale);
        this.enemyCache.set(i, f);
      } else if (f.robot.root.parent !== this.scene) {
        this.scene.add(f.robot.root);
      }
      f.robot.setStyleGlow(this.ultra ? 0xff1a3a : OPPONENTS[i].style.glow);
      f.robot.head.visible = true;
      f.robot.root.visible = true;
      f.robot.floorY = 0; // the hangar floor
      f.robot.root.rotation.x = 0;
      f.robot.root.rotation.z = 0;
      return f;
    };
    if (!this.vs || this.vs.idx !== idx || this.vs.idx2 !== idx2) {
      this.setVsMode(null);
      this.vsFoe = foeOf(idx);
      this.vsFoe2 = foeOf(idx2);
    }
    const prev = this.vs?.stage ?? 'search';
    if (stage !== prev) {
      if (stage === 'found') {
        this.vsPunch = 1;
      } else if (stage === 'lock') {
        this.vsPunch = 0.7;
        this.sfx.ready();
      }
    }
    this.vs = { idx, idx2, stage };
  }

  getMenuCamMode() {
    return this.menuCamMode;
  }

  rotateHero(deltaYaw: number) {
    this.heroYawTarget += deltaYaw;
  }

  resetHeroRotation() {
    this.heroYawTarget = -0.16;
  }

  setHeroMouse(nx: number, ny: number) {
    this.heroMouseX = nx;
    this.heroMouseY = ny;
  }

  /** forget everything the iris learned — the next shot starts at the neutral exposure */
  private resetExposure() {
    this.aeKey = 0.28;
    this.aeGain = 1;
    this.aePause = 0;
    this.aeHold = 0;
  }

  private placeMenu() {
    // square them up for the demo reel: they fight for real in the menu background
    this.player.reset(-2.0, -1.8, Math.atan2(4.0, -2.4));
    this.enemy.reset(2.0, -4.2, Math.atan2(-4.0, 2.4));
    this.player.mode = 'normal';
    this.enemy.mode = 'normal';
    this.player.glowBoost = 0.6;
    this.enemy.glowBoost = 0.6;
    this.demoP = { cool: 0.5, strafe: 1, strafeT: 0, blockT: 0 };
    this.demoE = { cool: 1.0, strafe: -1, strafeT: 0, blockT: 0 };
    this.shot = nextShot();
    this.shotT = 0;
    this.shotCut = true;
    const showHero = this.menuCamMode !== 'arena';
    // Keep root.visible = true so eyeLights stay registered in the scene and never trigger shader recompilations;
    // when showHero is active, park the background fighters at y = -200 where frustum culling skips them in 0ms.
    this.player.robot.root.visible = true;
    this.enemy.robot.root.visible = true;
    if (showHero) {
      this.player.robot.root.position.y = -200;
      this.enemy.robot.root.position.y = -200;
    }
    for (const tr of this.player.trails) tr.mesh.visible = !showHero;
    for (const tr of this.enemy.trails) tr.mesh.visible = !showHero;
    if (this.menuHero) {
      this.menuHero.root.visible = showHero;
      this.menuHeroPedestal.visible = false;
      this.menuScrimPlane.visible = false;
    }
  }

  togglePause() {
    if (this.phase === 'menu' || this.phase === 'matchEnd') return;
    this.paused = !this.paused;
    this.emitHud(true);
  }

  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }

  setSoundProfile(id: SfxProfile) {
    this.sfx.init();
    this.sfx.setProfile(id, true);
  }

  press(code: string) {
    if (this.keys.has(code)) return;
    this.keys.add(code);
    // SPACE dodges on the press (instant). HOLDING it keeps the guard up, so a dodge flows straight into a block
    // if you never let go of the key.
    if (code === 'Space' && this.phase === 'fight' && !this.paused) this.playerDodge();
    this.onEdge(code);
  }
  release(code: string) {
    if (code === 'KeyW' || code === 'ArrowUp') this.runLatch = false;
    this.keys.delete(code);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    this.shiftHeld = e.shiftKey;
    if (e.repeat) return;
    this.sfx.init();
    this.press(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.shiftHeld = e.shiftKey;
    this.release(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.runLatch = false;
    this.shiftHeld = false;
  };

  /** coming back from another tab: the clock never counts the time we were away (one huge frameMs would upset the governor) */
  private onVisible = () => {
    if (document.visibilityState === 'visible') this.last = performance.now();
  };

  private onEdge(code: string) {
    if (code === 'Escape') {
      this.togglePause();
      return;
    }
    if (this.phase === 'walk') {
      if (code === 'Enter' || code === 'Space') this.finishWalk();
      return;
    }
    if (code === 'Slash' || code === 'Period') {
      // the camera can be changed anywhere: in the menu, while paused, mid-round
      if (!this.paused) this.cycleCamMode(code === 'Slash' ? 1 : -1);
      return;
    }
    if (this.phase !== 'fight' || this.paused) return;
    const p = this.player;
    const tapKind: Record<string, ['fwd' | 'back' | 'side', number]> = {
      KeyW: ['fwd', 0],
      ArrowUp: ['fwd', 0],
      KeyS: ['back', 0],
      ArrowDown: ['back', 0],
      KeyD: ['side', 1],
      ArrowRight: ['side', 1],
      KeyA: ['side', -1],
      ArrowLeft: ['side', -1],
    };
    const tk = tapKind[code];
    if (tk) {
      // HAND SELECTION: one tap to the right takes the right fist, one tap to the left takes the left one.
      // A tiny step is enough — the tap itself is the marker, no need to commit to a full sidestep.
      if (tk[0] === 'side') this.setHand(tk[1] > 0 ? 1 : 0);
      const now = performance.now();
      const prev = this.lastTap[code] ?? 0;
      this.lastTap[code] = now;
      if (now - prev < 260) {
        this.playerDash(tk[0], tk[1]);
        if (tk[0] === 'fwd') this.runLatch = true; // dash, then keep W held to break into a sprint
      }
    }
    switch (code) {
      case 'KeyP':
        this.tryAttack(p, 'grab');
        break;
      case 'KeyG':
        this.toggleRage();
        break;
      case 'KeyH':
      case 'KeyZ':
        this.tryAttack(p, 'jab');
        break;
      case 'KeyJ':
      case 'KeyC':
        this.tryAttack(p, 'hook');
        break;
      case 'KeyK':
      case 'KeyV':
        this.tryAttack(p, 'upper');
        break;
      case 'KeyL':
        this.tryAttack(p, 'counter');
        break;
      case 'KeyX': // bonus straight kept from the old kit
        this.tryAttack(p, 'cross');
        break;
      case 'KeyQ': // TARGET SWITCH: head ↔ body (T does the same)
      case 'KeyT':
        this.toggleAim();
        break;
      case 'KeyR':
        // (KeyE is the Peek-a-Boo stance now, it is read in playerInput)
        this.tryOverdrive(p);
        break;
      // ---------------- FREESTYLE ----------------
      // The whole show-off book (poses.ts) sits on its own keys, and one key just cycles it: M N B U I Y O.
      case 'KeyM':
      case 'KeyN':
      case 'KeyB':
      case 'KeyU':
      case 'KeyI':
      case 'KeyY':
      case 'KeyO':
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4': {
        const fs = freestyleByKey(code);
        if (fs) this.taunt(p, fs.id);
        break;
      }
      case 'Freestyle': // the touch button: cycle to the next move in the book
        this.taunt(p, (p.tauntStyle + 1) % FREESTYLE.length);
        break;
      case 'BracketRight':
        this.cycleFootwork(1);
        break;
      case 'BracketLeft':
        this.cycleFootwork(-1);
        break;
    }
  }

  // ------------------------------------------------------------ round flow
  private startRound(first = false) {
    if (this.menuHero) {
      this.menuHero.root.visible = false;
      this.menuHeroPedestal.visible = false;
      this.menuScrimPlane.visible = false;
    }
    const p = this.player;
    const e = this.enemy;
    if (this.teamMode && this.ally && this.enemy2) {
      if (this.swapped) this.swapEnemies(); // every round opens with the original pairs
      p.reset(-3.4, 6.2, Math.PI);
      e.reset(-3.4, -6.2, 0);
      this.ally.reset(3.6, 6.6, Math.PI);
      this.enemy2.reset(3.6, -6.6, 0);
      this.squadA = { cool: 0.8, strafe: 1, strafeT: 0, blockT: 0 };
      this.squadE = { cool: 1.1, strafe: -1, strafeT: 0, blockT: 0 };
    } else {
      p.reset(0, 6.0, Math.PI);
      e.reset(0, -6.0, 0);
    }
    for (const f of this.fighters()) {
      f.mode = 'taunt';
      f.robot.root.visible = true;
      f.robot.head.visible = true;
      for (const tr of f.trails) tr.mesh.visible = true;
    }
    this.roundTime = ROUND_TIME;
    this.timeUp = false;
    this.combo = 0;
    this.stats = freshStats();
    this.decap.clear(); // any head torn off last round is bolted back on
    this.cine = null; // and the director hands the camera back to the operator
    this.meterReadyShown = false;
    this.ai = this.makeAi();
    this.timeScale = 1;
    this.slowT = 0;
    this.sfx.musicIntensity = 1;
    this.arena.setScreen(PLAYER_NAME, this.def.name, this.roundLabel(), '#4da3ff', this.ultra ? ULTRA_COLOR : this.def.color);
    if (first) this.beginWalk();
    else this.beginIntro(first);
  }

  // ------------------------------------------------------------------ RING WALK
  private beginWalk() {
    this.phase = 'walk';
    this.phaseT = 0;
    this.walk = [];
    this.walkPyroT = 0;
    this.camInit = false;
    const mk = (f: Fighter, side: 1 | -1, lag: number, lateral: number, delay: number) => {
      const home = f.pos.clone();
      const homeYaw = f.yaw;
      const a = side > 0 ? 1.247 : 4.389; // the two aisles that face the corners (see arena.ts: aisles every 60° from 0.2 rad)
      const out = new THREE.Vector2(Math.cos(a), Math.sin(a));
      const perp = new THREE.Vector2(-out.y, out.x);
      const at = (r: number, l: number) => out.clone().multiplyScalar(r).addScaledVector(perp, l);
      const sh = entryShift();
      const from = at(34.0 + lag + sh, lateral); // in the mouth of the tunnel
      const mark = at(26.0 + lag * 0.5 + sh, lateral); // the end of the strut: from here he sprints
      const take = at(20.0 + sh, lateral * 0.8); // the lip of the launch wedge
      const land = at(10.2 + sh * 0.3, lateral * 0.6); // on the canvas, well inside the ropes
      f.reset(from.x, from.y, Math.atan2(-out.x, -out.y));
      f.y = -1.4; // the hall floor is 1.4 below the canvas
      f.mode = 'normal';
      f.tauntT = 0;
      f.swagger = -1;
      const d = delay;
      this.walk.push({
        f,
        from,
        mark,
        take,
        land,
        home,
        homeYaw,
        t: [0.6 + d, 3.7 + d, 4.55 + d, 5.75 + d, 6.3 + d, 7.6 + d, 8.9 + d],
        cue: 0,
        landed: false,
        raised: false,
        apex: false,
        inward: out.clone().negate(),
        perp,
      });
    };
    mk(this.player, 1, 0, 0, 0);
    mk(this.enemy, -1, 0, 0, 0.35);
    if (this.teamMode && this.ally && this.enemy2) {
      mk(this.ally, 1, 3.2, 2.2, 0.55);
      mk(this.enemy2, -1, 3.2, -2.2, 0.9);
    }
    this.showBanner('RING WALK', `${PLAYER_NAME}  VS  ${this.def.name}`, 'round', 2.4);
    this.sfx.say(`Introducing... ${PLAYER_NAME}!`);
    this.sfx.cheer(1);
    this.crowdRoar(1, 4.5);
    this.hype = 1;
    this.pyro(1);
    this.trauma = 0.2;
  }

  /** where a fighter is on its ring-walk track at time t: position, height, facing, flip and which beat it is in */
  private walkAt(w: WalkTrack, t: number, out: { pos: THREE.Vector2; y: number; yaw: number; flip: number; beat: number; u: number }) {
    const [t0, t1, t2, t3, t4, t5, t6] = w.t;
    const ease = (u: number) => u * u * (3 - 2 * u);
    out.flip = 0;
    out.u = 0;
    if (t < t0) {
      out.pos.copy(w.from);
      out.beat = 0;
      out.u = t / t0;
    } else if (t < t1) {
      // THE STRUT: a steady walk, easing out of the gate only
      const u = (t - t0) / (t1 - t0);
      const k = u < 0.12 ? ease(u / 0.12) * 0.12 : u;
      out.pos.lerpVectors(w.from, w.mark, k);
      out.beat = 1;
      out.u = u;
    } else if (t < t2) {
      // THE SPRINT: a 20 % build-up out of the walk, then flat out into the wedge (take-off speed = flight speed)
      const u = (t - t1) / (t2 - t1);
      const sdist = u < 0.2 ? (u * u) / 0.4 : 0.1 + (u - 0.2);
      out.pos.lerpVectors(w.mark, w.take, sdist / 0.9);
      out.beat = 2;
      out.u = u;
    } else if (t < t3) {
      // THE FLIGHT: a straight line for the feet-track, a parabola on top for the centre of mass, and a full
      // tucked front flip in the middle of it (the pivot is the centre of mass — see animateFighter)
      const u = (t - t2) / (t3 - t2);
      out.pos.lerpVectors(w.take, w.land, u);
      out.y = THREE.MathUtils.lerp(rampY(w.take.length()), 0, u) + FLIGHT_H * 4 * u * (1 - u);
      const fu = THREE.MathUtils.clamp((u - 0.07) / 0.83, 0, 1);
      out.flip = Math.PI * 2 * fu * fu * (3 - 2 * fu); // one smooth turn: eases in, steady through the top, eases out
      out.beat = 3;
      out.u = u;
    } else if (t < t4) {
      out.pos.copy(w.land); // the landing crouch
      out.beat = 4;
      out.u = (t - t3) / (t4 - t3);
    } else if (t < t5) {
      out.pos.copy(w.land); // up, and the arms go up at the opponent
      out.beat = 5;
      out.u = (t - t4) / (t5 - t4);
    } else if (t < t6) {
      const u = (t - t5) / (t6 - t5);
      const k = u < 0.15 ? ease(u / 0.15) * 0.15 : u > 0.85 ? 0.85 + ease((u - 0.85) / 0.15) * 0.15 : u;
      out.pos.lerpVectors(w.land, w.home, k);
      out.beat = 6;
      out.u = u;
    } else {
      out.pos.copy(w.home);
      out.beat = 7;
    }
    if (out.beat <= 2) out.y = rampY(out.pos.length()); // on the runway / the wedge
    else if (out.beat >= 4) out.y = 0; // on the canvas
    // facing: the direction of travel until he lands, then the opponent
    const inYaw = Math.atan2(w.inward.x, w.inward.y);
    const turn = (a: number, b: number, u: number) => {
      let d = b - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return a + d * ease(THREE.MathUtils.clamp(u, 0, 1));
    };
    if (out.beat <= 4) out.yaw = inYaw;
    else if (out.beat === 5) out.yaw = turn(inYaw, w.homeYaw, (t - t4) / 0.5);
    else out.yaw = w.homeYaw; // backing into the corner, eyes on the opponent
  }

  private updateWalk(dt: number) {
    const t = this.phaseT;
    this.hype = 1;
    const cur = { pos: new THREE.Vector2(), y: 0, yaw: 0, flip: 0, beat: 0, u: 0 };
    for (const w of this.walk) {
      const f = w.f;
      const prev = f.pos.clone();
      const prevY = f.y;
      this.walkAt(w, t, cur);
      f.pos.copy(cur.pos);
      f.y = cur.y;
      f.yaw = cur.yaw;
      f.flip = cur.flip;
      if (dt > 0) {
        f.vel.set((f.pos.x - prev.x) / dt, (f.pos.y - prev.y) / dt);
        f.vy = (f.y - prevY) / dt;
      }
      f.speed = f.vel.length();
      f.kb.set(0, 0);
      f.dash.set(0, 0);
      f.sprinting = cur.beat === 2;
      // THE STRUT is one continuous arm script driven by the walk's progress (see animateFighter): the gate pose
      // flows into it and it flows into the sprint — nothing ever snaps. `swagger` is its progress: 0 at the gate,
      // 1 at the end of the strut, then it fades out over the first strides of the sprint.
      if (cur.beat === 0) f.swagger = -1 + cur.u * 0.999; // the arms come up at the gate
      else if (cur.beat === 1) f.swagger = cur.u;
      else if (cur.beat === 2) f.swagger = 1 + Math.min(1, cur.u / 0.3);
      else f.swagger = 0;
      // the crowd cues of the strut: pyro + roar on each fist pump, sparks on the chest pound, a "look at him" on the point
      const cues = [0.2, 0.46, 0.7, 0.9];
      while (cur.beat === 1 && w.cue < cues.length && cur.u >= cues[w.cue]) {
        const k = w.cue++;
        if (k < 2) {
          const sgn = k === 0 ? 1 : -1;
          const px = f.pos.x + w.perp.x * sgn * 3.6;
          const pz = f.pos.y + w.perp.y * sgn * 3.6;
          this.fx.spark(new THREE.Vector3(px, f.y + 0.2, pz), 46, 13, 0xffd27a, new THREE.Vector3(0, 1, 0), 0.3, 1.6, 14);
          this.fx.spark(new THREE.Vector3(px, f.y + 0.2, pz), 20, 9, 0xffffff, new THREE.Vector3(0, 1, 0), 0.4, 1.2, 10);
          this.crowdRoar(0.9, 2.2);
          if (f === this.player || f === this.enemy) this.sfx.pyro(0.6);
        } else if (k === 2) {
          const cx = f.pos.x + Math.sin(f.yaw) * 0.9;
          const cz = f.pos.y + Math.cos(f.yaw) * 0.9;
          this.fx.spark(new THREE.Vector3(cx, f.y + 4.9, cz), 26, 7, 0xffd080, undefined, 0.8, 0.4, 12);
          this.sfx.hit(0.5);
          this.sfx.crackle(0.6);
          if (!f.isPlayer && f === this.enemy) this.sfx.say(`And the challenger... ${this.def.name}!`);
        } else {
          this.crowdRoar(1, 2.4);
          if (f.isPlayer) this.sfx.say(`${PLAYER_NAME}!`);
        }
      }
      // THE FLIGHT: airborne, tucked for the flip; the lip of the wedge throws sparks as he leaves it
      if (cur.beat === 3) {
        if (f.state !== 'air') {
          f.state = 'air';
          f.tauntT = 0;
          // the push-off: the wedge takes the whole weight — sparks off the lip, a dust ring, a thud and a shake
          this.fx.spark(new THREE.Vector3(f.pos.x, f.y + 0.1, f.pos.y), 34, 9, 0xffd27a, new THREE.Vector3(-w.inward.x, 0.6, -w.inward.y), 0.5, 1.2, 12);
          this.fx.spark(new THREE.Vector3(f.pos.x, f.y + 0.1, f.pos.y), 22, 5, 0x9a9aa8, undefined, 1.2, 0.5, 4);
          this.fx.ring(f.pos.x, f.pos.y, 0xaeb6c8, 2.4, 0.32, f.y + 0.06);
          this.sfx.step(2.0);
          this.sfx.servo();
          this.sfx.whoosh(1);
          this.crowdRoar(1, 2.2);
          if (f.isPlayer) {
            this.fovKick = 3;
            this.trauma = Math.min(1, this.trauma + 0.22);
          }
        }
        // the apex: a beat of slow motion so the flip reads, then it drops out of the sky at full speed
        if (f.isPlayer && cur.u > 0.36 && !w.apex) {
          w.apex = true;
          this.slowScale = 0.5;
          this.slowT = 0.26;
        }
        // the tuck follows the rotation: knees come up as the turn speeds up, open out as it slows, and the legs
        // reach down for the canvas on the last part of the descent
        const fu = THREE.MathUtils.clamp((cur.u - 0.07) / 0.83, 0, 1);
        const sm = (a: number, b: number) => THREE.MathUtils.smoothstep(fu, a, b);
        f.pkTuck = Math.max(0.12, sm(0, 0.28) * (1 - sm(0.68, 0.96)));
      } else {
        if (f.state === 'air') f.state = 'idle';
        f.pkTuck += (0 - f.pkTuck) * (1 - Math.exp(-12 * dt));
      }
      // the last strides into the wedge: he loads up — hips drop, arms swing back — for the take-off
      const wantPre = cur.beat === 2 && cur.u > 0.78 ? 1 : 0;
      f.pkPre += (wantPre - f.pkPre) * (1 - Math.exp(-(wantPre > f.pkPre ? 12 : 16) * dt));
      if (cur.beat >= 4 && !w.landed) {
        // TONNES OF STEEL HIT THE CANVAS: the whole ring dips and every rope jolts, a shockwave and dust roll out
        // from under both boots, sparks jump, the camera takes the hit (a frame-freeze, then a beat of slow motion)
        w.landed = true;
        f.state = 'idle';
        f.vy = 0;
        f.pkLand = 1;
        f.pkTuck = 0;
        this.arena.canvasSlam(f.pos.x, f.pos.y, 3);
        const sy = Math.sin(f.yaw);
        const cy = Math.cos(f.yaw);
        for (const sgn of [-1, 1]) {
          const bx = f.pos.x + cy * sgn * 0.78 * f.scale;
          const bz = f.pos.y - sy * sgn * 0.78 * f.scale;
          this.fx.ring(bx, bz, 0xd8dce8, 1.9, 0.3, 0.07);
          this.fx.spark(new THREE.Vector3(bx, 0.15, bz), 30, 7, 0xb8bccb, undefined, 1.3, 0.6, 5);
          this.fx.spark(new THREE.Vector3(bx, 0.2, bz), 16, 10, 0xffc070, new THREE.Vector3(0, 0.7, 0), 0.6, 0.5, 12);
        }
        // both fists punch the canvas: a burst of hot sparks off each glove
        for (const sgn of [-1, 1]) {
          const fx0 = f.pos.x + sy * 1.0 * f.scale + cy * sgn * 1.05 * f.scale;
          const fz0 = f.pos.y + cy * 1.0 * f.scale - sy * sgn * 1.05 * f.scale;
          this.fx.ring(fx0, fz0, 0xffd9a0, 1.4, 0.28, 0.07);
          this.fx.spark(new THREE.Vector3(fx0, 0.25, fz0), 26, 11, 0xffb060, new THREE.Vector3(0, 0.8, 0), 0.8, 0.5, 14);
          this.fx.spark(new THREE.Vector3(fx0, 0.2, fz0), 14, 6, 0xffffff, undefined, 1.1, 0.35, 6);
        }
        this.fx.impactWave(new THREE.Vector3(f.pos.x, 0.35, f.pos.y), new THREE.Vector3(0, 1, 0), 0xdfe6ff, 5.2, 0.3);
        this.fx.ring(f.pos.x, f.pos.y, 0xc8d0e0, 3.6, 0.45, 0.07);
        this.fx.spark(new THREE.Vector3(f.pos.x, 0.3, f.pos.y), 70, 8, 0x9ea3b4, undefined, 1.6, 0.9, 4); // the dust cloud
        this.sfx.hit(1.0);
        this.sfx.step(2.2);
        this.sfx.ropeSlam(0.9);
        this.crowdRoar(1, 3.2);
        this.hype = 1;
        if (f === this.player || f === this.enemy) this.pyro(0.7);
        if (f.isPlayer) {
          this.freeze = 0.04;
          this.slowScale = 0.36;
          this.slowT = 0.18;
          this.camBump = 0.5;
          this.fovKick = -5;
          this.trauma = Math.min(1, this.trauma + 0.6);
          this.showBanner(PLAYER_NAME, 'IS IN THE RING', 'round', 1.6);
        }
      }
      if (cur.beat === 4) {
        f.pkLand = 1; // the landing crouch is held dead still — planted, no wobble
      } else if (cur.beat >= 5) {
        f.pkLand += (0 - f.pkLand) * (1 - Math.exp(-(f.tauntT > 0 ? 12 : 7) * dt)); // one decisive drive up
      }
      if (cur.beat === 5 && !w.raised && cur.u > 0.12) {
        // up on his feet: arms up at the opponent
        w.raised = true;
        this.sfx.servo();
        this.taunt(f, 1);
        if (f.isPlayer) this.sfx.say(`${PLAYER_NAME}... is in the building!`);
      }
      if (cur.beat === 6 && f.tauntT > 0.15) f.tauntT = 0.15;
      this.tickTaunt(f, dt);
    }
    // a slow pyro trickle along the aisles keeps the entrance lit
    this.walkPyroT -= dt;
    if (this.walkPyroT <= 0 && t < this.walk[0].t[2]) {
      this.walkPyroT = 0.55;
      for (const w of this.walk) {
        if (w.f !== this.player && w.f !== this.enemy) continue;
        const r = 21 + Math.random() * 12 + entryShift();
        const sgn = Math.random() < 0.5 ? -1 : 1;
        const px = -w.inward.x * r + w.perp.x * sgn * 3.7;
        const pz = -w.inward.y * r + w.perp.y * sgn * 3.7;
        this.fx.spark(new THREE.Vector3(px, rampY(r) + 0.2, pz), 16, 9, 0xffc060, new THREE.Vector3(0, 1, 0), 0.25, 1.2, 10);
      }
    }
    if (t >= WALK_T) this.finishWalk();
  }

  /** end of the parade (or Enter/Space to skip it): everybody in his corner, the round intro takes over */
  private finishWalk() {
    for (const w of this.walk) {
      w.f.reset(w.home.x, w.home.y, w.homeYaw);
      w.f.y = 0;
      w.f.tauntT = 0;
      w.f.swagger = 0;
      w.f.pkPre = 0;
      w.f.pkTuck = 0;
      w.f.pkLand = 0;
      w.f.flip = 0;
      w.f.sprinting = false;
      w.f.state = 'idle';
      w.f.mode = 'taunt';
    }
    this.walk = [];
    this.beginIntro(true);
  }

  private beginIntro(first: boolean) {
    this.phase = 'intro';
    this.phaseT = 0;
    const tag = this.ultra ? 'ULTRA HARD · ' : '';
    const card = this.teamMode && this.def2 ? `${PLAYER_NAME} & ${this.allyName}  VS  ${this.def.name} & ${this.def2.name}` : `${PLAYER_NAME}  VS  ${this.def.name}`;
    this.showBanner(`ROUND ${this.round}`, tag + (first ? card : `Skor ${this.wins[0]} - ${this.wins[1]}`), 'round', INTRO_COUNT[0] - 0.05);
    this.introStep = 0;
    this.sfx.bell(1);
    this.sfx.say(`Round ${['zero', 'one', 'two', 'three'][this.round] ?? this.round}`);
    this.sfx.cheer(0.5);
    this.camInit = false;
  }

  private beginFight() {
    this.resetExposure(); // the walk-in lights are not the ring lights: start the ring shot neutral
    this.phase = 'fight';
    this.phaseT = 0;
    for (const f of this.fighters()) {
      f.mode = 'normal';
      f.tauntT = 0;
      f.glowBoost = 0;
    }
    this.showBanner('FIGHT!', '', 'fight', 1.0);
    this.sfx.say('Fight!');
    this.sfx.cheer(1);
    this.trauma = 0.5;
    this.fovKick = -4;
    this.hype = 0.6;
    this.pyro(0.8); // the corner towers fire as the fight starts
  }

  private endRound(winner: Fighter, how: 'ko' | 'time') {
    this.phase = 'ko';
    this.phaseT = 0;
    const idx = winner.team;
    const youWon = winner.team === 0;
    this.wins[idx]++;
    winner.mode = 'victory';
    winner.glowBoost = 1.5;
    const mate = this.mateOf(winner);
    if (mate && mate.state !== 'ko') {
      mate.mode = 'victory';
      mate.glowBoost = 1.5;
    }
    const who = this.teamMode ? (youWon ? 'Tim kamu' : 'Tim lawan') : youWon ? 'Kamu' : this.def.name;
    if (how === 'ko') {
      this.showBanner('K.O.!', `${who} menang ronde ini`, 'ko', 3.2);
    } else {
      this.timeUp = true;
      this.showBanner('WAKTU HABIS', `${who} unggul poin`, 'ko', 3.0);
      this.sfx.bell(3);
      this.sfx.say('Time');
    }
    this.sfx.cheer(1);
    this.hype = 1;
    this.sfx.musicIntensity = 0.5;
    // the arena erupts when a round ends: a huge roar when YOU win, a big "ohhh" when the champion wins
    this.crowdRoar(youWon ? 1 : 0.7, how === 'ko' ? 4.2 : 3.4);
    if (youWon) this.pyro(1); // victory fireworks
  }

  private afterRound() {
    if (this.wins[0] >= 2 || this.wins[1] >= 2) {
      this.phase = 'matchEnd';
      this.phaseT = 0;
      this.result = this.wins[0] >= 2 ? 'win' : 'lose';
      this.banner = null;
      // the final result: a long, thunderous ovation for a win; a sympathetic, shorter one for a loss
      this.lastRoar = 0;
      this.crowdRoar(this.result === 'win' ? 1 : 0.55, this.result === 'win' ? 5.5 : 3.2);
      if (this.result === 'win') {
        this.pyro(1);
        window.setTimeout(() => this.pyro(0.9), 700);
        window.setTimeout(() => this.pyro(1), 1500);
      }
      this.sfx.say(this.result === 'win' ? 'Victory!' : 'Defeated');
      return;
    }
    this.round++;
    this.startRound();
  }

  /** PYRO: all four corner towers shoot a fountain of welding sparks into the air */
  private pyro(level: number) {
    for (const t of this.arena.towers) {
      this.fx.spark(t, 28 + Math.floor(level * 40), 10 + level * 8, 0xffd27a, new THREE.Vector3(0, 1, 0), 0.3, 1.7, 14);
    }
    this.sfx.pyro(level);
    this.trauma = Math.min(1, this.trauma + 0.1 * level);
  }

  /** the whole arena reacts: a roar + applause, the crowd jumps up, and the camera feels it a little */
  private crowdRoar(level: number, dur = 2.6) {
    const now = performance.now();
    if (now - this.lastRoar < 700 && level < 0.95) return;
    this.lastRoar = now;
    this.sfx.roar(level, dur);
    this.hype = Math.max(this.hype, Math.min(1, 0.55 + level * 0.45));
  }

  private showBanner(text: string, sub: string, kind: string, dur: number) {
    this.banner = { id: ++this.bannerId, text, sub, kind };
    this.bannerT = dur;
  }

  // ------------------------------------------------------------ main loop
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const frameMs = now - this.last;
    const raw = Math.min(0.066, frameMs / 1000);
    this.last = now;
    this.fpsEma += (Math.min(frameMs, 250) - this.fpsEma) * 0.08;
    // the governor watches for MISSED 60 Hz BEATS, not for an average: a stutter is what the player feels, so a
    // window in which a quarter of the frames ran long is enough to step a rung down.
    this.fpsT += frameMs / 1000;
    this.frames++;
    if (frameMs > 20.5) this.longFrames++;
    if (this.fpsT >= 0.5) {
      this.fps = this.frames / Math.max(0.05, this.fpsT);
      if (this.qWarm > 0) {
        // the first couple of seconds are not representative: every material in the hall compiles on its first
        // frame and the arena uploads its textures. Judging the GPU on that would drop a rung for nothing.
        this.qWarm -= this.fpsT;
        this.qSteady = 0;
      } else {
        this.adaptQuality(this.longFrames / Math.max(1, this.frames));
      }
      this.fpsT = 0;
      this.frames = 0;
      this.longFrames = 0;
    }
    this.step(raw);
  };

  /**
   * THE 60 FPS GOVERNOR. Called twice a second with the share of frames that missed the beat in that window.
   * A bad window drops a rung immediately (a soft frame rate is always worse than a softer picture), a good one
   * slowly climbs back — never onto a rung that already failed on this machine.
   */
  private adaptQuality(badFrameShare: number) {
    if (!this.qAuto) return;
    const ms = this.fpsEma;
    this.qCooldown = Math.max(0, this.qCooldown - 0.5);
    const last = this.qTier >= QUALITY_TIERS.length - 1;
    if (badFrameShare > 0.22 || ms > 21.5) {
      this.qSteady = 0;
      if (this.qCooldown > 0 || last) return;
      this.qTierFailed = this.qTier;
      this.applyTier(this.qTier + 1);
      // a hard miss (25 fps territory) reacts at once, a marginal one waits a beat before giving anything up
      this.qCooldown = ms > 27 || badFrameShare > 0.45 ? 1.0 : 2.4;
      return;
    }
    if (badFrameShare < 0.05 && ms < 19.2 && this.qTier > 0 && this.qTier - 1 !== this.qTierFailed) {
      // a genuinely solid 60 for five seconds: climb one rung back up
      this.qSteady += 0.5;
      if (this.qSteady >= 5) {
        this.qSteady = 0;
        this.applyTier(this.qTier - 1);
        this.qCooldown = 5;
      }
    } else {
      this.qSteady = 0;
    }
  }

  private applyTier(tier: number, force = false) {
    const next = THREE.MathUtils.clamp(Math.round(tier), 0, QUALITY_TIERS.length - 1);
    if (next === this.qTier && !force) return;
    this.qTier = next;
    const cfg = this.tierCfg();
    // 1 · the glossy floors: the canvas sheen first, the hall floor second (it is the bigger, softer one)
    const canvasMirror = cfg.mirror >= 1;
    const hallMirror = cfg.mirror >= 2;
    if (this.arena && (force || canvasMirror !== this.mirrorsOn || hallMirror !== this.hallMirrorOn)) {
      this.mirrorsOn = canvasMirror;
      this.hallMirrorOn = hallMirror;
      this.arena.setMirrors(canvasMirror, hallMirror);
    }
    // 2 · the multisample count on the HDR target (the grade pass FXAA covers what is left)
    if (this.composer) {
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        if (rt.samples !== cfg.samples) {
          rt.samples = cfg.samples;
          rt.dispose();
        }
      }
    }
    // 3 · the render scale — the single biggest lever there is
    if (force || cfg.scale !== this.quality) {
      this.quality = cfg.scale;
      this.renderer.setPixelRatio(this.pixelRatio());
      if (this.composer) this.resize();
    }
    // 4 · the shadow map of the key light
    if (this.arena) {
      const sh = this.arena.keyLight.shadow;
      if (sh.mapSize.x !== cfg.shadow) {
        sh.mapSize.set(cfg.shadow, cfg.shadow);
        if (sh.map) {
          sh.map.dispose();
          sh.map = null;
        }
      }
    }
    // 5 · the bloom
    if (this.bloom) this.bloom.enabled = cfg.bloom;
  }

  /** the render scale this device is allowed to run at, on top of the current tier */
  private pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.dprCap) * this.quality;
  }

  private tierCfg() {
    return QUALITY_TIERS[this.qTier];
  }

  /**
   * A 4K panel at dpr 2 means eight million pixels of HDR with MSAA and post — no GPU holds that at 60. The cap
   * keeps the frame inside a sane pixel budget (the FXAA and the MSAA share the edge work, so a slightly lower
   * density is invisible), and every rung of the ladder then scales it further.
   */
  static bootDprCap() {
    try {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      const budget = 2.9e6; // ≈ 2266 × 1275, the sweet spot for a modern laptop GPU at a locked 60
      return Math.max(0.75, Math.min(dpr, 2, Math.sqrt(budget / Math.max(1, w * h))));
    } catch {
      return 1.5;
    }
  }

  /**
   * WHICH RUNG TO START ON. Reading the GPU string is the only honest way to know before a single frame has been
   * drawn; software rasterizers go straight to the bottom, phone-class GPUs start low, and the governor takes it
   * from there in the first second of play.
   */
  private bootTier(): number {
    let gpu = '';
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    } catch {
      /* the string is a privilege, not a right */
    }
    if (/swiftshader|llvmpipe|software|basic render|mesa offscreen/.test(gpu)) return 4;
    if (/mali|adreno|powervr|videocore|vivante|tegra/.test(gpu)) return 3;
    const cores = navigator.hardwareConcurrency || 4;
    const px = (window.innerWidth || 1280) * (window.innerHeight || 720) * Math.min(window.devicePixelRatio || 1, 2) ** 2;
    if (/intel/.test(gpu) && /(hd|uhd|iris|graphics)/.test(gpu)) return px > 3.2e6 ? 2 : 1;
    if (cores <= 2) return 3;
    if (cores <= 4 && px > 3.2e6) return 2;
    // a discrete GPU we can name gets the full rig straight away — everything else starts one rung down and lets
    // the governor PROMOTE it after five solid seconds, because a first-second stutter is worse than a slightly
    // softer first second
    if (/apple m[1-9]|nvidia|geforce|rtx|gtx|radeon|rx ?\d|arc a\d|quadro/.test(gpu)) return 0;
    return gpu ? 1 : cores > 6 ? 1 : 2;
  }

  /** the manual exposure step (0.85 … 1.25), remembered between visits */
  setBrightness(b: number) {
    const v = (BRIGHTNESS_STEPS as readonly number[]).includes(b) ? b : 1.0;
    if (v === this.bright) return;
    this.bright = v;
    try {
      localStorage.setItem(LS_BRIGHT, String(v));
    } catch {
      /* ignore */
    }
    this.resetExposure();
    this.emitHud(true);
  }

  /** the graphics mode the player pinned (auto = the governor), remembered between visits */
  setGfxMode(m: GfxMode) {
    this.qMode = m;
    this.qAuto = m === 'auto';
    try {
      localStorage.setItem(LS_GFX, m);
    } catch {
      /* ignore */
    }
    if (!this.qAuto) this.applyTier(gfxTier(m));
    else this.applyTier(this.bootTier());
    this.emitHud(true);
  }

  /**
   * THE IRIS. Downsample the composed HDR frame to a single averaged pixel (three halvings) and read it back every
   * twelfth frame. `renderer.readRenderTargetPixels` is synchronous, so twelve frames of texture memory (plus the
   * GPU's own pipeline depth) is the safe margin — and it is one pixel, so the transfer is nothing.
   */
  private sampleScene() {
    if (this.aeDead) return;
    try {
      this.renderer.readRenderTargetPixels(this.meter.rt, 0, 0, 1, 1, this.aeBuf);
      const lum = (0.2126 * this.aeBuf[0] + 0.7152 * this.aeBuf[1] + 0.0722 * this.aeBuf[2]) / 255;
      this.aeKey += (THREE.MathUtils.clamp(lum, 0.001, 1.2) - this.aeKey) * 0.4;
    } catch {
      this.aeDead = true; // no readback on this driver — the picture simply keeps its fixed exposure
    }
  }

  /** the exposure the grade pass is told to use: the fixed base, times the gentle auto-exposure correction */
  private updateAutoExposure(dt: number) {
    this.aeHold = Math.max(0, this.aeHold - dt);
    if (this.aeHold > 0) {
      // a cinematic flash or a white-out IS the point of the shot: do not let the iris fight it
      this.aePause = Math.min(1.4, this.aePause + dt * 3);
      return;
    }
    this.aePause = Math.max(0, this.aePause - dt * 0.9);
    if (this.aePause > 0) return;
    // Asymmetric ON PURPOSE: a hot frame gets pulled down, a dark one is left exactly as it was lit. An
    // auto-exposure that also brightens is how a night scene ends up looking like day.
    const key = this.aeKey / Math.max(0.001, this.bright); // normalised: the slider is not a lighting change
    const want = THREE.MathUtils.clamp(0.26 / Math.max(0.02, key), 0.82, 1.0);
    this.aeGain += (want - this.aeGain) * (1 - Math.exp(-1.6 * dt));
  }

  private step(raw: number) {
    if (!this.paused) {
      if (this.freeze > 0) {
        this.freeze -= raw;
      } else if (this.slowT > 0) {
        this.slowT -= raw;
        this.timeScale = this.slowScale;
      } else {
        // ONE CLOCK FOR A FALL: a knock-down runs in REAL TIME. A launch no longer triggers slow-mo at all (see the
        // hit feedback), so the flight, the landing and the collapse are one continuous simulation at 1×; and if a
        // slow-mo from something else is still winding down, it eases out gently instead of snapping while a body
        // is still settling on the canvas.
        const inFight = this.phase === 'fight' || this.phase === 'ko';
        const settling = inFight && this.fighters().some((f) => f.state === 'air' || ((f.state === 'ko' || f.state === 'down') && f.fallS.x < 0.97));
        this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-(settling ? 5 : 16) * raw));
      }
      const dt = this.freeze > 0 ? 0 : raw * this.timeScale;
      this.time += raw;
      if (this.phase === 'menu') {
        this.trauma = 0;
        this.camBump = 0;
        this.camPush = 0;
        this.fovKick = 0;
        this.camImp.set(0, 0, 0);
        this.camImpVel.set(0, 0, 0);
        this.flashAmt = 0;
      }
      if (dt > 0) {
        this.simulate(dt);
        this.decap.update(dt, this.fx); // torn heads tumble & cables keep shorting out
      }
      this.updateAnimations(dt);
      if (this.freeze > 0 && this.frozenFighter) {
        const f = this.frozenFighter;
        const wave = Math.sin(this.freeze * 78) * 0.042;
        f.robot.root.position.x += Math.sin(f.yaw) * f.hitF * wave + Math.cos(f.yaw) * f.hitL * wave;
        f.robot.root.position.z += Math.cos(f.yaw) * f.hitF * wave - Math.sin(f.yaw) * f.hitL * wave;
      }
      this.fx.update(raw * Math.max(0.35, this.timeScale), this.camera);
      this.updateCamera(raw, dt); // the cinematic beats run on world time, so they slow down with the action
      this.updateWarn();
      this.focus.set((this.player.pos.x + this.enemy.pos.x) / 2, 3.4, (this.player.pos.y + this.enemy.pos.y) / 2);
      // the hero followspots ride the fighters' feet — from the walk-in, through the fight, to the count
      this.arena.track(this.player.robot.root.position, this.enemy.robot.root.visible ? this.enemy.robot.root.position : null);
      this.arena.update(this.time, raw, this.hype, this.focus);
      this.hype = Math.max(0.15, this.hype - raw * 0.12);
      if (this.bannerT > 0) {
        this.bannerT -= raw;
        if (this.bannerT <= 0) this.banner = null;
      }
      this.flashAmt = Math.max(0, this.flashAmt - raw * 3.2);
      this.flashEl.style.opacity = String(Math.min(1, this.flashAmt));
    }
    this.grade.uniforms.time.value = this.time;
    this.composer.render();
    // the iris runs on world time so it never counts a paused frame, and the flash hold keeps a strobe a strobe
    this.aeHold = Math.max(this.aeHold, this.flashAmt * 0.5 + (this.phase === 'intro' || this.phase === 'matchEnd' ? 0.3 : 0));
    this.updateAutoExposure(Math.min(0.05, raw));
    this.aeFrames++;
    if (this.aeFrames >= 12) {
      this.aeFrames = 0;
      this.sampleScene();
    }
    this.grade.uniforms.exposure.value = 1.13 * this.aeGain * this.bright;
    // ...and the top-end limiter rides along with it: the hotter the frame, the harder the ceiling
    this.grade.uniforms.guard.value = THREE.MathUtils.clamp((this.aeKey / Math.max(0.001, this.bright) - 0.34) / 0.3, 0, 1);
    this.emitHud(false);
  }

  /**
   * ATTACK INDICATOR (the thing God of War calls an enemy attack indicator): while an enemy attack is winding up, a ring
   * shrinks onto a DODGE button prompt over its head. YELLOW = normal strike, RED = cannot be blocked (grab / Overdrive),
   * GREEN = you already dodged this one. Press the button before the ring closes.
   */
  private updateWarn() {
    const e = this.enemy;
    const p = this.player;
    const m = e.move;
    let live = this.phase === 'fight' && e.state === 'attack' && !!m && !e.impacted && p.state !== 'ko' && p.state !== 'down';
    if (live && m && p.pos.distanceTo(e.pos) > (m.reach + 3.5) * e.scale) live = false;
    let v: THREE.Vector3 | null = null;
    if (live) {
      this.camera.updateMatrixWorld();
      v = new THREE.Vector3(e.pos.x, 6.7 * e.scale + e.y, e.pos.y).project(this.camera);
      if (v.z > 1) live = false;
    }
    if (!live || !m || !v) {
      if (this.warnOn) {
        this.warnOn = false;
        this.warnEl.style.display = 'none';
      }
      return;
    }
    // game-seconds until the strike lands = what is left of the warning + the travel of the strike itself
    const from = e.tellT > 0 ? m.strikeAt * 0.85 : e.moveT;
    const remain = Math.max(0, e.tellT) + Math.max(0, m.impact - from) * e.tscale * PACE;
    if (this.warnSeq !== e.moveSeq) {
      this.warnSeq = e.moveSeq;
      this.warnTotal = Math.max(0.25, remain);
      this.sfx.warn(UNBLOCKABLE.includes(m.id));
    }
    const ok = p.dodgeFor === e.moveSeq;
    const red = UNBLOCKABLE.includes(m.id);
    const kind = ok ? 'warn-ok' : red ? 'warn-red' : 'warn-yellow';
    if (!this.warnOn || this.warnKind !== kind) {
      this.warnOn = true;
      this.warnKind = kind;
      this.warnEl.className = `warn ${kind}`;
      this.warnEl.style.display = 'block';
      this.warnTag.textContent = ok ? 'AMAN!' : red ? 'TAK BISA DIBLOK — DODGE!' : 'DODGE!';
    }
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.warnEl.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
    const u = Math.max(0, Math.min(1, remain / this.warnTotal)); // 1 → 0 as the strike approaches
    const s = 0.62 + u * 2.0;
    this.warnRing.style.transform = `scale(${s.toFixed(3)})`;
    this.warnRing.style.opacity = String(0.3 + (1 - u) * 0.7);
    this.warnRing2.style.transform = `scale(${(s * 0.78).toFixed(3)})`;
    this.warnRing2.style.opacity = String(0.2 + (1 - u) * 0.5);
  }

  private simulate(dt: number) {
    this.phaseT += dt;
    for (const f of this.fighters()) f.animT += dt;
    this.trauma = Math.max(0, this.trauma - dt * 2.3);
    this.fovKick *= Math.exp(-9 * dt);

    switch (this.phase) {
      case 'menu':
        if (this.menuCamMode === 'arena') {
          // the menu background is a live demo fight when in Arena Cam mode
          this.demoBrain(this.player, this.enemy, this.demoP, dt);
          this.demoBrain(this.enemy, this.player, this.demoE, dt);
          this.updateFighter(this.player, this.enemy, dt);
          this.updateFighter(this.enemy, this.player, dt);
          this.separate();
        }
        this.hype = Math.max(this.hype, 0.45);
        break;
      case 'walk':
        this.updateWalk(dt);
        break;
      case 'intro': {
        // PRE-FIGHT SHOW: both machines throw a cocky show-off move at each other, then settle into the guard for
        // the 3 · 2 · 1 — sparks, servo barks and the crowd are the same one-shots the in-fight taunts use.
        const p = this.player;
        const e = this.enemy;
        if (this.introStep === 0 && this.phaseT >= INTRO_TAUNT_AT) {
          this.introStep = 1;
          p.mode = 'normal';
          e.mode = 'normal';
          const book = [10, 0, 10, 1, 10, 4, 10, 6]; // the fist clash leads; the others keep the rematches fresh
          const ps = book[(this.round * 2) % book.length];
          const es = book[(this.round * 2 + 1 + this.oppIndex) % book.length];
          this.taunt(p, ps);
          this.taunt(e, es);
          if (this.teamMode && this.ally && this.enemy2) {
            this.ally.mode = 'normal';
            this.enemy2.mode = 'normal';
            this.taunt(this.ally, book[(this.round * 2 + 3) % book.length]);
            this.taunt(this.enemy2, book[(this.round * 2 + 5) % book.length]);
          }
          this.crowdRoar(0.7, 2.0);
          this.hype = Math.max(this.hype, 0.5);
        }
        for (let k = 0; k < INTRO_COUNT.length; k++) {
          if (this.introStep === k + 1 && this.phaseT >= INTRO_COUNT[k]) {
            this.introStep = k + 2;
            const n = 3 - k;
            this.showBanner(String(n), k === 2 ? 'SIAP…' : '', 'count', 0.7);
            this.sfx.tick(1);
            this.sfx.say(String(n));
            this.fovKick = -1.2;
            if (k === 2) {
              // the last count: show over — every guard snaps up
              for (const f of this.fighters()) f.tauntT = Math.min(f.tauntT, 0.12);
            }
          }
        }
        for (const f of this.fighters()) this.tickTaunt(f, dt);
        if (this.phaseT > INTRO_T) this.beginFight();
        break;
      }
      case 'fight': {
        this.roundTime -= dt;
        if (this.roundTime <= 0) {
          const ratio = (f: Fighter | null) => (f ? f.hp / f.maxHp : 0);
          const pr = ratio(this.player) + (this.teamMode ? ratio(this.ally) : 0);
          const er = ratio(this.enemy) + (this.teamMode ? ratio(this.enemy2) : 0);
          this.endRound(pr >= er ? this.player : this.enemy, 'time');
          break;
        }
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 0;
        this.playerInput();
        this.updateEnemyAI(dt);
        if (this.teamMode && this.ally && this.enemy2) {
          if (this.ally.state !== 'ko') this.squadBrain(this.ally, this.foeOf(this.ally), this.squadA, dt);
          if (this.enemy2.state !== 'ko') this.squadBrain(this.enemy2, this.foeOf(this.enemy2), this.squadE, dt);
        }
        for (const f of this.fighters()) this.updateFighter(f, this.foeOf(f), dt);
        this.separate();
        break;
      }
      case 'ko':
        for (const f of this.fighters()) {
          f.wish.set(0, 0);
          f.blocking = false;
        }
        this.player.ippo = false;
        this.player.queued = null;
        for (const f of this.fighters()) this.updateFighter(f, this.foeOf(f), dt);
        this.separate();
        if (this.phaseT > (this.timeUp ? 3.2 : 4.2)) this.afterRound();
        break;
      case 'matchEnd':
        break;
    }
  }

  // ------------------------------------------------------------ input -> player
  private dirKeys() {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const lat = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return { fwd, lat };
  }

  private toward(a: Fighter, b: Fighter) {
    const v = new THREE.Vector2(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
    const l = v.length() || 1;
    return v.multiplyScalar(1 / l);
  }

  private playerInput() {
    const p = this.player;
    const { fwd, lat } = this.dirKeys();
    const f = this.toward(p, this.enemy);
    const r = new THREE.Vector2(-f.y, f.x);
    p.wish.set(0, 0);
    p.blocking = false;
    p.sprinting = false;
    p.ippo = false;
    if (p.state === 'idle' && p.dodgeT <= 0) {
      p.blocking = this.keys.has('Space') && p.stam > 0;
      const holdW = this.keys.has('KeyW') || this.keys.has('ArrowUp');
      // SPRINT: hold SHIFT (or F) and walk in any direction. A double-tap on W that you keep holding also runs.
      // A run only ends when the stamina is really empty, and only restarts once ~25 has recovered.
      if (p.stam <= 0.5) this.sprintLock = true;
      else if (p.stam > 25) this.sprintLock = false;
      // (e.shiftKey is checked on every key event as well, so a Shift that was pressed before the window had focus,
      //  or whose key-up got lost, can no longer make the run feel randomly unresponsive)
      const shift = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyF') || this.shiftHeld;
      const moving = fwd !== 0 || lat !== 0;
      // PEEK-A-BOO (hold E): a high, tight guard and a weaving body. It closes the distance on its own, slips straight
      // punches and charges the DEMPSEY ROLL. The price: stamina barely recovers, and throws beat it.
      const ippoOn = this.keys.has('KeyE') && p.stam > 2;
      p.ippo = ippoOn;
      if (ippoOn) p.blocking = true;
      const wantRun = !p.blocking && moving && !this.sprintLock && (shift || (this.runLatch && holdW && fwd > 0));
      const rageSpd = p.rage ? 1.15 : 1;
      const walkMul = 0.88 + 0.16 * this.fwMul; // calibrated pro-boxer step speed (1.04× at 1×, 1.36× at 3× — fast, grounded, never cartoony)
      const runMul = 0.85 + 0.25 * this.fwMul; // fast ring sprint multiplier when holding Shift
      if (ippoOn) {
        const im = walkMul * rageSpd;
        const dist = p.pos.distanceTo(this.enemy.pos);
        let fw = fwd;
        // approach assist: with no key held, creep in until you are in punching range
        if (fwd === 0 && lat === 0 && dist > 3.5 * this.enemy.scale && this.enemy.state !== 'ko' && this.enemy.state !== 'down') fw = 0.85;
        p.wish.addScaledVector(f, fw * (fw > 0 ? IPPO_FWD : IPPO_BACK) * im).addScaledVector(r, lat * IPPO_SIDE * im);
        const lim = IPPO_FWD * im;
        if (p.wish.length() > lim) p.wish.setLength(lim);
      } else if (wantRun) {
        p.sprinting = true;
        // forwards at full speed, sideways a little slower, backwards much slower
        const rs = RUN_SPEED * runMul * rageSpd;
        p.wish.addScaledVector(f, fwd * (fwd > 0 ? rs : rs * 0.5)).addScaledVector(r, lat * rs * 0.72);
        if (p.wish.length() > rs) p.wish.setLength(rs);
      } else {
        const k = (p.blocking ? 0.5 : 1) * walkMul * rageSpd;
        p.wish.addScaledVector(f, fwd * (fwd > 0 ? WALK_FWD : WALK_BACK) * k).addScaledVector(r, lat * WALK_SIDE * k);
        const lim = (fwd > 0 ? WALK_FWD : fwd < 0 ? WALK_BACK : WALK_SIDE) * k;
        if (p.wish.length() > lim) p.wish.setLength(lim);
      }
    } else if (p.state === 'attack') {
      const rageSpd = p.rage ? 1.15 : 1;
      if (p.runStrike) {
        p.wish.addScaledVector(f, 3.4 * rageSpd); // a running punch keeps its forward momentum
      } else {
        const free = (p.impacted ? 3.8 : 1.5) * rageSpd; // once the punch has landed you can already glide away / reposition
        p.wish.addScaledVector(f, fwd * free).addScaledVector(r, lat * free * 1.15);
      }
    }
  }

  /**
   * RAGE MODE (KeyG): toggles hyper-aggressive combat mode — faster punch execution, earlier combo cancels,
   * faster footwork & dodges, heavier hit pushback, and blazing crimson-gold plasma aura.
   */
  public toggleRage() {
    if (this.phase !== 'fight' || this.paused) return;
    const p = this.player;
    if (p.state === 'ko' || p.state === 'down') return;
    p.rage = !p.rage;
    p.rageFlash = 1.1;
    this.sfx.init();
    if (p.rage) {
      p.glowBoost = Math.max(p.glowBoost, 3.4);
      this.sfx.charge();
      this.sfx.crackle(0.85);
      this.sfx.pyro(0.45);
      this.sfx.say('Rage mode!');
      this.trauma = Math.min(0.25, this.trauma + 0.08);
      this.fovKick = -1.5;
      this.fx.ring(p.pos.x, p.pos.y, 0xff3b2a, 6.8, 0.52, 0.12);
      this.fx.ring(p.pos.x, p.pos.y, 0xffb030, 4.0, 0.36, 0.08);
      this.fx.spark(new THREE.Vector3(p.pos.x, 3.8 * p.scale, p.pos.y), 40, 9.5, 0xff4a2a, new THREE.Vector3(0, 0.6, 0), 1.25, 0.55, 8);
      this.popup(new THREE.Vector3(p.pos.x, 6.8, p.pos.y), '🔥 RAGE MODE: AGRESIF!', 'pop-crit');
      this.crowdRoar(0.55, 1.4);
    } else {
      this.sfx.click();
      this.popup(new THREE.Vector3(p.pos.x, 6.5, p.pos.y), 'RAGE MATI', 'pop-info');
    }
    this.emitHud(true);
  }

  private playerDodge() {
    const p = this.player;
    if (this.phase !== 'fight') return;
    const e = this.enemy;
    const incomingDeadly = e.state === 'attack' && !!e.move && !e.impacted;
    // dodge-cancel: you may always bail out of any non-Overdrive swing (or any swing when an enemy attack is incoming!) to dodge
    if (p.state === 'attack' && p.move && (p.impacted || !isOD(p.move.id) || incomingDeadly)) {
      p.state = 'idle';
      p.move = null;
      p.runStrike = false;
      p.ippoStrike = false;
      p.queued = null;
    }
    // Fluid chain-dodge: allow seamless pendulum re-dodge once 58% of the current dodge has played, or immediately if an attack is incoming
    if (p.dodgeT > 0 && p.dodgeT <= p.dodgeDur * 0.42) {
      p.dodgeT = 0;
      p.dodgeCd = 0;
    }
    if (incomingDeadly) {
      p.dodgeCd = 0; // never lock the player out of dodging an incoming enemy attack
      p.stam = Math.max(p.stam, 10);
      if (p.dodgeT > 0) p.dodgeT = 0; // allow re-dodging if an enemy chains into a deadly follow-up
    }
    if (p.state !== 'idle' || p.dodgeT > 0) return;
    const { fwd, lat } = this.dirKeys();
    const f = this.toward(p, this.enemy);
    const r = new THREE.Vector2(-f.y, f.x);
    const d = new THREE.Vector2();
    const dist = p.pos.distanceTo(e.pos);
    const sweetDist = 3.25 * (p.scale + e.scale) * 0.5; // ideal pro-boxing pocket range for instant counters
    let speedMul = 1.0;

    if (fwd === 0 && lat === 0) {
      // SMART AUTO-RANGE SPACE DODGE: never blindly hop backward when the enemy isn't attacking!
      if (incomingDeadly && e.move) {
        // Enemy IS attacking: slip laterally to the outside of the punch while auto-fitting into counter range!
        const slipSide = e.move.arm === 0 ? 1 : e.move.arm === 1 ? -1 : p.aliSign;
        const autoFwd = THREE.MathUtils.clamp((dist - sweetDist) * 0.55, -0.32, 0.72);
        d.addScaledVector(f, autoFwd).addScaledVector(r, slipSide).normalize();
        speedMul = THREE.MathUtils.clamp(0.75 + Math.abs(dist - sweetDist) * 0.15, 0.72, 1.05);
      } else if (dist > sweetDist + 0.45 && e.state !== 'ko' && e.state !== 'down') {
        // Enemy is NOT attacking and is out of range: auto-step-in pendulum weave to close the gap right to sweetDist!
        const closeRatio = THREE.MathUtils.clamp((dist - sweetDist) / 2.4, 0.35, 1.0);
        d.addScaledVector(f, 0.94).addScaledVector(r, p.aliSign * 0.34).normalize();
        speedMul = 0.55 + 0.45 * closeRatio;
      } else {
        // Enemy is NOT attacking and we are already in the pocket: tight pro-boxer head-slip & angle pivot in place!
        const pocketFwd = THREE.MathUtils.clamp((dist - sweetDist) * 0.6, -0.1, 0.35);
        d.addScaledVector(f, pocketFwd).addScaledVector(r, p.aliSign * 0.95).normalize();
        speedMul = 0.48;
      }
    } else if (fwd === 0 && lat !== 0) {
      // Lateral dodge (A/D + Space): automatically curve slightly in/out to maintain ideal counter distance
      const autoFwd = THREE.MathUtils.clamp((dist - sweetDist) * 0.45, -0.15, 0.55);
      d.addScaledVector(f, autoFwd).addScaledVector(r, lat).normalize();
    } else {
      d.addScaledVector(f, fwd).addScaledVector(r, lat).normalize();
    }

    if (!this.startDodge(p, d, 'evade')) {
      if (p.stam < 10) this.popup(new THREE.Vector3(p.pos.x, 5.8, p.pos.y), 'TENAGA HABIS', 'pop-info');
      return;
    }
    p.dodgeSpeed *= speedMul;
    // ★ TIMED DODGE: the enemy attack that is winding up right now (warning or strike on its way) can no longer hit you.
    const m = e.move;
    if (e.state === 'attack' && m && !e.impacted) {
      p.dodgeFor = e.moveSeq;
    }
  }

  /**
   * TAUNT (M): beat your chest at the opponent. It fills the Overdrive meter and whips the crowd up —
   * but you are wide open while you do it (taking a hit hurts more and cancels it instantly).
   */
  /**
   * FREESTYLE. One entry point for the whole show-off book (poses.ts): every move is a robotic piece of business —
   * a shoulder roll, a beckoning flick, a cable flex, a windmill into a fist clap, a piston rev — rather than
   * something a human body does. They all run through the same rig, so they blend in and out of the guard cleanly.
   */
  private taunt(f: Fighter, style = 0) {
    if (f.state !== 'idle' || f.dodgeT > 0 || f.tauntT > 0) return false;
    const fs = FREESTYLE[THREE.MathUtils.clamp(Math.round(style), 0, FREESTYLE.length - 1)];
    f.tauntStyle = fs.id;
    f.tauntT = fs.dur;
    f.tauntDur = fs.dur;
    f.blocking = false;
    f.ippo = false;
    f.glowBoost = Math.max(f.glowBoost, fs.glow);
    this.sfx.servo();
    this.sfx.say(f.isPlayer ? fs.say : this.tauntBack(fs));
    if (this.phase === 'fight' || this.phase === 'intro' || this.phase === 'walk') {
      this.popup(new THREE.Vector3(f.pos.x, f.y + 6.6 * f.scale, f.pos.y), f.isPlayer ? fs.tag : this.tauntBack(fs).toUpperCase(), 'pop-crit');
      if (this.phase === 'fight') this.crowdRoar(0.4 + fs.dur * 0.12, 1.4 + fs.dur * 0.35);
    }
    return true;
  }

  /** the same show-off, thrown back at you with the trash talk of a machine that is not impressed */
  private tauntBack(fs: { id: number }) {
    switch (fs.id) {
      case 1:
        return 'Bow down!';
      case 2:
        return 'Missing me already?';
      case 4:
        return 'This is power.';
      case 5:
        return 'Hear that?';
      case 6:
        return 'Engine hot.';
      case 7:
        return 'Diagnostics complete.';
      case 8:
        return 'Feel the core.';
      case 9:
        return 'Spin cycle.';
      case 10:
        return 'Scrap metal.';
      default:
        return 'Is that all?';
    }
  }

  /**
   * The one-shots of the freestyle book. `poses.ts` says WHEN each beat happens (a progress 0 → 1) — the sound,
   * the sparks, the crowd and the camera kick all live here, so the animation and its feedback can never drift apart.
   */
  private fsCue(f: Fighter, s: string) {
    const yaw = f.yaw;
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // the robot's own left, in world space
    const at = (x: number, y: number, z: number) => new THREE.Vector3(f.pos.x + side.x * x, y * f.scale, f.pos.y + side.z * x + z);
    switch (s) {
      case 'beat':
        this.tauntBeat(f);
        break;
      case 'raise':
        this.tauntRaise(f);
        break;
      case 'clash':
        this.tauntClash(f);
        break;
      case 'chin': {
        // the cocky chin-up that ends the show: a servo bark, the eyes flare, a dust ring off the boots
        this.sfx.servo();
        this.sfx.pyro(0.22);
        f.glowBoost = Math.max(f.glowBoost, 3.4);
        this.fx.ring(f.pos.x, f.pos.y, 0xffe0a0, 3.0, 0.3, 0.05);
        this.fx.spark(at(0, 0.25, 0), 10, 3.6, 0x9aa8c0, undefined, 1.0, 0.4, 5);
        if (f.isPlayer) this.fovKick = -1.5;
        break;
      }
      case 'roll': {
        // the shoulder roll: servos whining, dust puffing off the boots as the weight shifts
        this.sfx.servo();
        this.sfx.whoosh(0.28);
        this.fx.spark(at(0.5, 0.22, 0), 5, 2.4, 0xbfc9d8, new THREE.Vector3(0, 1, 0), 0.8, 0.35, 4);
        this.fx.spark(at(-0.5, 0.22, 0), 5, 2.4, 0xbfc9d8, new THREE.Vector3(0, 1, 0), 0.8, 0.35, 4);
        if (f.isPlayer) this.trauma = Math.min(1, this.trauma + 0.05);
        break;
      }
      case 'beckon': {
        // the flick of the palms: a quiet servo tick and a spark off each hand
        this.sfx.tick();
        for (const sx of [1, -1]) this.fx.spark(at(sx * 0.85, 4.5, 0.5), 5, 2.6, 0x9fe6ff, new THREE.Vector3(0, 0.4, 0.6), 0.5, 0.3, 4);
        break;
      }
      case 'flex': {
        // CABLE FLEX: the tension really does crackle — arcs across both shoulders and the lights surge
        this.sfx.crackle(0.7);
        f.glowBoost = Math.max(f.glowBoost, 3.2);
        for (const sx of [1, -1]) {
          const p = at(sx * 1.15, 4.7, -0.1);
          this.fx.spark(p, 10, 4.5, 0x8fd0ff, new THREE.Vector3(0, 0.2, 0), 0.6, 0.4, 10);
          this.fx.ring(p.x, p.z, 0x8fd0ff, 1.5, 0.3, 0.05);
        }
        if (f.isPlayer) this.fovKick = -2;
        break;
      }
      case 'clap': {
        // the windmill ends in a metal clap: a hard crack, a shock ring and a kick through the camera
        this.sfx.hit(0.5);
        this.sfx.crackle(0.8);
        f.glowBoost = Math.max(f.glowBoost, 3.4);
        this.fx.spark(at(0, 4.6, 0.7), 22, 7, 0xffd27a, new THREE.Vector3(0, 0.3, 0.4), 1.1, 0.5, 12);
        this.fx.ring(f.pos.x, f.pos.y, 0xffe0a0, 4.6, 0.5, 0.09);
        if (f.isPlayer) {
          this.trauma = Math.min(1, this.trauma + 0.3);
          this.camBump = Math.max(this.camBump, 0.22);
          this.fovKick = -4;
        }
        break;
      }
      case 'rev': {
        // the piston rev: a pneumatic bark, sparks off the fists and the chest reactor pulsing harder
        this.sfx.pyro(0.3);
        this.sfx.crackle(0.5);
        f.glowBoost = Math.max(f.glowBoost, 3);
        for (const sx of [1, -1]) this.fx.spark(at(sx * 0.7, 2.6, -0.2), 9, 4, 0xffb45a, new THREE.Vector3(0, -0.3, 0), 0.7, 0.4, 6);
        if (f.isPlayer) this.trauma = Math.min(1, this.trauma + 0.12);
        break;
      }
      case 'check': {
        // SERVO CHECK: a joint snapping to its station — one hard servo tick, one spark off the fist
        this.sfx.tick(1);
        this.sfx.servo();
        const side = s === 'check' ? (f.hand === 1 ? 1 : -1) : 1;
        this.fx.spark(at(side * 1.1, 4.4, 0.6), 6, 3, 0xbfe6ff, new THREE.Vector3(0, 0.3, 0.5), 0.5, 0.3, 4);
        break;
      }
      case 'charge': {
        // CORE OVERLOAD: the reactor winds up — the chest lights climb and the plates start throwing arcs
        this.sfx.charge();
        this.sfx.crackle(0.65);
        f.glowBoost = Math.max(f.glowBoost, 3.2);
        this.fx.spark(at(0, 3.6, 0.35), 12, 4.5, 0x8fd0ff, new THREE.Vector3(0, 0.2, 0.8), 0.7, 0.4, 8);
        this.fx.ring(f.pos.x, f.pos.y, 0x9fe0ff, 2.2, 0.35, 0.05);
        if (f.isPlayer) this.trauma = Math.min(1, this.trauma + 0.06);
        break;
      }
      case 'spin': {
        // DRILL FISTS: the wrists spin up — a fast servo whine and sparks skipping off both fists
        this.sfx.servo();
        this.sfx.screech(0.4);
        for (const sx of [1, -1]) this.fx.spark(at(sx * 0.7, 3.9, 1.0), 7, 3.2, 0xffd27a, new THREE.Vector3(0, 0, 0.8), 0.6, 0.3, 5);
        f.glowBoost = Math.max(f.glowBoost, 2.2);
        break;
      }
      case 'roar': {
        // standing out of the rev: the machine roars and the house answers
        this.sfx.hit(0.4);
        this.sfx.cheer(1);
        this.sfx.pyro(0.5);
        this.fx.ring(f.pos.x, f.pos.y, 0xffb45a, 5.4, 0.55, 0.09);
        this.fx.spark(at(0, 0.3, 0), 18, 4.5, 0x9aa8c0, undefined, 1.2, 0.5, 7);
        this.crowdRoar(0.8, 2.2);
        break;
      }
    }
  }

  /** the moment both arms lock overhead in the Zeus taunt: a shockwave, sparks off the fists, lights flare */
  private tauntRaise(f: Fighter) {
    this.sfx.hit(0.45);
    this.sfx.pyro(0.55);
    this.sfx.cheer(0.9);
    f.glowBoost = Math.max(f.glowBoost, 3);
    const up = new THREE.Vector3(0, 1, 0);
    // sparks streaming up off both raised fists
    for (const s of [1, -1]) {
      this.fx.spark(new THREE.Vector3(f.pos.x + s * 1.1 * f.scale, 8.4 * f.scale, f.pos.y), 16, 7, 0xffd27a, up, 0.5, 0.8, 11);
    }
    this.fx.ring(f.pos.x, f.pos.y, 0xffe0a0, 7, 0.6, 0.08);
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.25, f.pos.y), 22, 5, 0x9aa8c0, undefined, 1.4, 0.6, 7);
    if (f.isPlayer) {
      this.trauma = Math.min(1, this.trauma + 0.25);
      this.camBump = Math.max(this.camBump, 0.2);
      this.fovKick = -3;
    }
  }

  /** the chest thumps inside the taunt: a metal boom, a burst of welding sparks off the breastplate and a camera kick */
  private tauntBeat(f: Fighter) {
    this.sfx.hit(0.42);
    this.sfx.crackle(0.6);
    f.glowBoost = Math.max(f.glowBoost, 2.8);
    const fwd = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw)); // the way the machine faces
    const c = new THREE.Vector3(f.pos.x + fwd.x * 0.7 * f.scale, 5.1 * f.scale, f.pos.y + fwd.z * 0.7 * f.scale); // the breastplate
    this.fx.spark(c, 20, 7, 0xffd27a, new THREE.Vector3(fwd.x, 0.5, fwd.z), 1.3, 0.5, 14);
    this.fx.spark(c, 8, 4, 0xffffff, new THREE.Vector3(0, 1, 0), 0.6, 0.3, 6);
    this.fx.ring(f.pos.x, f.pos.y, 0xffd27a, 3.4, 0.35, 0.08);
    this.trauma = Math.min(1, this.trauma + (f.isPlayer ? 0.14 : 0.08));
    if (f.isPlayer) this.camBump = Math.max(this.camBump, 0.12);
  }

  /** the FIST CLASH: both gloves slammed together in front of the sternum — a steel crack and a fan of sparks */
  private tauntClash(f: Fighter) {
    this.sfx.hit(0.55);
    this.sfx.crackle(0.75);
    this.sfx.tick(0.8);
    f.glowBoost = Math.max(f.glowBoost, 3.2);
    const fwd = new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw)); // the way the machine faces
    const c = new THREE.Vector3(f.pos.x + fwd.x * 2.1 * f.scale, 5.25 * f.scale, f.pos.y + fwd.z * 2.1 * f.scale); // where the two gloves meet
    // sparks squirt out sideways + up from between the two gloves, like two anvils meeting
    const side = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    this.fx.spark(c, 16, 7.5, 0xffd27a, new THREE.Vector3(side.x, 0.9, side.z), 1.2, 0.5, 12);
    this.fx.spark(c, 16, 7.5, 0xffd27a, new THREE.Vector3(-side.x, 0.9, -side.z), 1.2, 0.5, 12);
    this.fx.spark(c, 10, 5, 0xffffff, new THREE.Vector3(0, 1, 0), 0.7, 0.35, 8);
    this.fx.ring(f.pos.x + fwd.x * 0.6, f.pos.y + fwd.z * 0.6, 0xffe0a0, 3.8, 0.4, 0.08);
    this.trauma = Math.min(1, this.trauma + (f.isPlayer ? 0.16 : 0.1));
    if (f.isPlayer) {
      this.camBump = Math.max(this.camBump, 0.14);
      this.fovKick = -2;
    }
  }

  /** the reward for a correctly timed dodge: crisp slow motion, a counter-attack bonus and massive comeback meter */
  private perfectDodge(d: Fighter, m?: Move) {
    if (d.isPlayer && this.phase === 'fight') this.stats.dodges++;
    const deadly = !!m && (isOD(m.id) || UNBLOCKABLE.includes(m.id) || m.power >= 0.6);
    const comeback = d.hp <= d.maxHp * 0.45;
    d.counterT = 2.4;
    d.dodgeWinT = Math.max(d.dodgeWinT, 1.2);
    d.counterCd = 0; // immediately unlock L counter-attack after a dodge!
    d.stam = Math.min(100, d.stam + 22);
    const gain = m && isOD(m.id) ? 100 : deadly ? (comeback ? 100 : 45) : comeback ? 36 : 24;
    d.meter = Math.min(100, d.meter + gain);
    this.popup(
      new THREE.Vector3(d.pos.x, 6.1, d.pos.y),
      deadly ? '⚡ HINDARAN MAUT! [R / L]' : 'PERFECT DODGE! [L]',
      'pop-dodge',
    );
    if (d.isPlayer && d.meter >= 100 && !this.meterReadyShown) {
      this.meterReadyShown = true;
      this.sfx.ready();
      this.popup(new THREE.Vector3(d.pos.x, 6.9, d.pos.y), '🔥 OVERDRIVE COMEBACK SIAP! [R]', 'pop-crit');
    }
    this.slowT = deadly ? 0.28 : 0.22; // crisp reflex window to press R (Overdrive) or L (Counter)
    this.slowScale = deadly ? 0.45 : 0.52;
    this.flashAmt = Math.max(this.flashAmt, 0.22);
    this.fovKick = 3.0;
    this.fx.ring(d.pos.x, d.pos.y, 0x5affc8, deadly ? 7.5 : 6, 0.5, 0.1);
    this.fx.spark(new THREE.Vector3(d.pos.x, 3 * d.scale, d.pos.y), deadly ? 36 : 24, 6.5, 0x5affc8, undefined, 1.2, 0.5, 3);
    this.sfx.dodge();
    this.sfx.cheer(deadly ? 0.75 : 0.5);
  }

  /**
   * HAND SELECTION. The fists follow the feet: a tap right (D / ▶) takes the RIGHT fist, a tap left (A / ◀)
   * takes the LEFT one. Every strike thrown after that (jab, hook, uppercut, counter) comes out of that hand and
   * the whole animation mirrors with it — so a right jab really is a right jab. A tiny step is enough.
   */
  private setHand(h: 0 | 1) {
    const p = this.player;
    if (p.hand === h) return;
    p.hand = h;
    p.handT = 0.7;
    this.sfx.tick(0.55); // deliberately quiet: only a soft servo tick, no click
    p.robot.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    p.robot.shoulders[h].getWorldPosition(v);
    this.fx.spark(v, 5, 3, h === 1 ? 0xffb060 : 0x8fd0ff, new THREE.Vector3(0, 0.4, 0), 0.8, 0.3, 3);
  }

  /** the arm a strike is really thrown with (0 = left, 1 = right, 2 = both): the player's stance hand decides */
  private armOf(f: Fighter, m: Move): 0 | 1 | 2 {
    if (m.arm === 2 || !f.isPlayer) return m.arm;
    return f.hand;
  }

  /**
   * PUNCH FOOTWORK. Every strike throws the body forward (see beginStrike) — this decides how the legs answer it.
   * The foot on the PUNCHING side re-plants: the left hand drives off the lead (left) foot, the right hand swings
   * the rear (right) foot in behind it. The step is metred by the distance — a short, flat nudge at the clinch
   * (there is nothing to close), a real step-in while the enemy is still out of punching range.
   */
  private punchStepOf(f: Fighter, o: Fighter) {
    const none = { foot: -1, z: 0, x: 0, dur: 0.18, seq: -1, lift: undefined as number | undefined };
    const m = f.move;
    // ---- GET-UP FOOTWORK ----
    // Two plants, on the beat of the rise: the rear foot comes up under the hips first (that is the one the knee
    // tuck hands the weight to), then the lead foot squares the stance. The steps are slow and high so they read as
    // a machine heaving itself upright, not as a shuffle. The balance steps in robot.ts are muted while he is down.
    if (f.state === 'down') {
      // the two plants are authored in poses.ts so the tests drive the rig with exactly what ships
      const g = getupFoot(f.riseU, f.riseSteps);
      if (!g) return none;
      f.riseSteps = g.steps;
      // z/x = 0: the foot walks all the way home to its standing stance spot, which is where the leg IK wants it
      return { foot: g.foot, z: g.z, x: g.x, dur: g.dur, seq: g.seq, lift: g.lift };
    }
    if (f.state === 'stagger') {
      // Boxing reactive backward footwork: each hit forces a crisp backward recovery step so the defender
      // visibly steps back under pressure as they get driven across the ring.
      const foot = f.comboTaken % 2 === 0 ? 1 : 0;
      return {
        foot,
        z: -0.36 - Math.min(0.26, f.kb.length() * 0.028),
        x: foot === 0 ? -0.07 : 0.07,
        dur: 0.21,
        seq: 5000 + f.comboTaken + f.moveSeq * 10,
        lift: 0.18,
      };
    }
    if (f.state !== 'attack' || !m) return none;
    if (f.moveT < m.strikeAt * 0.4) return none; // wind-up / feint: the feet do not commit yet
    const foot = this.armOf(f, m) === 1 ? 1 : 0;
    const avg = Math.max(0.001, (f.scale + o.scale) * 0.5);
    const gap = f.pos.distanceTo(o.pos) / avg; // ~1 at the clinch, ~2.6 in punching range, 4+ out of range
    const far = THREE.MathUtils.clamp((gap - 1.15) / 1.9, 0, 1);
    const z = (0.13 + far * 0.46) * (0.8 + m.power * 0.45) * (f.runStrike ? 1.25 : 1);
    const x = (foot === 0 ? -0.05 : 0.07) * (0.5 + far * 0.8); // a small pivot towards the centre line
    // the foot has to land on the same beat as the fist (the move clock runs at PACE × tscale, faster out of a dodge)
    const dur = THREE.MathUtils.clamp(((m.impact - m.strikeAt * 0.4) * PACE * f.tscale) / Math.max(1, f.atkSpd), 0.1, 0.34);
    return { foot, z, x, dur, seq: f.moveSeq, lift: undefined as number | undefined };
  }

  /**
   * TARGET SWITCH. TAP SPACE (or press T) and the point of impact moves between the HEAD and the BODY. Everything
   * follows the target: the punch pose drops onto it, the impact point / sparks / shock ring happen exactly there,
   * and the damage profile changes — head = damage & stun, body = stamina & stability, so a turtle gets broken up.
   */
  private toggleAim() {
    if (this.phase !== 'fight' || this.paused) return;
    const p = this.player;
    // KEPALA → DADA → REMIX → KEPALA. In REMIX the target is re-picked for every punch (see pickMixAim), so a
    // combination lands head–body–head like a real boxer's, and the opponent can never set his guard for one level.
    p.aimMode = ((p.aimMode + 1) % 3) as 0 | 1 | 2;
    p.aim = p.aimMode === AIM_BODY ? AIM_BODY : AIM_HEAD;
    p.mixN = 0;
    p.aimT = 0.9;
    const body = p.aimMode === AIM_BODY;
    const mix = p.aimMode === AIM_MIX;
    this.sfx.click();
    this.popup(new THREE.Vector3(p.pos.x, 6.6, p.pos.y), mix ? 'TARGET: REMIX' : body ? 'TARGET: DADA' : 'TARGET: KEPALA', 'pop-info');
    if (mix) {
      // both levels light up: the head AND the chest
      this.fx.ring(p.pos.x, p.pos.y, 0xc89bff, 2.8, 0.35, 0.09);
      this.fx.spark(new THREE.Vector3(p.pos.x, 5.3 * p.scale, p.pos.y), 10, 4, 0x9fe6ff, undefined, 1, 0.35, 3);
      this.fx.spark(new THREE.Vector3(p.pos.x, 3.5 * p.scale, p.pos.y), 10, 4, 0xffa050, undefined, 1, 0.35, 3);
      p.robot.root.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      p.robot.chest.getWorldPosition(v);
      this.fx.flash(v, 1.3, 0xd0a8ff, 0.16);
      return;
    }
    this.fx.ring(p.pos.x, p.pos.y, body ? 0xff9a4a : 0x8fd0ff, 2.8, 0.35, 0.09);
    this.fx.spark(new THREE.Vector3(p.pos.x, (body ? 3.5 : 5.3) * p.scale, p.pos.y), 14, 4, body ? 0xffa050 : 0x9fe6ff, undefined, 1, 0.35, 3);
    p.robot.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    p.robot.chest.getWorldPosition(v);
    this.fx.flash(v, 1.3, body ? 0xffb070 : 0x9fd6ff, 0.16);
  }

  /**
   * REMIX TARGETING. The player does not aim each punch: the combination does. The pattern is a boxer's — go to the
   * body to bring the hands down, then up to the head; the uppercut digs the body when the guard is high; a
   * counter / Overdrive always goes for the head (that is where the KO is). Punches thrown as a chain alternate
   * levels, with a little noise so the opponent can never read the sequence. `mixN` resets when the chain breaks.
   */
  private pickMixAim(f: Fighter, id: MoveId): 0 | 1 {
    const tgt = this.foeOf(f);
    const chained = f.spamCount > 0; // thrown within a second of the last punch (startMove has just updated it)
    if (!chained) f.mixN = 0;
    const n = f.mixN++;
    if (isOD(id) || id === 'counter') return AIM_HEAD;
    const guardHigh = tgt.blocking || tgt.ippo;
    // body first when his guard is high (it opens him up), head first when he is already open
    const pattern = guardHigh ? [AIM_BODY, AIM_BODY, AIM_HEAD, AIM_BODY, AIM_HEAD] : [AIM_HEAD, AIM_BODY, AIM_HEAD, AIM_HEAD, AIM_BODY];
    let aim = pattern[n % pattern.length] as 0 | 1;
    if (id === 'upper' && guardHigh) aim = AIM_BODY; // the uppercut digs under a high guard
    if (Math.random() < 0.18) aim = aim === AIM_HEAD ? AIM_BODY : AIM_HEAD; // noise: never a readable sequence
    if (tgt.stam < 25) aim = AIM_HEAD; // he is gassed: go for the finish
    return aim;
  }

  /** where a strike lands: the target you picked decides how far down the impact point sits */
  private aimY(f: Fighter, m: Move) {
    return f.aim === AIM_BODY ? Math.max(2.5, m.hitY - AIM_DROP) : m.hitY;
  }

  /**
   * THE POINT OF IMPACT, taken straight off the model: a HEAD target lands between the EYES (their live world
   * position, so it follows the opponent's head wherever he moves it) and a BODY target lands on the chest plate,
   * just above the ribs. Nothing is guessed and nothing has to be marked on screen.
   */
  private aimPoint(d: Fighter, aim: number, out: THREE.Vector3) {
    const eyes = d.robot.eyeOptics;
    if (aim === AIM_HEAD && eyes.length >= 2) {
      out.set(0, 0, 0);
      for (const e of eyes) out.add(e.getWorldPosition(this.eyeTmp));
      out.multiplyScalar(1 / eyes.length);
      return out;
    }
    d.robot.chest.getWorldPosition(out);
    out.y -= 0.22 * d.scale; // the ribs sit just under the chest plate
    return out;
  }

  /** is this move actually aimed downward at the body? (throws and Overdrive sweeps keep their own shape) */
  private aimsLow(f: Fighter, m: Move) {
    return f.aim === AIM_BODY && m.id !== 'grab' && m.id !== 'slam';
  }

  /** the target reshapes the punch: body shots pitch down onto the ribs, head shots ride a little higher */
  private aimPose(f: Fighter, m: Move, p: Pose): Pose {
    if (this.aimsLow(f, m)) {
      const pitch = m.id === 'upper' ? 0.3 : 0.5; // an uppercut to the body still travels up, just from lower down
      return { sx: p.sx + pitch, sy: p.sy, sz: Math.min(1.2, p.sz + 0.06), ex: p.ex - 0.06 };
    }
    // HEAD: the eyes sit above the old strike line, so straights and hooks ride a touch higher to meet them
    if (f.aim === AIM_HEAD && (m.kind === 'front' || m.kind === 'side')) return { sx: p.sx - AIM_HEAD_LIFT, sy: p.sy, sz: p.sz, ex: p.ex };
    return p;
  }

  /**
   * A perfectly timed COUNTER STANCE: the incoming strike is caught, the attacker is knocked out of his swing,
   * time slows down and your own straight fires back instantly carrying the COUNTER bonus.
   */
  private parryCounter(d: Fighter, a: Fighter, m: Move) {
    const od = isOD(m.id) || UNBLOCKABLE.includes(m.id);
    const comeback = d.hp <= d.maxHp * 0.45;
    const toA = new THREE.Vector2().subVectors(a.pos, d.pos).normalize();
    const hitPos = new THREE.Vector3(d.pos.x + toA.x * 1.1 * d.scale, 4.4 * d.scale, d.pos.y + toA.y * 1.1 * d.scale);

    d.counterT = 2.2; // the riposte about to land counts as a COUNTER hit (1.6×)
    d.dodgeWinT = Math.max(d.dodgeWinT, 1.0);
    d.counterCd = 0;
    d.parryFor = -1;
    const gain = isOD(m.id) ? 100 : od ? (comeback ? 100 : 45) : comeback ? 38 : 26;
    d.meter = Math.min(100, d.meter + gain);
    d.stam = Math.min(100, d.stam + 22);
    if (comeback && d.isPlayer) {
      d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.06); // adrenaline survival surge on clutch parry
    }
    d.queued = null;
    if (!d.impacted) {
      d.moveT = Math.max(d.moveT, PARRY_ACTIVE - 0.02); // fire the counter-straight right now
    }
    d.invuln = Math.max(d.invuln, 0.45); // full invincibility through the counter riposte
    d.handT = 0.7;
    // Lock facing & attack line dead-center onto the enemy so the counter riposte is 100% accurate and never whiffs!
    d.attackDir.copy(toA);
    d.yaw = Math.atan2(toA.x, toA.y);
    d.vel.set(0, 0);
    const dist = d.pos.distanceTo(a.pos);
    const ideal = 3.25 * (d.scale + a.scale) * 0.5;
    if (dist > ideal) {
      d.dash.set(toA.x * Math.min(3.2, dist - ideal) * 6.2, toA.y * Math.min(3.2, dist - ideal) * 6.2);
    }

    // the attacker loses the move: even an armored Overdrive or Unblockable is shattered and staggered open right in front of you!
    a.move = null;
    a.queued = null;
    a.tellT = 0;
    a.tellTotal = 0;
    a.impacted = false;
    a.state = 'stagger';
    a.stunT = od ? 0.72 : 0.82;
    a.hit = 1;
    a.hitSign = Math.random() < 0.5 ? 1 : -1;
    a.vel.set(0, 0);
    a.dash.set(0, 0);
    a.kb.set(-toA.x * 0.6, -toA.y * 0.6); // keep the staggered enemy in front of the fist so the riposte connects cleanly!
    if (!a.isPlayer) {
      this.ai.blockT = 0;
      this.ai.reactT = -1;
      this.ai.punishT = 0;
      this.ai.queued = null;
      this.ai.defStreak = 0;
    }

    this.popup(
      new THREE.Vector3(d.pos.x, 6.2, d.pos.y),
      comeback ? '🔥 COMEBACK PARRY!' : od ? '⚡ DEADLY PARRY!' : 'COUNTER PARRY!',
      'pop-crit',
    );
    if (d.isPlayer && d.meter >= 100 && !this.meterReadyShown) {
      this.meterReadyShown = true;
      this.sfx.ready();
      this.popup(new THREE.Vector3(d.pos.x, 6.95, d.pos.y), '🔥 OVERDRIVE COMEBACK SIAP! [R]', 'pop-crit');
    }
    this.slowT = 0.24; // crisp, satisfying parry slow-mo
    this.slowScale = 0.48;
    this.flashAmt = Math.max(this.flashAmt, 0.26);
    this.freeze = 0.06;
    this.frozenFighter = a;
    this.trauma = Math.min(0.6, this.trauma + 0.26);
    this.camPush += 0.24;
    this.camBump = Math.max(this.camBump, 0.14);
    this.fovKick = 3.8;
    this.fx.ring(hitPos.x, hitPos.z, 0xffe6a8, 6.5, 0.45, 0.1);
    this.fx.ring(hitPos.x, hitPos.z, 0xffffff, 3.6, 0.3, 0.07);
    this.fx.spark(hitPos, 36, 9.5, 0xffd27a, new THREE.Vector3(toA.x, 0.3, toA.y), 1.1, 0.55, 9);
    this.fx.flash(hitPos, 1.8, 0xfff0c0, 0.14);
    this.sfx.block(0.75); // steel catching steel
    this.sfx.crackle(0.75);
    this.sfx.cheer(0.7);
    this.hype = Math.max(this.hype, 0.8);
  }

  private playerDash(kind: 'fwd' | 'back' | 'side', sign: number) {
    const p = this.player;
    const e = this.enemy;
    const incomingDeadly = e.state === 'attack' && !!e.move && !e.impacted;
    if (p.state === 'attack' && p.move && (p.impacted || !isOD(p.move.id) || incomingDeadly)) {
      p.state = 'idle';
      p.move = null;
      p.runStrike = false;
      p.ippoStrike = false;
      p.queued = null;
    }
    if (p.dodgeT > 0 && p.dodgeT <= p.dodgeDur * 0.42) {
      p.dodgeT = 0;
      p.dodgeCd = 0;
    }
    if (incomingDeadly) {
      p.dodgeCd = 0;
      p.stam = Math.max(p.stam, 8);
      if (p.dodgeT > 0) p.dodgeT = 0;
    }
    if (p.state !== 'idle' || p.dodgeT > 0) return;
    const f = this.toward(p, this.enemy);
    const r = new THREE.Vector2(-f.y, f.x);
    const d = new THREE.Vector2();
    if (kind === 'fwd') d.copy(f);
    else if (kind === 'back') d.copy(f).multiplyScalar(-1);
    else d.copy(r).multiplyScalar(sign);
    if (this.startDodge(p, d, kind) && incomingDeadly) {
      p.dodgeFor = e.moveSeq;
    }
  }

  private startDodge(f: Fighter, dir: THREE.Vector2, kind: 'evade' | 'fwd' | 'back' | 'side' = 'evade') {
    const cfg = {
      evade: { dur: 0.36, speed: 13.5, inv: true, cost: 9, cd: 0.22 },
      fwd: { dur: 0.3, speed: 23.5, inv: false, cost: 6, cd: 0.2 },
      back: { dur: 0.33, speed: 16.8, inv: true, cost: 7, cd: 0.24 },
      side: { dur: 0.33, speed: 19.8, inv: true, cost: 6, cd: 0.2 },
    }[kind];
    // the enemy's dodge gets cheaper as its IQ grows (a clever fighter wastes less energy), the player's cost never changes
    const cost = (f.isPlayer ? cfg.cost : cfg.cost / Math.pow(this.iq, 0.25)) * STAM_SCALE;
    if (f.dodgeCd > 0 || f.stam < cost || f.state !== 'idle') return false;
    f.dodgeT = cfg.dur;
    f.dodgeDur = cfg.dur;
    f.dodgeTail = 0.24;
    const rageBoost = f.isPlayer && f.rage ? 1.18 : 1;
    f.dodgeSpeed = cfg.speed * (f.isPlayer ? Math.pow(this.fwMul, 0.6) : 1) * rageBoost; // dashes grow more slowly than walking (3× → 1.9×)
    // Player sidesteps/backsteps/evades and 3×+ AI dodges have full invulnerability mid-dodge so deadly punches can always be slipped!
    f.dodgeInv = cfg.inv || (f.isPlayer && kind !== 'fwd') || (!f.isPlayer && this.iq >= 3);
    f.dodgeKind = kind;
    f.dodgeDir.copy(dir);
    f.aliSign = (f.aliSign > 0 ? -1 : 1); // alternate weave rhythm for Muhammad Ali pendulum flow
    // enemy dodge cooldown: 2× the player's (the old value) was far too long to ever see it dodge twice in a row
    f.dodgeCd = cfg.cd * (f.isPlayer ? (f.rage ? 0.78 : 1) : Math.max(0.6, 1.6 / Math.sqrt(this.iq)));
    f.stam -= cost;
    f.blocking = false;
    this.sfx.dodge();
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.3, f.pos.y), kind === 'evade' ? 14 : 22, 6, 0x8fd0ff, undefined, 1, 0.4, 3);
    this.fx.ring(f.pos.x, f.pos.y, 0x8fd0ff, 3, 0.3, 0.07);
    if (f.isPlayer) this.fovKick = kind === 'fwd' ? 2.0 : kind === 'back' ? -1.1 : 0.6;
    return true;
  }

  /**
   * Unleash OVERDRIVE (KeyR): can be fired from idle, straight out of a dodge (Dodge-Cancel Overdrive),
   * or by cancelling any non-Overdrive attack for an unstoppable comeback!
   */
  private tryOverdrive(p: Fighter) {
    if (p.state === 'stagger' || p.state === 'ko' || p.state === 'air' || p.state === 'down') return;
    if (p.meter < 100) {
      this.popup(new THREE.Vector3(p.pos.x, 5.8, p.pos.y), `OVERDRIVE ${Math.floor(p.meter)}%`, 'pop-info');
      return;
    }
    if (p.state === 'attack' && p.move && isOD(p.move.id)) return;
    const fromDodge = p.dodgeT > 0 || p.dodgeWinT > 0 || p.counterT > 0;
    p.dodgeT = 0; // cancel dodge velocity so Overdrive lunges straight into the enemy!
    p.queued = null;
    p.state = 'idle';
    p.meter = 0;
    this.meterReadyShown = false;
    // Cycle Freestyle Windmill Overdrive (muter-muter tangan lalu menghajar musuh) with Bolt & Slam
    const odMoves: MoveId[] = ['windmill', 'bolt', 'windmill', 'slam'];
    const pick = odMoves[p.moveSeq % odMoves.length];
    this.odToggle = !this.odToggle;
    if (fromDodge) {
      p.dodgeWinT = Math.max(p.dodgeWinT, DODGE_WIN);
      p.counterT = Math.max(p.counterT, 2.0);
    }
    this.startMove(p, pick);
    p.invuln = Math.max(p.invuln, fromDodge ? 0.95 : 0.7); // invincible startup so Overdrive after a dodge is unstoppable!
    if (fromDodge || p.hp <= p.maxHp * 0.45) {
      p.winStrike = true;
      p.atkSpd = Math.max(p.atkSpd, 1.24);
      this.popup(new THREE.Vector3(p.pos.x, 7.1, p.pos.y), '🔥 OVERDRIVE COMEBACK!', 'pop-crit');
    }
  }

  private tryAttack(f: Fighter, id: MoveId) {
    const m = MOVES[id];
    if (f.state === 'stagger' || f.state === 'ko' || f.state === 'air' || f.state === 'down') return;
    const e = this.enemy;
    const incoming = f.isPlayer && e.state === 'attack' && !!e.move && !e.impacted;
    // Reactive L Counter-Attack: if an enemy attack is incoming OR you are countering out of a dodge, L is ALWAYS ready!
    if (id === 'counter' && f.isPlayer && (incoming || f.dodgeT > 0 || f.dodgeWinT > 0 || f.counterT > 0)) {
      f.counterCd = 0;
      f.stam = Math.max(f.stam, m.cost * STAM_SCALE + 2);
      if (f.state === 'attack' && f.move && !isOD(f.move.id)) {
        f.state = 'idle';
        f.move = null;
      }
      if (f.dodgeT > 0) {
        f.dodgeT = 0;
        f.invuln = Math.max(f.invuln, 0.42);
        f.dodgeWinT = Math.max(f.dodgeWinT, DODGE_WIN);
        f.counterT = Math.max(f.counterT, 1.8);
      }
      this.startMove(f, id);
      return;
    }
    // the counter stance cannot be spammed in neutral: it stays on a short cooldown after an empty swing
    if (id === 'counter' && f.isPlayer && f.counterCd > 0) {
      this.popup(new THREE.Vector3(f.pos.x, 5.8, f.pos.y), 'COUNTER BELUM SIAP', 'pop-info');
      return;
    }
    if (f.dodgeT > 0 && f.state === 'idle') {
      // DODGE ADVANTAGE: once enough of the dodge has played you may cancel out of it straight into an attack —
      // the strike comes out faster and lands harder, so whoever reads the exchange first owns it.
      const played = 1 - Math.max(0, f.dodgeT) / f.dodgeDur;
      if (played >= DODGE_CANCEL_AT || f.counterT > 0) {
        f.dodgeT = 0;
        f.invuln = Math.max(f.invuln, 0.25); // i-frames cover the start-up out of a dodge
        f.dodgeWinT = DODGE_WIN;
        this.startMove(f, id);
      } else {
        f.queued = id;
        f.queuedT = 0.35;
      }
      return;
    }
    if (f.state === 'attack') {
      if (f.move && this.canCancel(f) && f.stam > 0) this.startMove(f, id);
      else {
        f.queued = id;
        f.queuedT = 0.34;
      }
      return;
    }
    if (f.stam < Math.min(m.cost * STAM_SCALE, 4)) {
      if (f.isPlayer) this.popup(new THREE.Vector3(f.pos.x, 5.8, f.pos.y), 'TENAGA HABIS', 'pop-info');
      return;
    }
    this.startMove(f, id);
  }

  /** how long the enemy telegraphs a move: readable wind-up so you can see the shoulders load up */
  private tellFor(id: MoveId, chain: boolean) {
    if (chain || (this.ai && this.ai.punishT > 0) || (this.enemy && this.enemy.dodgeWinT > 0)) return TELL_CHAIN;
    return TELL[id] * Math.max(0.45, 0.82 - this.def.react * 0.32) * (this.ultra ? 0.88 : 1);
  }

  private startMove(f: Fighter, id: MoveId, chain = false) {
    const m = MOVES[id];
    if (id === 'counter' && f.isPlayer) {
      if (f.counterCd > 0) return; // guarded again here: a queued follow-up must not sneak past the cooldown
      f.counterCd = 0.65; // short anti-spam cooldown in neutral (reset to 0 on any dodge or incoming attack!)
      const e = this.enemy;
      if (e.state === 'attack' && e.move && !e.impacted) {
        f.parryFor = e.moveSeq; // lock onto the enemy's active attack so L catches & counters it!
        f.invuln = Math.max(f.invuln, 0.45);
      }
    }
    // Natural non-monotonous attack flow: track rapid consecutive attacks and cycle through 4 biomechanical
    // punch variations (angle, head-slip, level-change, hip-torque), plus auto-flow lead/rear hand on rapid spam!
    const sinceLast = f.animT - f.lastAtkAt;
    f.lastAtkAt = f.animT;
    if (sinceLast < 0.95) {
      f.spamCount = Math.min(8, f.spamCount + 1);
    } else {
      f.spamCount = 0;
    }
    f.strikeVar = (f.strikeVar + 1 + (f.spamCount >= 2 && (f.moveSeq & 1) === 1 ? 1 : 0)) % 4;
    if (!isOD(id) && id !== 'grab' && id !== 'counter' && f.spamCount >= 2 && f.strikeVar % 2 === 1) {
      f.hand = (1 - f.hand) as 0 | 1;
    }

    // a punch thrown at (near) full speed while sprinting is a RUNNING PUNCH
    f.runStrike = (f.isPlayer ? f.sprinting && f.speed > 6.2 : f.speed > 7.5) && !isOD(id) && id !== 'grab' && id !== 'counter';
    if (f.runStrike && f.isPlayer) this.fovKick = 3;
    // DEMPSEY ROLL: a punch thrown out of a charged weave carries all of that stored momentum
    f.ippoStrike = f.isPlayer && f.rollCharge > 0.25 && !f.runStrike && !isOD(id) && id !== 'grab';
    // the AI picks a target intelligently: digs into the body to shred stamina when you block/peek-a-boo, hunts the head when you're open
    if (!f.isPlayer) {
      const tgt = this.foeOf(f);
      const wantBody = tgt.blocking || tgt.ippo || (tgt.stam < 42 && id !== 'upper');
      f.aim = Math.random() < (wantBody ? 0.72 : 0.28) ? AIM_BODY : AIM_HEAD;
    } else if (f.aimMode === AIM_MIX && id !== 'grab' && id !== 'slam') {
      f.aim = this.pickMixAim(f, id);
    }
    f.strikeCharge = f.ippoStrike ? f.rollCharge : 0;
    if (f.ippoStrike) {
      f.rollCharge = 0;
      this.fovKick = 2.5;
    }
    f.state = 'attack';
    f.move = m;
    f.moveSeq++;
    f.moveT = 0;
    // DODGE ADVANTAGE & RAGE MODE: a strike thrown out of a dodge or during Rage Mode comes out faster and lands harder
    if (!f.isPlayer) f.rage = false; // enemy is strictly forbidden from using Rage Mode
    const isReactiveCounter =
      f.isPlayer &&
      id === 'counter' &&
      (f.dodgeWinT > 0 || f.counterT > 0 || (this.enemy.state === 'attack' && !!this.enemy.move && !this.enemy.impacted));
    f.winStrike = (f.dodgeWinT > 0 || isReactiveCounter) && !isOD(id);
    const dodgeSpd = isReactiveCounter ? 1.48 : f.winStrike ? DODGE_WIN_SPD : 1;
    const rageSpd = f.isPlayer && f.rage ? 1.2 : 1;
    const spamRhythm = f.spamCount >= 2 ? 1 + ((f.strikeVar % 3) - 1) * 0.05 : 1;
    f.atkSpd = dodgeSpd * rageSpd * spamRhythm;
    if (f.isPlayer) {
      const tgtYaw = Math.atan2(this.enemy.pos.x - f.pos.x, this.enemy.pos.y - f.pos.y);
      f.yaw += wrapAngle(tgtYaw - f.yaw) * (id === 'counter' || f.winStrike ? 0.9 : 0.6);
      if (id === 'counter' || f.winStrike) {
        f.vel.multiplyScalar(0.2); // plant the feet cleanly so the counter-attack fires on a razor-straight line!
      }
    }
    if (f.winStrike) {
      f.dodgeWinT = 0; // one dodge buys one heavy strike
      if (f.isPlayer) {
        this.popup(new THREE.Vector3(f.pos.x, 7.0, f.pos.y), 'DODGE STRIKE!', 'pop-crit');
        this.fx.ring(f.pos.x, f.pos.y, 0x7fe0ff, 4, 0.3, 0.09);
      } else if (this.phase === 'fight') {
        this.popup(new THREE.Vector3(f.pos.x, 6.8 * f.scale, f.pos.y), '⚡ SLIP COUNTER!', 'pop-crit');
        this.fx.ring(f.pos.x, f.pos.y, 0xff5a36, 3.8, 0.28, 0.08);
      }
    }
    // enemy attacks announce themselves: wind-up pose + indicator, then the strike
    f.tellT = 0;
    f.tellTotal = 0;
    if (!f.isPlayer && this.phase === 'fight') {
      const tt = this.tellFor(id, chain);
      f.tellT = tt;
      f.tellTotal = tt;
    }
    f.impacted = false;
    f.whooshed = false;
    f.hitConfirmed = false;
    f.attackDir.copy(this.toward(f, this.foeOf(f)));
    f.queued = null;
    f.blocking = false;
    f.stam = Math.max(0, f.stam - m.cost * STAM_SCALE);
    this.sfx.servo();
    if (isOD(id)) {
      this.sfx.charge();
      f.glowBoost = 3;
      this.sfx.say('Overdrive');
      this.fovKick = 3;
      if (id === 'windmill') {
        this.sfx.whoosh(0.8);
        if (this.phase === 'fight') {
          this.popup(
            new THREE.Vector3(f.pos.x, 6.8 * f.scale, f.pos.y),
            f.isPlayer ? '🌪️ FREESTYLE OVERDRIVE!' : '⚠️ OVERDRIVE FREESTYLE MUSUH!',
            'pop-crit',
          );
        }
      }
      // the director steps in for the charge: a short low hero angle before the strike lands
      if (f.isPlayer) this.startCine('od');
    }
    if (f.isPlayer) this.enemyReact(m);
  }

  private canCancel(f: Fighter) {
    const m = f.move;
    if (!m) return false;
    const baseAt = f.hitConfirmed && f.impacted && m.cancel < 90 ? Math.min(m.cancel, m.impact + 0.05) : m.cancel;
    const at = f.rage && m.cancel < 90 ? baseAt * 0.78 : baseAt;
    return f.moveT >= at;
  }

  // ------------------------------------------------------------ enemy AI (GENIUS TACTICAL BRAIN)
  // A hyper-intelligent, adaptive champion AI:
  //   - DEFENSIVE GENIUS: reads startup frames & mid-flight lunges, bails out of unsafe swings to slip/parry,
  //     slips outside the player's punching arm & away from the ropes, and escapes guard-breaks before stamina empties.
  //   - OFFENSIVE GENIUS: dodge-cancels slips directly into lightning-fast counter-punches, chains 3–5 hit combinations
  //     with mid-combo guard-breakers (throws, uppercuts, body shots, lunging counters), and cuts off the ring.
  private makeAi() {
    return {
      cool: 0.45,
      combo: 0,
      strafeDir: 1,
      strafeT: 0,
      blockT: 0,
      reactT: -1,
      reactAct: '' as '' | 'block' | 'side' | 'back',
      habit: { jab: 0, cross: 0, hook: 0, upper: 0, slam: 0, bolt: 0, windmill: 0, grab: 0, counter: 0 } as Record<MoveId, number>,
      defStreak: 0,
      defT: 0,
      punishT: 0,
      punishSeq: -1,
      queued: null as MoveId | null,
      queuedT: 0,
      pressure: true,
      moodT: 2.5,
      lastId: '' as MoveId | '', // the previous opener, so a smart AI avoids repeating it
      // ---- STRATEGIST layer (active across all IQ levels for genius tactical adaptation) ----
      plan: 'pressure' as Plan,
      planT: 0, // how long it has been running this plan
      // a dossier it builds on YOU while the round runs
      scout: { time: 0, atk: 0, block: 0, dodge: 0, whiff: 0, rush: 0, taken: 0 },
      cond: 0, // conditioning: how many times in a row it has shown the same setup
      condId: '' as MoveId | '', // the move it is conditioning you with
      holdOD: 0, // how long it has been saving its Overdrive for the right moment
    };
  }

  /** the opponent always runs the full strategic brain */
  private get strat() {
    return this.iq >= 1;
  }

  /** build a dossier on the player: how often he attacks, blocks, dodges, whiffs and rushes in */
  private scoutPlayer(dt: number) {
    const s = this.ai.scout;
    const p = this.foeOf(this.enemy);
    s.time += dt;
    if (p.blocking) s.block += dt;
    if (p.dodgeT > 0) s.dodge += dt * 3;
    if (p.speed > 6 && p.pos.distanceTo(this.enemy.pos) < 7) s.rush += dt;
    // decay, so it reacts to how you are fighting NOW and not ten seconds ago
    const k = Math.exp(-dt / 8);
    s.atk *= k;
    s.block *= k;
    s.dodge *= k;
    s.whiff *= k;
    s.rush *= k;
    s.taken *= k;
  }

  /**
   * THE GAME PLAN. Re-evaluated dynamically: weighs the score, the clock, both fighters' condition
   * and the player dossier, switching seamlessly between ruthless offense and master-class counter-boxing.
   */
  private updatePlan(dt: number) {
    const ai = this.ai;
    ai.planT += dt;
    if (ai.planT < 0.85) return;
    const e = this.enemy;
    const p = this.foeOf(e);
    const s = ai.scout;
    const eHp = e.hp / e.maxHp;
    const pHp = p.hp / p.maxHp;
    const obs = Math.max(1, s.time);
    const aggr = s.atk / obs; // your attacks per second
    const turtle = s.block / obs; // share of time you spend blocking
    const edgeP = Math.hypot(p.pos.x, p.pos.y); // how close YOU are to the ropes

    let plan: Plan = ai.plan;
    if (eHp < 0.22 && e.stam < 25) plan = 'recover'; // briefly catch breath while staying dangerous
    else if (pHp < 0.35 || p.stam < 25 || p.state === 'stagger') plan = 'finish'; // smells blood → all-out finish!
    else if (edgeP > RING - 5.2) plan = 'trap'; // you are near the ropes → cut off the ring & unload
    else if (aggr > 0.95) plan = 'counter'; // you spam/rush → slip and counter-punish ruthlessly
    else if (turtle > 0.3 || aggr < 0.45) plan = 'pressure'; // you turtle or hesitate → relentless offensive pressure
    else plan = Math.random() < 0.68 ? 'pressure' : 'counter';

    if (plan !== ai.plan) {
      ai.plan = plan;
      ai.planT = 0;
      ai.cond = 0;
      ai.pressure = plan === 'pressure' || plan === 'finish' || plan === 'trap';
      ai.moodT = 3.2;
    }
  }

  /** the ideal distance it wants to hold for the current plan */
  private planRange(scale: number) {
    switch (this.ai.plan) {
      case 'pressure':
      case 'finish':
        return 2.85 * scale;
      case 'trap':
        return 3.05 * scale;
      case 'counter':
        return 3.65 * scale; // right on the edge of the pocket, ready to slip & counter immediately
      case 'scout':
        return 3.5 * scale;
      case 'recover':
        return 5.4 * scale;
      default:
        return 6.2 * scale;
    }
  }

  private aiDefended(kind: 'block' | 'dodge', seq: number) {
    const ai = this.ai;
    ai.punishSeq = seq; // this move is already accounted for
    ai.defStreak = Math.min(6, ai.defStreak + 1);
    ai.defT = 2.4;
    const p = Math.min(0.98, this.def.punish * (kind === 'dodge' ? 1.08 : 0.92));
    if (Math.random() < p) {
      ai.punishT = (kind === 'dodge' ? 0.85 : 0.65) * (1 + Math.max(0, this.iq - 1) * 0.05);
      ai.cool = 0;
      ai.blockT = 0; // drop guard immediately to fire back the counter!
    }
  }

  private enemyReact(m: Move) {
    const e = this.enemy;
    const ai = this.ai;
    const def = this.def;
    ai.habit[m.id] = Math.min(8, ai.habit[m.id] + 1);
    ai.scout.atk += 1; // every punch you throw goes into the dossier
    const iq = Math.max(2, this.iq);
    const sq = Math.sqrt(iq);
    if (e.dodgeT > 0 || ai.reactT >= 0) return;
    if (e.state !== 'idle') {
      // Genius AI bails out of its own wind-up or post-impact recovery to slip/block your counter-attack!
      const bail = e.state === 'attack' && !!e.move && (e.tellT > 0 || e.impacted) && !isOD(e.move.id);
      if (!bail || Math.random() > Math.min(0.96, 0.55 + iq * 0.06)) return;
      e.state = 'idle';
      e.move = null;
      e.tellT = 0;
      e.queued = null;
      e.runStrike = false;
      e.ippoStrike = false;
      ai.combo = 0;
    }
    const foe = this.foeOf(e);
    const d = foe.pos.distanceTo(e.pos);
    if (d > (m.reach + m.step * 0.5) * foe.scale + 3.2) return; // reads lunges and dash-ins from afar
    // defending several times in a row tires the reflexes slightly, but a genius AI stays sharp
    const fatigue = Math.max(0.48, 1 - ai.defStreak * (0.09 / sq));
    const hab = 1 + Math.min(0.85, (ai.habit[m.id] - 1) * 0.16 * def.adapt);
    const cap = iq >= 10 ? 0.992 : iq >= 3 ? 0.975 : this.ultra ? 0.96 : 0.93;
    const p = Math.min(cap, def.react * hab * fatigue);
    if (Math.random() > p) return;
    const act = defenceAgainst(m.id, def.dodge);
    ai.reactAct = act;
    // razor-sharp reaction time so jabs, hooks, and counters are cleanly slipped or parried
    const rt = 0.04 + Math.random() * 0.07 + (1 - def.react) * 0.09;
    ai.reactT = Math.max(0.02, rt / Math.pow(iq, 0.75));
  }

  private pickAiMove(e: Fighter, chain: MoveId | null, dist: number): MoveId {
    const ai = this.ai;
    const pl = this.foeOf(e);
    if (this.def.slam && e.meter >= 100 && ai.combo <= 1) {
      // Overdrive finisher: unleash when the player is staggered, mid-attack, cornered, blocking with low stamina, or held long enough
      if (this.strat) {
        const cornered = Math.hypot(pl.pos.x, pl.pos.y) > RING - 4.0;
        const open = pl.state === 'stagger' || pl.state === 'air' || pl.tauntT > 0 || (pl.state === 'attack' && !pl.impacted);
        const kill = pl.hp / pl.maxHp < 0.38 || pl.stam < 32;
        if (!(open || kill || (cornered && ai.plan !== 'scout')) && ai.holdOD < 5.5) {
          return dist > 3.9 * e.scale ? 'counter' : 'cross';
        }
      }
      e.meter = 0;
      ai.holdOD = 0;
      const odRoll = Math.random();
      if (odRoll < 0.55) return 'windmill';
      return dist > 4.0 * e.scale || odRoll < 0.8 ? 'bolt' : 'slam';
    }
    if (chain) {
      // Mid-combo genius adaptation: if the player is blocking the combo, mix in a throw (grab), uppercut, or counter straight!
      if (pl.blocking || pl.ippo) {
        if (dist <= 3.3 * e.scale && Math.random() < 0.42) return 'grab';
        if (Math.random() < 0.45) return 'upper';
      }
      if (dist > 3.8 * e.scale) {
        return Math.random() < 0.55 ? 'counter' : 'cross'; // chase down a backpedaling opponent mid-combo!
      }
      const seq: Partial<Record<MoveId, MoveId[]>> = {
        jab: ['cross', 'hook', 'upper', 'counter'],
        cross: ['hook', 'upper', 'jab', 'counter'],
        hook: ['upper', 'cross', 'counter', 'jab'],
        upper: ['hook', 'cross', 'counter', 'jab'],
        counter: ['hook', 'upper', 'jab'],
      };
      const opts = seq[chain];
      if (opts) return opts[Math.floor(Math.random() * opts.length)];
    }
    // ---- STRATEGIST: conditioning + exploiting the dossier ----
    if (this.strat && !chain) {
      const s = ai.scout;
      const obs = Math.max(1, s.time);
      // CONDITIONING: show a fast setup twice, then crack their defense with a throw, uppercut, or lunging counter!
      if (ai.cond >= 2) {
        ai.cond = 0;
        const breaker: MoveId =
          pl.blocking || pl.ippo || s.block / obs > 0.3
            ? dist <= 3.4 * e.scale
              ? 'grab'
              : 'counter'
            : Math.random() < 0.55
              ? 'upper'
              : 'hook';
        ai.lastId = breaker;
        return breaker;
      }
      // Hard reads on the player's current state
      let pick: MoveId | null = null;
      if (pl.ippo || (pl.blocking && dist <= 3.35 * e.scale && Math.random() < 0.65)) pick = 'grab'; // throws beat peek-a-boo & turtles!
      else if (pl.stam < 32) pick = Math.random() < 0.5 ? 'counter' : 'cross'; // shatter exhausted guard
      else if (pl.sprinting || pl.speed > 7.5) pick = Math.random() < 0.6 ? 'upper' : 'counter'; // intercept a runner
      else if (s.dodge / obs > 0.38 || pl.dodgeT > 0) pick = 'hook'; // wide sweep catches dodgers
      else if (s.block / obs > 0.38 || pl.blocking) pick = Math.random() < 0.55 ? 'grab' : 'upper';
      else if (dist > 3.9 * e.scale) pick = Math.random() < 0.55 ? 'counter' : 'cross';
      if (pick && pick !== ai.lastId) {
        ai.lastId = pick;
        ai.cond = 0;
        return pick;
      }
      // Varied, unpredictable offensive openers
      const roll = Math.random();
      const setup: MoveId = roll < 0.36 ? 'jab' : roll < 0.68 ? 'cross' : roll < 0.86 ? 'hook' : 'counter';
      ai.condId = setup;
      ai.cond++;
      ai.lastId = setup;
      return setup;
    }

    // spacing-aware openers
    const far = dist > 3.7 * e.scale;
    const choose = (): MoveId => {
      const roll = Math.random();
      if (far) return roll < 0.45 ? 'cross' : roll < 0.75 ? 'counter' : 'jab';
      return roll < 0.28 ? 'jab' : roll < 0.52 ? 'cross' : roll < 0.78 ? 'hook' : 'upper';
    };
    let id = choose();
    if (id === this.ai.lastId && Math.random() < 0.7) id = choose();
    return id;
  }

  private updateEnemyAI(dt: number) {
    const e = this.enemy;
    const p = this.foeOf(e);
    const ai = this.ai;
    const def = this.def;
    e.wish.set(0, 0);
    ai.blockT -= dt;
    ai.cool -= dt;
    ai.punishT -= dt;
    ai.queuedT -= dt;
    ai.moodT -= dt;
    ai.defT -= dt;
    if (ai.defT <= 0) ai.defStreak = 0;
    for (const k of Object.keys(ai.habit) as MoveId[]) ai.habit[k] = Math.max(0, ai.habit[k] - dt * 0.18);
    e.blocking = false;
    e.rage = false; // enemy is strictly forbidden from using Rage Mode
    e.rageFlash = 0;
    const pDown = p.state === 'down' || p.state === 'ko';

    // ---- STRATEGIST: watch the human, then commit to a game plan ----
    if (this.strat) {
      this.scoutPlayer(dt);
      this.updatePlan(dt);
      ai.holdOD += dt;
    }

    // switch between pressure and counter-hunting phases (heavily favors active engagement)
    if (ai.moodT <= 0) {
      ai.pressure = Math.random() < 0.48 + def.aggro * 0.48;
      ai.moodT = 2.4 + Math.random() * 2.8;
    }

    const dist = e.pos.distanceTo(p.pos);

    // ---- CONTINUOUS MID-FLIGHT THREAT DETECTION ----
    // If the player started a punch from out of range and lunged in, react immediately!
    if (p.state === 'attack' && p.move && !p.impacted && ai.reactT < 0 && e.dodgeT <= 0 && ai.punishSeq !== p.moveSeq) {
      if (dist <= (p.move.reach + 2.1) * p.scale) {
        this.enemyReact(p.move);
      }
    }

    // ---- HIT-CONFIRMED & PRESSURE COMBO CHAINING ----
    if (e.state === 'attack' && e.move && ai.combo > 0 && e.impacted && this.canCancel(e) && !pDown && p.state !== 'air') {
      if (e.hitConfirmed || (dist <= 4.3 * e.scale && Math.random() < 0.65)) {
        this.startMove(e, this.pickAiMove(e, e.move.id, dist), true); // seamless combo flow
        ai.combo--;
        if (ai.combo <= 0) ai.cool = def.rest * (ai.pressure ? 0.38 : 0.65) * (0.6 + Math.random() * 0.6);
        return;
      }
    }

    // ---- DODGE-CANCEL COUNTER-STRIKE (Muhammad Ali Slip → Instant Counter) ----
    // Once the AI has slipped/backstepped your punch (first 55% of dodge i-frames spent), it cancels the end of its dodge
    // directly into a lightning-fast counter-strike while you are still stuck in recovery!
    if (e.state === 'idle' && e.dodgeT > 0 && e.dodgeT < e.dodgeDur * 0.45 && (ai.punishT > 0 || ai.queued) && !pDown && dist <= 4.6 * e.scale) {
      e.dodgeT = 0;
      const counterId: MoveId = ai.queued ?? (dist > 3.7 * e.scale ? 'counter' : Math.random() < 0.45 ? 'hook' : Math.random() < 0.75 ? 'upper' : 'cross');
      ai.queued = null;
      ai.punishT = 0;
      ai.combo = 1 + Math.floor(Math.random() * Math.max(2, def.combo - 1));
      this.startMove(e, counterId, true);
      return;
    }

    if (e.state !== 'idle' || e.dodgeT > 0) return;

    // WAKE-UP DEFENCE: right after getting up, guard briefly or slip if pressured
    if (e.softT > 0.28 && ai.blockT <= 0 && Math.random() < dt * 14) ai.blockT = 0.35;

    // WHIFF DETECTION: the player threw something that missed → instant counter-punish!
    if (p.state === 'attack' && p.move && p.impacted && !p.hitConfirmed && ai.punishSeq !== p.moveSeq) {
      ai.punishSeq = p.moveSeq;
      ai.scout.whiff += 1;
      ai.scout.atk += 1;
      if (Math.random() < Math.min(0.98, def.punish + 0.15)) {
        ai.punishT = 0.75;
        ai.cool = 0;
        ai.blockT = 0;
        ai.reactT = -1;
      }
    }

    const f = this.toward(e, p);
    const r = new THREE.Vector2(-f.y, f.x);

    // ---- EXECUTE DEFENSIVE REACTION (SLIP / PULL-BACK / PARRY-BLOCK) + QUEUE INSTANT COUNTER ----
    if (ai.reactT >= 0) {
      ai.reactT -= dt;
      if (ai.reactT < 0) {
        // Choose the smartest slip direction: away from the ropes AND outside the player's punching arm!
        const toCenter = new THREE.Vector2(-e.pos.x, -e.pos.y);
        let slipSign = Math.random() < 0.5 ? 1 : -1;
        if (Math.hypot(e.pos.x, e.pos.y) > RING - 4.2 && toCenter.lengthSq() > 0.01) {
          slipSign = Math.sign(r.dot(toCenter)) || slipSign;
        } else if (p.state === 'attack' && p.move) {
          const pArm = this.armOf(p, p.move);
          slipSign = pArm === 0 ? -1 : 1; // slip to the outside of the incoming lead/rear fist
        }
        const side = r.clone().multiplyScalar(slipSign);

        // If stamina is low (< 38), never sit in block waiting to get guard-broken — force a slip!
        const act = ai.reactAct === 'block' && e.stam < 38 && e.dodgeCd <= 0 ? 'side' : ai.reactAct;

        if (act === 'block') {
          ai.blockT = 0.34 + Math.random() * 0.22;
        } else if (act === 'side') {
          if (this.startDodge(e, side, 'side')) {
            if (p.state === 'attack' && p.move) {
              e.dodgeFor = p.moveSeq;
              ai.punishSeq = p.moveSeq;
            }
            ai.punishT = 0.85;
            ai.cool = 0;
            ai.blockT = 0;
            ai.queued = dist > 3.8 * e.scale ? 'counter' : Math.random() < 0.5 ? 'hook' : 'upper';
            ai.queuedT = 0.85;
          } else {
            ai.blockT = 0.35;
          }
        } else if (act === 'back') {
          if (this.startDodge(e, f.clone().multiplyScalar(-1).addScaledVector(side, 0.38).normalize(), 'back')) {
            if (p.state === 'attack' && p.move) {
              e.dodgeFor = p.moveSeq;
              ai.punishSeq = p.moveSeq;
            }
            ai.punishT = 0.85;
            ai.cool = 0;
            ai.blockT = 0;
            ai.queued = Math.random() < 0.6 ? 'counter' : 'cross';
            ai.queuedT = 0.9;
          } else {
            ai.blockT = 0.35;
          }
        }
        ai.reactAct = '';
      }
    }

    // ---- SMART GUARD ESCAPE & GUARD-COUNTER ----
    // Never hold block passively if the player isn't attacking or if stamina is running low!
    if (ai.blockT > 0) {
      if (p.state !== 'attack' && ai.punishT > 0) {
        ai.blockT = 0; // player's attack finished → drop guard immediately and punish!
      } else if (e.stam < 34 && e.dodgeCd <= 0) {
        ai.blockT = 0;
        const escSide = r.clone().multiplyScalar(ai.strafeDir);
        if (this.startDodge(e, escSide, 'side')) {
          ai.punishT = 0.7;
          ai.queued = 'hook';
          ai.queuedT = 0.75;
          return;
        }
      }
    }
    e.blocking = ai.blockT > 0 && e.stam > 0;

    const sp = def.speed * 1.25 * (e.blocking ? 0.48 : 1) * (e.rage ? 1.18 : 1);

    // ---- QUEUED FOLLOW-UP (Dash-in / Slip Punish) ----
    if (ai.queued && ai.queuedT > 0 && !e.blocking && !pDown) {
      const qReach = (MOVES[ai.queued].reach + 0.6) * e.scale;
      if (dist <= qReach) {
        const id = ai.queued;
        ai.queued = null;
        ai.combo = 1 + Math.floor(Math.random() * Math.max(2, def.combo - 1));
        this.startMove(e, id, true);
        return;
      }
    } else if (ai.queuedT <= 0) {
      ai.queued = null;
    }

    // ---- MOVEMENT: SPACING, CIRCLING, CUTTING OFF THE RING ----
    ai.strafeT -= dt;
    if (ai.strafeT < 0) {
      ai.strafeDir = Math.random() < 0.5 ? 1 : -1;
      ai.strafeT = 0.45 + Math.random() * 0.95;
    }
    const edge = Math.hypot(e.pos.x, e.pos.y);
    const toC = new THREE.Vector2(-e.pos.x, -e.pos.y);
    if (edge > RING - 3.4 && toC.lengthSq() > 0.01) {
      toC.normalize();
      const sgn = Math.sign(r.dot(toC)) || 1;
      ai.strafeDir = sgn; // pivot out of the corner so the AI is never trapped on the ropes
    }
    // RING GENERALSHIP: cut off the ring when trapping or pressuring
    if (this.strat && (ai.plan === 'trap' || ai.plan === 'pressure' || ai.plan === 'finish') && p.pos.lengthSq() > 0.01) {
      const outward = p.pos.clone().normalize();
      ai.strafeDir = Math.sign(r.dot(outward)) || ai.strafeDir;
      e.wish.addScaledVector(outward, sp * 0.38);
    }
    const ideal = this.strat ? this.planRange(e.scale) : (ai.pressure ? 3.0 : 3.6) * e.scale;
    if (pDown) {
      if (dist > 7.5) e.wish.addScaledVector(f, sp * 0.6);
      else if (dist < 5.5) e.wish.addScaledVector(f, -sp * 0.5);
    } else if (dist > ideal + 0.25) e.wish.addScaledVector(f, sp * 1.08);
    else if (dist < ideal - 0.75 && ai.cool > 0.25) e.wish.addScaledVector(f, -sp * 0.65);
    e.wish.addScaledVector(r, ai.strafeDir * sp * (ai.pressure ? 0.38 : 0.55));
    if (edge > RING - 2.6 && toC.lengthSq() > 0.01) {
      const k = Math.min(1, (edge - (RING - 2.6)) / 2.4);
      e.wish.addScaledVector(toC.clone().normalize(), sp * 0.85 * k);
    }
    // Aggressive gap-closing dash: if the player tries to run away, dash in and intercept!
    if (dist > 5.2 * e.scale && !pDown && e.dodgeCd <= 0 && Math.random() < dt * (ai.pressure ? 2.6 : 1.4)) {
      if (this.startDodge(e, f.clone(), 'fwd')) {
        ai.queued = Math.random() < 0.55 ? 'counter' : 'cross';
        ai.queuedT = 0.75;
        return;
      }
    }
    // Bait-and-pull counter: step just out of range when the player is about to swing, then counter!
    if (!ai.pressure && dist < 3.2 * e.scale && ai.cool > 0.18 && e.dodgeCd <= 0 && Math.random() < dt * 0.65 * def.punish) {
      if (this.startDodge(e, f.clone().multiplyScalar(-1), 'back')) {
        ai.punishT = 0.75;
        ai.queued = 'counter';
        ai.queuedT = 0.8;
        return;
      }
    }

    // ---- OFFENSIVE & COUNTER ATTACK DECISIONS ----
    const reachNow = 4.1 * e.scale;
    const canAtk = !pDown && (p.state !== 'air' || (def.react > 0.5 && Math.random() < 0.65));
    const punishing = ai.punishT > 0 && !e.blocking && canAtk;

    if (punishing) {
      if (dist <= reachNow + 0.5 * e.scale) {
        const roll = Math.random();
        const id: MoveId =
          p.blocking || p.ippo
            ? dist <= 3.3 * e.scale
              ? 'grab'
              : 'upper'
            : dist > 3.7 * e.scale
              ? 'counter'
              : roll < 0.32
                ? 'counter'
                : roll < 0.65
                  ? 'hook'
                  : roll < 0.88
                    ? 'upper'
                    : 'cross';
        this.startMove(e, id, true);
        ai.combo = 1 + Math.floor(Math.random() * Math.max(2, def.combo));
        ai.punishT = 0;
        ai.cool = def.rest * 0.45 * (0.6 + Math.random() * 0.5);
        return;
      }
      if (dist < 8.5 && e.dodgeCd <= 0) {
        if (this.startDodge(e, f.clone(), 'fwd')) {
          ai.queued = Math.random() < 0.6 ? 'counter' : 'cross';
          ai.queuedT = 0.8;
          ai.punishT = 0;
          return;
        }
      }
    }

    // ---- TACTICAL PLAN EXECUTION ----
    if (this.strat && !pDown) {
      const pl = ai.plan;
      if (pl === 'recover' && dist < 4.5 * e.scale && e.stam < 30) {
        if (e.dodgeCd <= 0 && Math.random() < dt * 3.5) {
          this.startDodge(e, f.clone().multiplyScalar(-1), 'back');
          ai.queued = 'counter';
          ai.queuedT = 0.75;
        } else if (ai.blockT <= 0) {
          ai.blockT = 0.35;
        }
        return;
      }
      if (pl === 'counter' && dist < 3.4 * e.scale && e.dodgeCd <= 0 && ai.cool > 0.14 && Math.random() < dt * 2.4) {
        if (this.startDodge(e, f.clone().multiplyScalar(-1), 'back')) {
          ai.punishT = 0.8;
          ai.queued = 'counter';
          ai.queuedT = 0.85;
          return;
        }
      }
    }

    if (ai.cool <= 0 && dist <= reachNow && !e.blocking && canAtk) {
      // Mind game: immediately crack a blocking or peek-a-boo player with a throw or uppercut!
      if ((p.blocking || p.ippo) && p.state === 'idle' && Math.random() < 0.52 + def.react * 0.35) {
        const breaker: MoveId = dist <= 3.35 * e.scale && Math.random() < 0.72 ? 'grab' : 'upper';
        this.startMove(e, breaker);
        ai.combo = breaker === 'upper' ? 2 : 0;
        ai.cool = def.rest * (0.55 + Math.random() * 0.5);
        return;
      }
      if (ai.combo <= 0) ai.combo = 2 + Math.floor(Math.random() * def.combo);
      const id = this.pickAiMove(e, null, dist);
      ai.lastId = id;
      this.startMove(e, id);
      ai.combo--;
      const rest = def.rest * (ai.pressure ? 0.38 : 0.72);
      ai.cool = ai.combo > 0 ? 0.03 + Math.random() * 0.06 : Math.max(0.18, rest * (0.55 + Math.random() * 0.6));
      // After finishing its combo, the AI either weaves/slips out at an angle OR raises a tight high guard!
      if (ai.combo <= 0) {
        if (e.dodgeCd <= 0 && Math.random() < 0.42) {
          const exitSide = r.clone().multiplyScalar(ai.strafeDir);
          this.startDodge(e, exitSide, 'side');
        } else if (Math.random() < 0.78) {
          ai.blockT = 0.35 + Math.random() * 0.25;
        }
      }
    }
  }

  /**
   * ATTRACT MODE: in the menu both robots are driven by this simple brain so the background is a real,
   * never-ending fight — approach, circle, throw combos, block, dodge and show off with a taunt.
   */
  private demoBrain(f: Fighter, o: Fighter, st: { cool: number; strafe: number; strafeT: number; blockT: number }, dt: number) {
    f.wish.set(0, 0);
    f.blocking = false;
    st.cool -= dt;
    st.blockT -= dt;
    st.strafeT -= dt;
    if (f.hp < f.maxHp * 0.45) f.hp = f.maxHp; // keep the demo going
    f.stam = Math.min(100, f.stam + 30 * dt);
    if (f.state !== 'idle' || f.dodgeT > 0 || f.tauntT > 0) return;

    const dist = f.pos.distanceTo(o.pos);
    const toO = this.toward(f, o);
    const side = new THREE.Vector2(-toO.y, toO.x);

    // react to the other robot's wind-up: block, or slip out of the way
    if (o.state === 'attack' && o.move && !o.impacted && dist < 5.5 && st.blockT <= 0 && Math.random() < dt * 9) {
      if (Math.random() < 0.45 && this.startDodge(f, side.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1), 'side')) return;
      st.blockT = 0.45 + Math.random() * 0.3;
    }
    f.blocking = st.blockT > 0;

    // spacing + circling
    if (st.strafeT <= 0) {
      st.strafe = Math.random() < 0.5 ? 1 : -1;
      st.strafeT = 0.8 + Math.random() * 1.4;
    }
    const sp = 4.4;
    if (dist > 3.6) f.wish.addScaledVector(toO, sp);
    else if (dist < 2.9) f.wish.addScaledVector(toO, -sp * 0.7);
    f.wish.addScaledVector(side, st.strafe * sp * 0.5);
    // stay off the ropes
    const edge = Math.hypot(f.pos.x, f.pos.y);
    if (edge > RING - 3) f.wish.addScaledVector(new THREE.Vector2(-f.pos.x, -f.pos.y).normalize(), sp * 0.9);

    if (st.cool > 0 || f.blocking) return;
    if (dist <= 4.0) {
      const r = Math.random();
      const id: MoveId =
        f.meter >= 100
          ? r < 0.55
            ? 'windmill'
            : r < 0.8
              ? 'bolt'
              : 'slam'
          : r < 0.34
            ? 'jab'
            : r < 0.6
              ? 'cross'
              : r < 0.82
                ? 'hook'
                : 'upper';
      if (isOD(id)) f.meter = 0;
      this.startMove(f, id);
      st.cool = 0.18 + Math.random() * 0.4;
    } else if (dist > 7 && Math.random() < dt * 1.5) {
      // showboat while there is nobody to hit — it pulls from the whole book, but it never picks a long one while
      // you are anywhere near enough to punish it
      const book = dist > 9.5 ? FREESTYLE : FREESTYLE.filter((fs) => fs.dur <= 2.0);
      const pick = book[Math.floor(Math.random() * book.length)];
      this.taunt(f, pick.id);
      st.cool = 1.2;
    }
  }

  /** advance a running show-off move: its clock, its Overdrive pay-out and its one-shot cues (sound / sparks / camera) */
  private tickTaunt(f: Fighter, dt: number) {
    if (f.tauntT <= 0) return;
    if (f.state !== 'idle' || f.dodgeT > 0) {
      f.tauntT = 0;
      return;
    }
    const was = f.tauntT;
    const fs = FREESTYLE[THREE.MathUtils.clamp(f.tauntStyle, 0, FREESTYLE.length - 1)];
    f.tauntT -= dt;
    // a show-off banks Overdrive — the longer and prouder the move, the more it pays (not during the pre-fight show)
    if (this.phase === 'fight') f.meter = Math.min(100, f.meter + fs.meter * dt);
    // the beats of the move fire off its own progress clock, so sound, sparks and camera always land together
    for (const c of fs.cues) if (was > (1 - c.p) * fs.dur && f.tauntT <= (1 - c.p) * fs.dur) this.fsCue(f, c.s);
    if (f.tauntT <= 0) f.softT = Math.max(f.softT, 0.35);
  }

  // ------------------------------------------------------------ fighter update
  private updateFighter(f: Fighter, o: Fighter, dt: number) {
    f.hit = Math.max(0, f.hit - dt * 2.4);
    f.recoilT = Math.max(0, f.recoilT - dt);
    if (f.emberT > 0) {
      // a trickle of hot metal keeps falling out of the dent for a third of a second after the blow
      f.emberT -= dt;
      const sy = Math.sin(f.yaw);
      const cy = Math.cos(f.yaw);
      f.emberP.set(f.pos.x + cy * f.emberLocal.x + sy * f.emberLocal.z, f.y + f.emberLocal.y, f.pos.y - sy * f.emberLocal.x + cy * f.emberLocal.z);
      if (Math.random() < Math.min(1, dt * 46)) this.fx.spark(f.emberP, 1 + Math.floor(Math.random() * 2), 1.6 + Math.random() * 2.2, Math.random() < 0.6 ? 0xffb050 : 0xffe0a0, new THREE.Vector3(0, -0.6, 0), 0.7, 0.45, 22);
    }
    // feet skidding under a knockback kick up grey dust off the canvas
    const skid = f.kb.length();
    if (skid > 3.2 && f.state !== 'air' && f.state !== 'ko' && f.y < 0.05) {
      f.skidAcc += dt * (skid - 2.4) * 3.2;
      while (f.skidAcc > 1) {
        f.skidAcc -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const sx = f.pos.x + Math.cos(f.yaw) * side * 0.55 * f.scale - f.kb.x * 0.05;
        const sz = f.pos.y - Math.sin(f.yaw) * side * 0.55 * f.scale - f.kb.y * 0.05;
        this.fx.spark(new THREE.Vector3(sx, 0.12, sz), 2, 1.6 + skid * 0.12, 0x8d93a0, new THREE.Vector3(-f.kb.x, 1.6, -f.kb.y), 1.3, 0.55, 2);
      }
    } else {
      f.skidAcc = 0;
    }
    f.hitUp = f.hitUp > 0 ? Math.max(0, f.hitUp - dt * 2.6) : Math.min(0, f.hitUp + dt * 2.6); // decays from either side (body shots are negative)
    f.flash = Math.max(0, f.flash - dt * 7);
    f.dash.multiplyScalar(Math.exp(-7.5 * dt));
    f.dodgeCd -= dt;
    f.counterT -= dt;
    f.handT = Math.max(0, f.handT - dt);
    f.aimT = Math.max(0, f.aimT - dt);
    f.rageFlash = Math.max(0, f.rageFlash - dt);
    f.counterCd = Math.max(0, f.counterCd - dt);
    f.dodgeWinT = Math.max(0, f.dodgeWinT - dt);
    f.queuedT -= dt;
    f.wallT -= dt;
    f.wallCd -= dt;
    // ---- ROPE CATAPULT: a body slammed into the ropes is held for a beat while they stretch, then they throw it
    // back into the ring — stunned, arms flailing, straight into whatever the opponent has waiting
    if (f.slingT > 0) {
      f.slingT -= dt;
      if (f.slingT <= 0 && f.state !== 'ko' && f.state !== 'down' && f.state !== 'air') {
        f.kb.x += f.slingX * f.slingV;
        f.kb.y += f.slingZ * f.slingV;
        f.hit = Math.max(f.hit, 0.45);
        f.hitF = 1; // thrown FORWARD this time: the chest leads, the head trails behind
        f.hitL = 0;
        f.hitSpin = 0;
        f.hitPt = 0.6;
        f.hitUp = 0;
        if (f.state === 'stagger') f.stunT = Math.max(f.stunT, 0.3);
        const px = f.pos.x + f.ropeNx * 1.4;
        const pz = f.pos.y + f.ropeNz * 1.4;
        this.arena.ropeHit(f.ropeNx ? f.ropeNx * 20 : f.pos.x, f.ropeNz ? f.ropeNz * 20 : f.pos.y, 0.5);
        this.fx.ring(px, pz, 0xffe0a0, 2.6 + f.slingV * 0.2, 0.3, 4.6 * f.scale);
        this.fx.spark(new THREE.Vector3(px, 4.9 * f.scale, pz), 10, 5, 0xffe0a0, new THREE.Vector3(f.slingX, 0.3, f.slingZ), 1.2, 0.45, 10);
        this.sfx.ropeCreak(1);
        this.popup(new THREE.Vector3(f.pos.x, 6.6 * f.scale, f.pos.y), 'TERPENTAL DARI TALI!', 'pop-info');
      }
    }
    // smoothed "on the ropes" weight (fast in, slower out) and which way he is facing them
    {
      const tgtW = THREE.MathUtils.clamp(f.ropeDepth / (FLEX * 0.75), 0, 1);
      f.ropeW += (tgtW - f.ropeW) * (1 - Math.exp(-(tgtW > f.ropeW ? 22 : 5) * dt));
      if (f.ropeDepth > 0) {
        const facing = Math.sin(f.yaw) * f.ropeNx + Math.cos(f.yaw) * f.ropeNz; // + = he faces the rope
        f.ropeBack += (-facing - f.ropeBack) * (1 - Math.exp(-8 * dt));
      }
    }
    f.wakeT -= dt;
    f.softT = Math.max(0, f.softT - dt);
    f.slipCd -= dt;
    // stability recovers once the flurry stops
    f.poiseT -= dt;
    if (f.poiseT <= 0) f.poise = Math.min(f.poiseMax, f.poise + POISE_REGEN * dt);
    // TAUNT: the show-off beats, Overdrive charge, and it ends if anything else happens
    this.tickTaunt(f, dt);
    // DEMPSEY ROLL charge: it builds while you weave in peek-a-boo and fades when you leave the stance
    if (f.isPlayer && f.state !== 'attack') {
      if (f.ippo) f.rollCharge = Math.min(1, f.rollCharge + dt * (0.5 + (f.speed > 1 ? 0.2 : 0)));
      else f.rollCharge = Math.max(0, f.rollCharge - dt * 0.45);
    }
    f.glowBoost = Math.max(f.mode === 'victory' ? 1.5 : f.rage ? 1.9 + Math.sin(f.animT * 14) * 0.5 : 0, f.glowBoost - dt * 1.5);
    if (f.rage && dt > 0 && Math.random() < dt * 18) {
      this.fx.spark(
        new THREE.Vector3(f.pos.x + (Math.random() - 0.5) * 1.4, (2.6 + Math.random() * 2.2) * f.scale, f.pos.y + (Math.random() - 0.5) * 1.4),
        2,
        4.5,
        Math.random() < 0.5 ? 0xff4a2a : 0xffb830,
        new THREE.Vector3(0, 0.65, 0),
        0.9,
        0.32,
        2,
      );
    }
    if (f.state === 'idle') {
      f.comboTaken = 0;
      f.juggle = 0;
    }
    if (f.sprinting) f.stam = Math.max(0, f.stam - SPRINT_DRAIN * dt); // running costs stamina and stops it from regenerating
    else if (f.state === 'idle' && !f.blocking) f.stam = Math.min(100, f.stam + (f.isPlayer ? REGEN_IDLE : REGEN_AI) * dt);
    else if (f.blocking) f.stam = Math.min(100, f.stam + (f.isPlayer ? REGEN_BLOCK : REGEN_BLOCK * 0.7) * dt);

    const fighting = this.phase === 'fight';
    if (f.state === 'attack' && f.move) {
      const m = f.move;
      if (f.tellT > 0) {
        // WARNING PHASE: the move creeps into its wind-up pose and holds there; the body pulses so the
        // attack is easy to read. The strike itself starts only once the warning has run out.
        f.tellT -= dt;
        const wind = m.strikeAt * 0.85;
        f.moveT = wind * (1 - Math.max(0, f.tellT) / Math.max(0.001, f.tellTotal));
        f.glowBoost = Math.max(f.glowBoost, 1.8);
        f.flash = Math.max(f.flash, 0.16 + 0.16 * Math.sin(f.animT * 32));
      } else {
        f.moveT += (dt * f.atkSpd) / (f.tscale * PACE); // atkSpd > 1 = a dodge-advantage strike, thrown faster
      }
      if (!f.whooshed && f.moveT >= m.strikeAt) {
        f.whooshed = true;
        this.beginStrike(f, o, m);
      }
      if (!f.impacted && f.moveT >= m.impact) {
        f.impacted = true;
        this.resolveHit(f, o);
      }
      if (f.state === 'attack' && f.move) {
        if (f.moveT >= m.dur) {
          f.state = 'idle';
          f.move = null;
          f.runStrike = false;
          f.ippoStrike = false;
        } else if (f.queued && f.queuedT > 0 && this.canCancel(f) && f.stam > 0 && f.isPlayer && fighting) {
          this.startMove(f, f.queued);
        }
      }
    } else if (f.state === 'idle' && f.queued && f.queuedT > 0 && f.isPlayer && fighting && f.dodgeT <= 0.1) {
      this.startMove(f, f.queued);
    } else if (f.state === 'stagger') {
      f.stunT -= dt;
      if (f.stunT <= 0) {
        f.state = 'idle';
        f.softT = 0.7;
      }
    } else if (f.state === 'down') {
      f.downT -= dt;
      // THE GET-UP. He lies still for a beat after the landing, then rolls onto one shoulder, plants that hand,
      // tucks a knee under the hips and pushes up — the hips lead, the torso follows, the head is the first thing
      // to come up. `riseStages` (poses.ts) owns the shape of it; robot receives `riseU` and does the rest, so the
      // whole move is one continuous curve instead of a body rotating stiffly up off the floor.
      const du = 1 - THREE.MathUtils.clamp(f.downT / Math.max(0.001, f.downDur), 0, 1); // 0 on landing
      const RISE_AT = 0.3; // how much of the time on the floor is spent flat out
      f.riseU = THREE.MathUtils.clamp((du - RISE_AT) / (1 - RISE_AT), 0, 1);
      f.fallT = 1; // the plain fall spring stays down: the rise is the staged animation, not a spring release
      if (f.downT <= 0) {
        f.state = 'idle';
        f.fallT = 0;
        f.fallS.set(0); // the lie is already fully unwound by riseU = 1 — no spring lag on the way out
        f.fallS.v = 0;
        f.riseU = 1;
        f.riseOut = 1; // the settle: the shoulders shake out and the stance settles over the next half second
        f.wakeT = 0.3;
        f.softT = 1.0;
      }
    }
    f.riseOut = Math.max(0, f.riseOut - dt / 0.55);
    if (f.state === 'ko') f.fallT = 1;
    const airborne = f.state === 'air' || (f.state === 'ko' && (f.y > 0 || f.vy !== 0));
    if (airborne) this.updateAir(f, dt);

    // movement
    f.dodgeTail = f.dodgeT > 0 ? 0.24 : Math.max(0, f.dodgeTail - dt);
    if (f.dodgeT > 0) {
      f.dodgeT -= dt;
      const u = 1 - Math.max(0, f.dodgeT) / f.dodgeDur;
      f.invuln = Math.max(f.invuln - dt, f.dodgeInv && u > 0.03 && u < 0.92 ? 0.12 : 0);
      // Live circular ring-arc + directional steering: lateral dodges curve naturally around the opponent
      // and blend in live directional input so the dodge feels fluid and steerable instead of locked on a rail!
      const toO = this.toward(f, o);
      const rightO = new THREE.Vector2(-toO.y, toO.x);
      const latComp = f.dodgeDir.dot(rightO);
      if (Math.abs(latComp) > 0.35) {
        const fwdComp = f.dodgeDir.dot(toO);
        // subtle inward pendulum arc on lateral weaves so you circle around the opponent's guard
        const arcFwd = fwdComp + (1 - u) * 0.14;
        f.dodgeDir.set(toO.x * arcFwd + rightO.x * latComp, toO.y * arcFwd + rightO.y * latComp).normalize();
      }
      if (f.isPlayer && f.wish.lengthSq() > 0.1) {
        const wishDir = f.wish.clone().normalize();
        if (wishDir.dot(f.dodgeDir) > -0.35) {
          f.dodgeDir.lerp(wishDir, Math.min(1, dt * 4.5)).normalize();
        }
      }
      // Athletic S-curve velocity profile: smooth push-off off the ball of the foot -> fast glide -> cushioned settle
      const pushOff = u < 0.14 ? 0.38 + 0.62 * smooth(u / 0.14) : 1;
      const glide = u < 0.14 ? 1 : Math.pow(Math.cos(((u - 0.14) / 0.86) * Math.PI * 0.5), 1.12);
      f.vel.copy(f.dodgeDir).multiplyScalar(f.dodgeSpeed * pushOff * glide);
      // Seamless momentum handover: blend into held footwork velocity (f.wish) over the second half of the dodge
      // so holding W/A/S/D glides straight out of the dodge into fast footwork with zero stop-and-hitch!
      if (u > 0.45 && f.state === 'idle' && f.wish.lengthSq() > 0.05) {
        const handoff = smooth(THREE.MathUtils.clamp((u - 0.45) / 0.55, 0, 1));
        f.vel.lerp(f.wish, handoff * 0.88);
      }
      // the dodge just finished — the advantage window is open: the next strike comes out faster and hits harder
      if (f.dodgeT <= 0 && f.state === 'idle') f.dodgeWinT = DODGE_WIN;
    } else {
      f.invuln = Math.max(0, f.invuln - dt);
      if (f.state === 'stagger' || f.state === 'ko' || f.state === 'air' || f.state === 'down') f.wish.set(0, 0);
      // acceleration-limited steering = momentum (ramps up, carries, brakes with weight)
      const moving = f.wish.lengthSq() > 0.01;
      const dx = f.wish.x - f.vel.x;
      const dy = f.wish.y - f.vel.y;
      const dl = Math.hypot(dx, dy);
      // Snappy pro-boxer traction: instant response on key press, high-traction boot grip on release so spacing is exact!
      const fwGrip = f.isPlayer ? 0.88 + 0.16 * this.fwMul : 1;
      let acc = moving ? (f.sprinting ? 38 : 34) : f.speed > 7 ? 42 : 48;
      if (f.state === 'attack') acc = f.runStrike ? 7 : 14; // a running punch carries its momentum
      if (f.isPlayer && f.state !== 'attack') acc *= fwGrip;
      if (moving && f.vel.x * f.wish.x + f.vel.y * f.wish.y < 0) acc *= 1.35; // crisp pivot when reversing direction
      const maxStep = acc * dt;
      if (dl <= maxStep) f.vel.copy(f.wish);
      else f.vel.addScaledVector(new THREE.Vector2(dx / dl, dy / dl), maxStep);
    }
    f.kb.multiplyScalar(Math.exp(-(airborne ? 1.7 : f.state === 'down' ? 7 : f.state === 'stagger' ? 3.5 : 4.4) * dt));
    let nx = f.pos.x + (f.vel.x + f.kb.x + f.dash.x) * dt;
    let nz = f.pos.y + (f.vel.y + f.kb.y + f.dash.y) * dt;

    // ---- rope contact: the ropes stretch like a soft spring-damper, hold the body and ease it back
    const touch = RING_IN - BODY_R * f.scale;
    f.ropeDepth = 0;
    // A BODY NEVER GOES THROUGH THE ROPES — not the hips, not the head, not the boots. Standing, the hull radius is
    // all that matters; knocked flying or down on the canvas the machine is 7 m long, so both ENDS of it (and the
    // side it is laid over to) are kept inside the rope line too, by shoving the whole body in. The shove grows
    // with the lie, so it is a slide along the mat, never a pop.
    if (this.phase !== 'walk' && (f.state === 'air' || f.state === 'down' || f.state === 'ko')) {
      const sy = Math.sin(f.yaw);
      const cy = Math.cos(f.yaw);
      const lieK = THREE.MathUtils.clamp(f.fallS.x, 0, 1);
      const lean = Math.sin(Math.min(1.3, f.tilt));
      const back = (lieK * 3.5 + lean * 3.3 * (1 - lieK) + 0.5) * f.scale; // the head end (he goes over backwards)
      const front = (lieK * 3.9 + 1.0) * f.scale; // the boots end
      const sideK = Math.sin(Math.min(1.2, Math.abs(f.tiltZ))) * 3.2 * f.scale + 1.0 * f.scale;
      const sgnZ = f.tiltZ >= 0 ? 1 : -1;
      const ends: [number, number][] = [
        [-sy * back, -cy * back],
        [sy * front, cy * front],
        [cy * sideK * sgnZ, -sy * sideK * sgnZ],
      ];
      const limit = RING_IN - 0.35;
      let shX = 0;
      let shZ = 0;
      for (const [ox, oz] of ends) {
        const px = nx + ox;
        const pz = nz + oz;
        if (Math.abs(px) > limit) shX = Math.abs(px) - limit > Math.abs(shX) ? (px > 0 ? -(px - limit) : limit - px) : shX;
        if (Math.abs(pz) > limit) shZ = Math.abs(pz) - limit > Math.abs(shZ) ? (pz > 0 ? -(pz - limit) : limit - pz) : shZ;
      }
      if (shX !== 0) {
        nx += shX;
        if (f.kb.x * shX < 0) f.kb.x *= 0.2;
        if (f.vel.x * shX < 0) f.vel.x = 0;
        this.arena.ropePress(shX < 0 ? 20 : -20, nz, Math.min(0.6, Math.abs(shX)));
      }
      if (shZ !== 0) {
        nz += shZ;
        if (f.kb.y * shZ < 0) f.kb.y *= 0.2;
        if (f.vel.y * shZ < 0) f.vel.y = 0;
        this.arena.ropePress(nx, shZ < 0 ? 20 : -20, Math.min(0.6, Math.abs(shZ)));
      }
    }
    for (let ax = 0; ax < 2; ax++) {
      const pc = ax === 0 ? nx : nz;
      const sgn = pc >= 0 ? 1 : -1;
      const depth = Math.abs(pc) - touch;
      if (depth <= 0) {
        if (depth < -0.12) f.ropeIn[ax] = false;
        continue;
      }
      const fresh = !f.ropeIn[ax];
      f.ropeIn[ax] = true;
      if (depth > f.ropeDepth) {
        f.ropeDepth = depth;
        f.ropeNx = ax === 0 ? sgn : 0;
        f.ropeNz = ax === 1 ? sgn : 0;
      }
      const vTot = (ax === 0 ? f.vel.x + f.kb.x + f.dash.x : f.vel.y + f.kb.y + f.dash.y) * sgn;
      // the ropes are a progressive spring: soft for the first stretch, stiffening hard towards the posts' limit —
      // and a body that flies in fast is damped less, so more of the energy comes back as the rebound
      const give = ropeGive(ax === 0 ? nz : nx);
      const stiff = ROPE_K * (1 + 1.6 * (depth / give) * (depth / give));
      const damp = ROPE_C * lerp(1, 0.45, THREE.MathUtils.clamp((vTot - 4) / 9, 0, 1));
      // A body knocked INTO the ropes in mid-air does not bounce back out of them: the top rope takes him across the
      // chest / the back, kills his travel and he drops straight down beside it (the catapult is for a man on his feet)
      const catchK = airborne ? 0.3 : 1;
      const accel = (stiff * depth + damp * Math.max(0, vTot)) * catchK;
      if (ax === 0) f.kb.x -= sgn * accel * dt;
      else f.kb.y -= sgn * accel * dt;
      if (airborne && vTot > 0) {
        const bleed = 1 - Math.exp(-7 * dt);
        if (ax === 0) f.kb.x -= f.kb.x * bleed;
        else f.kb.y -= f.kb.y * bleed;
      }
      // walking into the rope: fade the intent out instead of fighting the spring
      const vv = (ax === 0 ? f.vel.x : f.vel.y) * sgn;
      if (vv > 0) {
        const cut = Math.min(vv, vv * Math.min(1, depth * 3 + 0.2) * 10 * dt);
        if (ax === 0) f.vel.x -= sgn * cut;
        else f.vel.y -= sgn * cut;
      }
      // the drawn rope follows the body — plus the hip/chest shove of a fresh hit, so the armour never pokes through it
      this.arena.ropePress(ax === 0 ? sgn * 20 : f.pos.x, ax === 1 ? sgn * 20 : f.pos.y, depth + f.hitV * 0.3);
      if (fresh && vTot > 2.5 && f.wallCd <= 0) this.ropeImpact(f, ax === 0 ? sgn : 0, ax === 1 ? sgn : 0, vTot);
    }
    // absolute stop: the body can never pass the fully stretched rope (which gives less and less towards the posts)
    const hardX = touch + ropeGive(nz);
    const hardZ = touch + ropeGive(nx);
    const cx = THREE.MathUtils.clamp(nx, -hardX, hardX);
    const cz = THREE.MathUtils.clamp(nz, -hardZ, hardZ);
    if (cx !== nx) {
      if (f.kb.x * nx > 0) f.kb.x *= 0.2;
      if (f.vel.x * nx > 0) f.vel.x = 0;
      if (f.dash.x * nx > 0) f.dash.x = 0;
    }
    if (cz !== nz) {
      if (f.kb.y * nz > 0) f.kb.y *= 0.2;
      if (f.vel.y * nz > 0) f.vel.y = 0;
      if (f.dash.y * nz > 0) f.dash.y = 0;
    }
    f.pos.x = cx;
    f.pos.y = cz;
    f.speed = f.state === 'ko' ? 0 : f.vel.length();

    // facing (locks onto the strike direction once a punch is thrown)
    if (f.state === 'air' && this.phase !== 'walk' && this.phase !== 'menu') {
      // knocked flying: no steering — he turns with the spin the blow put on him, and that spin bleeds off
      f.airSpin *= Math.exp(-1.6 * dt);
      f.yaw += f.airSpin * dt;
      if (dt > 0) f.yawRate = lerp(f.yawRate, f.airSpin, 1 - Math.exp(-14 * dt));
    } else if (f.state !== 'ko' && f.state !== 'down' && this.phase !== 'menu') {
      f.airSpin = 0;
      const target = Math.atan2(o.pos.x - f.pos.x, o.pos.y - f.pos.y);
      const locked = f.state === 'attack' && f.whooshed;
      const counterAim = f.isPlayer && (f.dodgeT > 0 || f.dodgeTail > 0 || (f.state === 'attack' && !f.whooshed));
      const rate = locked ? (f.move?.id === 'hook' || f.move?.id === 'counter' ? 4.5 : 0.8) : f.state === 'air' ? 3 : counterAim ? 18 : f.softT > 0 ? 4.5 : 10.5;
      const dyaw = wrapAngle(target - f.yaw) * (1 - Math.exp(-rate * dt));
      f.yaw += dyaw;
      if (dt > 0) f.yawRate = lerp(f.yawRate, dyaw / dt, 1 - Math.exp(-14 * dt));
    } else {
      f.yawRate = 0;
    }

    // a tipping / fallen robot must not lie across or beyond the ropes: it twists inward as it goes down
    {
      const ang = Math.min(1.5, f.tilt + 1.5 * THREE.MathUtils.clamp(f.fallS.x, 0, 1));
      if (ang > 0.15) {
        const L = TIP_LEN * f.scale * Math.sin(ang);
        const tx = f.pos.x - Math.sin(f.yaw) * L;
        const tz = f.pos.y - Math.cos(f.yaw) * L;
        const lim = RING_IN - 0.8;
        if (Math.abs(tx) > lim || Math.abs(tz) > lim) {
          const tgt = Math.atan2(f.pos.x, f.pos.y); // face away from the centre → it falls back towards it
          f.yaw += wrapAngle(tgt - f.yaw) * (1 - Math.exp(-4.5 * dt));
          const ox = Math.abs(tx) - lim;
          const oz = Math.abs(tz) - lim;
          if (ox > 0) f.pos.x -= Math.sign(tx) * Math.min(ox, 5 * dt);
          if (oz > 0) f.pos.y -= Math.sign(tz) * Math.min(oz, 5 * dt);
        }
      }
    }
  }

  private updateAir(f: Fighter, dt: number) {
    f.vy -= GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y > 0) return;
    f.y = 0;
    const imp = -f.vy;
    if (imp > 16 && !f.bounced) {
      // only a truly violent slam skips once off the canvas — and barely (steel does not bounce like a ball)
      f.bounced = true;
      f.vy = imp * 0.1;
      this.landFx(f, imp);
      this.ragdollSlam(f, Math.min(1, imp / 18) * 0.8);
    } else {
      f.vy = 0;
      if (f.state === 'air') {
        f.state = 'down';
        if (this.phase === 'fight') this.stats.knockdowns[f.isPlayer ? 1 : 0]++;
        // the knockdown bank: a beat flat out, then the staged rise (the AI gets up a touch sooner at high IQ)
        f.downDur = 2.0 * (f.isPlayer ? 1 : 1 / (1 + (this.iq - 1) * 0.06));
        f.downT = f.downDur;
        f.riseU = 0;
        f.riseOut = 0;
        f.riseSteps = 0;
        // which shoulder he rolls onto: the side the fight is on, so the roll brings him up facing his man
        const to = this.toward(f, this.foeOf(f));
        f.riseDir = to.x * Math.cos(f.yaw) - to.y * Math.sin(f.yaw) >= 0 ? 1 : -1;
        f.fallT = 1;
        // THE LANDING IS TWO-STAGE, like a real knock-down: the boots / hips arrive first with the body still carrying
        // its airborne lean, the KNEES GIVE WAY under the weight, the hips drop, and only then does the torso go over
        // and slam the canvas (head last). The lean he arrives with is kept as its own channel (tiltLand) and is
        // traded for the staged lie as the collapse progresses — the total pitch is continuous and monotonic.
        f.fallS.set(0);
        f.fallS.v = 1.4;
        f.tiltLand = f.tilt;
        f.tiltZLand = f.tiltZ;
        if (Math.abs(f.tiltZ) > 0.15) f.riseDir = f.tiltZ > 0 ? 1 : -1; // he lies on the side he went over to
        this.ragdollSlam(f, Math.min(1, imp / 18));
        f.juggle = 0;
        f.comboTaken = 0;
        f.kb.multiplyScalar(0.4);
      }
      if (imp > 2) this.landFx(f, imp);
    }
  }

  /**
   * RAGDOLL, part 1 — THE LAUNCH. The blow throws the limbs: velocity goes straight into the arm springs (shoulders
   * flung up and out, elbows snapped open), the torso springs get a twist, and the rig's head / shoulder / hip
   * springs are jolted. From here on the air pose only asks the arms to hang, so what you see is the throw decaying
   * on each part's own spring — the right arm and the left never move as one.
   */
  private ragdollKick(f: Fighter, mag: number, side: number) {
    for (let i = 0; i < 2; i++) {
      const sp = f.armS[i];
      const s = i === 0 ? 1 : -1;
      sp[0].v += (-4.2 - (s * side > 0 ? 2.0 : 0.5)) * mag; // flung up/back, the arm on the hit side harder
      sp[2].v += (1.1 + (s * side > 0 ? 0.8 : 0.2)) * mag; // a little out — not spread-eagled
      sp[3].v += (2.4 + (s * side > 0 ? 1.0 : 0)) * mag; // elbow snapped open
    }
    f.bodyS.twist.v += side * 3.2 * mag;
    f.bodyS.roll.v += side * 1.4 * mag;
    f.robot.jolt(mag * 0.9, side);
  }

  /**
   * RAGDOLL, part 2 — THE SLAM. The body hits the canvas and every part that hangs off it keeps going for a beat:
   * the arms whip down and bounce off the mat, the head snaps back on the neck, the hips sink on their suspension,
   * the chest rocks — then each settles on its own spring (the second, smaller slam is the bounce).
   */
  private ragdollSlam(f: Fighter, mag: number) {
    const side = f.riseDir || 1;
    for (let i = 0; i < 2; i++) {
      const sp = f.armS[i];
      const s = i === 0 ? 1 : -1;
      sp[0].v += (4 + (s * side > 0 ? 1.5 : 0)) * mag; // arms slap down
      sp[2].v += (-0.8 + s * side * 0.5) * mag;
      sp[3].v += (-2.5 - (s * side > 0 ? 0 : 1.0)) * mag; // elbows buckle
    }
    f.bodyS.twist.v += side * 1.6 * mag;
    f.bodyS.roll.v += -side * 1.2 * mag;
    f.bodyS.dip.v += 2.0 * mag;
    f.robot.jolt(mag, side);
  }

  private landFx(f: Fighter, imp: number) {
    const pw = Math.min(1, imp / 20);
    this.fx.ring(f.pos.x, f.pos.y, 0xc8d0e0, 4 + pw * 8, 0.55, 0.08);
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.2, f.pos.y), 14 + Math.floor(pw * 44), 4 + pw * 8, 0xb4b4c4, undefined, 1.4, 0.7, 6);
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.4, f.pos.y), 6 + Math.floor(pw * 20), 6 + pw * 6, 0xffb060, undefined, 1.2, 0.6, 14);
    this.sfx.hit(0.3 + pw * 0.55);
    this.trauma = Math.min(0.28, this.trauma + 0.06 + pw * 0.12);
    this.camBump = Math.max(this.camBump, 0.04 + pw * 0.08);
    this.hype = Math.min(1, this.hype + 0.15);
    // the opponent hits the canvas → the crowd goes wild; if it is YOU, they gasp (a smaller reaction)
    if (this.phase === 'fight') this.crowdRoar(f.isPlayer ? 0.32 : 0.62, f.isPlayer ? 1.4 : 2.2);
  }

  /** first touch of the ropes: soft feedback; only a hard slam staggers (briefly) — never a big ping-pong */
  private ropeImpact(f: Fighter, wx: number, wz: number, vIn: number) {
    f.wallCd = 0.5;
    const p = Math.min(1, (vIn - 2.5) / 10);
    const strong = vIn > 6.0;
    if (strong) f.wallT = 1.0;
    f.dash.multiplyScalar(0.3);
    if (f.state === 'air') {
      // hit the ropes in mid-air: the ropes stop him dead and he comes DOWN — no float, no upward kick
      f.vy = Math.min(f.vy, 1.0);
      f.kb.multiplyScalar(0.35);
      f.robot.jolt(0.5 + p * 0.5, f.riseDir || 1);
    }
    else if (strong && f.state !== 'ko' && f.state !== 'down') {
      f.state = 'stagger';
      f.move = null;
      f.queued = null;
      f.blocking = false;
      f.dodgeT = 0;
      f.stunT = Math.max(f.stunT, 0.45 + p * 0.25);
      f.hit = Math.max(f.hit, 0.3 + p * 0.3);
      f.hitF = -1;
      f.hitL = 0;
      f.hitSpin = 0;
      f.hitPt = 0.5;
      f.hitSign = Math.random() < 0.5 ? 1 : -1;
    }
    const px = f.pos.x + wx * 1.5;
    const pz = f.pos.y + wz * 1.5;
    this.arena.ropeHit(wx ? wx * 20 : f.pos.x, wz ? wz * 20 : f.pos.y, 0.3 + p * 0.9);
    this.fx.spark(new THREE.Vector3(px, 4.9 * f.scale, pz), 6 + Math.floor(p * 20), 4 + p * 5, 0xffe0a0, new THREE.Vector3(-wx, 0.2, -wz), 1.2, 0.5, 10);
    this.sfx.ropeCreak(p);
    this.trauma = Math.min(0.22, this.trauma + 0.03 + p * 0.07);
    this.camBump = Math.max(this.camBump, 0.02 + p * 0.05);
    if (strong) {
      this.sfx.cheer(0.5);
      this.hype = Math.max(this.hype, 0.8);
      this.popup(new THREE.Vector3(f.pos.x, 6.4 * f.scale, f.pos.y), 'ROPE BOUNCE!', 'pop-crit');
      // the ropes stretch for a beat and then CATAPULT him back into the ring (see updateFighter)
      f.slingT = 0.16 + p * 0.08;
      f.slingV = 5 + p * 7.5;
      f.slingX = -wx;
      f.slingZ = -wz;
      // and the whole ring takes the shock: a short canvas thump + camera kick
      this.sfx.ropeSlam(0.5 + p * 0.5);
      this.fx.ring(f.pos.x, f.pos.y, 0xffffff, 3 + p * 3, 0.3, 0.08);
      this.camPush += 0.08 + p * 0.14;
    }
  }

  private separate() {
    const list = this.fighters();
    const w = (f: Fighter) => (f.state === 'ko' ? 0 : f.state === 'down' ? 0.15 : 1);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i];
        const e = list[j];
        if (p.state === 'air' || e.state === 'air') continue;
        const minD = 3.2 * (p.scale + e.scale) * 0.5;
        const d = p.pos.distanceTo(e.pos);
        if (d >= minD || d < 0.001) continue;
        const pw = w(p);
        const ew = w(e);
        const tot = pw + ew;
        if (tot === 0) continue;
        const dir = new THREE.Vector2().subVectors(p.pos, e.pos).multiplyScalar(1 / d);
        const push = minD - d;
        p.pos.addScaledVector(dir, (push * pw) / tot);
        e.pos.addScaledVector(dir, (-push * ew) / tot);
      }
    }
    for (const f of list) {
      // the only hard limit is the fully stretched rope (the rope spring in updateFighter does the rest) — clamping
      // to the inner ring line here used to stop anybody from ever reaching the ropes at all
      const touch = RING_IN - BODY_R * f.scale;
      const hx = touch + ropeGive(f.pos.y);
      const hz = touch + ropeGive(f.pos.x);
      f.pos.x = THREE.MathUtils.clamp(f.pos.x, -hx, hx);
      f.pos.y = THREE.MathUtils.clamp(f.pos.y, -hz, hz);
    }
  }

  // ------------------------------------------------------------ combat
  private beginStrike(f: Fighter, o: Fighter, m: Move) {
    if (this.phase === 'fight' && m.id !== 'counter') this.stats.thrown[f.isPlayer ? 0 : 1]++;
    const dir = this.toward(f, o);
    const isPlayerCounter = f.isPlayer && (m.id === 'counter' || f.winStrike || f.counterT > 0);
    if (isPlayerCounter) {
      f.attackDir.copy(dir);
      f.yaw = Math.atan2(dir.x, dir.y);
      f.vel.set(0, 0);
    } else {
      f.attackDir.lerp(dir, TRACK[m.id]).normalize();
    }
    const d = f.pos.distanceTo(o.pos);
    const avg = (f.scale + o.scale) * 0.5;
    const idealStop = (isPlayerCounter ? 3.25 : 3.4) * avg;
    const allowed = o.state === 'ko' || o.state === 'down' ? 0 : Math.max(0, d - idealStop);
    const maxStep = m.step * f.scale * (isPlayerCounter ? 1.45 : 1.15) * (f.runStrike ? 1.45 : f.ippoStrike ? 1.35 : 1);
    const disp = Math.min(isPlayerCounter ? Math.max(maxStep, Math.min(allowed, 3.8 * f.scale)) : maxStep, allowed);
    if (f.runStrike) {
      // the whole run is thrown into the punch: dust burst at the planted foot
      this.fx.ring(f.pos.x + dir.x * 0.6, f.pos.y + dir.y * 0.6, 0xc8d2e8, 5.5, 0.4, 0.07);
      this.fx.spark(new THREE.Vector3(f.pos.x, 0.2, f.pos.y), 22, 6, 0x9a9aaa, new THREE.Vector3(-dir.x, 0.1, -dir.y), 1.1, 0.5, 3);
    }
    f.dash.addScaledVector(dir, disp * 7.2);
    this.sfx.whoosh(m.power);
    this.sfx.step(0.55 + m.power * 0.8);
    const fx = f.pos.x + dir.x * 0.9;
    const fz = f.pos.y + dir.y * 0.9;
    this.fx.ring(fx, fz, 0x9aa8c0, 2.2 * f.scale + m.power * 2.5, 0.35, 0.06);
    this.fx.spark(new THREE.Vector3(fx, 0.15, fz), 6 + Math.floor(m.power * 22), 3 + m.power * 4, 0x9a9aaa, undefined, 1.2, 0.4, 3);
    this.fx.flash(new THREE.Vector3(fx, this.aimY(f, m) * 0.7 * f.scale, fz), 0.7 + m.power * 1.6, 0xbfe6ff, 0.09); // the punch cuts the air
  }

  private resolveHit(a: Fighter, d: Fighter) {
    const m = a.move!;
    const X = MOVE_EXTRA[m.id];
    const aim = a.aim; // the target the attacker picked: 0 = head, 1 = body
    // the menu runs a real demo fight in the background, so hits have to resolve there too
    if (d.state === 'ko' || d.state === 'down' || (this.phase !== 'fight' && this.phase !== 'menu')) return;
    const dist = a.pos.distanceTo(d.pos);
    const toA = new THREE.Vector2().subVectors(a.pos, d.pos).normalize();
    const away = new THREE.Vector2(-toA.x, -toA.y);
    // the impact point is exactly where the target is: between the eyes for a head shot, the chest plate for a body
    // shot — taken from the live model, so it sits on the optics no matter what the opponent is doing
    const aimP = this.aimPoint(d, aim, this.aimTmp);
    const hitPos = new THREE.Vector3(aimP.x + toA.x * 0.75 * d.scale, aimP.y, aimP.z + toA.y * 0.75 * d.scale);
    const dirAD = new THREE.Vector3(away.x, 0.2, away.y);

    if (m.id === 'bolt') {
      // a straight: shock ring at the fist, speed-streak sparks down the line of the punch
      const fxp = new THREE.Vector3(a.pos.x - toA.x * 3.4, 3.5 * a.scale, a.pos.y - toA.y * 3.4);
      this.fx.ring(a.pos.x - toA.x * 2.4, a.pos.y - toA.y * 2.4, 0x9fe6ff, 9, 0.55);
      this.fx.spark(fxp, 36, 14, 0x9fe6ff, new THREE.Vector3(-toA.x, 0.05, -toA.y), 0.5, 0.6, 3);
    }
    if (m.id === 'windmill') {
      // FREESTYLE WINDMILL OVERDRIVE: twin cyclone shockwaves and a massive burst of golden-cyan plasma sparks
      const fxp = new THREE.Vector3(a.pos.x - toA.x * 3.2, 3.8 * a.scale, a.pos.y - toA.y * 3.2);
      this.fx.ring(a.pos.x - toA.x * 2.2, a.pos.y - toA.y * 2.2, 0xffb830, 12.5, 0.65);
      this.fx.ring(a.pos.x - toA.x * 2.2, a.pos.y - toA.y * 2.2, 0x5fe2ff, 8.5, 0.48, 0.14);
      this.fx.spark(fxp, 52, 16, 0xffb830, new THREE.Vector3(-toA.x, 0.18, -toA.y), 0.75, 0.75, 6);
      this.fx.spark(fxp, 28, 13, 0x5fe2ff, new THREE.Vector3(-toA.x, 0.1, -toA.y), 0.65, 0.6, 4);
    }
    if (m.id === 'counter') {
      // HALF AN OVERDRIVE — and the same fireworks, scaled down: a tight shock ring at the fist and a short speed
      // streak down the line of the punch, so a counter that connects reads as the Overdrive's little brother.
      const fxp = new THREE.Vector3(a.pos.x - toA.x * 2.4, 3.5 * a.scale, a.pos.y - toA.y * 2.4);
      this.fx.ring(a.pos.x - toA.x * 1.8, a.pos.y - toA.y * 1.8, 0x9fe6ff, 5.5, 0.42);
      this.fx.spark(fxp, 20, 10, 0x9fe6ff, new THREE.Vector3(-toA.x, 0.05, -toA.y), 0.5, 0.5, 3);
    }
    if (m.id === 'slam') {
      this.fx.ring(a.pos.x - toA.x * 1.8, a.pos.y - toA.y * 1.8, 0xffb040, 14, 0.7);
      this.fx.ring(a.pos.x - toA.x * 1.8, a.pos.y - toA.y * 1.8, 0xffffff, 8, 0.45);
      this.fx.spark(new THREE.Vector3(a.pos.x - toA.x * 2.4, 0.3, a.pos.y - toA.y * 2.4), 60, 11, 0xffa040, undefined, 1.4, 1.0, 16);
    }

    // TIMED DODGE: the player pressed dodge while THIS very attack was winding up → it whiffs, wherever he stands
    if (d.isPlayer && d.dodgeFor === a.moveSeq) {
      d.dodgeFor = -1;
      this.perfectDodge(d, m);
      return;
    }

    const playerTrueCounter = a.isPlayer && (m.id === 'counter' || a.winStrike || a.counterT > 0);
    if (dist > (m.reach + (a.runStrike ? 1.0 : 0) + (playerTrueCounter ? 0.65 : 0)) * a.scale) return; // out of range (a running punch / true counter reaches further)

    // COUNTER STANCE (L): a strike that arrives inside the parry window (or locked by parryFor) is caught, not eaten.
    // Works on ANY attack — including the unblockable throw and the Overdrives!
    if (d.isPlayer && d.state === 'attack' && d.move && d.move.id === 'counter' && (d.moveT <= PARRY_ACTIVE || d.parryFor === a.moveSeq)) {
      this.parryCounter(d, a, m);
      return;
    }

    // sidestep physics: the strike travels along a locked line
    const rel = new THREE.Vector2().subVectors(d.pos, a.pos);
    const lateral = Math.abs(rel.x * a.attackDir.y - rel.y * a.attackDir.x);
    const avg = (a.scale + d.scale) * 0.5;
    const hitWidth = X.width * (playerTrueCounter ? 1.45 : 1) * avg;
    if (lateral > hitWidth) {
      if (d.dodgeT > 0 || d.invuln > 0) {
        if (d.isPlayer) {
          this.perfectDodge(d, m);
        } else {
          this.popup(new THREE.Vector3(d.pos.x, 6.5 * d.scale, d.pos.y), 'MISS', 'pop-info');
          this.aiDefended('dodge', a.moveSeq);
        }
      }
      return;
    }
    if (d.wakeT > 0) return;

    if (d.invuln > 0 && !(playerTrueCounter && !d.isPlayer)) {
      if (d.isPlayer) {
        this.perfectDodge(d, m);
      } else {
        this.popup(new THREE.Vector3(d.pos.x, 6.5 * d.scale, d.pos.y), 'MISS', 'pop-info');
        this.aiDefended('dodge', a.moveSeq);
      }
      return;
    }

    // PLAYER L-COUNTER / OVERDRIVE INTERRUPTS ENEMY DEADLY WIND-UP:
    // If the player lands L (counter) or R (Overdrive) while the enemy is winding up any attack (even an Overdrive or Unblockable!),
    // it shatters the enemy's attack and triggers a full Counter Parry!
    if (a.isPlayer && (m.id === 'counter' || isOD(m.id)) && d.state === 'attack' && d.move && !d.impacted) {
      if (m.id === 'counter') {
        this.parryCounter(a, d, d.move);
      } else {
        d.move = null;
        d.queued = null;
        d.tellT = 0;
        d.tellTotal = 0;
        d.state = 'stagger';
        d.stunT = 0.75;
        a.counterT = Math.max(a.counterT, 1.8);
      }
    }

    let dmg = m.dmg * a.dmgMul;
    let label = '';
    if (a.runStrike) {
      dmg *= 1.45;
      label = 'RUNNING PUNCH!';
    }
    if (a.isPlayer && a.counterT > 0) {
      dmg *= 1.6;
      a.counterT = 0;
      label = 'COUNTER!';
    }
    if (d.state === 'attack' && d.move && d.moveT < d.move.impact && !label && !isOD(m.id)) {
      dmg *= d.isPlayer ? 1.15 : 1.35; // counter-hits hurt you less than they hurt the enemy
      label = 'CRITICAL!';
    }
    const crit = label !== '';
    // DODGE ADVANTAGE: the strike you threw straight out of a dodge lands heavier
    if (a.winStrike) {
      dmg *= 1 + (DODGE_WIN_DMG - 1) * (a.isPlayer ? 1 : 0.5);
      label = label || 'DODGE STRIKE!';
    }
    // EPIC COMEBACK BOOST: when the player's HP is low (< 45%) and they land a Counter (L), Dodge Strike, or Overdrive (R)
    const epicComeback = a.isPlayer && a.hp <= a.maxHp * 0.45 && (crit || a.winStrike || m.id === 'counter' || isOD(m.id));
    if (epicComeback) {
      dmg *= 1.28;
      label = isOD(m.id) ? '🔥 OVERDRIVE COMEBACK!' : '🔥 EPIC COMEBACK!';
    }
    // RAGE MODE: heavier damage and relentless forward dominance
    if (a.rage) {
      dmg *= 1.22;
      if (!label && m.power >= 0.55) label = 'RAGE SMASH!';
    }
    // DEMPSEY ROLL: more damage the longer you weaved before throwing it; a full charge is a SMASH
    if (a.ippoStrike) {
      dmg *= 1 + 0.85 * a.strikeCharge;
      label = label || (a.strikeCharge > 0.85 ? 'DEMPSEY SMASH!' : 'DEMPSEY ROLL!');
      this.fx.ring(d.pos.x, d.pos.y, 0x7fe0ff, 4 + a.strikeCharge * 5, 0.4, 0.09);
      this.trauma = Math.min(0.65, this.trauma + 0.14 + a.strikeCharge * 0.22);
    }
    if (d.wallT > 0) dmg *= 1.25;
    const wasAir = d.state === 'air';
    dmg *= wasAir ? Math.max(0.45, 1 - d.juggle * 0.15) : Math.max(0.45, 1 - d.comboTaken * 0.1);
    // the target you picked decides what the punch does to him
    dmg *= AIM_DMG[aim];
    if (!label && aim === AIM_BODY) label = m.id === 'upper' ? 'LIVER SHOT!' : 'BODY BLOW!';

    // PEEK-A-BOO: the weaving head slips jabs and crosses completely (but not hooks, uppercuts, throws or Overdrive)
    if (d.ippo && d.state === 'idle' && d.slipCd <= 0 && (m.id === 'jab' || m.id === 'cross')) {
      d.slipCd = 0.4;
      d.rollCharge = Math.min(1, d.rollCharge + 0.28);
      d.meter = Math.min(100, d.meter + 6);
      this.popup(new THREE.Vector3(d.pos.x, 6.2 * d.scale, d.pos.y), 'SLIP!', 'pop-dodge');
      this.sfx.dodge();
      this.fx.spark(hitPos, 10, 5, 0x9fe6ff, dirAD, 1, 0.35);
      return;
    }

    // ---------- blocked ----------
    if (!X.unblock && d.blocking && d.state === 'idle') {
      a.hitConfirmed = true;
      if (!d.isPlayer) this.aiDefended('block', a.moveSeq);
      const chip = dmg * m.blockMul * (d.isPlayer ? 1 : 1 / (1 + (this.iq - 1) * 0.1)); // a smart guard soaks more
      d.hp = Math.max(1, d.hp - chip);
      // body shots against a guard eat the guard: the chip drain is multiplied when you are aiming at the body
      d.stam = Math.max(0, d.stam - dmg * 1.25 * AIM_STAM[aim] * (d.ippo ? 0.55 : 1) * (d.isPlayer ? 1 : 1 / Math.pow(this.iq, 0.35)));
      // Boxing guard pushback: even blocked punches drive the defender backward across the ring while the attacker presses in!
      d.kb.addScaledVector(away, m.knock * 0.88 * (a.rage ? 1.32 : 1));
      if (dist > 2.9 * avg) a.kb.addScaledVector(away, m.knock * 0.34);
      this.fx.spark(new THREE.Vector3(d.pos.x, 0.2, d.pos.y), 8, 3.8, 0xb8c4d8, new THREE.Vector3(-away.x, 0.2, -away.y), 1.1, 0.4, 4);
      this.fx.spark(hitPos, 28 + Math.floor(m.power * 32), 10 + m.power * 5, 0xffd27a, dirAD, 1, 0.6); // steel on steel: a shower of sparks
      this.fx.spark(hitPos, 8 + Math.floor(m.power * 12), 7, 0xffffff, dirAD, 1.2, 0.35);
      this.fx.flash(hitPos, 2.2 + m.power * 1.6, 0x9fd6ff, 0.16);
      this.fx.shards(hitPos, 2 + Math.floor(m.power * 5), dirAD, d.robot.armorColor, 6 + m.power * 5, 0.6);
      a.recoilArm = this.armOf(a, m);
      a.recoilTot = 0.12 + m.power * 0.08;
      a.recoilT = a.recoilTot;
      a.recoilAmt = 0.7 + m.power * 0.8; // a guard is a wall: the fist bounces off it harder than off a body
      this.fx.impactWave(hitPos, dirAD, 0x96e2ff, 2.2 + m.power * 2.4, 0.24);
      this.fx.ring(hitPos.x, hitPos.z, 0xbfe4ff, 2.0 + m.power * 2.4, 0.28, hitPos.y);
      this.sfx.block(m.power);
      this.freeze = 0.032 + m.power * 0.028;
      this.frozenFighter = d;
      this.trauma = Math.min(0.45, this.trauma + 0.12 + m.power * 0.16);
      this.camPush += 0.12 + m.power * 0.18;
      this.camBump = Math.max(this.camBump, 0.06 + m.power * 0.1);
      const bImp = 1.4 + m.power * 2.2;
      this.camImpVel.x += away.x * bImp;
      this.camImpVel.y -= 0.7 + m.power * 1.1;
      this.camImpVel.z += away.y * bImp;
      this.popup(hitPos, aim === AIM_BODY ? 'GUARD ABSORB' : 'BLOCK', 'pop-block');
      if (d.stam <= 0) {
        d.blocking = false;
        d.state = 'stagger';
        d.stunT = 1.0;
        d.hit = 1;
        d.hitF = away.x * Math.sin(d.yaw) + away.y * Math.cos(d.yaw);
        d.hitL = away.x * Math.cos(d.yaw) - away.y * Math.sin(d.yaw);
        d.hitSpin = d.hitL * 0.9;
        d.hitSign = Math.abs(d.hitL) > 0.1 ? Math.sign(d.hitL) : Math.random() < 0.5 ? 1 : -1;
        d.hitPt = aim === AIM_HEAD ? 1 : 0;
        this.ai.blockT = 0;
        this.sfx.guardBreak();
        this.popup(new THREE.Vector3(d.pos.x, 6.4 * d.scale, d.pos.y), 'GUARD BREAK!', 'pop-crit');
        this.freeze = 0.08;
        this.slowT = 0.2;
        this.slowScale = 0.46;
        this.trauma = Math.min(0.7, this.trauma + 0.32);
        this.camImpVel.y -= 2.4;
        d.stam = 25;
      }
      if (d.isPlayer) this.flashAmt = Math.max(this.flashAmt, 0.15);
      return;
    }
    d.blocking = false;

    // ---------- clean hit ----------
    d.hp = Math.max(0, d.hp - dmg);
    d.hit = Math.min(1.4, 0.78 + dmg * 0.038);
    a.hitConfirmed = true;
    // ---- THE GEOMETRY OF THE HIT ----
    // The recoil is expressed in the DEFENDER's own frame, so the animation can be built from where the fist
    // really came from and where it landed: a straight snaps him back down the line, a hook turns his head off
    // the axis, an uppercut lifts him, a body shot folds him. `away` is the world push direction, rotated into
    // his local axes (the same convention the foot IK uses: local +z = his facing, local +x = his left).
    const cyD = Math.cos(d.yaw);
    const syD = Math.sin(d.yaw);
    d.hitF = away.x * syD + away.y * cyD;
    d.hitL = away.x * cyD - away.y * syD;
    d.hitPt = aim === AIM_HEAD ? 1 : 0;
    d.hitSpin = d.hitL * (m.kind === 'side' ? 1.7 : 0.9);
    d.hitSign = Math.abs(d.hitL) > 0.1 ? Math.sign(d.hitL) : Math.random() < 0.5 ? 1 : -1;
    a.meter = Math.min(100, a.meter + dmg * 1.3 * (!a.isPlayer && this.ultra ? 1.5 : 1)); // ultra: the enemy charges Overdrive faster
    d.meter = Math.min(100, d.meter + dmg * 0.55);
    if (a.isPlayer && a.meter >= 100 && !this.meterReadyShown) {
      this.meterReadyShown = true;
      this.sfx.ready();
      this.popup(new THREE.Vector3(a.pos.x, 6.4, a.pos.y), 'OVERDRIVE SIAP! [R]', 'pop-crit');
    }
    d.comboTaken++;
    const big = m.power;
    const armored = d.state === 'attack' && !!d.move && isOD(d.move.id) && !(a.isPlayer && (m.id === 'counter' || isOD(m.id)));
    // the target is what the punch does to him: the body tears down stamina and stability
    if (AIM_DRAIN[aim] > 0) d.stam = Math.max(0, d.stam - dmg * AIM_DRAIN[aim]);
    // drain stability; it only breaks after a sustained flurry of clean hits
    if (!wasAir && !armored) {
      d.poise -= poiseCost(big) * AIM_POISE[aim] * (crit ? 1.6 : 1) * (epicComeback ? 1.45 : 1); // a counter-hit or comeback rocks much harder
      d.poiseT = POISE_DELAY;
    }
    // ---- WHEN DOES HE GO DOWN? Only when it is earned. A robot that falls over from every uppercut or every running
    // cross is not a fighter. He is "softened" when his stability is nearly gone, when he is already rocked by a
    // previous shot, or when he is nearly out of HP; only then do the launchers and the running cross take him off
    // his feet. The specials (Overdrive / throw) always do — that is what they are for. Breaking the stability bar
    // with a real punch (cross and up) is a knockdown; breaking it with a jab only ROCKS him and leaves the bar low.
    const poiseFrac = Math.max(0, d.poise) / d.poiseMax;
    const rocked = d.state === 'stagger' && d.stunT > 0.35;
    const softened = poiseFrac < 0.3 || rocked || d.hp <= d.maxHp * 0.22;
    const brokenRaw = d.poise <= 0;
    const broken = brokenRaw && big >= 0.5;
    if (broken) d.poise = d.poiseMax; // reset, so you cannot be chain-knocked-down
    else if (brokenRaw) {
      d.poise = d.poiseMax * 0.22; // rocked, not dropped — the next real punch can finish the job
      label = label || 'ROCKED!';
    }
    const upperLaunch = m.id === 'upper' && (softened || crit || broken);
    const launcher = isOD(m.id) || m.id === 'grab' || upperLaunch;
    const runLaunch = a.runStrike && m.id === 'cross' && (softened || crit);
    const ippoLaunch = a.ippoStrike && a.strikeCharge > 0.85 && m.id !== 'jab' && (softened || big >= 0.6);
    let launched = false;
    if (wasAir) {
      d.juggle++;
      if (d.juggle >= 5 || isOD(m.id)) {
        d.vy = -17;
        label = 'SPIKE!'; // (no slow-mo: the body is in the air — the fall plays in real time)
      } else {
        const pop = (m.id === 'jab' ? 7.5 : m.id === 'cross' ? 8.5 : m.id === 'hook' ? 9 : 10) * (d.juggle >= 3 ? 0.75 : 1);
        d.vy = pop;
        d.kb.addScaledVector(away, 2.5 + big * 2);
        label = label || `JUGGLE x${d.juggle}`;
      }
    // A LAUNCH (= being knocked down) now needs a real reason: a designated launcher, a fully committed special,
    // or a flurry that has emptied your stability. Ordinary jabs / crosses / hooks — even on a counter-hit — no
    // longer sweep you off your feet; they stagger you instead.
    } else if (!armored && (launcher || broken || runLaunch || ippoLaunch)) {
      launched = true;
      d.state = 'air';
      d.move = null;
      d.queued = null;
      d.dodgeT = 0;
      d.juggle = 0;
      d.bounced = false;
      // THE LAUNCH IS THE PUNCH. He is flung along the line the fist actually travelled — a straight drives him
      // back down its line, low and far; a hook throws him ACROSS and spins him; an uppercut lifts him — with a
      // speed that comes from the move's knock, its power, a running start, rage and a counter-hit. Then the
      // simulation (gravity, the lay-over with the travel, the ropes catching, the two-stage landing) does the rest.
      const fwdA = new THREE.Vector2(Math.sin(a.yaw), Math.cos(a.yaw));
      const leftA = new THREE.Vector2(Math.cos(a.yaw), -Math.sin(a.yaw));
      const pd = new THREE.Vector2();
      if (m.kind === 'side') pd.copy(leftA).multiplyScalar(m.arm === 0 ? -0.85 : 0.85).addScaledVector(fwdA, 0.5);
      else if (m.kind === 'up') pd.copy(fwdA).multiplyScalar(0.7);
      else pd.copy(fwdA);
      if (pd.lengthSq() < 1e-4) pd.copy(away);
      pd.normalize();
      const dir = new THREE.Vector2().addScaledVector(pd, 0.62).addScaledVector(away, 0.38).normalize();
      const force = m.knock * (0.72 + big * 0.5) * (a.runStrike ? 1.35 : 1) * (a.rage ? 1.2 : 1) * (crit ? 1.15 : 1);
      const horiz = THREE.MathUtils.clamp(force * 0.95, 4.5, 13.5);
      const vert = m.kind === 'up' ? 12 + big * 4.5 : m.kind === 'side' ? 7.5 + big * 3 : 8 + big * 3.5;
      d.vy = vert;
      d.kb.copy(dir).multiplyScalar(horiz);
      // a hook turns him round in the air (the head is thrown off the axis, the body follows); a straight barely does
      d.airSpin = m.kind === 'side' ? (m.arm === 0 ? -1 : 1) * (1.8 + big * 1.6) : (Math.random() - 0.5) * 0.5;
      // the limbs are thrown the way he is going (ragdoll kick side = the side the blow came across to)
      const sideL = dir.x * Math.cos(d.yaw) - dir.y * Math.sin(d.yaw); // + = driven to his left
      this.ragdollKick(d, 0.55 + big * 0.45, Math.abs(sideL) > 0.25 ? (sideL > 0 ? 1 : -1) : 1);
      label = m.id === 'grab' ? 'THROW!' : m.id === 'windmill' ? 'FREESTYLE SMASH!' : broken && !launcher ? 'KNOCKDOWN!' : label || 'LAUNCH!';
    } else if (!armored) {
      // BOXING HIT PUSHBACK & RING DOMINANCE:
      // Each landed strike noticeably drives the defender backward across the canvas while the attacker steps in to press the advantage!
      const heavyNoDrop = (m.id === 'upper' || (a.runStrike && m.id === 'cross') || brokenRaw) ? 1.35 : 1; // kept on his feet, but driven back hard — often into the ropes
      const pushMul = (1.85 + Math.min(4, d.comboTaken) * 0.3) * AIM_KNOCK[aim] * (a.runStrike ? 1.45 : 1) * (a.rage ? 1.35 : 1) * heavyNoDrop;
      d.kb.addScaledVector(away, m.knock * pushMul);
      if (dist > 2.85 * avg) {
        a.kb.addScaledVector(away, m.knock * 0.62 * (a.rage ? 1.25 : 1));
      }
      // a smart AI shakes a hit off sooner, and where you hit him matters: head shots stun, body shots do not
      const sc = Math.max(0.5, 1 - d.comboTaken * 0.08) * (d.isPlayer ? 0.9 : 1 / (1 + (this.iq - 1) * 0.07));
      const stun = m.stun * sc * AIM_STUN[aim] * (brokenRaw ? 1.5 : 1);
      if (d.state === 'stagger') d.stunT = Math.max(d.stunT, stun);
      else {
        d.state = 'stagger';
        d.move = null;
        d.queued = null;
        d.dodgeT = 0;
        d.stunT = stun;
      }
    } else {
      d.kb.addScaledVector(away, m.knock * 0.4);
    }
    if (!d.isPlayer) {
      this.ai.blockT = 0;
      this.ai.reactT = -1;
      this.ai.defStreak = 0;
      this.ai.punishT = 0;
      this.ai.queued = null;
    }

    // feedback — heavy, on-beat hitstop + 3D spring-damper camera punch + crisp slow-mo so every 2-ton robot blow feels massive!
    this.freeze = 0.045 + big * 0.068 + (launched ? 0.015 : 0);
    if (launched) {
      // a knock-down is NOT slowed: the body leaves the feet and the whole fall plays in real time (a short
      // hit-stop on the contact is all the punctuation it gets — the simulation does the rest)
      this.slowT = 0;
    } else if (big >= 0.6 || crit || a.runStrike || a.winStrike || a.rage) {
      this.slowT = Math.max(this.slowT, 0.14 + big * 0.11);
      this.slowScale = 0.46;
    } else {
      // even a clean jab carries unmistakable 2-ton hydraulic piston weight
      this.slowT = Math.max(this.slowT, 0.065);
      this.slowScale = Math.min(this.slowScale < 1 ? this.slowScale : 1, 0.68);
    }
    this.frozenFighter = d;
    this.trauma = Math.min(0.85, this.trauma + 0.26 + big * 0.42 + (crit ? 0.12 : 0) + (launched ? 0.14 : 0));
    this.shakePh = 0; // start shockwave at phase 0 right on impact for a clean, deterministic punch wave
    const impMag = (2.6 + big * 4.8) * (crit || launched ? 1.25 : 1);
    this.camImpVel.x += away.x * impMag;
    this.camImpVel.y -= 1.2 + big * 2.4;
    this.camImpVel.z += away.y * impMag;
    d.flash = 1;
    // head shots snap his head back; body shots fold him over the punch (a negative hitUp drops the torso + head)
    d.hitUp = aim === AIM_BODY && !launched ? -(0.36 + big * 0.6) : m.kind === 'up' && !launched ? 0.45 + big * 0.75 : 0;
    d.dash.set(0, 0);
    this.camPush += 0.26 + big * 0.52;
    this.camBump = Math.max(this.camBump, 0.1 + big * 0.24);
    this.camRoll = d.hitSign * (0.015 + big * 0.032);
    this.fovKick = -(1.8 + big * 4.6);
    this.hype = Math.min(1, this.hype + 0.35 + big * 0.35);
    const hot = aim === AIM_BODY ? 0xff9840 : 0xffc458; // body shots burn warmer, head shots stay golden
    this.fx.spark(hitPos, 46 + Math.floor(big * 105), 11.5 + big * 15, hot, dirAD, 1.05, 0.98);
    this.fx.spark(hitPos, 18 + Math.floor(big * 38), 7.5 + big * 9, 0xffffff, dirAD, 1.35, 0.48);
    this.fx.spark(hitPos, 12 + Math.floor(big * 26), 9.5 + big * 11, 0x7fe0ff, dirAD, 0.9, 0.58); // high-voltage servo arc sparks
    this.fx.spark(new THREE.Vector3(d.pos.x, 0.2, d.pos.y), 14 + Math.floor(big * 32), 4.5 + big * 6.5, 0xb9c2d6, undefined, 1.4, 0.65, 7); // floor debris
    // ARMOUR CHIPS: real solid debris knocked off the plating, tinted to the armour that was hit, tumbling & bouncing
    this.fx.shards(hitPos, 5 + Math.floor(big * 14) + (crit ? 5 : 0), dirAD, d.robot.armorColor, 7 + big * 7, 0.8 + big * 0.7);
    // the dent keeps dripping embers for a moment (heavier blows bleed longer)
    d.emberT = Math.max(d.emberT, 0.22 + big * 0.3);
    {
      const sy = Math.sin(d.yaw);
      const cy = Math.cos(d.yaw);
      const lx = hitPos.x - d.pos.x;
      const lz = hitPos.z - d.pos.y;
      d.emberLocal.set(cy * lx - sy * lz, hitPos.y - d.y, sy * lx + cy * lz);
    }
    // the shock travels back up the attacker's arm: the fist recoils off the plate and the body rocks with it
    a.recoilArm = this.armOf(a, m);
    a.recoilTot = 0.14 + big * 0.12;
    a.recoilT = a.recoilTot;
    a.recoilAmt = 0.55 + big * 0.9 + (crit ? 0.3 : 0);
    this.fx.flash(hitPos, 3.2 + big * 5.6, 0xffe0a8, 0.25);
    if (big >= 0.4 || crit || launched) this.arena.strobe(0.3 + big * 0.7 + (launched ? 0.3 : 0)); // the rig kicks with the blow
    this.fx.impactWave(hitPos, dirAD, aim === AIM_BODY ? 0xff9c48 : 0xffdf88, 2.8 + big * 5.2, 0.28); // 3D sonic halo perpendicular to punch vector + 4-point starburst!
    if (big >= 0.55 || crit || launched) {
      this.fx.impactWave(hitPos, dirAD, 0xffffff, 1.8 + big * 3.4, 0.18); // inner white-hot sonic core ring on heavy/counter hits
    }
    this.fx.ring(hitPos.x, hitPos.z, aim === AIM_BODY ? 0xffa860 : 0xffe498, 2.8 + big * 5.2, 0.36, hitPos.y); // primary shock ring AT the impact point
    this.fx.ring(hitPos.x, hitPos.z, 0xffffff, 1.6 + big * 3.0, 0.22, hitPos.y); // inner sonic snap ring
    this.fx.ring(d.pos.x, d.pos.y, 0xffe0a0, 4.0 + big * 6.5, 0.46);
    this.fx.ring(d.pos.x, d.pos.y, 0xffffff, 2.2 + big * 3.8, 0.28, 0.1);
    this.sfx.hit(Math.min(1, big * 1.15));
    this.sfx.crackle(0.25 + big * 0.55); // heavy steel armor crunch & electrical arc on every clean blow!
    this.sfx.cheer(0.3 + big * 0.7);
    // a player Overdrive that connects gets the director's punch-in on the point of impact — unless this is the
    // one that takes his head off, in which case the long HEAD RIP shot takes over instead
    const willRip = a.isPlayer && aim === AIM_HEAD && !d.decapitated && this.phase === 'fight';
    if (a.isPlayer && isOD(m.id) && !willRip) this.startCine('hit', hitPos, m.id === 'bolt' ? toA : undefined);
    if (this.phase !== 'menu') {
      if (d.isPlayer) {
        this.flashAmt = Math.min(0.75, 0.22 + big * 0.35);
        this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,40,20,0) 35%, rgba(255,30,20,0.85) 100%)';
        this.combo = 0;
      } else {
        this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.0) 45%, rgba(255,255,255,0.3) 100%)';
        this.flashAmt = Math.max(this.flashAmt, 0.1 + big * 0.25);
        this.combo++;
        this.comboT = 2.3;
        this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      }
      if (this.phase === 'fight') {
        const who = a.isPlayer ? 0 : 1;
        this.stats.landed[who]++;
        this.stats.dmg[who] += dmg;
        if (crit && a.isPlayer) this.stats.counters++;
        this.stats.time = ROUND_TIME - this.roundTime;
      }
      if (isOD(m.id) && !launched) {
        this.slowT = 0.42;
        this.slowScale = 0.38;
      }
      if (isOD(m.id)) {
        this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,230,180,0.25) 0%, rgba(255,200,120,0.55) 100%)';
        this.flashAmt = 0.85;
      }
      this.popup(hitPos, Math.round(dmg).toString(), big >= 0.6 ? 'pop-big' : 'pop-dmg');
      if (label) this.popup(new THREE.Vector3(hitPos.x, hitPos.y + 1.4, hitPos.z), label, 'pop-crit');
      if (a.isPlayer && this.combo >= 3) this.popup(new THREE.Vector3(a.pos.x, 6.3, a.pos.y), `${this.combo} HIT COMBO`, 'pop-info');
    }

    // ------------------------------------------------------------------ HEAD RIP
    // An Overdrive that lands on a HEAD target does not just hurt: it tears the opponent's head clean off. The
    // helmet is launched away with the momentum of the blow and the neck is left as a stump with torn, sparking
    // cables hanging out of it. It is a finisher, so it ends the round on the spot.
    if (a.isPlayer && aim === AIM_HEAD && isOD(m.id) && this.phase === 'fight' && !d.decapitated) {
      d.decapitated = true;
      d.hp = 0;
      d.poise = 0;
      this.decap.pop(d.robot, away, d.scale, this.fx);
      this.startCine('rip', hitPos, away); // four angles: the cut, the head in flight, the sparking stump, the fall-out
      this.fx.flash(hitPos, 9, 0xffffff, 0.3);
      this.fx.ring(hitPos.x, hitPos.z, 0x9fe6ff, 12, 0.7, hitPos.y);
      this.fx.spark(hitPos, 90, 16, 0x9fe6ff, dirAD, 1.4, 1.0, 10);
      this.popup(new THREE.Vector3(d.pos.x, 7.4 * d.scale, d.pos.y), 'HEAD RIP!', 'pop-crit');
      this.popup(hitPos, 'KEPALA TERPENTAL!', 'pop-big');
      this.slowT = 0.85;
      this.slowScale = 0.32;
      this.flashAmt = 0.9;
      this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.1) 20%, rgba(150,230,255,0.75) 100%)';
      this.freeze = 0.14;
      this.trauma = 0.85;
      this.camPush += 0.55;
      this.camBump = 0.45;
      this.fovKick = -6;
      this.hype = 1;
      this.sfx.hit(1);
      this.sfx.screech(1); // steel joints tearing apart
      this.sfx.guardBreak();
      this.sfx.crackle(1);
      this.sfx.ko();
      this.crowdRoar(1, 4.6);
    }

    if (d.hp <= 0) this.knockout(d, a);
  }

  private knockout(d: Fighter, a: Fighter) {
    if (this.phase === 'menu') {
      d.hp = d.maxHp; // the demo reel never ends: patch him up and fight on
      return;
    }
    const mate = this.mateOf(d);
    if (this.teamMode && mate && mate.state !== 'ko') {
      // TEAM MATCH: one down, the partner fights on — the survivors regroup on whoever is still standing
      d.state = 'ko';
      d.move = null;
      d.blocking = false;
      d.fallT = 0;
      d.vy = Math.max(d.vy, 9);
      d.bounced = false;
      d.kb.copy(new THREE.Vector2(d.pos.x - a.pos.x, d.pos.y - a.pos.y).normalize()).multiplyScalar(8);
      d.hp = 0;
      this.slowT = 0.6;
      this.slowScale = 0.38;
      this.freeze = 0.12;
      this.trauma = 0.7;
      this.fovKick = -5;
      this.flashAmt = 0.7;
      this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.5) 100%)';
      this.sfx.ko();
      this.sfx.say('K O!');
      this.crowdRoar(d.team === 0 ? 0.65 : 0.95, 3.0);
      this.showBanner('K.O.!', `${this.nameOf(d)} TUMBANG · ${this.nameOf(mate)} MELANJUTKAN`, 'ko', 2.4);
      this.fx.spark(new THREE.Vector3(d.pos.x, 3.5 * d.scale, d.pos.y), 70, 12, 0xffaa40, undefined, 1.5, 1.2, 12);
      this.fx.ring(d.pos.x, d.pos.y, 0xffffff, 12, 0.8);
      if (d === this.enemy) this.swapEnemies();
      return;
    }
    d.state = 'ko';
    d.move = null;
    d.blocking = false;
    d.fallT = 0;
    d.vy = Math.max(d.vy, 9);
    d.bounced = false;
    d.kb.copy(new THREE.Vector2(d.pos.x - a.pos.x, d.pos.y - a.pos.y).normalize()).multiplyScalar(8);
    this.slowT = 0.95;
    this.slowScale = 0.32;
    this.freeze = 0.16;
    this.trauma = 0.85;
    this.fovKick = -6;
    this.flashAmt = 1;
    this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.6) 100%)';
    this.sfx.ko();
    this.sfx.say('K O!');
    this.endRound(a, 'ko');
    // a decapitation deserves its own card
    if (d.decapitated) this.showBanner('K.O.!', d.isPlayer ? 'KEPALAMU TERPENTAL!' : `${this.def.name} KEHILANGAN KEPALA`, 'ko', 3.8);
    this.fx.spark(new THREE.Vector3(d.pos.x, 3.5 * d.scale, d.pos.y), 90, 14, 0xffaa40, undefined, 1.5, 1.2, 12);
    this.fx.ring(d.pos.x, d.pos.y, 0xffffff, 14, 0.9);
  }

  // ------------------------------------------------------------ animation
  private updateAnimations(dt: number) {
    if (this.phase === 'menu' && this.menuCamMode !== 'arena') {
      this.animateMenuHero(dt > 0 ? dt : 0.016);
      return;
    }
    for (const f of this.fighters()) this.animateFighter(f, this.foeOf(f), dt);
  }

  /** the lobby poses (arms + body channels) — shared by the hero stage and the portrait studio */
  private heroArms(pose: HeroPose, t: number, mx: number, my: number) {
    let a0: Pose;
    let a1: Pose;
    let dp = 0.12;
    let tw = Math.sin(t * 0.8) * 0.02 + mx * 0.08;
    let ln = 0.03 + my * 0.04;
    const rl = Math.sin(t * 1.2) * 0.015;
    switch (pose) {
      case 'ready': {
        // THE STARE-DOWN (boxing promo stance): the lead glove raised beside the cheek, the rear glove at the
        // chest, elbows in, shoulders a quarter turn to the lens, chin down behind the lead fist — the face stays
        // clear between the gloves. A heavy slow breath, the lead fist slowly rolling its knuckles, nothing else
        // moves. (measured on the rig: lead fist 1.5 m beside / 0.9 m ahead of the head at cheek height, rear
        // fist on the sternum line)
        const br = Math.sin(t * 1.3) * 0.016;
        const roll = Math.sin(t * 0.7) * 0.03;
        a0 = { sx: -0.8 + br, sy: -0.1 + roll, sz: 0.25 - roll, ex: -2.4 - br };
        a1 = { sx: -0.55 + br * 0.7, sy: -0.4, sz: 0.0, ex: -1.8 - br };
        tw = 0.22 + Math.sin(t * 0.8) * 0.01 + mx * 0.08;
        ln = 0.1 + my * 0.03;
        dp = 0.11 + br * 0.5;
        break;
      }
      case 'vs': {
        // THE CALL-OUT (VS screen, opponent revealed): the lead fist driven straight out at the lens and HELD
        // there, the rear fist on the chest, the shoulder behind the thrust — "you're next"
        const br = Math.sin(t * 1.6) * 0.015;
        a0 = { sx: -1.52 + br, sy: -0.3, sz: 0.1, ex: -0.26 };
        a1 = { sx: -0.92 + br, sy: -0.5, sz: -0.2, ex: -1.76 };
        tw = 0.34 + mx * 0.05;
        ln = 0.15 + my * 0.03;
        dp = 0.11 + br * 0.5;
        break;
      }
      case 'menace': {
        // THE PREDATOR (the opponent on the VS screen): hunched forward, the arms hanging wide and loaded, fists
        // clenched, a slow roll of the shoulders — a machine sizing you up
        const sway = Math.sin(t * 1.1) * 0.05;
        a0 = { sx: -0.42 + sway, sy: -0.1, sz: 0.16, ex: -1.25 };
        a1 = { sx: -0.42 - sway, sy: -0.1, sz: 0.16, ex: -1.25 };
        tw = Math.sin(t * 0.55) * 0.09 + mx * 0.05;
        ln = 0.24 + my * 0.03;
        dp = 0.2 + Math.sin(t * 1.1) * 0.012;
        break;
      }
      case 'guard': {
        const sw = Math.sin(t * 3.2) * 0.03;
        a0 = { sx: -0.74 + sw, sy: -0.45, sz: 0.06, ex: -1.98 };
        a1 = { sx: -0.74 - sw, sy: 0.45, sz: 0.06, ex: -1.98 };
        dp = 0.14 + Math.abs(Math.sin(t * 3.5)) * 0.04;
        break;
      }
      case 'victory': {
        const pump = Math.sin(t * 3.5) * 0.08;
        a0 = { sx: -2.85 + pump, sy: -0.08, sz: 0.52, ex: -0.38 };
        a1 = { sx: -2.85 + pump, sy: 0.08, sz: 0.52, ex: -0.38 };
        ln = -0.08;
        dp = 0.08;
        break;
      }
      case 'taunt': {
        const p = Math.sin(t * 4.5) * 0.5 + 0.5;
        a0 = { sx: -0.4 - p * 0.42, sy: -0.18, sz: 1.1, ex: -2.1 + p * 0.4 };
        a1 = { sx: -0.4 - p * 0.42, sy: 0.18, sz: 1.1, ex: -2.1 + p * 0.4 };
        dp = 0.14 + p * 0.03;
        break;
      }
      case 'stand':
      default: {
        const breath = Math.sin(t * 1.8) * 0.025;
        a0 = { sx: -0.22 + breath, sy: -0.14, sz: 0.24, ex: -0.92 - breath * 1.6 };
        a1 = { sx: -0.16 + breath, sy: 0.16, sz: 0.26, ex: -0.78 - breath * 1.6 };
        dp = 0.04 + breath * 0.6;
        break;
      }
    }
    return { a0, a1, dp, tw, ln, rl };
  }

  private heroAnimState(pose: HeroPose, t: number, mx: number, my: number, mirror = false) {
    const { a0, a1, dp, tw, ln, rl } = this.heroArms(pose, t, mx, my);
    // `mirror` is the reflection of the pose across the body's centre line: the arms swap and every lateral
    // channel (shoulder twist, hip roll, the look) flips sign — the VS opponent squares up as the hero's mirror image
    return {
      arms: (mirror ? [a1, a0] : [a0, a1]) as [Pose, Pose],
      twist: mirror ? -tw : tw,
      lean: ln,
      lunge: 0,
      dip: dp,
      roll: mirror ? -rl : rl,
      vf: 0,
      vl: 0,
      af: 0,
      al: 0,
      yawRate: 0,
      air: 0,
      hit: 0,
      hitSign: 1,
      hitUp: 0,
      fall: 0,
      time: t,
      glow: 0.55 + Math.sin(t * 2.5) * 0.12,
      flash: 0,
      tilt: 0,
      dash: 0,
      dashF: 0,
      dashL: 0,
      lookX: mirror ? -mx : mx,
      lookY: my,
    };
  }

  private animateMenuHero(dt: number) {
    if (!this.menuHero || this.phase !== 'menu') return;
    const t = this.time;
    this.hangar.update(t);
    if (this.vs) {
      // THE VS STAGE: the hero holds his lobby stare-down the whole way through — search, reveal and lock — and the
      // opponent is his exact MIRROR IMAGE: the same pose reflected across the centre line (lead hand swapped,
      // twist flipped, same breath), so the two square up symmetrically either side of the VS mark. Only the lens
      // punches in on the reveal.
      const heroPose: HeroPose = this.heroPose;
      this.vsPunch = Math.max(0, this.vsPunch - dt * 2.2);
      if (this.vsFoe) this.vsFoe.robot.animate(this.heroAnimState(heroPose, t, 0, 0, true), dt);
      if (this.vsFoe2) this.vsFoe2.robot.animate(this.heroAnimState(heroPose, t + 0.6, 0, 0, true), dt);
      this.menuHero.animate(this.heroAnimState(heroPose, t, 0, 0), dt);
      return;
    }
    this.heroYaw += (this.heroYawTarget - this.heroYaw) * Math.min(1, 10 * dt);
    this.menuHero.root.rotation.y = this.heroYaw;
    if (this.menuHeroPedestal) {
      this.menuHeroPedestal.rotation.y = t * 0.32;
    }
    this.menuHero.animate(this.heroAnimState(this.heroPose, t, this.heroMouseX, this.heroMouseY), dt);
  }

  private animateFighter(f: Fighter, o: Fighter, dt: number) {
    let a0: Pose = GUARD;
    let a1: Pose = GUARD;
    let tw = 0;
    let ln = 0.08;
    let lg = 0;
    let dp = 0.12;
    let rl = 0;
    let kk = 15;
    const t = f.animT;
    f.headYaw = 0;

    if (f.state === 'ko') {
      a0 = a1 = LIMP;
      ln = 0;
      dp = 0;
    } else if ((f.pkTuck > 0.01 || f.pkLand > 0.01 || f.pkPre > 0.01) && f.tauntT <= 0) {
      // PARKOUR ENTRANCE: the load before take-off (arms swung back, hips down), the tuck of the front flip (arms
      // wrapped round the knees), the arms flying open on the descent, then the superhero landing — deep crouch,
      // one fist driven into the canvas, the other arm swept back for balance, head coming up last
      const pre = f.pkPre;
      const tk = f.pkTuck;
      const ld = f.pkLand;
      const loadA = P(0.95, 0.05, 0.35, -0.8);
      const tuckA = P(-1.35, -0.3, 0.25, -2.3);
      // the superhero landing, boxer's cut: BOTH fists driven straight down into the canvas either side of the
      // knees, arms locked, shoulders square, head down then up — one symmetric, planted, menacing shape
      const landFist = P(-0.58, -0.06, 0.34, -0.1);
      const open = P(-1.5, 0.1, 1.15, -0.5); // the arms fly open as he comes out of the tuck
      const inAir = f.state === 'air' ? 1 : 0;
      const from = f.sprinting ? RUNARM : GUARD; // the load grows out of the running arm swing, not out of the guard
      const base0 = lerpPose(lerpPose(lerpPose(from, loadA, pre), open, Math.min(1, (1 - tk) * 1.4) * inAir), tuckA, tk);
      a0 = lerpPose(base0, landFist, ld);
      a1 = lerpPose(base0, landFist, ld);
      ln = lerp(lerp(lerp(0.08, 0.34, pre), 0.7, tk), 0.5, ld);
      dp = lerp(lerp(lerp(0.12, 0.55, pre), 0.3, tk), 0.92, ld); // a firm crouch: the knees stay well clear of the canvas
      tw = 0;
      rl = 0;
      kk = ld > 0.3 ? 70 : 34; // the landing pose SNAPS in
    } else if (f.state === 'air') {
      // KNOCKED FLYING: nothing is "animated" here. The arms were thrown by the blow (ragdollKick put the velocity
      // into their springs); from then on they hang as dead weight that trails the body — very soft springs, a slow
      // drift as the torso pitches over, no flapping
      const drift = Math.sin(t * 3.4) * 0.07;
      a0 = P(-0.6 + drift, 0.05, 0.38, -0.75);
      a1 = P(-0.6 - drift, 0.05, 0.38, -0.75);
      ln = -0.2;
      dp = 0.05;
      kk = 5;
    } else if (f.state === 'down') {
      // KNOCK-DOWN & GET-UP: the whole rise is one continuous curve — he lies limp, rolls onto one shoulder,
      // plants that hand and pushes, swings the free arm across for momentum, and hands the arms back to the guard
      // as he comes up. The body, hips, head and legs read the same staging curves (riseStages), so nothing fights.
      const rb = riseArms(f.riseU, f.riseDir);
      a0 = rb.a0;
      a1 = rb.a1;
      tw = rb.tw;
      ln = rb.ln;
      lg = 0;
      dp = rb.dp;
      rl = rb.rl;
      kk = rb.kk;
    } else if (f.state === 'stagger') {
      const fl = Math.sin(t * 22) * 0.14;
      const kbMag = Math.min(1, f.kb.length() / 12);
      a0 = { ...STAGGER, sz: STAGGER.sz + fl, sx: STAGGER.sx - fl - kbMag * 0.18 };
      a1 = { ...STAGGER, sz: STAGGER.sz - fl, sx: STAGGER.sx + fl - kbMag * 0.18 };
      ln = -0.34 - kbMag * 0.22;
      lg = -0.36 - kbMag * 0.25;
      tw = f.hitSign * (0.28 * kbMag + Math.sin(t * 18) * 0.12);
      rl = -f.hitL * 0.22 * kbMag;
      dp = 0.25 + kbMag * 0.08;
      kk = 32;
    } else if (f.state === 'attack' && f.move) {
      const m = f.move;
      const s = sampleKeys(m.keys, f.moveT);
      // the player's stance hand decides which fist throws it; posing the other arm mirrors the motion,
      // so the follow-through, the swing and the wind-up all come from the correct side of the body
      const arm = this.armOf(f, m);
      const mirrored = m.arm !== 2 && arm !== m.arm;
      if (m.id === 'windmill' && f.moveT < m.strikeAt * 0.94) {
        // FREESTYLE WINDMILL OVERDRIVE (muter-muter tangan):
        // High-speed 360° circular arm rotation before snapping into the devastating haymaker smash!
        const spin = f.animT * 25;
        const windP = P(-spin, 0.34 + Math.sin(spin) * 0.18, 0.48, -0.3 + Math.cos(spin) * 0.15);
        const counterSpin = spin + Math.PI;
        const windOther = P(-counterSpin, 0.28, 0.4, -0.45);
        if (arm === 0) {
          a0 = windP;
          a1 = f.moveT < m.strikeAt * 0.72 ? windOther : GUARD;
        } else {
          a1 = windP;
          a0 = f.moveT < m.strikeAt * 0.72 ? windOther : GUARD;
        }
        tw = -0.82 + Math.sin(spin) * 0.38;
        ln = -0.18 + Math.cos(spin) * 0.1;
        lg = -0.38;
        dp = 0.28 + Math.sin(spin * 0.5) * 0.08;
        rl = Math.cos(spin) * 0.22;
        kk = 95;
      } else {
        const strike = this.aimPose(f, m, s.p); // aiming at the body drops the whole punch onto the target
        // Natural non-monotonous attack flow: 4 biomechanical variations (angle, head-slip, level-change, pivot)
        // plus dynamic off-hand balance/guard motion so spamming punches looks fluid and human!
        const canVar = !isOD(m.id) && m.id !== 'grab' && m.id !== 'counter';
        const varEnv = canVar ? Math.sin(Math.min(1, f.moveT / Math.max(0.25, m.dur * 0.82)) * Math.PI) : 0;
        const v = f.strikeVar;
        const sgn = arm === 0 ? -1 : 1;
        const variedStrike: Pose = { ...strike };
        let offGuard: Pose = { ...GUARD };
        if (varEnv > 0.01) {
          if (v === 1) {
            // Outside Head-Slip & Corkscrew Overhand Angle
            variedStrike.sx -= 0.14 * varEnv;
            variedStrike.sy += 0.16 * varEnv;
            variedStrike.sz += 0.24 * varEnv;
            offGuard = P(GUARD.sx - 0.16 * varEnv, GUARD.sy - 0.12 * varEnv, GUARD.sz + 0.18 * varEnv, GUARD.ex + 0.18 * varEnv);
            rl += sgn * 0.22 * varEnv;
            dp += 0.09 * varEnv;
          } else if (v === 2) {
            // Level-Change Crouch & Rising Drive
            variedStrike.sx += 0.16 * varEnv;
            variedStrike.ex -= 0.14 * varEnv;
            offGuard = P(GUARD.sx - 0.24 * varEnv, GUARD.sy - 0.18 * varEnv, GUARD.sz, GUARD.ex - 0.15 * varEnv);
            dp += 0.18 * varEnv;
            ln += 0.14 * varEnv;
            rl -= sgn * 0.14 * varEnv;
          } else if (v === 3) {
            // Wide Pivot & Inside Shoulder Roll
            variedStrike.sy -= 0.18 * varEnv;
            variedStrike.sz -= 0.18 * varEnv;
            offGuard = P(GUARD.sx + 0.12 * varEnv, GUARD.sy + 0.14 * varEnv, GUARD.sz + 0.26 * varEnv, GUARD.ex + 0.25 * varEnv);
            rl += sgn * 0.18 * Math.cos(f.moveT * 10) * varEnv;
          } else {
            // Classic Crisp Snap with subtle off-hand rhythm
            offGuard = P(GUARD.sx - 0.1 * varEnv, GUARD.sy - 0.08 * varEnv, GUARD.sz + 0.08 * varEnv, GUARD.ex - 0.08 * varEnv);
            rl -= sgn * 0.08 * varEnv;
          }
        }
        if (arm === 0) {
          a0 = variedStrike;
          a1 = offGuard;
        } else if (arm === 1) {
          a1 = variedStrike;
          a0 = offGuard;
        } else {
          a0 = a1 = variedStrike;
        }
        const extraTw = varEnv > 0.01 ? (v === 3 ? -sgn * 0.26 : v === 1 ? -sgn * 0.15 : 0) * varEnv : 0;
        tw = s.twist * (mirrored ? -1 : 1) * (f.ippoStrike ? 1.35 : 1) + extraTw;
        if (f.tellT > 0) tw += Math.sin(f.animT * 46) * 0.03; // the held wind-up trembles
        ln += s.lean + (f.runStrike ? 0.22 : f.ippoStrike ? 0.16 : f.rage ? 0.12 : 0); // leaning into it
        lg = (s.lunge + (v === 2 ? 0.18 * varEnv : 0)) * (f.runStrike ? 1.3 : 1) * (f.aim === AIM_BODY ? 0.94 : 1);
        dp += s.dip + (this.aimsLow(f, m) ? 0.1 : 0); // and you sit down into a body shot
        kk = f.rage ? 92 : 75;
      }
    } else if (f.tauntT > 0) {
      // FREESTYLE: one beat of a move from the book (poses.ts). Which move it is only changes what the curves do —
      // the rig, the springs and the return to the guard are identical for all of them.
      const u = 1 - f.tauntT / Math.max(0.001, f.tauntDur);
      const fb = freestylePose(f.tauntStyle, u, t);
      a0 = fb.a0;
      a1 = fb.a1;
      tw = fb.tw;
      ln = fb.ln;
      dp = fb.dp;
      rl = fb.rl;
      kk = fb.kk;
    } else if (f.swagger !== 0 && this.phase === 'walk') {
      // THE STRUT (ring walk). Everything here hangs on the LIVE STRIDE (robot.stride): the arms swing loose and big
      // against the legs, the elbow folds as the arm comes forward and opens as it goes back, the shoulders roll
      // against the hips, the weight drops onto each stance leg — so the body never stands still while the legs
      // walk. The show is scripted on the strut's progress `sw` and layered ON TOP of that swing, each moment
      // overlapping the next: arms raised at the gate → arms open low to the crowd → the left fist pumped high at the
      // stands (still pumping with the step, head turned to that side) → the right → a double chest pound →
      // a point straight at the ring → the arms drop into the running swing.
      const sw = f.swagger;
      const g = f.robot.stride.arm; // −1..1 (+1 = left foot ahead → left arm back)
      const gs = f.robot.stride.swing;
      const st = (a: number, b: number) => THREE.MathUtils.smoothstep(sw, a, b);
      const fwdL = Math.max(0, -g); // the left arm is forward
      const fwdR = Math.max(0, g);
      const armL = P(-0.3 + g * 0.6, 0.08, 0.46, -0.78 - fwdL * 0.55 + fwdR * 0.22);
      const armR = P(-0.3 - g * 0.6, 0.08, 0.46, -0.78 - fwdR * 0.55 + fwdL * 0.22);
      const bothUp = P(-2.8 - gs * 0.08, -0.1, 0.55, -0.4);
      const pumpL = P(-2.72 + g * 0.2, -0.14, 0.42, -0.5 + fwdR * 0.12);
      const pumpR = P(-2.72 - g * 0.2, -0.14, 0.42, -0.5 + fwdL * 0.12);
      const pound = P(-0.1, -1.0, -0.85, -1.9);
      const poundOpen = P(-1.6, -0.5, 1.2, -2.0);
      const point = P(-1.62 - g * 0.05, -0.15, 0.15, -0.1);
      const gateUp = st(-1, -0.45) * (1 - st(0.0, 0.17)); // up at the gate, down into the swing as he walks
      const wL = st(0.18, 0.28) * (1 - st(0.38, 0.47));
      const wR = st(0.44, 0.54) * (1 - st(0.62, 0.71));
      const wP = st(0.67, 0.75) * (1 - st(0.84, 0.91));
      const thump = Math.max(0, Math.sin((sw - 0.71) * Math.PI * 12)) * wP; // two thumps inside the window
      const wPt = st(0.87, 0.95) * (1 - st(1.02, 1.3));
      const toRun = st(1.0, 1.3);
      let l = lerpPose(armL, bothUp, gateUp);
      let r = lerpPose(armR, bothUp, gateUp);
      l = lerpPose(l, pumpL, wL);
      r = lerpPose(r, pumpR, wR);
      const poundPose = lerpPose(poundOpen, pound, thump);
      l = lerpPose(l, poundPose, wP);
      r = lerpPose(r, poundPose, wP);
      r = lerpPose(r, point, wPt);
      a0 = lerpPose(l, RUNARM, toRun);
      a1 = lerpPose(r, RUNARM, toRun);
      const show = 1 - toRun;
      // chest out, shoulders rolling against the hips with every step, the weight dropping onto each stance leg
      tw = (-g * 0.26 + (wL - wR) * 0.2 - wPt * 0.14) * show;
      rl = (g * 0.085 + (wL - wR) * 0.05) * show;
      ln = lerp(-0.12 - gateUp * 0.06 + thump * 0.25 + wPt * 0.1, 0.16, toRun);
      dp = lerp(0.1 + gs * gs * 0.05 + thump * 0.12, 0.2, toRun);
      kk = 24 + thump * 40;
      f.headYaw = ((wL - wR) * 0.85 - wPt * 0.12) * show; // he looks at the stands he is playing to
    } else if (f.riseOut > 0 && !f.blocking) {
      // THE SETTLE: the half second after standing up. The shoulders shake the last of the roll out of them, the
      // chest dips and comes back, and the guard closes a beat late — a fighter getting up, not a rig snapping
      // back to its idle frame.
      const o = 1 - f.riseOut / 0.55; // 0 → 1 across the settle
      const shake = Math.sin(o * Math.PI * 3) * (1 - o);
      a0 = lerpPose(GUARD, P(-0.5, -0.62, 0.3, -1.7), (1 - o) * 0.7);
      a1 = lerpPose(GUARD, P(-0.5, -0.38, 0.3, -1.7), (1 - o) * 0.7);
      tw = shake * 0.22;
      ln = 0.08 + (1 - o) * 0.14 - shake * 0.05;
      dp = 0.12 + (1 - o) * 0.14;
      rl = shake * 0.09;
      kk = 26;
    } else if (f.mode === 'taunt') {
      const pump = Math.sin(t * 3.2) * 0.5 + 0.5;
      const tp: Pose = { ...TAUNT, sx: TAUNT.sx - pump * 0.4, ex: TAUNT.ex + pump * 0.5 };
      a0 = a1 = this.phase === 'menu' || (this.phase === 'intro' && this.phaseT < 2.0) ? tp : GUARD;
      ln = 0;
      dp = 0.15;
    } else if (f.mode === 'victory') {
      a0 = a1 = { ...VICTORY, sx: VICTORY.sx + Math.sin(t * 6) * 0.15 };
      ln = -0.15;
      dp = 0.1;
    } else if (f.ippo) {
      // PEEK-A-BOO: fists glued to the cheeks, chin tucked, the body weaving on a figure-8 (the Dempsey Roll).
      // The weave speeds up and widens as the roll charges.
      f.weavePh += dt * (2.6 + f.rollCharge * 2.2);
      const ph = f.weavePh;
      const amp = 0.75 + f.rollCharge * 0.55;
      const flick = Math.sin(ph * 2 + 0.6) * 0.06;
      a0 = P(-1.08 + flick, -0.8, 0.0, -2.35);
      a1 = P(-1.08 - flick, -0.8, 0.0, -2.35);
      tw = Math.sin(ph) * 0.34 * amp;
      rl = Math.sin(ph) * 0.2 * amp;
      dp = 0.36 + (1 - Math.cos(ph * 2)) * 0.06 * amp;
      ln = 0.22 + (1 - Math.cos(ph * 2)) * 0.04 * amp;
      kk = 22;
    } else if (f.blocking) {
      a0 = a1 = BLOCK;
      dp = 0.3;
      ln = 0.2;
    } else {
      // idle guard with subtle bouncing
      // Time-based wobble only while standing. While walking, the bob / arm swing / pelvis roll all come from
      // the stride itself (robot.ts), so they stay in sync with the footsteps instead of fighting them.
      const wk = Math.min(1, f.speed / 3.5);
      const idle = 1 - wk;
      const sw = Math.sin(t * 4) * 0.06 * idle;
      a0 = { ...GUARD, sx: GUARD.sx + sw };
      a1 = { ...GUARD, sx: GUARD.sx - sw };
      dp = 0.15 + wk * 0.02 + Math.sin(t * 5.2) * 0.035 * idle;
      rl = Math.sin(t * 2.6) * 0.03 * idle;
      // sprinting: elbows bent and driving, torso leaning into the run (only when actually sprinting, so W/A/S/D boxing footwork keeps the guard up!)
      const ru = f.sprinting ? THREE.MathUtils.clamp((f.speed / f.scale - 6.4) / 3.2, 0, 1) : 0;
      const run = ru * ru * (3 - 2 * ru);
      if (run > 0.01) {
        a0 = lerpPose(a0, RUNARM, run);
        a1 = lerpPose(a1, RUNARM, run);
        ln = lerp(ln, 0.16, run);
        dp = lerp(dp, 0.2, run);
      }
    }

    // ---------------- HIT REACTION LAYER ----------------
    // A landed punch must read as a punch that LANDED — never as a guard that just did not work. So while the hit
    // impulse is live the arms leave the guard entirely and react to WHERE the fist went in:
    //  • head shot → the guard is blown open: the arm on the side he is thrown towards whips up and out, the other
    //    one drops away from the face; an uppercut throws both arms higher and the torso back;
    //  • body shot → he folds over the fist: both forearms clamp across the stomach, shoulders in, torso bent.
    // The weight comes from the smoothed hit impulse (instant snap, ~0.4 s relax) so it transitions on its own into
    // the stagger wobble / the guard coming back up. A punch that is actually BLOCKED never gets here.
    const canFlinch = (f.state === 'idle' || f.state === 'stagger') && !f.blocking && f.mode === 'normal';
    const wF = canFlinch ? THREE.MathUtils.clamp((f.hitV - 0.06) * 1.15, 0, 1) : 0;
    if (wF > 0.01) {
      const up = Math.max(0, f.hitUpV);
      const bodyK = THREE.MathUtils.clamp(1 - f.hitPt + Math.max(0, -f.hitUpV) * 0.7, 0, 1);
      const openNear = P(-1.45 - up * 0.55, 0.3, 1.2 + up * 0.25, -0.7);
      const openFar = P(-0.4 + up * 0.1, 0.05, 0.62, -1.2);
      const clutch = P(-0.55, -0.62, -0.14, -2.0);
      const nearIs0 = f.hitSign > 0; // thrown towards his left → the left arm (index 0) is the one flung out
      const r0 = lerpPose(nearIs0 ? openNear : openFar, clutch, bodyK);
      const r1 = lerpPose(nearIs0 ? openFar : openNear, clutch, bodyK);
      a0 = lerpPose(a0, r0, wF);
      a1 = lerpPose(a1, r1, wF);
      ln += (bodyK * 0.55 - (1 - bodyK) * (0.3 + up * 0.4)) * wF;
      dp += (bodyK * 0.34 + (1 - bodyK) * 0.05) * wF;
      tw += f.hitSign * (1 - bodyK) * 0.18 * wF;
      kk = Math.max(kk, 30);
    }

    // ---------------- ON THE ROPES ----------------
    // The ropes carry his weight. Driven back onto them he hangs over the top rope: torso bent back, arms spread
    // wide along the ropes to catch himself, hips pushed forward into the stretch. Run into them chest first and
    // he catches himself the other way round — leaning in with both arms reaching over the rope. Blends with the
    // depth the ropes are pushed out, so a light touch barely registers and a full slam drapes him over them.
    if (f.ropeW > 0.01 && f.state !== 'air' && f.state !== 'ko' && f.state !== 'down' && f.mode === 'normal') {
      const w = f.ropeW * (f.state === 'attack' ? 0.3 : 1);
      const back = THREE.MathUtils.clamp(f.ropeBack, -1, 1);
      const bk = THREE.MathUtils.clamp(back * 0.5 + 0.5, 0, 1); // 1 = ropes at his back
      const spread = Math.sin(t * 7 + f.animT) * 0.08;
      // ropes at his back: arms out wide along the top rope, elbows nearly straight
      const drapeL = P(-0.35 + spread, 0.42, 1.25, -0.5);
      const drapeR = P(-0.35 - spread, 0.42, 1.25, -0.5);
      // ropes in front: both arms reach forward over the rope, bent, catching the fall
      const catchL = P(-1.35, -0.15, 0.55, -0.9);
      const catchR = P(-1.35, -0.15, 0.55, -0.9);
      a0 = lerpPose(a0, lerpPose(catchL, drapeL, bk), w);
      a1 = lerpPose(a1, lerpPose(catchR, drapeR, bk), w);
      // the top rope runs across his upper back: it HOLDS him, so he cannot keep falling backwards through it —
      // whatever the stagger / hit layers asked for, the back lean is capped to the rope and the hips sag into the
      // middle rope instead (that is what being on the ropes looks like: held up, not tipping out of the ring)
      const capBack = -0.16;
      ln = lerp(ln, Math.max(ln, capBack) - 0.06, w * bk);
      ln += 0.38 * (1 - bk) * w; // ran into them chest first: folded forward onto the top rope
      dp += (0.2 * bk + 0.08 * (1 - bk)) * w;
      lg -= 0.2 * bk * w; // hips sink back into the middle rope, the chest rests on the top one
      kk = Math.max(kk, 24);
    }


    const dodging = f.dodgeT > 0 && f.state === 'idle';
    const dodgeBlend = dodging ? 1 : f.state === 'idle' ? smooth(THREE.MathUtils.clamp(f.dodgeTail / 0.24, 0, 1)) : 0;
    if (dodging) {
      const fw = this.toward(f, o);
      const dot = f.dodgeDir.x * -fw.y + f.dodgeDir.y * fw.x;
      const back = -(f.dodgeDir.x * fw.x + f.dodgeDir.y * fw.y);
      const du = 1 - Math.max(0, f.dodgeT) / f.dodgeDur;
      // Multi-phase biomechanical kinetic chain:
      // 1) dipLoad leads first (knees bend & hips drop under the line of fire)
      // 2) uCurve peaks mid-dodge (torso & head sweep through the bottom of the 3D U-arc)
      // 3) rollFollow trails with smooth follow-through as the shoulders unwind into counter-punch posture
      const dipLoad = Math.sin(Math.PI * Math.pow(du, 0.78));
      const uCurve = Math.sin(Math.PI * du);
      const rollFollow = Math.sin(Math.PI * Math.pow(du, 1.15));
      const wave = Math.sin(Math.PI * 2 * du);
      const sgn = Math.abs(dot) > 0.3 ? Math.sign(dot) : f.aliSign;
      if (back >= 0.35) {
        // Pro Pull-Counter & Muhammad Ali Matrix Lean-Back Shoulder Roll:
        // Weight glides onto the rear leg, lead shoulder rolls across the chin, rear hand coils low for a counter!
        ln = -0.34 * uCurve - 0.08 * wave;
        lg = -0.44 * rollFollow;
        tw = sgn * 0.56 * rollFollow - sgn * 0.14 * wave;
        rl = sgn * 0.32 * uCurve + sgn * 0.11 * wave;
        dp = 0.16 + 0.18 * dipLoad;
        const phillyLead = P(-0.34, -0.24, 0.34, -1.28);
        const coiledRear = P(-0.68, -0.52, 0.18, -1.92);
        a0 = lerpPose(a0, sgn > 0 ? phillyLead : coiledRear, rollFollow * 0.86);
        a1 = lerpPose(a1, sgn > 0 ? coiledRear : phillyLead, rollFollow * 0.86);
      } else if (Math.abs(dot) > 0.35) {
        // Canelo / Lomachenko 3D Lateral U-Weave & Shoulder Roll:
        // Phase 1 dips under the punch (ln > 0 at bottom of U), Phase 2 rolls the head & shoulders to the outside
        // while coiling the inside hip/fist for an explosive Dodge Strike or Overdrive!
        const uDip = Math.sin(Math.PI * Math.min(1, du * 1.15));
        rl = dot * 0.48 * rollFollow + dot * 0.14 * wave;
        tw = -dot * 0.62 * rollFollow + dot * 0.16 * wave;
        ln = 0.12 + 0.22 * uDip - 0.1 * wave;
        lg = 0.22 * rollFollow;
        dp = 0.22 + 0.28 * dipLoad;
        const counterCoil = P(-0.46, -0.28, 0.36, -1.52);
        const templeGuard = P(-0.88, -0.64, 0.14, -2.14);
        a0 = lerpPose(a0, dot > 0 ? templeGuard : counterCoil, rollFollow * 0.86);
        a1 = lerpPose(a1, dot > 0 ? counterCoil : templeGuard, rollFollow * 0.86);
      } else {
        // Mike Tyson Peek-a-Boo Pendulum Slip-In:
        // Drops low and weaves the head & shoulders in a fluid figure-8 while driving inside the opponent's reach!
        rl = sgn * 0.42 * Math.sin(du * Math.PI * 1.35);
        tw = -sgn * 0.56 * rollFollow + sgn * 0.14 * wave;
        ln = 0.3 * uCurve;
        lg = 0.42 * rollFollow;
        dp = 0.28 + 0.28 * dipLoad;
        const peekCoilL = P(-0.94, -0.66, 0.14, -2.22);
        const peekCoilR = P(-0.86, -0.58, 0.18, -2.12);
        a0 = lerpPose(a0, sgn > 0 ? peekCoilL : peekCoilR, rollFollow * 0.84);
        a1 = lerpPose(a1, sgn > 0 ? peekCoilR : peekCoilL, rollFollow * 0.84);
      }
      kk = 42;
    }

    // IMPACT RECOIL: on contact the shock comes back up the arm — the elbow buckles a touch, the shoulder is
    // shoved back, the torso rocks away from the target and the stance dips to absorb it, then it all springs
    // back into the follow-through. Reads as a fist hitting two tons of steel instead of passing through it.
    if (f.recoilT > 0 && f.recoilTot > 0) {
      const u = f.recoilT / f.recoilTot; // 1 at contact → 0
      const jolt = Math.sin(u * Math.PI) * f.recoilAmt; // rises in a few frames, then eases out
      const arms = f.recoilArm === 2 ? [0, 1] : [f.recoilArm];
      for (const i of arms) {
        const src = i === 0 ? a0 : a1;
        const rec = P(src.sx + 0.16 * jolt, src.sy, src.sz + (i === 0 ? -1 : 1) * 0.05 * jolt, src.ex - 0.36 * jolt);
        if (i === 0) a0 = rec;
        else a1 = rec;
      }
      ln -= 0.1 * jolt;
      dp += 0.07 * jolt;
      tw += (f.recoilArm === 0 ? -1 : 1) * 0.06 * jolt;
    }

    // critically-damped / slightly under-damped springs → weighty motion with follow-through
    const atk = f.state === 'attack';
    const isWindmillSpin = atk && f.move?.id === 'windmill' && f.moveT < f.move.strikeAt * 0.94;
    const soft = f.softT > 0 ? Math.max(0.4, 0.45 + 0.55 * (1 - f.softT / 0.9)) : 1; // ease back to normal
    const hzA = Math.sqrt(kk) * 1.9 * soft;
    const zA = atk ? 0.66 : lerp(0.82, 0.74, dodgeBlend);
    const tgt = [a0, a1];
    for (let i = 0; i < 2; i++) {
      const ps = tgt[i];
      const sp = f.armS[i];
      if (isWindmillSpin) {
        // Direct continuous 360° shoulder rotation during the Freestyle Windmill Overdrive wind-up
        sp[0].set(ps.sx);
      } else if (atk && f.move?.id === 'windmill') {
        const tau = Math.PI * 2;
        if (sp[0].x < -tau) sp[0].x = ((sp[0].x % tau) + tau) % tau - tau;
      }
      f.arms[i] = {
        sx: isWindmillSpin ? ps.sx : sp[0].update(ps.sx, hzA, zA, dt),
        sy: sp[1].update(ps.sy, hzA, zA, dt),
        sz: sp[2].update(ps.sz, hzA, zA, dt),
        ex: sp[3].update(ps.ex, hzA, zA, dt),
      };
    }
    const hzB = (atk ? 10.5 : f.state === 'stagger' ? 9.5 : lerp(5.4, 11.2, dodgeBlend)) * soft;
    const zB = atk ? 0.74 : lerp(0.84, 0.76, dodgeBlend);
    f.twist = f.bodyS.twist.update(tw, hzB, zB, dt);
    const landSnap = this.phase === 'walk' && f.pkLand > 0.3; // the parkour landing: the body hits its crouch in one frame-beat, no wobble
    f.lean = f.bodyS.lean.update(ln, landSnap ? 20 : hzB, landSnap ? 0.95 : zB, dt);
    f.lunge = f.bodyS.lunge.update(lg, hzB, 0.8, dt);
    f.dip = f.bodyS.dip.update(dp, landSnap ? 22 : atk ? 10.5 : lerp(6.2, 10.8, dodgeBlend), landSnap ? 0.95 : 0.8, dt);
    f.roll = f.bodyS.roll.update(rl, lerp(6.8, 11.2, dodgeBlend), 0.78, dt);

    // fall / get-up through a spring: quick, slightly bouncy drop and a slow, smooth rise
    const fallTarget = f.state === 'ko' ? 1 : f.state === 'down' ? f.fallT : 0;
    const dropping = fallTarget > f.fallS.x;
    const e = THREE.MathUtils.clamp(f.fallS.update(fallTarget, f.state === 'ko' ? 1.8 : dropping ? 1.7 : 1.2, f.state === 'ko' ? 0.7 : dropping ? 0.8 : 1.0, dt), 0, 1.06);
    // hit reactions: snap in fast, relax slowly
    f.hitV += (f.hit - f.hitV) * (1 - Math.exp(-(f.hit > f.hitV ? 40 : 7) * dt));
    f.hitUpV += (f.hitUp - f.hitUpV) * (1 - Math.exp(-(Math.abs(f.hitUp) > Math.abs(f.hitUpV) ? 40 : 6) * dt));
    // place
    f.robot.root.position.set(f.pos.x, f.y, f.pos.y);
    // in the air the body lays back WITH its travel: knocked straight up it stays near upright (and collapses when it
    // lands), driven across the ring it pitches over; caught by the ropes it drops upright beside them
    // ...and it goes over in the direction it was HIT: a hook throws him over sideways, a straight onto his back
    const syT = Math.sin(f.yaw);
    const cyT = Math.cos(f.yaw);
    const kbF = -(f.kb.x * syT + f.kb.y * cyT) / f.scale; // + = driven backwards
    const kbL = (f.kb.x * cyT - f.kb.y * syT) / f.scale; // + = driven to his left
    const hsp = THREE.MathUtils.clamp(Math.max(0, kbF) / 10, 0, 1);
    const lsp = THREE.MathUtils.clamp(kbL / 9, -1, 1);
    const inAir = f.state === 'air' && this.phase !== 'walk';
    const tiltTarget = inAir ? (f.vy > 0 ? 0.2 + hsp * 0.25 : 0.32 + hsp * 0.3) : 0;
    const tiltZTarget = inAir ? lsp * (f.vy > 0 ? 0.28 : 0.5) : 0;
    if (f.state === 'down' || (f.state === 'ko' && f.fallT > 0 && f.y <= 0.001)) {
      // on the canvas: the airborne lean is handed over to the staged collapse (robot.ts adds the two)
      const lay = fallStages(f.fallS.x).lay;
      f.tilt = f.tiltLand * (1 - lay);
      f.tiltZ = f.tiltZLand * (1 - lay);
    } else {
      f.tilt = lerp(f.tilt, tiltTarget, 1 - Math.exp(-9 * dt));
      f.tiltZ = lerp(f.tiltZ, tiltZTarget, 1 - Math.exp(-(inAir ? 7 : 5) * dt));
      if (!inAir) {
        f.tiltLand = f.tilt;
        f.tiltZLand = f.tiltZ;
      }
    }
    f.robot.root.rotation.order = 'YXZ';
    f.robot.root.rotation.y = f.yaw;
    f.robot.root.rotation.x = f.flip;
    if (f.flip !== 0) {
      // the flip turns about the centre of mass, not the feet: move the root so the COM stays on the flight path
      const c = COM_H * f.scale;
      const sn = Math.sin(f.flip);
      const cs = Math.cos(f.flip);
      f.robot.root.position.set(f.pos.x - c * sn * Math.sin(f.yaw), f.y + c - c * cs, f.pos.y - c * sn * Math.cos(f.yaw));
    }
    const sy = Math.sin(f.yaw);
    const cy = Math.cos(f.yaw);
    const grounded = f.state !== 'ko' && f.state !== 'air' && f.state !== 'down';
    const mvx = !grounded ? 0 : f.vel.x + f.kb.x + f.dash.x;
    const mvz = !grounded ? 0 : f.vel.y + f.kb.y + f.dash.y;
    if (dt > 0) {
      const ax = (mvx - f.prevV.x) / dt;
      const az = (mvz - f.prevV.y) / dt;
      const k = 1 - Math.exp(-10 * dt);
      f.acc.x += (ax - f.acc.x) * k;
      f.acc.y += (az - f.acc.y) * k;
    }
    f.prevV.set(mvx, mvz);
    const pw = this.punchStepOf(f, o);
    // STRIKE OPTICS: 0 → 1 as the fist pulls out of the guard, 1 at the moment it is released. The eyes read
    // this every frame and fire their lock-on pulse on the crossing.
    const sm = f.state === 'attack' ? f.move : null;
    const strike = sm ? THREE.MathUtils.clamp(f.moveT / Math.max(0.001, sm.strikeAt), 0, 1) : 0;
    const strikePow = sm ? sm.power : 0.5;
    f.robot.floorY = this.phase === 'walk' ? (f.state === 'air' ? -1.4 : Math.min(0, f.y)) : 0; // the hall floor / the runway under him
    f.robot.footLimit = this.phase === 'walk' ? Infinity : RING_IN - 0.45; // the feet stay inside the rope line (the rope is 0.24 thick + a little air)
    f.robot.animate(
      {
        arms: f.arms,
        twist: f.twist,
        lean: f.lean,
        lunge: f.lunge,
        dip: f.dip,
        roll: f.roll,
        vf: (mvx * sy + mvz * cy) / f.scale,
        vl: (mvx * cy - mvz * sy) / f.scale,
        af: (f.acc.x * sy + f.acc.y * cy) / f.scale,
        al: (f.acc.x * cy - f.acc.y * sy) / f.scale,
        yawRate: f.yawRate,
        air: f.state === 'air' || (f.state === 'ko' && f.y > 0.05) ? 1 : 0,
        tuck: f.pkTuck,
        hit: f.hitV,
        hitSign: f.hitSign,
        hitUp: f.hitUpV,
        hitF: f.hitF,
        hitL: f.hitL,
        hitPt: f.hitPt,
        hitSpin: f.hitSpin,
        fall: e,
        time: f.animT,
        glow: f.glowBoost + (f.counterT > 0 ? 1.2 : 0) + (f.isPlayer && f.meter >= 100 ? 1.0 + Math.sin(f.animT * 10) * 0.6 : 0),
        flash: f.flash,
        tilt: f.tilt,
        tiltZ: f.tiltZ,
        ragdoll: f.state === 'air' && this.phase !== 'walk' && this.phase !== 'menu' ? 1 : 0,
        dash: f.dodgeT > 0 && f.state === 'idle' ? 1 : 0,
        dashF: f.dodgeDir.x * sy + f.dodgeDir.y * cy,
        dashL: f.dodgeDir.x * cy - f.dodgeDir.y * sy,
        sprint: f.sprinting ? 1 : 0,
        headYaw: f.headYaw,
        lookX: THREE.MathUtils.clamp((o.pos.x - f.pos.x) * cy - (o.pos.y - f.pos.y) * sy, -1, 1),
        lookY: THREE.MathUtils.clamp((o.y - f.y) * 0.4, -1, 1),
        punchFoot: pw.foot,
        punchZ: pw.z,
        punchX: pw.x,
        punchDur: pw.dur,
        punchSeq: pw.seq,
        stepLift: pw.lift,
        // the get-up is only declared while he is actually on the canvas: standing, the staged weights are gone
        // and the ordinary rig takes the body back (see robot.ts)
        rise: f.state === 'down' ? f.riseU : undefined,
        riseDir: f.riseDir,
        riseOut: f.riseOut,
        strike,
        strikePow,
      },
      dt,
    );

    // fist trails
    f.robot.root.updateMatrixWorld(true);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const m = f.move;
      const arm = m ? this.armOf(f, m) : -1;
      const isWindmill = !!m && m.id === 'windmill';
      const mine = !!m && (arm === 2 || arm === i || (isWindmill && f.moveT < m.strikeAt * 0.72));
      const emit =
        dt > 0 &&
        f.state === 'attack' &&
        mine &&
        ((f.moveT >= m!.strikeAt - 0.02 && f.moveT <= m!.impact + 0.1) || (isWindmill && f.moveT <= m!.impact + 0.12));
      tmp.set(0, -1.0, 0.05);
      f.robot.fists[i].localToWorld(tmp);
      f.trails[i].width = 0.26 * f.scale * (m && isOD(m.id) ? 1.55 : f.rage ? 1.25 : 1);
      // CHARGE: in the last instant of the wind-up (or throughout the Windmill spin!) the fist crackles with energy
      if (
        dt > 0 &&
        f.state === 'attack' &&
        mine &&
        m!.power > 0.45 &&
        !f.whooshed &&
        (f.moveT >= m!.strikeAt - 0.1 || isWindmill) &&
        Math.random() < (isWindmill ? 0.8 : 0.55)
      ) {
        this.fx.spark(
          tmp,
          isWindmill ? 4 : 2,
          3 + m!.power * 5,
          isWindmill ? 0xffb830 : f.isPlayer ? 0x8fd0ff : 0xffb040,
          new THREE.Vector3(0, 0.25, 0),
          0.7,
          0.28,
          2,
        );
      }
      f.trails[i].update(tmp, emit, dt, this.camera);
    }
  }

  // ------------------------------------------------------------ camera

  /**
   * GAMEPLAY CAMERA — an operator, not a fixed rig. It frames BOTH fighters (pulling back as they separate and
   * pushing in when they clinch), leads the action with their combined velocity so the shot is already looking
   * where the fight is going, rides just above the top rope instead of looking down from the gods, and lifts its
   * gaze when somebody is launched.
   */
  /** the gameplay camera lives in cammath, enhanced with smooth velocity filtering & dynamic ringside action framing */
  private gameplayCam(gp: THREE.Vector3, gl: THREE.Vector3, raw: number) {
    const p = this.camHero();
    const e = this.enemy;
    // Low-pass filter velocities before passing to gameplayShot so sudden dashes/dodges never snap the camera aim
    const vk = 1 - Math.exp(-3.2 * raw);
    this.smoothVelP.lerp(p.vel, vk);
    this.smoothVelE.lerp(e.vel, vk);
    const savedVP = p.vel;
    const savedVE = e.vel;
    p.vel = this.smoothVelP;
    e.vel = this.smoothVelE;
    const mode = CAM_MODES[this.camMode];
    const res = gameplayShot(gp, gl, this.view, p, e, mode, this.baseFov, this.aspect, RING + 11);
    p.vel = savedVP;
    e.vel = savedVE;
    this.camClose = res.camClose;

    // Pro Dynamic Combat Director: subtle heroic low-angle pocket elevation & smooth dynamic orbit around exchanges
    if (this.phase === 'fight' && mode.style !== 'shoulder') {
      let orbitTarget = Math.sin(this.time * 0.35) * 0.04;
      if (p.state === 'attack' && p.move) orbitTarget += (p.hand === 1 ? 0.08 : -0.08) * p.move.power;
      if (e.state === 'attack' && e.move) orbitTarget -= 0.07 * e.move.power;
      if (p.dodgeT > 0) orbitTarget += p.aliSign * 0.09;
      this.dynOrbit += (orbitTarget - this.dynOrbit) * (1 - Math.exp(-4.0 * raw));
      const ox = gp.x - gl.x;
      const oz = gp.z - gl.z;
      const ca = Math.cos(this.dynOrbit);
      const sa = Math.sin(this.dynOrbit);
      gp.x = gl.x + ox * ca - oz * sa;
      gp.z = gl.z + ox * sa + oz * ca;
      // In close pocket exchanges, dip the camera slightly and lift the look target for a monumental Real Steel hero angle
      gp.y = Math.max(2.35, gp.y - this.camClose * 0.32);
      gl.y += this.camClose * 0.14;
    }
  }

  private view = newFrame();
  private spillDir = new THREE.Vector3();
  private spillPts: number[] = [];
  private spillPads: number[] = [];
  private spillD = new THREE.Vector3();
  private ripS: RipOut = {
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, 1),
    fov: 46,
    roll: 0,
    blend: 0,
    spill: 0,
    push: 0,
    phase: 'snap',
  };
  /**
   * How far outside the frame the fighters are: 1 = exactly at the edge, > 1 = spilling out. Head height and feet
   * of both robots are checked through the lens that is being aimed right now.
   */
  private get aspect() {
    return this.container.clientWidth / Math.max(1, this.container.clientHeight);
  }



  /** call a cinematic beat. `at` is the point to shoot, `dir` the direction the blow travelled. */
  private startCine(kind: CineKind, at?: THREE.Vector3, dir?: THREE.Vector2) {
    if (this.paused || this.phase === 'menu') return;
    const cur = this.cine;
    if (cur) {
      if (cur.kind === 'rip' && kind !== 'rip') return; // never cut away from the money shot
      if (cur.kind === kind && kind !== 'rip' && cur.t < cur.dur * 0.6) return;
    }
    this.cineFrom.copy(this.camPos);
    this.cineFromLook.copy(this.camLook);
    if (at) this.cineFocus.copy(at);
    if (dir && dir.lengthSq() > 0.0001) this.cineDir.copy(dir).normalize();
    this.cine = { kind, t: 0, dur: CINE_DUR[kind] };
    if (kind === 'od') this.cineFovT = 42;
    if (kind === 'hit') this.cineFovT = 46;
    if (kind === 'rip') this.cineFovT = 36;
  }

  /** advances the active beat on world time and takes the camera over */
  private cineCam(tp: THREE.Vector3, tl: THREE.Vector3, dt: number) {
    const c = this.cine!;
    c.t += Math.max(dt, 0);
    const u = THREE.MathUtils.clamp(c.t / c.dur, 0, 1);
    const seg = (a: number, b: number, x = u) => {
      const q = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
      return q * q * (3 - 2 * q);
    };
    const p = this.camHero();
    const e = this.enemy;
    const up = new THREE.Vector3(0, 1, 0);

    if (c.kind === 'rip') {
      // ---------------- HEAD RIP: four angles so the moment is unmissable ----------------
      const neck = new THREE.Vector3();
      const head = new THREE.Vector3();
      const chest = new THREE.Vector3();
      e.robot.neck.getWorldPosition(neck);
      e.robot.chest.getWorldPosition(chest);
      const fly = this.decap.headObj(e.robot);
      if (fly) fly.getWorldPosition(head);
      else head.copy(neck);
      const blow = new THREE.Vector3(this.cineDir.x, 0, this.cineDir.y);
      if (blow.lengthSq() < 0.001) blow.set(0, 0, 1);
      blow.normalize();
      const side = new THREE.Vector3(-blow.z, 0, blow.x);

      // the whole beat lives in cammath, so the framing can be verified by a test outside the browser
      const shot = this.ripS;
      ripShot(
        shot,
        this.view,
        c.t,
        head,
        neck,
        chest,
        blow,
        side,
        e.scale,
        this.container.clientWidth / Math.max(1, this.container.clientHeight),
        this.cineFrom,
        this.cineFromLook,
        RING + 8, // the lens never leaves the arena floor
        2.0,
        10.5,
      );
      // hand back to the resting camera (the KO orbit) for the aftermath
      tp.copy(shot.pos).lerp(tp, shot.blend);
      tl.copy(shot.look).lerp(tl, shot.blend);
      this.cineFovT = shot.fov;
      this.camRoll = shot.roll;
      if (u >= 1) this.cine = null;
      return;
    }

    if (c.kind === 'hit') {
      // ---------------- OVERDRIVE IMPACT: dolly in on the point of impact while keeping both fighters framed ----------------
      const k = seg(0, 0.3);
      const midTarget = new THREE.Vector3((p.pos.x + e.pos.x) * 0.5, 3.4, (p.pos.y + e.pos.y) * 0.5);
      const target = this.cineFocus.clone().lerp(midTarget, 0.55).addScaledVector(up, 0.15);
      const from = this.cineFrom.clone();
      const d = from.distanceTo(target);
      const push = Math.min(0.22, 2.2 / Math.max(1.5, d)); // never zoom past the fighters
      tp.copy(from).lerp(target, push * k);
      tl.copy(this.cineFromLook).lerp(target, seg(0, 0.45));
      this.cineFovT = THREE.MathUtils.lerp(56, 48, k);
      this.camRoll += 0.015 * k * Math.sign(this.cineDir.x + this.cineDir.y || 1);
      if (u >= 1) this.cine = null;
      return;
    }

    // ---------------- OVERDRIVE CHARGE: heroic angle that keeps BOTH player and enemy in frame ----------------
    const k = seg(0, 0.32) * (1 - seg(0.62, 1));
    const f = this.toward(p, e);
    const r = new THREE.Vector2(-f.y, f.x);
    const gap = p.pos.distanceTo(e.pos);
    const dist = THREE.MathUtils.lerp(Math.max(9.2, gap + 5.8), Math.max(8.2, gap + 4.8), k);
    const orbit = 0.68;
    const midX = (p.pos.x + e.pos.x) * 0.5;
    const midZ = (p.pos.y + e.pos.y) * 0.5;
    const from = new THREE.Vector3(
      midX - f.x * dist * Math.cos(orbit) + r.x * dist * Math.sin(orbit),
      THREE.MathUtils.lerp(4.6, 3.2, k),
      midZ - f.y * dist * Math.cos(orbit) + r.y * dist * Math.sin(orbit),
    );
    tp.copy(this.camPos).lerp(from, k);
    tl.copy(this.camLook).lerp(new THREE.Vector3(midX, THREE.MathUtils.lerp(3.4, 3.6, k), midZ), k);
    this.cineFovT = THREE.MathUtils.lerp(this.cineFov, 48, k);
    this.camRoll += 0.014 * k;
    if (u >= 1) this.cine = null;
  }

  private updateCamera(raw: number, dt: number) {
    const p = this.camHero();
    const e = this.enemy;
    const cam = this.camera;
    const f = this.toward(p, e);
    const gp = new THREE.Vector3();
    const gl = new THREE.Vector3();
    this.gameplayCam(gp, gl, raw);

    const camMode = CAM_MODES[this.camMode];
    let tp = gp;
    let tl = gl;
    let direct = false;
    const t = this.time;
    // the gameplay lens breathes with the distance (wide as they separate, tighter up close)
    const fovGoal = camMode.fov - this.camClose * camMode.closeBias * 5;
    this.baseFov += (fovGoal - this.baseFov) * (1 - Math.exp(-2.6 * raw));

    if (this.phase === 'menu') {
      const wide = this.container.clientWidth >= 1024;
      const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
      const heroX = HANGAR_POS.x;
      const heroZ = HANGAR_POS.z;
      const camCenterY = 3.5;

      const showHero = this.menuCamMode !== 'arena';
      this.player.robot.root.visible = true;
      this.enemy.robot.root.visible = true;
      if (showHero) {
        this.player.robot.root.position.y = -200;
        this.enemy.robot.root.position.y = -200;
      }
      if (this.menuHero) {
        this.menuHero.root.visible = showHero;
        this.menuHeroPedestal.visible = showHero;
        this.menuScrimPlane.visible = showHero;
        this.menuHeroPedestal.visible = false;
        this.menuScrimPlane.visible = false;
        this.menuHero.root.position.set(heroX, 0, heroZ);
        this.menuHeroPedestal.position.set(heroX, 0, heroZ);
        this.menuScrimPlane.position.set(heroX, camCenterY + 1.0, heroZ - 3.0);
      }

      if (this.menuCamMode !== 'arena') {
        // THE HANGAR SHOWCASE — zero shake. 'hero' = the lobby: waist up, the machine filling the frame;
        // 'full' = the garage: head to boots; the VS stage: both Titans chest-up, facing the lens.
        this.trauma = 0;
        this.camBump = 0;
        this.camPush = 0;
        this.camRoll = 0;
        this.fovKick = 0;
        const distScale = aspect < 0.75 ? Math.min(1.28, 0.75 / aspect) : 1.0;
        if (this.vs) {
          const sep = 2.75;
          const fit = aspect < 1.5 ? 1.5 / Math.max(0.6, aspect) : 1;
          const punch = this.vsPunch * this.vsPunch;
          const camDist = 9.6 * fit * (1 - punch * 0.07);
          this.menuHero.root.position.set(heroX - sep, 0, heroZ);
          this.menuHero.root.rotation.y = 0.42;
          const foes = [this.vsFoe, this.vsFoe2];
          foes.forEach((f, i) => {
            if (!f) return;
            const second = i === 1;
            f.robot.root.position.set(heroX + sep + (second ? 2.4 : 0), 0, heroZ - (second ? 2.6 : 0));
            f.robot.root.rotation.y = -0.42 - (second ? 0.15 : 0);
            f.robot.root.visible = this.vs!.stage !== 'search';
          });
          tp = new THREE.Vector3(heroX, 5.55 - punch * 0.12, heroZ + camDist);
          tl = new THREE.Vector3(heroX, 5.45, heroZ);
        } else if (this.menuCamMode === 'full') {
          const camDist = 13.0 * distScale;
          tp = new THREE.Vector3(heroX, 3.58, heroZ + camDist);
          tl = new THREE.Vector3(heroX, camCenterY, heroZ);
        } else {
          // waist up: hips (≈3.6) to a hand above the helmet (≈7.8), the lens a touch below the chest for presence
          // a slow, barely-there drift of the lens (a dolly breathing round him) keeps the still pose alive
          const camDist = 6.9 * distScale + Math.sin(t * 0.21) * 0.16;
          const drift = Math.sin(t * 0.3) * 0.14;
          tp = new THREE.Vector3(heroX + 0.15 + drift, 5.25 + Math.sin(t * 0.17) * 0.06, heroZ + camDist);
          tl = new THREE.Vector3(heroX + 0.15 + drift * 0.4, 5.65, heroZ);
        }
        direct = true;
        this.camRoll = 0;
      } else {
        // Arena Action Camera: director cuts between cinematic shots of the demo fight
        this.shotT += raw;
        if (this.shotT >= this.shot.dur) {
          this.shot = nextShot(this.shot);
          this.shotT = 0;
          this.shotCut = true; // hard cut
        }
        const u = Math.min(1, this.shotT / this.shot.dur);
        const a3 = new THREE.Vector3(p.pos.x, 0, p.pos.y);
        const b3 = new THREE.Vector3(e.pos.x, 0, e.pos.y);
        const sc = shotCamera(this.shot, u, t, a3, b3, wide ? 3.6 : 0.8);
        tp = sc.pos;
        tl = sc.look;
        direct = this.shotCut;
        this.shotCut = false;
        this.camRoll = this.shot.roll; // the lens (fov) is applied at the end of this method
      }
    } else if (this.phase === 'matchEnd') {
      const ang = t * 0.22;
      const winner = this.result === 'win' ? p : e;
      tp = new THREE.Vector3(winner.pos.x + Math.cos(ang) * 11.5, 3.8 + Math.sin(t * 0.4) * 0.6, winner.pos.y + Math.sin(ang) * 11.5);
      tl = new THREE.Vector3(winner.pos.x, 3.2, winner.pos.y);
      direct = !this.camInit;
    } else if (this.phase === 'walk' && this.walk.length) {
      // RING WALK coverage: a tracking shot ahead of the player down the runway (full figure, head to boots); a
      // side-on wide shot from inside the ring for the sprint and the flip so the whole arc over the ropes reads;
      // a hard cut to a low shot in front of the landing; then a wide shot for the arms-up and the walk to the corner.
      const w = this.walk[0];
      const tt = this.phaseT;
      const ix = w.inward.x;
      const iz = w.inward.y;
      const px = w.perp.x;
      const pz = w.perp.y;
      const fy = p.y;
      const mid = new THREE.Vector2().addVectors(w.take, w.land).multiplyScalar(0.5);
      const A = new THREE.Vector3(p.pos.x + ix * 10.5 + px * 3.4, fy + 3.2, p.pos.y + iz * 10.5 + pz * 3.4);
      // the side shot sits INSIDE the ring, 13 m along the rope he flies over, so the whole arc — wedge, ropes,
      // flip, canvas — is in one frame and nothing passes between the lens and the robot
      const alongX = Math.abs(ix) < Math.abs(iz);
      const rs = alongX ? Math.sign(px) || 1 : Math.sign(pz) || 1;
      const rx = alongX ? rs : 0;
      const rz = alongX ? 0 : rs;
      const bx = THREE.MathUtils.lerp(p.pos.x, mid.x, 0.45);
      const bz = THREE.MathUtils.lerp(p.pos.y, mid.y, 0.45);
      const B = new THREE.Vector3(w.land.x + rx * 13 + ix * 1.5, 4.6, w.land.y + rz * 13 + iz * 1.5);
      const u4 = THREE.MathUtils.clamp((tt - w.t[3]) / (w.t[5] - w.t[3]), 0, 1); // a slow push-in on the landing
      const cd = 10.0 - 1.2 * u4;
      const C = new THREE.Vector3(w.land.x + ix * cd + px * 2.8, 2.2 + u4 * 0.6, w.land.y + iz * cd + pz * 2.8);
      const E = new THREE.Vector3(ix * -3.5 + px * 12.5, 6.4, iz * -3.5 + pz * 12.5);
      const lookA = new THREE.Vector3(p.pos.x, fy + 3.6, p.pos.y);
      const lookB = new THREE.Vector3(bx, THREE.MathUtils.clamp(fy + 3.2, 2.5, 5.2), bz);
      const lookC = new THREE.Vector3(p.pos.x, 3.1 + (1 - p.pkLand) * 0.6, p.pos.y);
      const lookE = new THREE.Vector3(p.pos.x * 0.6, 3.0, p.pos.y * 0.6);
      const sw = (a: number, b: number) => smooth(THREE.MathUtils.clamp((tt - a) / (b - a), 0, 1));
      const wAB = sw(w.t[1] - 0.7, w.t[1] + 0.15);
      const wBC = tt >= w.t[3] - 0.1 ? 1 : 0; // a hard CUT to the low landing shot just before touch-down
      const wCE = sw(w.t[4] + 0.5, w.t[4] + 1.3);
      tp = A.lerp(B, wAB).lerp(C, wBC).lerp(E, wCE);
      tl = lookA.lerp(lookB, wAB).lerp(lookC, wBC).lerp(lookE, wCE);
      direct = !this.camInit || (tt >= w.t[3] - 0.1 && tt < w.t[3] + 0.04);
      if (tt > WALK_T - 0.6) direct = true;
    } else if (this.phase === 'intro') {
      const u = Math.min(1, this.phaseT / INTRO_T);
      const eu = smooth(u);
      const behind = Math.atan2(-f.y, -f.x); // azimuth of gameplay camera
      const az = behind + Math.PI * (1 - eu) * 0.95;
      const rad = lerp(11, 7.0, eu);
      const ip = new THREE.Vector3(Math.cos(az) * rad, lerp(2.0, 4.6, eu), Math.sin(az) * rad);
      const il = new THREE.Vector3(0, 3.8, 0);
      const w = smooth(Math.min(1, Math.max(0, (u - 0.72) / 0.28)));
      tp = ip.lerp(gp, w);
      tl = il.lerp(gl, w);
      direct = true;
    } else if (this.phase === 'ko' && !this.timeUp) {
      // aftermath: a slow orbit around the wreckage — the man on the canvas and, if it came off, his head.
      // When the head has rolled away the orbit is centred between the two, so the aftermath reads as one shot:
      // the empty shoulders at one end, the helmet at the other.
      const loser = p.state === 'ko' ? p : e;
      let cx = loser.pos.x;
      let cz = loser.pos.y;
      let rad = 8.5;
      let lookY = 2.0;
      let lift = 0;
      const fly = this.decap.isOff(loser.robot) ? this.decap.headObj(loser.robot) : null;
      if (fly) {
        this.spillD.setFromMatrixPosition(fly.matrixWorld);
        const gap = Math.hypot(this.spillD.x - loser.pos.x, this.spillD.z - loser.pos.y);
        if (gap > 2) {
          cx = (loser.pos.x + this.spillD.x) * 0.5;
          cz = (loser.pos.y + this.spillD.z) * 0.5;
          rad = 8.5 + gap * 0.42;
          lookY = 1.7;
          lift = Math.min(1.4, gap * 0.06);
        }
      }
      rad *= camMode.koScale; // a wide mode watches the aftermath from further out, a close one leans in
      // never orbit out of the building
      const far = Math.hypot(cx, cz);
      rad = Math.max(4.5, Math.min(rad, RING + 10 - far));
      const ang = t * 0.3 + 1.2;
      tp = new THREE.Vector3(cx + Math.cos(ang) * rad, 3.3 + lift, cz + Math.sin(ang) * rad);
      tl = new THREE.Vector3(cx, lookY, cz);
    } else if (this.phase === 'ko') {
      tp = gp;
    }

    // the director's layer sits on top of all of it: while a beat is running it owns the camera
    let cineK = 0;
    if (this.cine && (this.phase === 'fight' || this.phase === 'ko')) {
      this.cineCam(tp, tl, dt);
      // keep the lens inside the building: never through the crowd wall, never under the canvas
      tp.x = THREE.MathUtils.clamp(tp.x, -(RING + 9.5), RING + 9.5);
      tp.z = THREE.MathUtils.clamp(tp.z, -(RING + 9.5), RING + 9.5);
      tp.y = THREE.MathUtils.clamp(tp.y, 2.0, 10.5);
      cineK = 1;
    } else if (this.cine) {
      this.cine = null; // the fight is over: hand the camera straight back
    }

    this.runFov += ((this.player.sprinting ? 4 : 0) - this.runFov) * (1 - Math.exp(-4 * raw));
    // the lens: gameplay breathes with the distance, a cinematic beat drives its own focal length
    this.cineFov += (this.cineFovT - this.cineFov) * (1 - Math.exp(-7 * raw));
    if (!this.cine && Math.abs(this.cineFov - this.baseFov) < 0.2) this.cineFov = this.baseFov; // fully handed back
    const gameFov = cineK > 0 || this.cine ? this.cineFov : this.baseFov;
    const clampedKick = this.phase === 'fight' ? Math.max(-4.5, this.fovKick) : this.fovKick;
    cam.fov = (this.phase === 'menu' ? (this.menuCamMode !== 'arena' ? (this.vs ? 30 : 38) : this.shot.fov) : gameFov) + clampedKick + (cineK > 0 ? 0 : this.runFov);

    // ---- PRE-LERP OMNIDIRECTIONAL FRAMING: fit target shot (tp, tl) BEFORE smoothing so the camera NEVER jitters or clips! ----
    const safeFov = Math.max(28, cam.fov - 5.5);
    if (this.cine?.kind !== 'rip' && (this.phase === 'fight' || this.phase === 'ko' || this.phase === 'walk')) {
      this.spillPts.length = 0;
      this.spillPads.length = 0;
      // the ring walk frames the PLAYER alone, head to boots, whatever he is doing (including the flip)
      const targets = this.phase === 'walk' ? [p] : camMode.ignoreSelf && this.phase === 'fight' ? [e] : [p, e];
      fighterBox(this.spillPts, this.spillPads, targets);
      if (this.phase === 'walk' && p.flip !== 0) {
        this.spillPts.push(p.pos.x, p.y + COM_H * p.scale, p.pos.y);
        this.spillPads.push(4.1 * p.scale);
      }
      for (const fgt of targets) {
        const sc = fgt.scale;
        const flat = THREE.MathUtils.clamp(fgt.fallS ? fgt.fallS.x : fgt.state === 'ko' || fgt.state === 'down' ? 1 : 0, 0, 1);
        const headY = (7.15 - (7.15 - 1.9) * flat) * sc + fgt.y;
        const chestY = (3.8 - 2.2 * flat) * sc + fgt.y;
        this.spillPts.push(fgt.pos.x, headY, fgt.pos.y);
        this.spillPads.push(1.08 * sc);
        this.spillPts.push(fgt.pos.x, chestY, fgt.pos.y);
        this.spillPads.push(1.28 * sc);
        this.spillPts.push(fgt.pos.x, Math.max(0.08, fgt.y), fgt.pos.y);
        this.spillPads.push(0.68 * sc);
      }
      const fly = this.decap.isOff(e.robot) ? this.decap.headObj(e.robot) : null;
      if (fly) {
        this.spillD.setFromMatrixPosition(fly.matrixWorld);
        this.spillPts.push(this.spillD.x, this.spillD.y, this.spillD.z);
        this.spillPads.push(0.95 * e.scale);
      }
      const dt0 = tp.distanceTo(tl);
      if (dt0 > 0.8) {
        this.spillDir.copy(tp).sub(tl).multiplyScalar(1 / dt0);
        // (the ring walk happens out on the hall floor, 1.4 below the canvas, so its bounds are the building's)
        const walkCam = this.phase === 'walk';
        const roomT = reachAlong(tl, this.spillDir, walkCam ? 40 : RING + 15, walkCam ? -1.2 : 2.2, 13.5);
        const dtFit = fitShot(
          this.view,
          tl,
          this.spillDir,
          safeFov,
          this.aspect,
          this.spillPts,
          this.spillPads,
          dt0,
          Math.min(dt0 * 1.85 + 10, roomT),
          tp,
        );
        if (dtFit > dt0) tp.copy(this.spillDir).multiplyScalar(dtFit).add(tl);
      }
    }

    if (direct) {
      this.camPos.copy(tp);
      this.camLook.copy(tl);
      if (this.phase !== 'intro') this.camInit = true;
    } else if (cineK > 0) {
      // a real operator grabbing the moment: fast, but never a teleport
      this.camPos.lerp(tp, 1 - Math.exp(-16 * raw));
      this.camLook.lerp(tl, 1 - Math.exp(-15 * raw));
    } else {
      // butter-smooth, responsive broadcast tracking
      const fk = 1 + (this.fwMul - 1) * 0.35;
      this.camPos.lerp(tp, 1 - Math.exp(-8.5 * fk * raw));
      this.camLook.lerp(tl, 1 - Math.exp(-12.5 * fk * raw));
    }

    // Shake-free post-lerp safety floor on this.camPos (never contaminated by camera shake!)
    if (this.cine?.kind !== 'rip' && (this.phase === 'fight' || this.phase === 'ko' || (this.phase === 'walk' && this.spillPts.length > 0))) {
      const d0 = this.camPos.distanceTo(this.camLook);
      if (d0 > 0.8) {
        this.spillDir.copy(this.camPos).sub(this.camLook).multiplyScalar(1 / d0);
        const walkCam2 = this.phase === 'walk';
        const room = reachAlong(this.camLook, this.spillDir, walkCam2 ? 40 : RING + 15, walkCam2 ? -1.2 : 2.2, 13.5);
        const d = fitShot(
          this.view,
          this.camLook,
          this.spillDir,
          safeFov + 1.5,
          this.aspect,
          this.spillPts,
          this.spillPads,
          d0,
          Math.min(d0 * 1.85 + 10, room),
          this.camPos,
        );
        if (d > d0) this.camPos.copy(this.spillDir).multiplyScalar(d).add(this.camLook);
      }
    }

    cam.position.copy(this.camPos);
    if (this.phase !== 'menu' || this.menuCamMode === 'arena') {
      // 3D Critically-Damped Spring-Damper for Heavy Robot Impact Recoil (100% smooth, ZERO random jitter!)
      const stepDt = Math.min(0.033, raw);
      const springK = 185;
      const dampC = 16.5;
      this.camImpVel.x += (-springK * this.camImp.x - dampC * this.camImpVel.x) * stepDt;
      this.camImpVel.y += (-springK * this.camImp.y - dampC * this.camImpVel.y) * stepDt;
      this.camImpVel.z += (-springK * this.camImp.z - dampC * this.camImpVel.z) * stepDt;
      this.camImp.addScaledVector(this.camImpVel, stepDt);
      const maxImp = 0.42;
      if (this.camImp.length() > maxImp) this.camImp.setLength(maxImp);
      cam.position.add(this.camImp);

      this.camPush *= Math.exp(-9 * raw);
      this.camBump *= Math.exp(-10 * raw);
      this.camRoll *= Math.exp(-8 * raw);
      if (this.camPush > 0.001) {
        const dirv = this.camLook.clone().sub(cam.position).normalize();
        cam.position.addScaledVector(dirv, Math.min(0.34, this.camPush));
      }
      cam.position.y -= this.camBump * 0.42;
      // Gentle, steady broadcast breathing (never wobbly)
      this.handPh += raw;
      const hand = (0.012 + this.hype * 0.008 + this.camClose * 0.008) * camMode.hand * (cineK > 0 ? 0.25 : 1);
      cam.position.x += Math.sin(this.handPh * 0.85) * hand;
      cam.position.y += Math.sin(this.handPh * 1.21 + 1.3) * hand * 0.55;
      cam.position.z += Math.cos(this.handPh * 0.73 + 0.6) * hand * 0.6;

      // Low-frequency damped shockwave (starts at phase 0 on impact -> smooth physical thud, zero high-frequency buzz!)
      this.shakePh += raw * 24;
      const s = this.trauma * this.trauma * (cineK > 0 ? 0.3 : 0.52);
      if (s > 0.0005) {
        const wave = Math.sin(this.shakePh);
        const wave2 = Math.cos(this.shakePh * 0.75);
        cam.position.x += wave * s * 0.22;
        cam.position.y -= Math.abs(wave) * s * 0.2;
        cam.position.z += wave2 * s * 0.22;
      }

      cam.lookAt(this.camLook);
      if (s > 0.0005) {
        cam.rotateZ(Math.sin(this.shakePh * 0.85) * s * 0.024);
        cam.rotateX(-Math.abs(Math.sin(this.shakePh)) * s * 0.014);
      }
      cam.rotateZ(this.camRoll + Math.sin(this.handPh * 0.61) * hand * 0.008);
    } else {
      // In menu hero mode: ZERO shake, rock-solid lookAt!
      this.camPush = 0;
      this.camBump = 0;
      this.camRoll = 0;
      this.trauma = 0;
      this.camImp.set(0, 0, 0);
      this.camImpVel.set(0, 0, 0);
      cam.lookAt(this.camLook);
    }
    cam.updateProjectionMatrix();
    // THE GLOW: the rig breathes a real bloom, and every heavy blow and every flash pushes it — but only a
    // little, and never past the point where the dark of the hall starts turning grey
    this.bloom.strength = Math.min(0.72, 0.4 + this.trauma * 0.14 + this.flashAmt * 0.18);
  }

  // ------------------------------------------------------------ popups + hud
  private popup(p: THREE.Vector3, text: string, cls: string) {
    const v = p.clone().project(this.camera);
    if (v.z > 1 || v.z < -1) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * w + (Math.random() - 0.5) * 40}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    this.popupLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 1100);
  }

  private emitHud(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastHud < 60) return;
    this.lastHud = now;
    this.onHud({
      phase: this.phase,
      round: this.round,
      timeLeft: Math.max(0, Math.ceil(this.roundTime)),
      pHp: this.player.hp,
      pMax: this.player.maxHp,
      eHp: this.enemy.hp,
      eMax: this.enemy.maxHp,
      stam: this.player.stam,
      meter: this.player.meter,
      combo: this.combo,
      stats: this.stats,
      wins: [...this.wins] as [number, number],
      eName: this.def.name,
      eTitle: this.def.title,
      eColor: this.def.color,
      banner: this.banner,
      paused: this.paused,
      result: this.result,
      oppIndex: this.oppIndex,
      ultra: this.ultra,
      fw: this.fwMul,
      cam: this.camMode,
      iq: this.iq,
      ePlan: this.iq >= STRATEGIST && this.phase === 'fight' ? PLAN_LABEL[this.ai.plan] : '',
      roll: this.player.rollCharge,
      ippo: this.player.ippo,
      hand: this.player.hand,
      handFlash: this.player.handT,
      parry: this.player.state === 'attack' && this.player.move?.id === 'counter' && this.player.moveT <= PARRY_ACTIVE,
      parryCd: this.player.counterCd,
      aim: this.player.aim,
      aimMode: this.player.aimMode,
      aimFlash: this.player.aimT,
      rage: this.player.rage,
      rageFlash: this.player.rageFlash,
      heroPose: this.heroPose,
      menuCamMode: this.menuCamMode,
      helmetSkin: this.helmetSkin,
      gloveSkin: this.gloveSkin,
      armorSkin: this.armorSkin,
      fps: this.fps,
      gfx: this.tierCfg().name,
      gfxMode: this.qMode,
      bright: this.bright,
      team:
        this.teamMode && this.ally && this.enemy2 && this.def2
          ? {
              ally: { name: this.allyName, hp: this.ally.hp, max: this.ally.maxHp, color: '#5effb0', ko: this.ally.state === 'ko' },
              enemy2: { name: this.def2.name, hp: this.enemy2.hp, max: this.enemy2.maxHp, color: this.ultra ? ULTRA_COLOR : this.def2.color, ko: this.enemy2.state === 'ko' },
            }
          : null,
    });
  }
}