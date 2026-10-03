import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Robot, type Pose, type RobotStyle } from './robot';
import { FREESTYLE, freestyleByKey, freestylePose, riseArms } from './poses';
import { buildArena, type Arena } from './arena';
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

// ------------------------------------------------------------------ data
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
const LS_FW = 'steel-titans-footwork-v2'; // v2: the default preset is now 3×
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
  speed: d.speed * 1.14,
  dmg: d.dmg * 1.3,
  react: Math.min(0.9, d.react + 0.22),
  dodge: Math.min(0.85, d.dodge + 0.18),
  punish: Math.min(0.9, d.punish + 0.25),
  adapt: d.adapt * 1.6 + 0.3,
  aggro: Math.min(0.95, d.aggro + 0.22),
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
const LS_IQ = 'steel-titans-iq';
export const loadIq = (): number => {
  try {
    const v = Number(localStorage.getItem(LS_IQ));
    return (IQ_STEPS as readonly number[]).includes(v) ? v : 1;
  } catch {
    return 1;
  }
};

/** the opponent's tuning after the IQ multiplier: every skill moves towards its ceiling as the IQ grows */
export const smartDef = (d: OpponentDef, iq: number): OpponentDef => {
  if (iq <= 1) return { ...d, iq: 1 };
  const k = 1 - 1 / iq; // 2× → 0.5, 3× → 0.67, 10× → 0.9 of the way to the ceiling
  const toward = (v: number, goal: number) => v + (goal - v) * k;
  return {
    ...d,
    iq,
    react: toward(d.react, 0.97), // how often it reads your attack in time
    dodge: toward(d.dodge, 0.82), // how often it chooses to evade instead of blocking
    punish: toward(d.punish, 0.96), // how often it counters after you whiff or it defends
    adapt: d.adapt * (1 + (iq - 1) * 0.35), // how fast it learns the moves you spam
    aggro: toward(d.aggro, 0.85),
    rest: d.rest / Math.sqrt(iq), // shorter pauses between its attacks
    combo: d.combo + (iq >= 3 ? 1 : 0) + (iq >= 10 ? 1 : 0),
    slam: d.slam || iq >= 3,
  };
};

export const ULTRA_COLOR = '#ff2a4a';

export const PLAYER_NAME = 'ATLAS';
export const PLAYER_STYLE: RobotStyle = { variant: 'atom', main: 0xc3c9d4, secondary: 0x262a33, accent: 0x1f66ff, glow: 0x3fd8ff };

export const OPPONENTS: OpponentDef[] = [
  { name: 'SCRAP-9', title: 'Si Tukang Pukul Rongsokan', hp: 90, speed: 3.0, dmg: 0.8, react: 0.2, dodge: 0.15, punish: 0.18, adapt: 0.4, aggro: 0.3, rest: 1.5, tscale: 1.5, scale: 1.0, combo: 2, slam: false, color: '#ff8a2a', style: { main: 0x8a6a4a, secondary: 0x4b4038, accent: 0xff8a2a, glow: 0xff7a1a } },
  { name: 'CRIMSON FANG', title: 'Predator Ring Bawah Tanah', hp: 110, speed: 3.5, dmg: 0.95, react: 0.38, dodge: 0.4, punish: 0.4, adapt: 0.8, aggro: 0.5, rest: 1.0, tscale: 1.25, scale: 1.1, combo: 3, slam: false, color: '#ff3b3b', style: { main: 0x9c1c22, secondary: 0x2a2d36, accent: 0xe8e8e8, glow: 0xff2a2a } },
  { name: 'VOLT TITAN', title: 'Raksasa Bertenaga Petir', hp: 130, speed: 3.9, dmg: 1.0, react: 0.44, dodge: 0.42, punish: 0.36, adapt: 1.0, aggro: 0.55, rest: 1.0, tscale: 1.12, scale: 1.2, combo: 3, slam: true, color: '#d6ff2a', style: { main: 0xc2a826, secondary: 0x23262d, accent: 0x111111, glow: 0xd6ff2a } },
  { name: 'OMEGA ZEUS', title: 'Juara Dunia Tak Terkalahkan', hp: 145, speed: 4.1, dmg: 1.0, react: 0.5, dodge: 0.42, punish: 0.34, adapt: 1.2, aggro: 0.58, rest: 1.0, tscale: 1.08, scale: 1.22, combo: 3, slam: true, color: '#c070ff', style: { main: 0x3b2370, secondary: 0x15121f, accent: 0xffc83a, glow: 0xb050ff } },
];

export type Phase = 'menu' | 'intro' | 'fight' | 'ko' | 'matchEnd';
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
  aim: number; // the point of impact every punch is aimed at (0 = head, 1 = body)
  aimFlash: number; // > 0 while the "target switched" flash is on screen
  heroPose?: 'stand' | 'guard' | 'victory' | 'taunt';
  menuCamMode?: 'hero' | 'arena';
}

type MoveId = 'jab' | 'cross' | 'hook' | 'upper' | 'slam' | 'bolt' | 'grab' | 'counter';
const isOD = (id: MoveId) => id === 'slam' || id === 'bolt'; // overdrive moves
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
  // COUNTER STANCE: a short catch-and-riposte. While the parry window is open (PARRY_ACTIVE) an incoming strike
  // is caught instead of landing, time slows down and the straight fires back instantly with the COUNTER bonus.
  // Thrown with no timing at all it is just a weak straight — the reward is in the read, not in the spam.
  counter: {
    id: 'counter', arm: 1, dur: 1.0, strikeAt: 0.46, impact: 0.58, cancel: 0.72, dmg: 9, reach: 4.3, cost: 12, stun: 0.6, knock: 5, blockMul: 0.25, power: 0.5, hitY: 4.3, step: 1.5, kind: 'front',
    keys: [
      k(0, GUARD),
      k(0.12, P(-0.52, -0.12, 0.42, -2.45), -0.34, -0.06, -0.3, 0.3, 'out'),
      k(0.34, P(-0.6, -0.16, 0.5, -2.4), -0.42, -0.02, -0.26, 0.34), // held parry stance (catch here)
      k(0.46, P(-0.4, 0.55, 0.34, -2.35), -0.5, -0.12, -0.42, 0.3, 'out'), // load the riposte
      k(0.58, P(-1.62, -0.8, 0, -0.06), 0.95, 0.38, 0.9, 0.06, 'in'), // the counter straight
      k(0.74, P(-1.62, -0.8, 0, -0.06), 0.95, 0.38, 0.9, 0.06),
      k(1.0, GUARD),
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
const POISE_MAX = 100;
const POISE_REGEN = 38; // per second
const POISE_DELAY = 1.0; // seconds of no damage before it starts refilling
const poiseCost = (power: number) => 8 + power * 22; // jab ≈ 15, cross ≈ 20, hook ≈ 22 → ~5 clean hits in a row

/**
 * ENEMY ATTACK WARNING ("tell"). The moment the enemy commits to a move it freezes in its wind-up pose for this long
 * (seconds, before difficulty scaling) and the attack indicator pops up over its head. Press DODGE any time between
 * the start of the warning and the moment the strike lands (≈ 0.6–1.0 s in total) and the attack cannot hit you.
 * Unblockable / heavy moves (grab, Overdrive) get the longest warning.
 */
const TELL: Record<MoveId, number> = { jab: 0.48, cross: 0.55, hook: 0.6, upper: 0.62, grab: 0.68, slam: 0.9, bolt: 0.9, counter: 0.5 };
const TELL_CHAIN = 0.16; // a follow-up hit of a combo that has already connected keeps its pace
const UNBLOCKABLE: MoveId[] = ['grab', 'slam', 'bolt']; // shown with a RED indicator, like God of War's unblockable attacks
// how much a strike re-aims at the opponent's *current* position when it launches (1 = homing)
const TRACK: Record<MoveId, number> = { jab: 0.2, cross: 0.25, hook: 0.85, upper: 0.4, slam: 0.4, bolt: 0.18, grab: 0.4, counter: 0.3 };

/**
 * COUNTER STANCE (L). For this long after pressing L the player is *catching*: any strike that reaches him inside
 * the window is parried — no damage, the attacker is knocked out of the swing, time slows down and his own
 * counter-straight fires back instantly with the 1.6× COUNTER bonus. Outside the window L is just a weak straight.
 */
const PARRY_ACTIVE = 0.44;

/**
 * WHERE YOU AIM. A tap on SPACE (or T) switches the point of impact between the HEAD and the BODY, and every
 * punch then follows: the pose drops onto the target, the sparks / flash / shock ring happen AT that point of
 * impact, and the damage profile changes with it.
 *   HEAD — more damage, more stun (the fast KO road)
 *   BODY — less damage, but it drains stamina hard and rocks stability (breaks guards, sets up knockdowns)
 */
const AIM_HEAD = 0;
const AIM_BODY = 1;
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
const DODGE_WIN_SPD = 1.38; // the next strike plays this much faster out of a dodge
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
const REGEN_AI = 20; // per second, for the opponent

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
  fallS = new Spring();
  flash = 0;
  dash = new THREE.Vector2();
  attackDir = new THREE.Vector2(0, 1);
  y = 0;
  vy = 0;
  bounced = false;
  juggle = 0;
  comboTaken = 0;
  hitConfirmed = false;
  moveSeq = 0;
  downT = 0;
  wallT = 0;
  wallCd = 0;
  wakeT = 0;
  tilt = 0;
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
  downDur = 1.8; // total time on the floor, get-up included
  poise = POISE_MAX; // stability: how much punishment is left before a normal punch can knock you down
  poiseT = 0; // delay before the poise starts refilling
  poiseMax = POISE_MAX;
  hand: 0 | 1 = 0; // PLAYER: which fist the next strike is thrown with (0 = left, 1 = right) — set by the last step
  handT = 0; // how long the "hand switched" flash stays up (HUD)
  counterCd = 0; // PLAYER: cooldown before the counter stance can be taken again (mashing it would be a turtling exploit)
  aim: 0 | 1 = 0; // 0 = the HEAD is the target, 1 = the BODY — every punch aims there (pose, impact point, damage)
  aimT = 0; // how long the "target switched" flash stays up (HUD)
  dodgeWinT = 0; // DODGE ADVANTAGE: time left in which the next strike is faster & heavier (after a dodge)
  atkSpd = 1; // duration multiplier of the move being played (> 1 = thrown faster, out of a dodge)
  winStrike = false; // the move currently playing is a dodge-advantage strike
  decapitated = false; // HEAD RIP: this robot is fighting (or lying) without its head
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
  weavePh = 0; // phase of the weaving animation
  runStrike = false; // the current punch was thrown at full run → heavier, longer, launches
  yawRate = 0;
  prevV = new THREE.Vector2();
  acc = new THREE.Vector2();
  armS: Spring[][] = [0, 1].map(() => [new Spring(), new Spring(), new Spring(), new Spring()]);
  bodyS = { twist: new Spring(), lean: new Spring(0.08), lunge: new Spring(), dip: new Spring(0.12), roll: new Spring() };

  constructor(
    public robot: Robot,
    public isPlayer: boolean,
    public scale: number,
    public maxHp: number,
    public dmgMul: number,
    public tscale: number,
  ) {
    this.hp = maxHp;
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
    this.tauntT = 0;
    this.tauntDur = 0;
    this.tauntStyle = 0;
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
    this.juggle = 0;
    this.comboTaken = 0;
    this.hitConfirmed = false;
    this.downT = 0;
    this.wallT = 0;
    this.wallCd = 0;
    this.wakeT = 0;
    this.tilt = 0;
    this.fallT = 0;
    this.glowBoost = 0;
    this.mode = 'normal';
    this.handT = 0;
    this.counterCd = 0;
    this.aim = AIM_HEAD;
    this.aimT = 0;
    this.dodgeWinT = 0;
    this.atkSpd = 1;
    this.winStrike = false;
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

const RING_IN = 13.45; // inner face of the ropes at rest
const BODY_R = 1.55; // collision radius of the torso/legs (per unit of scale)
const FLEX = 0.95; // how far the ropes can stretch before they hold
const ROPE_K = 105; // rope stiffness
const ROPE_C = 9.5; // rope damping (slightly under-damped → a soft, small rebound)
const TIP_LEN = 6.0; // height of a robot, used for its fall footprint
const RING = 11.9;
const PACE = 1.1; // global animation pace: heavier, more deliberate
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
const INTRO_T = 3.0;

export class Game {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
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
  private def: OpponentDef = OPPONENTS[0];

  private phase: Phase = 'menu';
  private phaseT = 0;
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
  private fpsEma = 16;
  private fpsT = 0;
  private quality = 1.5;
  private flashAmt = 0;
  private hype = 0;
  private combo = 0;
  private comboT = 0;
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
  private shot: Shot = nextShot();
  private shotT = 0;
  private shotCut = true;
  private odToggle = Math.random() < 0.5;

  private ai = this.makeAi();

  // Foreground Hero Robot in main menu (standing front view)
  private menuHero: Robot;
  private menuHeroPedestal: THREE.Group;
  private menuHeroSpot: THREE.SpotLight;
  private menuHeroRim: THREE.SpotLight;
  private menuHeroFill: THREE.PointLight;
  private menuScrimPlane: THREE.Mesh;
  private heroPose: 'stand' | 'guard' | 'victory' | 'taunt' = 'stand';
  private heroYaw = 0;
  private heroYawTarget = 0;
  private heroMouseX = 0;
  private heroMouseY = 0;
  private menuCamMode: 'hero' | 'arena' = 'hero';

  constructor(container: HTMLElement, onHud: (h: HudState) => void) {
    this.container = container;
    this.onHud = onHud;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;

    this.arena = buildArena(this.scene);
    this.fx = new Effects(this.scene);
    this.decap = new Decap(this.scene);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.1, 0.35, 1.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Foreground menu hero robot (standing front view on illuminated platform)
    this.menuHero = new Robot(PLAYER_STYLE, 1.0);
    this.scene.add(this.menuHero.root);

    this.menuHeroPedestal = new THREE.Group();
    const platGeo = new THREE.CylinderGeometry(2.3, 2.4, 0.12, 32);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x141a26,
      metalness: 0.85,
      roughness: 0.25,
    });
    const platMesh = new THREE.Mesh(platGeo, platMat);
    platMesh.position.y = 0.06;
    platMesh.receiveShadow = true;
    this.menuHeroPedestal.add(platMesh);

    const ringGeo = new THREE.RingGeometry(2.05, 2.25, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x3fd8ff,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.125;
    this.menuHeroPedestal.add(ringMesh);

    const innerRingGeo = new THREE.RingGeometry(1.2, 1.25, 32);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x1f66ff,
      side: THREE.DoubleSide,
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRingMesh.rotation.x = -Math.PI / 2;
    innerRingMesh.position.y = 0.126;
    this.menuHeroPedestal.add(innerRingMesh);
    this.scene.add(this.menuHeroPedestal);

    this.menuHeroSpot = new THREE.SpotLight(0xd8eeff, 4.2, 30, Math.PI / 3.2, 0.35, 1.0);
    this.menuHeroSpot.castShadow = true;
    this.scene.add(this.menuHeroSpot);
    this.scene.add(this.menuHeroSpot.target);

    this.menuHeroRim = new THREE.SpotLight(0x3fd8ff, 3.2, 25, Math.PI / 3, 0.45, 1.0);
    this.scene.add(this.menuHeroRim);
    this.scene.add(this.menuHeroRim.target);

    this.menuHeroFill = new THREE.PointLight(0x60b0ff, 2.0, 12, 1.2);
    this.scene.add(this.menuHeroFill);

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

    this.player = this.makeFighter(true, PLAYER_STYLE, 1, 100, 1, 1);
    this.prepareEnemy(0);
    this.toMenu();

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

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
        this.sfx.step(light * Math.min(1.5, 0.55 * scale + 0.2));
      }
      const d = Math.hypot(wx - this.camera.position.x, wz - this.camera.position.z);
      this.trauma = Math.min(1, this.trauma + Math.max(0, 0.035 * scale * light - d * 0.0015));
      this.camBump = Math.max(this.camBump, Math.max(0, 0.035 * scale * light - d * 0.0015));
      if (spd > 1.5) {
        this.fx.ring(wx, wz, 0x7d8cab, 0.9 * scale + spd * 0.1, 0.3, 0.06);
        this.fx.spark(v, 2 + Math.floor(spd * 0.5), 1.4 + spd * 0.15, 0x8a8a99, undefined, 1.1, 0.3, 2);
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
    this.enemy = this.makeFighter(false, this.def.style, this.def.scale, this.def.hp, this.def.dmg, this.def.tscale);
    // Ultra opponents burn crimson-red so you can tell at a glance that this is the hard version
    if (this.ultra) this.enemy.robot.setStyleGlow(0xff1a3a);
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
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
  startMatch(idx: number) {
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
    this.wins = [0, 0];
    this.round = 1;
    this.result = null;
    this.paused = false;
    this.startRound(true);
  }

  selectOpponent(idx: number) {
    if (this.phase !== 'menu') return;
    this.prepareEnemy(idx);
    this.placeMenu();
  }

  toMenu() {
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
      this.menuScrimPlane.visible = true;
      this.heroPose = 'stand';
      this.heroYaw = 0;
      this.heroYawTarget = 0;
      this.menuCamMode = 'hero';
    }
    this.placeMenu();
    this.sfx.musicIntensity = 0.7;
    this.emitHud(true);
  }

  setHeroPose(pose: 'stand' | 'guard' | 'victory' | 'taunt') {
    if (this.heroPose === pose) return;
    this.heroPose = pose;
    this.sfx.init();
    this.sfx.click();
    this.emitHud(true);
  }

  getHeroPose() {
    return this.heroPose;
  }

  setMenuCamMode(mode: 'hero' | 'arena') {
    if (this.menuCamMode === mode) return;
    this.menuCamMode = mode;
    this.sfx.init();
    this.sfx.click();
    this.emitHud(true);
  }

  getMenuCamMode() {
    return this.menuCamMode;
  }

  rotateHero(deltaYaw: number) {
    this.heroYawTarget += deltaYaw;
  }

  resetHeroRotation() {
    this.heroYawTarget = 0;
  }

  setHeroMouse(nx: number, ny: number) {
    this.heroMouseX = nx;
    this.heroMouseY = ny;
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
    if (this.menuHero) {
      const showHero = this.menuCamMode === 'hero';
      this.menuHero.root.visible = showHero;
      this.menuHeroPedestal.visible = false;
      this.menuHeroSpot.visible = showHero;
      this.menuHeroRim.visible = showHero;
      this.menuHeroFill.visible = showHero;
      this.menuScrimPlane.visible = showHero;
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

  private onEdge(code: string) {
    if (code === 'Escape') {
      this.togglePause();
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
      case 'KeyG':
        this.tryAttack(p, 'grab');
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
        if (p.meter >= 100 && p.state === 'idle') {
          p.meter = 0;
          this.meterReadyShown = false;
          // far away → the long straight; up close → alternate so you get both
          const far = p.pos.distanceTo(this.enemy.pos) > 4.4;
          this.odToggle = !this.odToggle;
          this.startMove(p, far || this.odToggle ? 'bolt' : 'slam');
        }
        break;
      // ---------------- FREESTYLE ----------------
      // The whole show-off book (poses.ts) sits on its own keys, and one key just cycles it: M N B U I Y O.
      case 'KeyM':
      case 'KeyN':
      case 'KeyB':
      case 'KeyU':
      case 'KeyI':
      case 'KeyY':
      case 'KeyO': {
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
    const p = this.player;
    const e = this.enemy;
    p.reset(0, 6.0, Math.PI);
    e.reset(0, -6.0, 0);
    p.mode = 'taunt';
    e.mode = 'taunt';
    this.player.robot.root.visible = true;
    this.roundTime = ROUND_TIME;
    this.timeUp = false;
    this.combo = 0;
    this.decap.clear(); // any head torn off last round is bolted back on
    this.cine = null; // and the director hands the camera back to the operator
    this.meterReadyShown = false;
    this.ai = this.makeAi();
    this.phase = 'intro';
    this.phaseT = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.sfx.musicIntensity = 1;
    this.arena.setScreen(PLAYER_NAME, this.def.name, this.roundLabel(), '#4da3ff', this.ultra ? ULTRA_COLOR : this.def.color);
    const tag = this.ultra ? 'ULTRA HARD · ' : '';
    this.showBanner(`ROUND ${this.round}`, tag + (first ? `${PLAYER_NAME}  VS  ${this.def.name}` : `Skor ${this.wins[0]} - ${this.wins[1]}`), 'round', INTRO_T - 0.3);
    this.sfx.bell(1);
    this.sfx.say(`Round ${['zero', 'one', 'two', 'three'][this.round] ?? this.round}`);
    this.sfx.cheer(0.5);
    this.camInit = false;
  }

  private beginFight() {
    this.phase = 'fight';
    this.phaseT = 0;
    this.player.mode = 'normal';
    this.enemy.mode = 'normal';
    this.player.glowBoost = 0;
    this.enemy.glowBoost = 0;
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
    const idx = winner.isPlayer ? 0 : 1;
    this.wins[idx]++;
    winner.mode = 'victory';
    winner.glowBoost = 1.5;
    if (how === 'ko') {
      this.showBanner('K.O.!', winner.isPlayer ? 'Kamu menang ronde ini' : `${this.def.name} menang ronde ini`, 'ko', 3.2);
    } else {
      this.timeUp = true;
      this.showBanner('WAKTU HABIS', winner.isPlayer ? 'Kamu unggul poin' : `${this.def.name} unggul poin`, 'ko', 3.0);
      this.sfx.bell(3);
      this.sfx.say('Time');
    }
    this.sfx.cheer(1);
    this.hype = 1;
    this.sfx.musicIntensity = 0.5;
    // the arena erupts when a round ends: a huge roar when YOU win, a big "ohhh" when the champion wins
    this.crowdRoar(winner.isPlayer ? 1 : 0.7, how === 'ko' ? 4.2 : 3.4);
    if (winner.isPlayer) this.pyro(1); // victory fireworks
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
    this.fpsT += frameMs / 1000;
    if (this.fpsT > 1.2) {
      this.fpsT = 0;
      this.adaptQuality();
    }
    this.step(raw);
  };

  private adaptQuality() {
    if (this.fpsEma > 30 && this.quality > 0.55) {
      this.quality = Math.max(0.55, this.quality - 0.2);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality));
      this.resize();
      if (this.quality <= 0.8) this.bloom.enabled = false;
    }
  }

  private step(raw: number) {
    if (!this.paused) {
      if (this.slowT > 0) {
        this.slowT -= raw;
        this.timeScale = this.slowScale;
      } else {
        this.timeScale += (1 - this.timeScale) * (1 - Math.exp(-6 * raw));
      }
      let dt = raw * this.timeScale;
      if (this.freeze > 0) {
        this.freeze -= raw;
        dt = 0;
      }
      this.time += raw;
      if (this.phase === 'menu') {
        this.trauma = 0;
        this.camBump = 0;
        this.camPush = 0;
        this.fovKick = 0;
        this.flashAmt = 0;
      }
      if (dt > 0) {
        this.simulate(dt);
        this.decap.update(dt, this.fx); // torn heads tumble & cables keep shorting out
      }
      this.updateAnimations(dt);
      if (this.freeze > 0 && this.frozenFighter) {
        const f = this.frozenFighter;
        f.robot.root.position.x += (Math.random() - 0.5) * 0.09;
        f.robot.root.position.z += (Math.random() - 0.5) * 0.09;
      }
      this.fx.update(raw * Math.max(0.35, this.timeScale), this.camera);
      this.updateCamera(raw, dt); // the cinematic beats run on world time, so they slow down with the action
      this.updateWarn();
      this.focus.set((this.player.pos.x + this.enemy.pos.x) / 2, 3.4, (this.player.pos.y + this.enemy.pos.y) / 2);
      this.arena.update(this.time, raw, this.hype, this.focus);
      this.hype = Math.max(0.15, this.hype - raw * 0.12);
      if (this.bannerT > 0) {
        this.bannerT -= raw;
        if (this.bannerT <= 0) this.banner = null;
      }
      this.flashAmt = Math.max(0, this.flashAmt - raw * 3.2);
      this.flashEl.style.opacity = String(Math.min(1, this.flashAmt));
    }
    this.composer.render();
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
    this.player.animT += dt;
    this.enemy.animT += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
    this.fovKick *= Math.exp(-5 * dt);

    switch (this.phase) {
      case 'menu':
        // the menu background is a live demo fight
        this.demoBrain(this.player, this.enemy, this.demoP, dt);
        this.demoBrain(this.enemy, this.player, this.demoE, dt);
        this.updateFighter(this.player, this.enemy, dt);
        this.updateFighter(this.enemy, this.player, dt);
        this.separate();
        this.hype = Math.max(this.hype, 0.45);
        break;
      case 'intro':
        if (this.phaseT > INTRO_T) this.beginFight();
        break;
      case 'fight': {
        this.roundTime -= dt;
        if (this.roundTime <= 0) {
          const pr = this.player.hp / this.player.maxHp;
          const er = this.enemy.hp / this.enemy.maxHp;
          this.endRound(pr >= er ? this.player : this.enemy, 'time');
          break;
        }
        this.comboT -= dt;
        if (this.comboT <= 0) this.combo = 0;
        this.playerInput();
        this.updateEnemyAI(dt);
        this.updateFighter(this.player, this.enemy, dt);
        this.updateFighter(this.enemy, this.player, dt);
        this.separate();
        break;
      }
      case 'ko':
        this.player.wish.set(0, 0);
        this.enemy.wish.set(0, 0);
        this.player.blocking = false;
        this.enemy.blocking = false;
        this.player.ippo = false;
        this.player.queued = null;
        this.updateFighter(this.player, this.enemy, dt);
        this.updateFighter(this.enemy, this.player, dt);
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
      if (ippoOn) {
        const im = 1 + (this.fwMul - 1) * 0.5;
        const dist = p.pos.distanceTo(this.enemy.pos);
        let fw = fwd;
        // approach assist: with no key held, creep in until you are in punching range
        if (fwd === 0 && lat === 0 && dist > 3.6 * this.enemy.scale && this.enemy.state !== 'ko' && this.enemy.state !== 'down') fw = 0.85;
        p.wish.addScaledVector(f, fw * (fw > 0 ? IPPO_FWD : IPPO_BACK) * im).addScaledVector(r, lat * IPPO_SIDE * im);
        const lim = IPPO_FWD * im;
        if (p.wish.length() > lim) p.wish.setLength(lim);
      } else if (wantRun) {
        p.sprinting = true;
        // forwards at full speed, sideways a little slower, backwards much slower
        const rs = RUN_SPEED * this.fwMul;
        p.wish.addScaledVector(f, fwd * (fwd > 0 ? rs : rs * 0.5)).addScaledVector(r, lat * rs * 0.72);
        if (p.wish.length() > rs) p.wish.setLength(rs);
      } else {
        const k = (p.blocking ? 0.5 : 1) * this.fwMul;
        p.wish.addScaledVector(f, fwd * (fwd > 0 ? WALK_FWD : WALK_BACK) * k).addScaledVector(r, lat * WALK_SIDE * k);
        const lim = (fwd > 0 ? WALK_FWD : fwd < 0 ? WALK_BACK : WALK_SIDE) * k;
        if (p.wish.length() > lim) p.wish.setLength(lim);
      }
    } else if (p.state === 'attack') {
      if (p.runStrike) {
        p.wish.addScaledVector(f, 3.4); // a running punch keeps its forward momentum
      } else {
        const free = p.impacted ? 3.6 : 1.4; // once the punch has landed you can already glide away / reposition
        p.wish.addScaledVector(f, fwd * free).addScaledVector(r, lat * free * 1.15);
      }
    }
  }

  private playerDodge() {
    const p = this.player;
    if (this.phase !== 'fight') return;
    // dodge-cancel: once your own punch has landed you may bail out of its recovery (responsive!)
    if (p.state === 'attack' && p.move && p.impacted) {
      p.state = 'idle';
      p.move = null;
      p.runStrike = false;
      p.ippoStrike = false;
      p.queued = null;
    }
    if (p.state !== 'idle' || p.dodgeT > 0) return;
    const { fwd, lat } = this.dirKeys();
    const f = this.toward(p, this.enemy);
    const r = new THREE.Vector2(-f.y, f.x);
    const d = new THREE.Vector2();
    if (fwd === 0 && lat === 0) d.addScaledVector(f, -1);
    else d.addScaledVector(f, fwd).addScaledVector(r, lat);
    if (!this.startDodge(p, d.normalize(), 'evade')) {
      if (p.stam < 10) this.popup(new THREE.Vector3(p.pos.x, 5.8, p.pos.y), 'TENAGA HABIS', 'pop-info');
      return;
    }
    // ★ TIMED DODGE: the enemy attack that is winding up right now (warning or strike on its way) can no longer hit you.
    //   You have the whole warning + the strike's travel time (≈ 0.6–1.0 s) to press the key.
    const e = this.enemy;
    const m = e.move;
    if (e.state === 'attack' && m && !e.impacted && p.pos.distanceTo(e.pos) < (m.reach + 3.5) * e.scale) {
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
    if (this.phase === 'fight') {
      this.popup(new THREE.Vector3(f.pos.x, 6.6 * f.scale, f.pos.y), f.isPlayer ? fs.tag : this.tauntBack(fs).toUpperCase(), 'pop-crit');
      this.crowdRoar(0.4 + fs.dur * 0.12, 1.4 + fs.dur * 0.35);
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

  /** the two chest thumps inside the taunt: a metal boom, sparks and a camera kick */
  private tauntBeat(f: Fighter) {
    this.sfx.hit(0.3);
    this.sfx.crackle(0.5);
    const c = new THREE.Vector3(f.pos.x, 4.6 * f.scale, f.pos.y);
    this.fx.spark(c, 14, 6, 0xffd27a, undefined, 1.2, 0.5, 13);
    this.fx.ring(f.pos.x, f.pos.y, 0xffd27a, 3.4, 0.35, 0.08);
    if (f.isPlayer) {
      this.trauma = Math.min(1, this.trauma + 0.12);
      this.camBump = Math.max(this.camBump, 0.1);
    }
  }

  /** the reward for a correctly timed dodge: slow motion, a counter-attack bonus and meter */
  private perfectDodge(d: Fighter) {
    d.counterT = 1.8;
    d.meter = Math.min(100, d.meter + 14);
    this.popup(new THREE.Vector3(d.pos.x, 6, d.pos.y), 'PERFECT DODGE!', 'pop-dodge');
    this.slowT = 0.34; // a beat of slow motion, not a pause: you still have to throw the counter fast
    this.slowScale = 0.45;
    this.flashAmt = Math.max(this.flashAmt, 0.25);
    this.fovKick = 5;
    this.fx.ring(d.pos.x, d.pos.y, 0x5affc8, 6, 0.5, 0.1);
    this.fx.spark(new THREE.Vector3(d.pos.x, 3 * d.scale, d.pos.y), 24, 6, 0x5affc8, undefined, 1.2, 0.5, 3);
    this.sfx.dodge();
    this.sfx.cheer(0.5);
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
      const want = f.riseU > 0.64 ? 2 : f.riseU > 0.38 ? 1 : 0;
      if (want > f.riseSteps) {
        f.riseSteps = want;
        const foot = want === 1 ? 1 : 0;
        return {
          foot,
          z: foot === 1 ? -0.05 : -0.22, // first step tucks the rear foot in, second brings the lead foot under him
          x: foot === 1 ? 0.12 : 0.06,
          dur: 0.3,
          seq: 900 + want,
          lift: 0.2,
        };
      }
      return none;
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
    p.aim = p.aim === AIM_HEAD ? AIM_BODY : AIM_HEAD;
    p.aimT = 0.9;
    const body = p.aim === AIM_BODY;
    this.sfx.click();
    this.popup(new THREE.Vector3(p.pos.x, 6.6, p.pos.y), body ? 'TARGET: DADA' : 'TARGET: KEPALA', 'pop-info');
    this.fx.ring(p.pos.x, p.pos.y, body ? 0xff9a4a : 0x8fd0ff, 2.8, 0.35, 0.09);
    this.fx.spark(new THREE.Vector3(p.pos.x, (body ? 3.5 : 5.3) * p.scale, p.pos.y), 14, 4, body ? 0xffa050 : 0x9fe6ff, undefined, 1, 0.35, 3);
    p.robot.root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    p.robot.chest.getWorldPosition(v);
    this.fx.flash(v, 1.3, body ? 0xffb070 : 0x9fd6ff, 0.16);
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
    const od = isOD(m.id);
    const toA = new THREE.Vector2().subVectors(a.pos, d.pos).normalize();
    const hitPos = new THREE.Vector3(d.pos.x + toA.x * 1.1 * d.scale, 4.4 * d.scale, d.pos.y + toA.y * 1.1 * d.scale);

    d.counterT = 1.6; // the riposte about to land counts as a COUNTER hit (1.6×)
    d.meter = Math.min(100, d.meter + (od ? 22 : 16));
    d.stam = Math.min(100, d.stam + 6);
    d.queued = null;
    d.moveT = Math.max(d.moveT, PARRY_ACTIVE - 0.03); // fire the counter-straight right now
    d.invuln = Math.max(d.invuln, 0.24); // and the rest of the swing cannot touch him
    d.handT = 0.7;

    // the attacker loses the move: a light hit leaves him wide open, a heavy one only briefly (it is armoured)
    a.move = null;
    a.queued = null;
    a.tellT = 0;
    a.tellTotal = 0;
    a.impacted = false;
    a.state = 'stagger';
    a.stunT = od ? 0.32 : 0.62;
    a.hit = 1;
    a.hitSign = Math.random() < 0.5 ? 1 : -1;
    a.kb.addScaledVector(toA, -2.4 - m.power * 2);
    if (!a.isPlayer) {
      this.ai.blockT = 0;
      this.ai.reactT = -1;
      this.ai.punishT = 0;
      this.ai.queued = null;
      this.ai.defStreak = 0;
    }

    this.popup(new THREE.Vector3(d.pos.x, 6.2, d.pos.y), 'COUNTER PARRY!', 'pop-crit');
    this.slowT = 0.34; // short and sharp: the riposte has to come out fast
    this.slowScale = 0.45;
    this.flashAmt = Math.max(this.flashAmt, 0.3);
    this.freeze = 0.09;
    this.frozenFighter = a;
    this.trauma = Math.min(1, this.trauma + 0.35);
    this.camPush += 0.35;
    this.camBump = Math.max(this.camBump, 0.22);
    this.fovKick = 6;
    this.fx.ring(hitPos.x, hitPos.z, 0xffe6a8, 6, 0.45, 0.1);
    this.fx.ring(hitPos.x, hitPos.z, 0xffffff, 3.2, 0.3, 0.07);
    this.fx.spark(hitPos, 30, 9, 0xffd27a, new THREE.Vector3(toA.x, 0.3, toA.y), 1.1, 0.55, 9);
    this.fx.flash(hitPos, 1.6, 0xfff0c0, 0.12);
    this.sfx.block(0.65); // steel catching steel
    this.sfx.crackle(0.7);
    this.sfx.cheer(0.6);
    this.hype = Math.max(this.hype, 0.7);
  }

  private playerDash(kind: 'fwd' | 'back' | 'side', sign: number) {
    const p = this.player;
    if (p.state !== 'idle' || p.dodgeT > 0) return;
    const f = this.toward(p, this.enemy);
    const r = new THREE.Vector2(-f.y, f.x);
    const d = new THREE.Vector2();
    if (kind === 'fwd') d.copy(f);
    else if (kind === 'back') d.copy(f).multiplyScalar(-1);
    else d.copy(r).multiplyScalar(sign);
    this.startDodge(p, d, kind);
  }

  private startDodge(f: Fighter, dir: THREE.Vector2, kind: 'evade' | 'fwd' | 'back' | 'side' = 'evade') {
    const cfg = {
      evade: { dur: 0.34, speed: 12.5, inv: true, cost: 10, cd: 0.36 },
      fwd: { dur: 0.27, speed: 23, inv: false, cost: 6, cd: 0.28 },
      back: { dur: 0.3, speed: 16, inv: true, cost: 8, cd: 0.42 },
      side: { dur: 0.3, speed: 19, inv: false, cost: 6, cd: 0.28 },
    }[kind];
    // the enemy's dodge gets cheaper as its IQ grows (a clever fighter wastes less energy), the player's cost never changes
    const cost = (f.isPlayer ? cfg.cost : cfg.cost / Math.pow(this.iq, 0.25)) * STAM_SCALE;
    if (f.dodgeCd > 0 || f.stam < cost || f.state !== 'idle') return false;
    f.dodgeT = cfg.dur;
    f.dodgeDur = cfg.dur;
    f.dodgeSpeed = cfg.speed * (f.isPlayer ? Math.pow(this.fwMul, 0.6) : 1); // dashes grow more slowly than walking (3× → 1.9×)
    // a 3×+ AI times even its sidesteps so well that they behave like true evasions (invulnerable mid-dodge)
    f.dodgeInv = cfg.inv || (!f.isPlayer && this.iq >= 3);
    f.dodgeKind = kind;
    f.dodgeDir.copy(dir);
    // enemy dodge cooldown: 2× the player's (the old value) was far too long to ever see it dodge twice in a row
    f.dodgeCd = cfg.cd * (f.isPlayer ? 1 : Math.max(0.6, 1.6 / Math.sqrt(this.iq)));
    f.stam -= cost;
    f.blocking = false;
    this.sfx.dodge();
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.3, f.pos.y), kind === 'evade' ? 14 : 22, 6, 0x8fd0ff, undefined, 1, 0.4, 3);
    this.fx.ring(f.pos.x, f.pos.y, 0x8fd0ff, 3, 0.3, 0.07);
    if (f.isPlayer) this.fovKick = kind === 'fwd' ? 3 : kind === 'back' ? -1.5 : 0;
    return true;
  }

  private tryAttack(f: Fighter, id: MoveId) {
    const m = MOVES[id];
    if (f.state === 'stagger' || f.state === 'ko' || f.state === 'air' || f.state === 'down') return;
    // the counter stance cannot be spammed: it stays on cooldown for a moment after every attempt
    if (id === 'counter' && f.isPlayer && f.counterCd > 0) {
      this.popup(new THREE.Vector3(f.pos.x, 5.8, f.pos.y), 'STANCE BELUM SIAP', 'pop-info');
      return;
    }
    if (f.dodgeT > 0 && f.state === 'idle') {
      // DODGE ADVANTAGE: once enough of the dodge has played you may cancel out of it straight into an attack —
      // the strike comes out faster and lands harder, so whoever reads the exchange first owns it.
      const played = 1 - Math.max(0, f.dodgeT) / f.dodgeDur;
      if (played >= DODGE_CANCEL_AT) {
        f.dodgeT = 0;
        f.invuln = Math.max(f.invuln, 0.05); // the tail of the i-frames just about covers the start-up
        f.dodgeWinT = DODGE_WIN;
        this.startMove(f, id);
      } else {
        f.queued = id;
        f.queuedT = 0.3;
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

  /** how long the enemy telegraphs a move: slower fighters give more warning, ULTRA gives less */
  private tellFor(id: MoveId, chain: boolean) {
    if (chain) return TELL_CHAIN;
    return TELL[id] * (1.25 - this.def.react * 0.55) * (this.ultra ? 0.9 : 1);
  }

  private startMove(f: Fighter, id: MoveId, chain = false) {
    const m = MOVES[id];
    if (id === 'counter' && f.isPlayer) {
      if (f.counterCd > 0) return; // guarded again here: a queued follow-up must not sneak past the cooldown
      f.counterCd = 1.15;
    }
    // a punch thrown at (near) full speed is a RUNNING PUNCH
    // (the threshold scales with the footwork setting: at 2× / 3× plain walking is already fast, only a real sprint counts)
    f.runStrike = f.isPlayer && f.speed > 7.0 * this.fwMul && !isOD(id) && id !== 'grab';
    if (f.runStrike) this.fovKick = 4;
    // DEMPSEY ROLL: a punch thrown out of a charged weave carries all of that stored momentum
    f.ippoStrike = f.isPlayer && f.rollCharge > 0.25 && !f.runStrike && !isOD(id) && id !== 'grab';
    // the AI picks a target too: it digs into the body when you live behind your guard, otherwise it hunts the head
    if (!f.isPlayer) f.aim = Math.random() < (this.player.blocking || this.player.ippo ? 0.65 : 0.28) ? AIM_BODY : AIM_HEAD;
    f.strikeCharge = f.ippoStrike ? f.rollCharge : 0;
    if (f.ippoStrike) {
      f.rollCharge = 0;
      this.fovKick = 3;
    }
    f.state = 'attack';
    f.move = m;
    f.moveSeq++;
    f.moveT = 0;
    // DODGE ADVANTAGE: a strike thrown out of a dodge comes out faster and lands harder (the AI gets a smaller
    // share of it — it already has reflexes and reads on its side)
    f.winStrike = f.dodgeWinT > 0 && !isOD(id);
    f.atkSpd = f.winStrike ? 1 + (DODGE_WIN_SPD - 1) * (f.isPlayer ? 1 : 0.5) : 1;
    if (f.winStrike) {
      f.dodgeWinT = 0; // one dodge buys one heavy strike
      if (f.isPlayer) {
        this.popup(new THREE.Vector3(f.pos.x, 7.0, f.pos.y), 'DODGE STRIKE!', 'pop-crit');
        this.fx.ring(f.pos.x, f.pos.y, 0x7fe0ff, 4, 0.3, 0.09);
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
    f.attackDir.copy(this.toward(f, f.isPlayer ? this.enemy : this.player));
    f.queued = null;
    f.blocking = false;
    f.stam = Math.max(0, f.stam - m.cost * STAM_SCALE);
    this.sfx.servo();
    if (isOD(id)) {
      this.sfx.charge();
      f.glowBoost = 3;
      this.sfx.say('Overdrive');
      this.fovKick = 3;
      // the director steps in for the charge: a short low hero angle before the strike lands
      if (f.isPlayer) this.startCine('od');
    }
    if (f.isPlayer) this.enemyReact(m);
  }

  private canCancel(f: Fighter) {
    const m = f.move;
    if (!m) return false;
    const at = f.hitConfirmed && f.impacted && m.cancel < 90 ? Math.min(m.cancel, m.impact + 0.05) : m.cancel;
    return f.moveT >= at;
  }

  // ------------------------------------------------------------ enemy AI
  // A reactive, adaptive opponent: reads the player's startup frames to block / sidestep / backstep with the
  // *right* defence for each move, punishes whiffs and blocked moves, adapts to spammed moves, mixes pressure
  // and cautious phases, uses throws against turtling and avoids getting cornered.
  // Fairness: every successful defence builds "defStreak" which lowers its reaction, dodges cost stamina and
  // have a cooldown, blocking drains stamina (guard break), and punish windows are short — so it can be beaten.
  private makeAi() {
    return {
      cool: 1.4,
      combo: 0,
      strafeDir: 1,
      strafeT: 0,
      blockT: 0,
      reactT: -1,
      reactAct: '' as '' | 'block' | 'side' | 'back',
      habit: { jab: 0, cross: 0, hook: 0, upper: 0, slam: 0, bolt: 0, grab: 0, counter: 0 } as Record<MoveId, number>,
      defStreak: 0,
      defT: 0,
      punishT: 0,
      punishSeq: -1,
      queued: null as MoveId | null,
      queuedT: 0,
      pressure: false,
      moodT: 3,
      lastId: '' as MoveId | '', // the previous opener, so a smart AI can avoid repeating it
      // ---- STRATEGIST layer (only used when iq >= STRATEGIST) ----
      plan: 'scout' as Plan,
      planT: 0, // how long it has been running this plan
      // a dossier it builds on YOU while the round runs
      scout: { time: 0, atk: 0, block: 0, dodge: 0, whiff: 0, rush: 0, taken: 0 },
      cond: 0, // conditioning: how many times in a row it has shown the same setup
      condId: '' as MoveId | '', // the move it is conditioning you with
      holdOD: 0, // how long it has been saving its Overdrive for the right moment
    };
  }

  /** the opponent is running the full strategic brain */
  private get strat() {
    return this.iq >= STRATEGIST;
  }

  /** build a dossier on the player: how often he attacks, blocks, dodges, whiffs and rushes in */
  private scoutPlayer(dt: number) {
    const s = this.ai.scout;
    const p = this.player;
    s.time += dt;
    if (p.blocking) s.block += dt;
    if (p.dodgeT > 0) s.dodge += dt * 3;
    if (p.speed > 6 && p.pos.distanceTo(this.enemy.pos) < 7) s.rush += dt;
    // decay, so it reacts to how you are fighting NOW and not ten seconds ago
    const k = Math.exp(-dt / 9);
    s.atk *= k;
    s.block *= k;
    s.dodge *= k;
    s.whiff *= k;
    s.rush *= k;
    s.taken *= k;
  }

  /**
   * THE GAME PLAN. Re-evaluated a few times a second: it weighs the score, the clock, both fighters' condition
   * and the dossier, then commits to a plan for a while (so it reads as intent, not as twitching).
   */
  private updatePlan(dt: number) {
    const ai = this.ai;
    ai.planT += dt;
    if (ai.planT < 1.1) return; // stick with a plan long enough for you to feel it
    const e = this.enemy;
    const p = this.player;
    const s = ai.scout;
    const eHp = e.hp / e.maxHp;
    const pHp = p.hp / p.maxHp;
    const obs = Math.max(1, s.time);
    const aggr = s.atk / obs; // your attacks per second
    const turtle = s.block / obs; // share of time you spend blocking
    const edgeP = Math.hypot(p.pos.x, p.pos.y); // how close YOU are to the ropes

    let plan: Plan = ai.plan;
    if (eHp < 0.3 && (e.stam < 35 || eHp < pHp - 0.15)) plan = 'recover'; // hurt and tired → survive, recover, pick its moment
    else if (pHp < 0.26) plan = 'finish'; // smells blood
    else if (this.roundTime < 16 && eHp > pHp + 0.08) plan = 'stall'; // ahead with the clock running out → run it down
    else if (s.time < 4.5) plan = 'scout'; // start of a round: feel you out first
    else if (aggr > 0.85) plan = 'counter'; // you rush → it waits and punishes
    else if (turtle > 0.4 || aggr < 0.3) plan = 'pressure'; // you turtle / stall → it comes forward
    else if (edgeP > RING - 5.5) plan = 'trap'; // you are drifting to the ropes → cut the ring off
    else plan = Math.random() < 0.55 ? 'pressure' : 'counter';

    if (plan !== ai.plan) {
      ai.plan = plan;
      ai.planT = 0;
      ai.cond = 0;
      // a plan change also resets the rhythm, so the switch is visible
      ai.pressure = plan === 'pressure' || plan === 'finish' || plan === 'trap';
      ai.moodT = 4;
    }
  }

  /** the ideal distance it wants to hold for the current plan */
  private planRange(scale: number) {
    switch (this.ai.plan) {
      case 'pressure':
      case 'finish':
        return 2.9 * scale;
      case 'trap':
        return 3.2 * scale;
      case 'counter':
        return 4.5 * scale; // just outside your reach, so your punches fall short
      case 'scout':
        return 4.8 * scale;
      case 'recover':
        return 7.5 * scale;
      default:
        return 9.5 * scale; // stall
    }
  }

  private aiDefended(kind: 'block' | 'dodge', seq: number) {
    const ai = this.ai;
    ai.punishSeq = seq; // this move is already accounted for
    ai.defStreak = Math.min(6, ai.defStreak + 1);
    ai.defT = 3.2;
    const p = this.def.punish * (kind === 'dodge' ? 1 : 0.7);
    if (Math.random() < p) {
      ai.punishT = (kind === 'dodge' ? 0.55 : 0.4) * (1 + (this.iq - 1) * 0.05); // the counter window is longer for a smarter AI
      ai.cool = 0;
      ai.blockT = 0;
    }
  }

  private enemyReact(m: Move) {
    const e = this.enemy;
    const ai = this.ai;
    const def = this.def;
    ai.habit[m.id] = Math.min(8, ai.habit[m.id] + 1);
    ai.scout.atk += 1; // every punch you throw goes into the dossier
    const iq = this.iq;
    const sq = Math.sqrt(iq);
    if (e.dodgeT > 0 || ai.reactT >= 0) return;
    if (e.state !== 'idle') {
      // a smart fighter bails out of its own wind-up / recovery to defend; a low IQ cannot do that
      const bail = iq >= 3 && e.state === 'attack' && !!e.move && (e.tellT > 0 || e.impacted) && !isOD(e.move.id);
      if (!bail || Math.random() > Math.min(0.95, 0.2 + iq * 0.07)) return;
      e.state = 'idle';
      e.move = null;
      e.tellT = 0;
      e.queued = null;
      e.runStrike = false;
      e.ippoStrike = false;
      ai.combo = 0;
    }
    const d = this.player.pos.distanceTo(e.pos);
    if (d > m.reach * this.player.scale + (iq >= 3 ? 3.2 : 1.8)) return; // a genius also reads dash-ins from further away
    // defending several times in a row tires the reflexes; a smarter AI tires far more slowly
    const fatigue = Math.max(0.3, 1 - ai.defStreak * (0.13 / sq));
    const hab = 1 + Math.min(0.7 + (iq - 1) * 0.03, (ai.habit[m.id] - 1) * 0.13 * def.adapt);
    const cap = iq >= 10 ? 0.995 : iq >= 3 ? 0.97 : iq >= 2 ? 0.95 : this.ultra ? 0.94 : 0.88;
    const p = Math.min(cap, def.react * hab * fatigue);
    if (Math.random() > p) return;
    let act: 'block' | 'side' | 'back';
    if (m.id === 'grab') act = Math.random() < 0.5 ? 'back' : 'side'; // blocking is useless vs throws
    else if (m.id === 'slam') act = Math.random() < 0.7 ? 'back' : 'side';
    else if (m.id === 'bolt') act = Math.random() < 0.65 ? 'side' : 'back'; // a straight: sidestepping it is the answer
    else if (m.id === 'hook') act = Math.random() < def.dodge ? 'back' : 'block'; // wide sweep: sidestep fails
    else if (m.id === 'upper') act = Math.random() < def.dodge * 0.8 ? 'back' : 'block';
    else act = Math.random() < def.dodge ? 'side' : 'block'; // straights are sidestepped
    ai.reactAct = act;
    // reaction time: 0.17–0.27 s at 1× used to be slower than a jab (it lands in ~0.14 s), so jabs could never be defended.
    // Now 1× is a little faster, and a higher IQ shortens it a lot (10× ≈ 0.03 s).
    const rt = 0.07 + Math.random() * 0.1 + (1 - def.react) * 0.13;
    ai.reactT = Math.max(0.03, rt / (iq <= 1 ? 1.15 : Math.pow(iq, 0.85)));
  }

  private pickAiMove(e: Fighter, chain: MoveId | null, dist: number): MoveId {
    const ai = this.ai;
    const pl = this.player;
    if (this.def.slam && e.meter >= 100 && ai.combo <= 1) {
      // STRATEGIST: Overdrive is a finisher, not something to dump the moment the meter fills. It waits for a
      // moment you cannot answer — you are staggered, hurt, pinned on the ropes — or until it has held it too long.
      if (this.strat) {
        const cornered = Math.hypot(pl.pos.x, pl.pos.y) > RING - 3.5;
        const open = pl.state === 'stagger' || pl.state === 'air' || pl.tauntT > 0;
        const kill = pl.hp / pl.maxHp < 0.3;
        if (!(open || kill || (cornered && ai.plan !== 'scout')) && ai.holdOD < 9) return dist > 4.2 * e.scale ? 'cross' : 'jab';
      }
      e.meter = 0;
      ai.holdOD = 0;
      return dist > 4.0 * e.scale || Math.random() < 0.5 ? 'bolt' : 'slam';
    }
    if (chain) {
      const seq: Partial<Record<MoveId, MoveId[]>> = { jab: ['cross', 'cross', 'hook'], cross: ['hook', 'upper', 'jab'], hook: ['upper', 'cross'], upper: ['jab'] };
      const opts = seq[chain];
      if (opts) return opts[Math.floor(Math.random() * opts.length)];
    }
    // ---- STRATEGIST: conditioning + exploiting the dossier ----
    if (this.strat && !chain) {
      const s = ai.scout;
      const obs = Math.max(1, s.time);
      // CONDITIONING: show the same harmless setup two or three times so you start defending it the same way,
      // then break the pattern with the launcher you are no longer ready for.
      if (ai.cond >= 2 + Math.floor(Math.random() * 2)) {
        ai.cond = 0;
        const breaker: MoveId = pl.blocking || s.block / obs > 0.35 ? 'grab' : 'upper';
        ai.lastId = breaker;
        return breaker;
      }
      // hard reads on how you fight
      let pick: MoveId | null = null;
      if (pl.ippo) pick = 'grab'; // peek-a-boo slips punches but cannot escape a throw
      else if (pl.stam < 26) pick = 'cross'; // exhausted guard → batter it until it breaks
      else if (pl.sprinting || pl.speed > 8) pick = 'upper'; // intercept a runner
      else if (s.dodge / obs > 0.45) pick = 'hook'; // a dodger gets caught by the wide sweep
      else if (s.block / obs > 0.45) pick = Math.random() < 0.6 ? 'grab' : 'upper';
      if (pick && pick !== ai.lastId) {
        ai.lastId = pick;
        ai.cond = 0;
        return pick;
      }
      // otherwise keep feeding the setup it is conditioning you with
      const setup: MoveId = ai.condId || (Math.random() < 0.6 ? 'jab' : 'cross');
      ai.condId = setup;
      ai.cond++;
      ai.lastId = setup;
      return setup;
    }

    // READ THE HUMAN (IQ ≥ 2): guard-break a tired player, catch a runner, crack a turtle
    if (this.iq >= 2 && !chain) {
      const pl = this.player;
      if (Math.random() < Math.min(0.9, (this.iq - 1) * 0.2)) {
        let pick: MoveId | null = null;
        if (pl.stam < 28) pick = Math.random() < 0.5 ? 'jab' : 'cross'; // a few blocked jabs empty an exhausted guard
        else if (pl.sprinting || pl.speed > 8) pick = 'upper'; // a runner cannot dodge an uppercut
        else if (pl.blocking) pick = Math.random() < 0.5 ? 'hook' : 'upper';
        if (pick && pick !== this.ai.lastId) {
          this.ai.lastId = pick;
          return pick;
        }
      }
    }
    // spacing-aware openers
    const far = dist > 3.7 * e.scale;
    const choose = (): MoveId => {
      const roll = Math.random();
      if (far) return roll < 0.5 ? 'cross' : roll < 0.8 ? 'jab' : 'hook';
      return roll < 0.3 ? 'jab' : roll < 0.52 ? 'cross' : roll < 0.8 ? 'hook' : 'upper';
    };
    let id = choose();
    // a smart AI avoids repeating itself, so it cannot be baited by a pattern
    if (this.iq >= 2 && id === this.ai.lastId && Math.random() < 0.6) id = choose();
    return id;
  }

  private updateEnemyAI(dt: number) {
    const e = this.enemy;
    const p = this.player;
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
    const pDown = p.state === 'down' || p.state === 'ko';

    // ---- STRATEGIST: watch the human, then commit to a game plan ----
    if (this.strat) {
      this.scoutPlayer(dt);
      this.updatePlan(dt);
      ai.holdOD += dt;
    }

    // switch between pressure and cautious phases
    if (ai.moodT <= 0) {
      ai.pressure = Math.random() < 0.3 + def.aggro * 0.55;
      ai.moodT = 3 + Math.random() * 4;
    }

    // hit-confirmed string chaining
    if (e.state === 'attack' && e.move && ai.combo > 0 && e.hitConfirmed && e.impacted && this.canCancel(e) && !pDown && p.state !== 'air') {
      this.startMove(e, this.pickAiMove(e, e.move.id, e.pos.distanceTo(p.pos)), true); // true combo → short warning
      ai.combo--;
      if (ai.combo <= 0) ai.cool = def.rest * (ai.pressure ? 0.5 : 0.9) * (0.6 + Math.random() * 0.9);
      return;
    }
    if (e.state !== 'idle' || e.dodgeT > 0) return;

    // WAKE-UP DEFENCE: right after being knocked about or getting up, a smart fighter covers up instead of swinging blindly
    if (this.iq >= 2 && e.softT > 0.3 && ai.blockT <= 0 && Math.random() < dt * (this.iq >= 10 ? 14 : this.iq * 2.2)) ai.blockT = 0.45;

    // whiff detection: the player threw something that hit nothing → open to a counter
    if (p.state === 'attack' && p.move && p.impacted && !p.hitConfirmed && ai.punishSeq !== p.moveSeq) {
      ai.punishSeq = p.moveSeq;
      ai.scout.whiff += 1;
      ai.scout.atk += 1;
      if (Math.random() < def.punish) {
        ai.punishT = 0.5;
        ai.cool = 0;
        ai.blockT = 0;
        ai.reactT = -1;
      }
    }

    if (ai.reactT >= 0) {
      ai.reactT -= dt;
      if (ai.reactT < 0) {
        const f = this.toward(e, p);
        const side = new THREE.Vector2(-f.y, f.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
        if (ai.reactAct === 'block') ai.blockT = 0.5 + Math.random() * 0.35 + Math.min(0.5, (this.iq - 1) * 0.06); // a smart guard stays up longer
        else if (ai.reactAct === 'side') {
          if (!this.startDodge(e, side, 'side')) ai.blockT = 0.5;
        } else if (ai.reactAct === 'back') {
          if (!this.startDodge(e, f.clone().multiplyScalar(-1).addScaledVector(side, 0.35).normalize(), 'back')) ai.blockT = 0.5;
        }
        ai.reactAct = '';
      }
    }
    e.blocking = ai.blockT > 0 && e.stam > 0;

    const dist = e.pos.distanceTo(p.pos);
    const f = this.toward(e, p);
    const r = new THREE.Vector2(-f.y, f.x);
    const sp = def.speed * 1.2 * (e.blocking ? 0.4 : 1);

    // ---- queued follow-up (dash-in punish) ----
    if (ai.queued && ai.queuedT > 0 && !e.blocking) {
      if (dist <= 4.2 * e.scale) {
        const id = ai.queued;
        ai.queued = null;
        this.startMove(e, id);
        ai.cool = def.rest * 0.8;
        return;
      }
    } else ai.queued = null;

    // ---- movement: spacing, circling, wall awareness ----
    ai.strafeT -= dt;
    if (ai.strafeT < 0) {
      ai.strafeDir = Math.random() < 0.5 ? 1 : -1;
      ai.strafeT = 0.5 + Math.random() * 1.1;
    }
    const edge = Math.hypot(e.pos.x, e.pos.y);
    const toC = new THREE.Vector2(-e.pos.x, -e.pos.y);
    if (edge > RING - 3.2 && toC.lengthSq() > 0.01) {
      toC.normalize();
      const sgn = Math.sign(r.dot(toC)) || 1;
      ai.strafeDir = sgn; // circle out of the corner instead of backing into the ropes
    }
    // RING GENERALSHIP: while trapping, it does not circle at random — it keeps itself between you and the
    // middle of the ring, so every exchange walks you another step backwards into the ropes.
    if (this.strat && ai.plan === 'trap' && p.pos.lengthSq() > 0.01) {
      const outward = p.pos.clone().normalize(); // from the centre towards the player
      ai.strafeDir = Math.sign(r.dot(outward)) || ai.strafeDir;
      e.wish.addScaledVector(outward, sp * 0.45); // shade across to cut the escape route
    }
    const ideal = this.strat ? this.planRange(e.scale) : (ai.pressure ? 3.2 : 4.0) * e.scale;
    if (pDown) {
      if (dist > 7.5) e.wish.addScaledVector(f, sp * 0.6);
      else if (dist < 5.5) e.wish.addScaledVector(f, -sp * 0.5);
    } else if (dist > ideal + 0.3) e.wish.addScaledVector(f, sp);
    else if (dist < ideal - 0.7 && ai.cool > 0.3) e.wish.addScaledVector(f, -sp * 0.7);
    e.wish.addScaledVector(r, ai.strafeDir * sp * (ai.pressure ? 0.35 : 0.55));
    if (edge > RING - 2.4 && toC.lengthSq() > 0.01) {
      const k = Math.min(1, (edge - (RING - 2.4)) / 2.4);
      e.wish.addScaledVector(toC.clone().normalize(), sp * 0.8 * k);
    }
    if (dist > 9.5 && !pDown && e.dodgeCd <= 0 && Math.random() < dt * 0.9) this.startDodge(e, f.clone(), 'fwd');
    // cautious phase: occasionally hop back out of range to bait a whiff
    if (!ai.pressure && dist < 3.3 * e.scale && ai.cool > 0.2 && e.dodgeCd <= 0 && Math.random() < dt * 0.35 * def.punish * (1 + (this.iq - 1) * 0.12)) {
      if (this.startDodge(e, f.clone().multiplyScalar(-1), 'back')) {
        ai.punishT = 0.6;
        return;
      }
    }

    // ---- attack decisions ----
    const reachNow = 3.6 * e.scale;
    const canAtk = !pDown && (p.state !== 'air' || (def.react > 0.55 && Math.random() < 0.35));
    const punishing = ai.punishT > 0 && !e.blocking && canAtk;

    if (punishing) {
      if (dist <= reachNow) {
        const roll = Math.random();
        const id: MoveId = roll < 0.4 ? 'jab' : roll < 0.8 ? 'cross' : 'hook';
        this.startMove(e, id);
        ai.combo = Math.random() < def.punish * 0.7 ? 1 : 0;
        ai.punishT = 0;
        ai.cool = def.rest * 0.8 * (0.7 + Math.random() * 0.6);
        return;
      }
      if (dist < 8 && e.dodgeCd <= 0 && Math.random() < dt * 8) {
        if (this.startDodge(e, f.clone(), 'fwd')) {
          ai.queued = Math.random() < 0.5 ? 'cross' : 'jab';
          ai.queuedT = 0.7;
          ai.punishT = 0;
          return;
        }
      }
    }

    // ---- the plan decides WHETHER to engage at all ----
    if (this.strat && !pDown) {
      const pl = ai.plan;
      // running the clock down / catching its breath: stay away, guard, do not trade
      if ((pl === 'stall' || pl === 'recover') && dist < 5.5 * e.scale) {
        if (ai.blockT <= 0 && Math.random() < dt * 3) ai.blockT = 0.5;
        if (e.dodgeCd <= 0 && dist < 3.6 * e.scale && Math.random() < dt * 2.5) this.startDodge(e, f.clone().multiplyScalar(-1), 'back');
        if (pl === 'stall' || e.stam < 55) return; // refuse the exchange
      }
      // feeling you out: only long, safe probes, and it keeps its distance
      if (pl === 'scout' && dist < 4.2 * e.scale && ai.cool <= 0 && Math.random() < 0.55) {
        this.startMove(e, 'jab');
        ai.lastId = 'jab';
        ai.cool = 0.5 + Math.random() * 0.5;
        ai.combo = 0;
        return;
      }
      // waiting game: hop out of range to make you swing at air, then punish
      if (pl === 'counter' && dist < 3.6 * e.scale && e.dodgeCd <= 0 && ai.cool > 0.15 && Math.random() < dt * 2.2) {
        if (this.startDodge(e, f.clone().multiplyScalar(-1), 'back')) {
          ai.punishT = 0.75;
          return;
        }
      }
    }

    if (ai.cool <= 0 && dist <= reachNow && !e.blocking && canAtk) {
      // mind game: throws beat blocking
      if (p.blocking && p.state === 'idle' && Math.random() < 0.25 + def.react * 0.45) {
        this.startMove(e, 'grab');
        ai.combo = 0;
        ai.cool = def.rest * (0.9 + Math.random() * 0.8);
        return;
      }
      if (ai.combo <= 0) ai.combo = 1 + Math.floor(Math.random() * def.combo);
      const id = this.pickAiMove(e, null, dist);
      ai.lastId = id;
      this.startMove(e, id);
      ai.combo--;
      const rest = def.rest * (ai.pressure ? 0.55 : 1.15);
      ai.cool = ai.combo > 0 ? 0.05 + Math.random() * 0.1 : Math.max(0.3, rest * (0.6 + Math.random() * 0.9));
      // after its combo, a smart fighter covers up instead of standing open (low IQ: only now and then)
      if (ai.combo <= 0 && Math.random() < Math.min(0.95, (ai.pressure ? 0.2 : 0.5) + (this.iq - 1) * 0.07)) ai.blockT = 0.5 + Math.min(0.4, (this.iq - 1) * 0.05);
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
      const id: MoveId = f.meter >= 100 ? (Math.random() < 0.5 ? 'bolt' : 'slam') : r < 0.34 ? 'jab' : r < 0.6 ? 'cross' : r < 0.82 ? 'hook' : 'upper';
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

  // ------------------------------------------------------------ fighter update
  private updateFighter(f: Fighter, o: Fighter, dt: number) {
    f.hit = Math.max(0, f.hit - dt * 2.4);
    f.hitUp = Math.max(0, f.hitUp - dt * 2.6);
    f.flash = Math.max(0, f.flash - dt * 7);
    f.dash.multiplyScalar(Math.exp(-10 * dt));
    f.dodgeCd -= dt;
    f.counterT -= dt;
    f.handT = Math.max(0, f.handT - dt);
    f.aimT = Math.max(0, f.aimT - dt);
    f.counterCd = Math.max(0, f.counterCd - dt);
    f.dodgeWinT = Math.max(0, f.dodgeWinT - dt);
    f.queuedT -= dt;
    f.wallT -= dt;
    f.wallCd -= dt;
    f.wakeT -= dt;
    f.softT = Math.max(0, f.softT - dt);
    f.slipCd -= dt;
    // stability recovers once the flurry stops
    f.poiseT -= dt;
    if (f.poiseT <= 0) f.poise = Math.min(f.poiseMax, f.poise + POISE_REGEN * dt);
    // TAUNT: two chest thumps, Overdrive charge, and it ends if anything else happens
    if (f.tauntT > 0) {
      if (f.state !== 'idle' || f.dodgeT > 0) f.tauntT = 0;
      else {
        const was = f.tauntT;
        const fs = FREESTYLE[THREE.MathUtils.clamp(f.tauntStyle, 0, FREESTYLE.length - 1)];
        f.tauntT -= dt;
        // a show-off banks Overdrive — the longer and prouder the move, the more it pays
        f.meter = Math.min(100, f.meter + fs.meter * dt);
        // the beats of the move fire off its own progress clock, so sound, sparks and camera always land together
        for (const c of fs.cues) if (was > (1 - c.p) * fs.dur && f.tauntT <= (1 - c.p) * fs.dur) this.fsCue(f, c.s);
        if (f.tauntT <= 0) f.softT = Math.max(f.softT, 0.35);
      }
    }
    // DEMPSEY ROLL charge: it builds while you weave in peek-a-boo and fades when you leave the stance
    if (f.isPlayer && f.state !== 'attack') {
      if (f.ippo) f.rollCharge = Math.min(1, f.rollCharge + dt * (0.5 + (f.speed > 1 ? 0.2 : 0)));
      else f.rollCharge = Math.max(0, f.rollCharge - dt * 0.45);
    }
    f.glowBoost = Math.max(f.mode === 'victory' ? 1.5 : 0, f.glowBoost - dt * 1.5);
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
    if (f.dodgeT > 0) {
      f.dodgeT -= dt;
      const u = 1 - Math.max(0, f.dodgeT) / f.dodgeDur;
      f.invuln = f.dodgeInv && u > 0.08 && u < 0.85 ? 1 : 0;
      f.vel.copy(f.dodgeDir).multiplyScalar(f.dodgeSpeed * Math.pow(1 - u, 1.3));
      // the dodge just finished — the advantage window is open: the next strike comes out faster and hits harder
      if (f.dodgeT <= 0 && f.state === 'idle') f.dodgeWinT = DODGE_WIN;
    } else {
      f.invuln = 0;
      if (f.state === 'stagger' || f.state === 'ko' || f.state === 'air' || f.state === 'down') f.wish.set(0, 0);
      // acceleration-limited steering = momentum (ramps up, carries, brakes with weight)
      const moving = f.wish.lengthSq() > 0.01;
      const dx = f.wish.x - f.vel.x;
      const dy = f.wish.y - f.vel.y;
      const dl = Math.hypot(dx, dy);
      // Snappy: a sprint reaches top speed in ~0.3 s and stopping from a sprint takes ~0.4 s (it used to need 0.75 s to
      // get going and then skated ~4 units after the key was released).
      let acc = moving ? (f.sprinting ? 36 : 28) : f.speed > 7 ? 26 : 18;
      if (f.state === 'attack') acc = f.runStrike ? 7 : 11; // a running punch carries its momentum
      if (f.isPlayer && f.state !== 'attack') acc *= this.fwMul; // faster footwork also reacts faster
      if (moving && f.vel.x * f.wish.x + f.vel.y * f.wish.y < 0) acc *= 1.25; // reversing costs a bit more
      const maxStep = acc * dt;
      if (dl <= maxStep) f.vel.copy(f.wish);
      else f.vel.addScaledVector(new THREE.Vector2(dx / dl, dy / dl), maxStep);
    }
    f.kb.multiplyScalar(Math.exp(-(airborne ? 0.9 : f.state === 'down' ? 7 : 5) * dt));
    const nx = f.pos.x + (f.vel.x + f.kb.x + f.dash.x) * dt;
    const nz = f.pos.y + (f.vel.y + f.kb.y + f.dash.y) * dt;

    // ---- rope contact: the ropes stretch like a soft spring-damper, hold the body and ease it back
    const touch = RING_IN - BODY_R * f.scale;
    const hard = touch + FLEX;
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
      const vTot = (ax === 0 ? f.vel.x + f.kb.x + f.dash.x : f.vel.y + f.kb.y + f.dash.y) * sgn;
      const accel = ROPE_K * depth + ROPE_C * Math.max(0, vTot);
      if (ax === 0) f.kb.x -= sgn * accel * dt;
      else f.kb.y -= sgn * accel * dt;
      // walking into the rope: fade the intent out instead of fighting the spring
      const vv = (ax === 0 ? f.vel.x : f.vel.y) * sgn;
      if (vv > 0) {
        const cut = Math.min(vv, vv * Math.min(1, depth * 3 + 0.2) * 10 * dt);
        if (ax === 0) f.vel.x -= sgn * cut;
        else f.vel.y -= sgn * cut;
      }
      this.arena.ropePress(ax === 0 ? sgn * 20 : f.pos.x, ax === 1 ? sgn * 20 : f.pos.y, depth);
      if (fresh && vTot > 3.5 && f.wallCd <= 0) this.ropeImpact(f, ax === 0 ? sgn : 0, ax === 1 ? sgn : 0, vTot);
    }
    // absolute stop: the body can never pass the fully stretched rope
    const cx = THREE.MathUtils.clamp(nx, -hard, hard);
    const cz = THREE.MathUtils.clamp(nz, -hard, hard);
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
    if (f.state !== 'ko' && f.state !== 'down' && this.phase !== 'menu') {
      const target = Math.atan2(o.pos.x - f.pos.x, o.pos.y - f.pos.y);
      const locked = f.state === 'attack' && f.whooshed;
      const rate = locked ? (f.move?.id === 'hook' ? 4 : 0.8) : f.state === 'air' ? 3 : f.softT > 0 ? 4.5 : 8.5;
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
    if (imp > 7 && !f.bounced) {
      f.bounced = true;
      f.vy = imp * 0.3;
      this.landFx(f, imp);
    } else {
      f.vy = 0;
      if (f.state === 'air') {
        f.state = 'down';
        // the knockdown bank: a beat flat out, then the staged rise (the AI gets up a touch sooner at high IQ)
        f.downDur = 1.8 * (f.isPlayer ? 1 : 1 / (1 + (this.iq - 1) * 0.06));
        f.downT = f.downDur;
        f.riseU = 0;
        f.riseOut = 0;
        f.riseSteps = 0;
        // which shoulder he rolls onto: the side the fight is on, so the roll brings him up facing his man
        const to = this.toward(f, f.isPlayer ? this.enemy : this.player);
        f.riseDir = to.x * Math.cos(f.yaw) - to.y * Math.sin(f.yaw) >= 0 ? 1 : -1;
        f.fallT = 1;
        f.fallS.set(Math.min(1, f.tilt / 1.5));
        f.fallS.v = 1.2;
        f.tilt = 0;
        f.juggle = 0;
        f.comboTaken = 0;
        f.kb.multiplyScalar(0.4);
      }
      if (imp > 2) this.landFx(f, imp);
    }
  }

  private landFx(f: Fighter, imp: number) {
    const pw = Math.min(1, imp / 20);
    this.fx.ring(f.pos.x, f.pos.y, 0xc8d0e0, 4 + pw * 8, 0.55, 0.08);
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.2, f.pos.y), 14 + Math.floor(pw * 44), 4 + pw * 8, 0xb4b4c4, undefined, 1.4, 0.7, 6);
    this.fx.spark(new THREE.Vector3(f.pos.x, 0.4, f.pos.y), 6 + Math.floor(pw * 20), 6 + pw * 6, 0xffb060, undefined, 1.2, 0.6, 14);
    this.sfx.hit(0.3 + pw * 0.55);
    this.trauma = Math.min(1, this.trauma + 0.25 + pw * 0.5);
    this.camBump = Math.max(this.camBump, 0.2 + pw * 0.45);
    this.hype = Math.min(1, this.hype + 0.15);
    // the opponent hits the canvas → the crowd goes wild; if it is YOU, they gasp (a smaller reaction)
    if (this.phase === 'fight') this.crowdRoar(f.isPlayer ? 0.32 : 0.62, f.isPlayer ? 1.4 : 2.2);
  }

  /** first touch of the ropes: soft feedback; only a hard slam staggers (briefly) — never a big ping-pong */
  private ropeImpact(f: Fighter, wx: number, wz: number, vIn: number) {
    f.wallCd = 0.5;
    const p = Math.min(1, (vIn - 3) / 11);
    const strong = vIn > 7.5;
    if (strong) f.wallT = 1.0;
    f.dash.multiplyScalar(0.3);
    if (f.state === 'air') f.vy = Math.max(f.vy, 2.5 + p * 2.5);
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
    this.fx.spark(new THREE.Vector3(px, 3 * f.scale, pz), 6 + Math.floor(p * 20), 4 + p * 5, 0xffe0a0, new THREE.Vector3(-wx, 0.2, -wz), 1.2, 0.5, 10);
    this.sfx.ropeCreak(p);
    this.trauma = Math.min(1, this.trauma + 0.1 + p * 0.28);
    this.camBump = Math.max(this.camBump, 0.08 + p * 0.2);
    if (strong) {
      this.sfx.cheer(0.5);
      this.hype = Math.max(this.hype, 0.8);
      this.popup(new THREE.Vector3(f.pos.x, 6.4 * f.scale, f.pos.y), 'ROPE BOUNCE!', 'pop-crit');
    }
  }

  private separate() {
    const p = this.player;
    const e = this.enemy;
    if (p.state === 'air' || e.state === 'air') return;
    const minD = 3.2 * (p.scale + e.scale) * 0.5;
    const d = p.pos.distanceTo(e.pos);
    if (d >= minD || d < 0.001) return;
    const w = (f: Fighter) => (f.state === 'ko' ? 0 : f.state === 'down' ? 0.15 : 1);
    const pw = w(p);
    const ew = w(e);
    const tot = pw + ew;
    if (tot === 0) return;
    const dir = new THREE.Vector2().subVectors(p.pos, e.pos).multiplyScalar(1 / d);
    const push = minD - d;
    p.pos.addScaledVector(dir, (push * pw) / tot);
    e.pos.addScaledVector(dir, (-push * ew) / tot);
    for (const f of [p, e]) {
      f.pos.x = THREE.MathUtils.clamp(f.pos.x, -RING, RING);
      f.pos.y = THREE.MathUtils.clamp(f.pos.y, -RING, RING);
    }
  }

  // ------------------------------------------------------------ combat
  private beginStrike(f: Fighter, o: Fighter, m: Move) {
    const dir = this.toward(f, o);
    f.attackDir.lerp(dir, TRACK[m.id]).normalize();
    const d = f.pos.distanceTo(o.pos);
    const avg = (f.scale + o.scale) * 0.5;
    const allowed = o.state === 'ko' || o.state === 'down' ? 0 : Math.max(0, d - 3.4 * avg);
    const disp = Math.min(m.step * f.scale * 1.25 * (f.runStrike ? 1.6 : f.ippoStrike ? 1.5 : 1), allowed);
    if (f.runStrike) {
      // the whole run is thrown into the punch: dust burst at the planted foot + a big shake
      this.fx.ring(f.pos.x + dir.x * 0.6, f.pos.y + dir.y * 0.6, 0xc8d2e8, 5.5, 0.4, 0.07);
      this.fx.spark(new THREE.Vector3(f.pos.x, 0.2, f.pos.y), 22, 6, 0x9a9aaa, new THREE.Vector3(-dir.x, 0.1, -dir.y), 1.1, 0.5, 3);
      this.trauma = Math.min(1, this.trauma + 0.25);
      this.camPush += 0.3;
    }
    f.dash.addScaledVector(dir, disp * 10);
    this.sfx.whoosh(m.power);
    this.sfx.step(0.55 + m.power * 0.8);
    const fx = f.pos.x + dir.x * 0.9;
    const fz = f.pos.y + dir.y * 0.9;
    this.fx.ring(fx, fz, 0x9aa8c0, 2.2 * f.scale + m.power * 2.5, 0.35, 0.06);
    this.fx.spark(new THREE.Vector3(fx, 0.15, fz), 6 + Math.floor(m.power * 22), 3 + m.power * 4, 0x9a9aaa, undefined, 1.2, 0.4, 3);
    this.fx.flash(new THREE.Vector3(fx, this.aimY(f, m) * 0.7 * f.scale, fz), 0.7 + m.power * 1.6, 0xbfe6ff, 0.09); // the punch cuts the air
    if (f.isPlayer) {
      this.camPush += 0.08 + m.power * 0.12;
      this.camBump = Math.max(this.camBump, 0.08 + m.power * 0.14);
      this.trauma = Math.min(1, this.trauma + 0.05 + m.power * 0.12);
    }
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
      this.trauma = Math.min(1, this.trauma + 0.55);
    }
    if (m.id === 'slam') {
      this.fx.ring(a.pos.x - toA.x * 1.8, a.pos.y - toA.y * 1.8, 0xffb040, 14, 0.7);
      this.fx.ring(a.pos.x - toA.x * 1.8, a.pos.y - toA.y * 1.8, 0xffffff, 8, 0.45);
      this.trauma = Math.min(1, this.trauma + 0.7);
      this.fx.spark(new THREE.Vector3(a.pos.x - toA.x * 2.4, 0.3, a.pos.y - toA.y * 2.4), 60, 11, 0xffa040, undefined, 1.4, 1.0, 16);
    }

    // TIMED DODGE: the player pressed dodge while THIS very attack was winding up → it whiffs, wherever he stands
    if (d.isPlayer && d.dodgeFor === a.moveSeq) {
      d.dodgeFor = -1;
      this.perfectDodge(d);
      return;
    }

    if (dist > (m.reach + (a.runStrike ? 1.0 : 0)) * a.scale) return; // out of range (a running punch reaches further)

    // COUNTER STANCE (L): a strike that arrives inside the parry window is caught, not eaten. Works on any
    // attack — including the unblockable throw and the Overdrives — but the window is short, so it must be read.
    if (d.isPlayer && d.state === 'attack' && d.move && d.move.id === 'counter' && d.moveT <= PARRY_ACTIVE) {
      this.parryCounter(d, a, m);
      return;
    }

    // sidestep physics: the strike travels along a locked line
    const rel = new THREE.Vector2().subVectors(d.pos, a.pos);
    const lateral = Math.abs(rel.x * a.attackDir.y - rel.y * a.attackDir.x);
    const avg = (a.scale + d.scale) * 0.5;
    if (lateral > X.width * avg) {
      if (d.dodgeT > 0 || d.invuln > 0) {
        if (d.isPlayer) {
          d.counterT = 1.6;
          d.meter = Math.min(100, d.meter + 10);
          this.popup(new THREE.Vector3(d.pos.x, 6, d.pos.y), 'SIDESTEP!', 'pop-dodge');
          this.slowT = 0.3;
          this.slowScale = 0.4;
          this.sfx.dodge();
        } else {
          this.popup(new THREE.Vector3(d.pos.x, 6.5 * d.scale, d.pos.y), 'MISS', 'pop-info');
          this.aiDefended('dodge', a.moveSeq);
        }
      }
      return;
    }
    if (d.wakeT > 0) return;

    if (d.invuln > 0) {
      if (d.isPlayer) {
        d.counterT = 1.8;
        d.meter = Math.min(100, d.meter + 14);
        this.popup(new THREE.Vector3(d.pos.x, 6, d.pos.y), 'PERFECT DODGE!', 'pop-dodge');
        this.slowT = 0.5;
        this.slowScale = 0.3;
        this.flashAmt = 0.25;
        this.sfx.dodge();
      } else {
        this.popup(new THREE.Vector3(d.pos.x, 6.5 * d.scale, d.pos.y), 'MISS', 'pop-info');
        this.aiDefended('dodge', a.moveSeq);
      }
      return;
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
    // DEMPSEY ROLL: more damage the longer you weaved before throwing it; a full charge is a SMASH
    if (a.ippoStrike) {
      dmg *= 1 + 0.85 * a.strikeCharge;
      label = label || (a.strikeCharge > 0.85 ? 'DEMPSEY SMASH!' : 'DEMPSEY ROLL!');
      this.fx.ring(d.pos.x, d.pos.y, 0x7fe0ff, 4 + a.strikeCharge * 5, 0.4, 0.09);
      this.trauma = Math.min(1, this.trauma + 0.2 + a.strikeCharge * 0.3);
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
      d.kb.addScaledVector(away, m.knock * 0.45);
      a.kb.addScaledVector(toA, 0.6);
      this.fx.spark(hitPos, 24 + Math.floor(m.power * 26), 9 + m.power * 4, 0xffd27a, dirAD, 1, 0.55); // steel on steel: a shower of sparks
      this.fx.spark(hitPos, 6 + Math.floor(m.power * 10), 6, 0xffffff, dirAD, 1.2, 0.3);
      this.fx.flash(hitPos, 1.7 + m.power * 1.2, 0x9fd6ff, 0.14);
      this.fx.ring(hitPos.x, hitPos.z, 0xbfe4ff, 1.6 + m.power * 2, 0.25, hitPos.y);
      this.sfx.block(m.power);
      this.freeze = 0.05 + m.power * 0.035;
      this.frozenFighter = d;
      this.trauma = Math.min(1, this.trauma + 0.18 + m.power * 0.26);
      this.camBump = Math.max(this.camBump, 0.08 + m.power * 0.14);
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
        this.freeze = 0.12;
        this.trauma = Math.min(1, this.trauma + 0.4);
        d.stam = 25;
      }
      if (d.isPlayer) this.flashAmt = Math.max(this.flashAmt, 0.15);
      return;
    }
    d.blocking = false;

    // ---------- clean hit ----------
    d.hp = Math.max(0, d.hp - dmg);
    d.hit = Math.min(1.3, 0.7 + dmg * 0.035);
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
    const armored = d.state === 'attack' && !!d.move && isOD(d.move.id);
    // the target is what the punch does to him: the body tears down stamina and stability
    if (AIM_DRAIN[aim] > 0) d.stam = Math.max(0, d.stam - dmg * AIM_DRAIN[aim]);
    // drain stability; it only breaks after a sustained flurry of clean hits
    if (!wasAir && !armored) {
      d.poise -= poiseCost(big) * AIM_POISE[aim] * (crit ? 1.6 : 1); // a counter-hit rocks you much harder
      d.poiseT = POISE_DELAY;
    }
    const broken = d.poise <= 0;
    if (broken) d.poise = d.poiseMax; // reset, so you cannot be chain-knocked-down
    let launched = false;
    if (wasAir) {
      d.juggle++;
      if (d.juggle >= 5 || isOD(m.id)) {
        d.vy = -17;
        label = 'SPIKE!';
        this.slowT = 0.25;
        this.slowScale = 0.4;
      } else {
        const pop = (m.id === 'jab' ? 7.5 : m.id === 'cross' ? 8.5 : m.id === 'hook' ? 9 : 10) * (d.juggle >= 3 ? 0.75 : 1);
        d.vy = pop;
        d.kb.addScaledVector(away, 2.5 + big * 2);
        label = label || `JUGGLE x${d.juggle}`;
      }
    // A LAUNCH (= being knocked down) now needs a real reason: a designated launcher, a fully committed special,
    // or a flurry that has emptied your stability. Ordinary jabs / crosses / hooks — even on a counter-hit — no
    // longer sweep you off your feet; they stagger you instead.
    } else if (!armored && (X.launch || broken || (a.runStrike && m.id === 'cross') || (a.ippoStrike && a.strikeCharge > 0.85 && m.id !== 'jab'))) {
      launched = true;
      d.state = 'air';
      d.move = null;
      d.queued = null;
      d.dodgeT = 0;
      d.juggle = 0;
      d.bounced = false;
      d.vy = m.id === 'slam' ? 21 : m.id === 'bolt' ? 18 : m.id === 'grab' ? 16 : 16.5;
      d.kb.copy(away).multiplyScalar((m.id === 'slam' ? 9 : m.id === 'bolt' ? 12 : m.id === 'grab' ? 8 : 4.5 + big * 3) * (a.runStrike ? 1.4 : 1));
      label = m.id === 'grab' ? 'THROW!' : broken && !X.launch ? 'KNOCKDOWN!' : label || 'LAUNCH!';
    } else if (!armored) {
      d.kb.addScaledVector(away, m.knock * 1.35 * AIM_KNOCK[aim] * (a.runStrike ? 1.5 : 1));
      // a smart AI shakes a hit off sooner, and where you hit him matters: head shots stun, body shots do not
      const sc = Math.max(0.5, 1 - d.comboTaken * 0.08) * (d.isPlayer ? 0.9 : 1 / (1 + (this.iq - 1) * 0.07));
      const stun = m.stun * sc * AIM_STUN[aim];
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

    // feedback — every part of the impact is scaled by how heavy the punch was
    this.freeze = 0.09 + big * 0.3 + (launched ? 0.07 : 0) + (a.runStrike ? 0.06 : 0);
    if (a.runStrike) {
      // all that momentum arrives at once: bigger shake, a short slow-motion beat and a camera shove
      this.trauma = Math.min(1, this.trauma + 0.3);
      this.camPush += 0.5;
      this.slowT = Math.max(this.slowT, 0.22);
      this.slowScale = 0.45;
    }
    // a genuinely heavy blow gets its own slow-motion beat, so you feel it land
    if (big >= 0.6 || launched) {
      this.slowT = Math.max(this.slowT, 0.16 + big * 0.14);
      this.slowScale = Math.min(this.slowScale, 0.42);
    }
    this.frozenFighter = d;
    this.trauma = Math.min(1, this.trauma + 0.34 + big * 0.62 + (d.isPlayer ? 0.1 : 0));
    d.flash = 1;
    // head shots snap his head back; body shots fold him over the punch (a negative hitUp drops the torso + head)
    d.hitUp = aim === AIM_BODY && !launched ? -(0.32 + big * 0.55) : m.kind === 'up' && !launched ? 0.4 + big * 0.7 : 0;
    d.dash.set(0, 0);
    this.camPush += 0.45 + big * 1.15;
    this.camBump = Math.max(this.camBump, 0.16 + big * 0.38);
    this.camRoll = d.hitSign * (0.02 + big * 0.06);
    this.fovKick = -(2.5 + big * 11);
    this.hype = Math.min(1, this.hype + 0.3 + big * 0.3);
    const hot = aim === AIM_BODY ? 0xffa050 : 0xffc060; // body shots burn warmer, head shots stay golden
    this.fx.spark(hitPos, 34 + Math.floor(big * 80), 10 + big * 13, hot, dirAD, 1, 0.9);
    this.fx.spark(hitPos, 12 + Math.floor(big * 28), 6 + big * 7, 0xffffff, dirAD, 1.3, 0.4);
    this.fx.spark(new THREE.Vector3(d.pos.x, 0.2, d.pos.y), 10 + Math.floor(big * 26), 4 + big * 6, 0xb9c2d6, undefined, 1.4, 0.65, 7); // floor debris
    this.fx.flash(hitPos, 2.6 + big * 4.6, 0xffd8a0, 0.22);
    this.fx.ring(hitPos.x, hitPos.z, aim === AIM_BODY ? 0xffb070 : 0xffe0a0, 2.4 + big * 4.6, 0.34, hitPos.y); // shock ring AT the impact point
    this.fx.ring(d.pos.x, d.pos.y, 0xffe0a0, 3.6 + big * 6, 0.45);
    this.fx.ring(d.pos.x, d.pos.y, 0xffffff, 2 + big * 3.4, 0.26, 0.1);
    this.sfx.hit(big);
    if (aim === AIM_BODY) this.sfx.crackle(0.35 + big * 0.5); // a body shot crunches
    this.sfx.cheer(0.3 + big * 0.7);
    // a player Overdrive that connects gets the director's punch-in on the point of impact — unless this is the
    // one that takes his head off, in which case the long HEAD RIP shot takes over instead
    const willRip = a.isPlayer && aim === AIM_HEAD && !d.decapitated && this.phase === 'fight';
    if (a.isPlayer && isOD(m.id) && !willRip) this.startCine('hit', hitPos, m.id === 'bolt' ? toA : undefined);
    if (this.phase !== 'menu') {
      if (d.isPlayer) {
        this.flashAmt = Math.min(1, 0.35 + big * 0.5);
        this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,40,20,0) 35%, rgba(255,30,20,0.85) 100%)';
        this.combo = 0;
      } else {
        this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.0) 45%, rgba(255,255,255,0.3) 100%)';
        this.flashAmt = Math.max(this.flashAmt, 0.12 + big * 0.35);
        this.combo++;
        this.comboT = 2.3;
      }
      if (launched && !isOD(m.id)) {
        this.slowT = Math.max(this.slowT, 0.3);
        this.slowScale = 0.45;
        this.fovKick = -10;
      }
      if (isOD(m.id)) {
        this.slowT = 0.9;
        this.slowScale = 0.25;
        this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,230,180,0.25) 0%, rgba(255,200,120,0.55) 100%)';
        this.flashAmt = 1;
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
      this.slowT = 1.15;
      this.slowScale = 0.2;
      this.flashAmt = 1;
      this.flashEl.style.background = 'radial-gradient(ellipse at center, rgba(255,255,255,0.1) 20%, rgba(150,230,255,0.75) 100%)';
      this.freeze = 0.2;
      this.trauma = 1;
      this.camPush += 1.1;
      this.camBump = 1;
      this.fovKick = -14;
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
    d.state = 'ko';
    d.move = null;
    d.blocking = false;
    d.fallT = 0;
    d.vy = Math.max(d.vy, 9);
    d.bounced = false;
    d.kb.copy(new THREE.Vector2(d.pos.x - a.pos.x, d.pos.y - a.pos.y).normalize()).multiplyScalar(8);
    this.slowT = 1.8;
    this.slowScale = 0.2;
    this.freeze = 0.3;
    this.trauma = 1;
    this.fovKick = -12;
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
    for (const f of [this.player, this.enemy]) this.animateFighter(f, f === this.player ? this.enemy : this.player, dt);
    if (this.phase === 'menu') {
      this.animateMenuHero(dt > 0 ? dt : 0.016);
    }
  }

  private animateMenuHero(dt: number) {
    if (!this.menuHero || this.phase !== 'menu') return;
    const t = this.time;
    let a0: Pose;
    let a1: Pose;
    let dp = 0.12;
    let tw = Math.sin(t * 0.8) * 0.02 + this.heroMouseX * 0.08;
    let ln = 0.03 + this.heroMouseY * 0.04;
    let rl = Math.sin(t * 1.2) * 0.015;

    switch (this.heroPose) {
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
        a0 = { sx: 0.06 + breath, sy: 0.03, sz: 0.28, ex: -0.42 - breath * 2 };
        a1 = { sx: 0.06 + breath, sy: -0.03, sz: 0.28, ex: -0.42 - breath * 2 };
        dp = 0.11 + breath * 0.8;
        break;
      }
    }

    this.heroYaw += (this.heroYawTarget - this.heroYaw) * Math.min(1, 10 * dt);
    this.menuHero.root.rotation.y = this.heroYaw;

    this.menuHero.animate(
      {
        arms: [a0, a1],
        twist: tw,
        lean: ln,
        lunge: 0,
        dip: dp,
        roll: rl,
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
        glow: 1.25 + Math.sin(t * 2.5) * 0.35,
        flash: 0,
        tilt: 0,
        dash: 0,
        dashF: 0,
        dashL: 0,
        lookX: this.heroMouseX,
        lookY: this.heroMouseY,
      },
      dt,
    );
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

    if (f.state === 'ko') {
      a0 = a1 = LIMP;
      ln = 0;
      dp = 0;
    } else if (f.state === 'air') {
      const fl = Math.sin(t * 14) * 0.35;
      a0 = P(-0.5 + fl, 0.1, 1.15, -0.5);
      a1 = P(-0.5 - fl, 0.1, 1.15, -0.5);
      ln = -0.2;
      dp = 0.05;
      kk = 20;
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
      const fl = Math.sin(t * 22) * 0.12;
      a0 = { ...STAGGER, sz: STAGGER.sz + fl, sx: STAGGER.sx - fl };
      a1 = { ...STAGGER, sz: STAGGER.sz - fl, sx: STAGGER.sx + fl };
      ln = -0.3;
      dp = 0.25;
      kk = 26;
    } else if (f.state === 'attack' && f.move) {
      const m = f.move;
      const s = sampleKeys(m.keys, f.moveT);
      // the player's stance hand decides which fist throws it; posing the other arm mirrors the motion,
      // so the follow-through, the swing and the wind-up all come from the correct side of the body
      const arm = this.armOf(f, m);
      const mirrored = m.arm !== 2 && arm !== m.arm;
      const strike = this.aimPose(f, m, s.p); // aiming at the body drops the whole punch onto the target
      if (arm === 0) a0 = strike;
      else if (arm === 1) a1 = strike;
      else a0 = a1 = strike;
      tw = s.twist * (mirrored ? -1 : 1) * (f.ippoStrike ? 1.35 : 1);
      if (f.tellT > 0) tw += Math.sin(f.animT * 46) * 0.03; // the held wind-up trembles
      ln = s.lean + (f.runStrike ? 0.22 : f.ippoStrike ? 0.16 : 0); // leaning into it
      lg = s.lunge * (f.runStrike ? 1.3 : 1) * (f.aim === AIM_BODY ? 0.94 : 1);
      dp = s.dip + (this.aimsLow(f, m) ? 0.1 : 0); // and you sit down into a body shot
      kk = 75;
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
      // sprinting: elbows bent and driving, torso leaning into the run
      // same S-curve as the legs in robot.ts (6.4 → 9.6), so arms, body and feet always agree on "how much of a run is this"
      const ru = THREE.MathUtils.clamp((f.speed / f.scale - 6.4) / 3.2, 0, 1);
      const run = ru * ru * (3 - 2 * ru);
      if (run > 0.01) {
        a0 = lerpPose(a0, RUNARM, run);
        a1 = lerpPose(a1, RUNARM, run);
        ln = lerp(ln, 0.16, run);
        dp = lerp(dp, 0.2, run);
      }
    }

    if (f.dodgeT > 0 && f.state === 'idle') {
      const fw = this.toward(f, o);
      const dot = f.dodgeDir.x * -fw.y + f.dodgeDir.y * fw.x;
      const back = -(f.dodgeDir.x * fw.x + f.dodgeDir.y * fw.y);
      const du = 1 - Math.max(0, f.dodgeT) / f.dodgeDur;
      const burst = Math.sin(Math.PI * Math.min(1, du * 1.05)); // load → push → settle
      rl = dot * 0.2 * burst;
      ln = 0.08 + -back * 0.15 * burst;
      dp = 0.16 + 0.2 * burst;
    }

    // critically-damped / slightly under-damped springs → weighty motion with follow-through
    const atk = f.state === 'attack';
    const soft = f.softT > 0 ? Math.max(0.4, 0.45 + 0.55 * (1 - f.softT / 0.9)) : 1; // ease back to normal
    const hzA = Math.sqrt(kk) * 1.9 * soft;
    const zA = atk ? 0.66 : 0.82;
    const tgt = [a0, a1];
    for (let i = 0; i < 2; i++) {
      const ps = tgt[i];
      const sp = f.armS[i];
      f.arms[i] = {
        sx: sp[0].update(ps.sx, hzA, zA, dt),
        sy: sp[1].update(ps.sy, hzA, zA, dt),
        sz: sp[2].update(ps.sz, hzA, zA, dt),
        ex: sp[3].update(ps.ex, hzA, zA, dt),
      };
    }
    const hzB = (atk ? 10.5 : f.state === 'stagger' ? 8 : 4.6) * soft;
    const zB = atk ? 0.74 : 0.86;
    f.twist = f.bodyS.twist.update(tw, hzB, zB, dt);
    f.lean = f.bodyS.lean.update(ln, hzB, zB, dt);
    f.lunge = f.bodyS.lunge.update(lg, hzB, 0.8, dt);
    f.dip = f.bodyS.dip.update(dp, atk ? 9 : 5.5, 0.8, dt);
    f.roll = f.bodyS.roll.update(rl, 6, 0.8, dt);

    // fall / get-up through a spring: quick, slightly bouncy drop and a slow, smooth rise
    const fallTarget = f.state === 'ko' ? 1 : f.state === 'down' ? f.fallT : 0;
    const dropping = fallTarget > f.fallS.x;
    const e = THREE.MathUtils.clamp(f.fallS.update(fallTarget, f.state === 'ko' ? 1.8 : dropping ? 2.6 : 1.2, f.state === 'ko' ? 0.65 : dropping ? 0.55 : 1.0, dt), 0, 1.06);
    // hit reactions: snap in fast, relax slowly
    f.hitV += (f.hit - f.hitV) * (1 - Math.exp(-(f.hit > f.hitV ? 40 : 7) * dt));
    f.hitUpV += (f.hitUp - f.hitUpV) * (1 - Math.exp(-(f.hitUp > f.hitUpV ? 40 : 6) * dt));
    // place
    f.robot.root.position.set(f.pos.x, f.y, f.pos.y);
    const tiltTarget = f.state === 'air' ? (f.vy > 0 ? 0.75 : 1.2) : 0;
    f.tilt = lerp(f.tilt, tiltTarget, 1 - Math.exp(-9 * dt));
    f.robot.root.rotation.y = f.yaw;
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
        dash: f.dodgeT > 0 && f.state === 'idle' ? 1 : 0,
        dashF: f.dodgeDir.x * sy + f.dodgeDir.y * cy,
        dashL: f.dodgeDir.x * cy - f.dodgeDir.y * sy,
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
      const mine = !!m && (arm === 2 || arm === i);
      const emit = dt > 0 && f.state === 'attack' && mine && f.moveT >= m!.strikeAt - 0.02 && f.moveT <= m!.impact + 0.1;
      tmp.set(0, -1.0, 0.05);
      f.robot.fists[i].localToWorld(tmp);
      f.trails[i].width = 0.26 * f.scale * (m && isOD(m.id) ? 1.5 : 1);
      // CHARGE: in the last instant of the wind-up the fist that is about to land crackles with energy
      if (dt > 0 && f.state === 'attack' && mine && m!.power > 0.45 && !f.whooshed && f.moveT >= m!.strikeAt - 0.1 && Math.random() < 0.55) {
        this.fx.spark(tmp, 2, 3 + m!.power * 5, f.isPlayer ? 0x8fd0ff : 0xffb040, new THREE.Vector3(0, 0.25, 0), 0.7, 0.28, 2);
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
  /** the gameplay camera lives in cammath (pure maths, so it can be verified outside the browser) */
  private gameplayCam(gp: THREE.Vector3, gl: THREE.Vector3) {
    const res = gameplayShot(gp, gl, this.view, this.player, this.enemy, CAM_MODES[this.camMode], this.baseFov, this.aspect, RING + 11);
    this.camClose = res.camClose;
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
    const p = this.player;
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
      // ---------------- OVERDRIVE IMPACT: dolly in on the point of impact ----------------
      const k = seg(0, 0.3);
      const target = this.cineFocus.clone().addScaledVector(up, 0.25);
      const from = this.cineFrom.clone();
      const d = from.distanceTo(target);
      const push = Math.min(0.34, 3.2 / Math.max(1.2, d)); // never fly through the fighters
      tp.copy(from).lerp(target, push * k);
      tl.copy(this.cineFromLook).lerp(target, seg(0, 0.45));
      this.cineFovT = THREE.MathUtils.lerp(58, 46, k);
      this.camRoll += 0.02 * k * Math.sign(this.cineDir.x + this.cineDir.y || 1);
      if (u >= 1) this.cine = null;
      return;
    }

    // ---------------- OVERDRIVE CHARGE: a low hero angle on the fighter winding up ----------------
    const k = seg(0, 0.32) * (1 - seg(0.62, 1));
    const f = this.toward(p, e);
    const r = new THREE.Vector2(-f.y, f.x);
    const dist = THREE.MathUtils.lerp(7.6, 5.0, k);
    const orbit = 0.85;
    const from = new THREE.Vector3(
      p.pos.x - f.x * dist * Math.cos(orbit) + r.x * dist * Math.sin(orbit),
      THREE.MathUtils.lerp(4.4, 2.45, k),
      p.pos.y - f.y * dist * Math.cos(orbit) + r.y * dist * Math.sin(orbit),
    );
    tp.copy(this.camPos).lerp(from, k);
    tl.copy(this.camLook).lerp(new THREE.Vector3(p.pos.x, THREE.MathUtils.lerp(4.0, 4.35, k), p.pos.y), k);
    this.cineFovT = THREE.MathUtils.lerp(this.cineFov, 42, k);
    this.camRoll += 0.018 * k;
    if (u >= 1) this.cine = null;
  }

  private updateCamera(raw: number, dt: number) {
    const p = this.player;
    const e = this.enemy;
    const cam = this.camera;
    const f = this.toward(p, e);
    const gp = new THREE.Vector3();
    const gl = new THREE.Vector3();
    this.gameplayCam(gp, gl);

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
      const heroX = wide ? 0.40 : 0.0;
      const heroZ = 6.0;
      const camCenterY = 4.50;

      if (this.menuHero) {
        const showHero = this.menuCamMode === 'hero';
        this.menuHero.root.visible = showHero;
        this.menuHeroPedestal.visible = false; // cropped out
        this.menuHeroSpot.visible = showHero;
        this.menuHeroRim.visible = showHero;
        this.menuHeroFill.visible = showHero;
        this.menuScrimPlane.visible = showHero;
        this.menuHero.root.position.set(heroX, 0, heroZ);
        this.menuHeroSpot.position.set(heroX + 1.2, 8.2, heroZ + 4.0);
        this.menuHeroSpot.target.position.set(heroX, camCenterY, heroZ);
        this.menuHeroRim.position.set(heroX - 3.0, 6.5, heroZ - 2.0);
        this.menuHeroRim.target.position.set(heroX, camCenterY, heroZ);
        this.menuHeroFill.position.set(heroX, camCenterY, heroZ + 3.2);
        this.menuScrimPlane.position.set(0, camCenterY, 3.0);
      }

      if (this.menuCamMode === 'hero') {
        // Hero Front-View Showcase (Head down to Thighs, perfectly fit within camera screen, ZERO screenshake!)
        this.trauma = 0;
        this.camBump = 0;
        this.camPush = 0;
        this.camRoll = 0;
        this.fovKick = 0;

        // At fov 38°, tan(19°) = 0.3443. Distance 9.25 units covers 6.37 vertical units.
        // Helmet top is at y = 6.75 (generous 0.93 margin below top header bar).
        // Thighs and knees are at y = 1.85-3.60 (generous 0.53 margin above bottom dock).
        // Both head and thighs are 100% visible inside the camera screen without clipping.
        const distScale = aspect < 0.75 ? Math.min(1.25, 0.75 / aspect) : 1.0;
        const camDist = 9.25 * distScale;

        const camX = heroX;
        const camY = camCenterY;
        const camZ = heroZ + camDist;
        tp = new THREE.Vector3(camX, camY, camZ);
        tl = new THREE.Vector3(heroX, camCenterY, heroZ);
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

    if (direct) {
      this.camPos.copy(tp);
      this.camLook.copy(tl);
      if (this.phase !== 'intro') this.camInit = true;
    } else if (cineK > 0) {
      // a real operator grabbing the moment: fast, but never a teleport
      this.camPos.lerp(tp, 1 - Math.exp(-18 * raw));
      this.camLook.lerp(tl, 1 - Math.exp(-16 * raw));
    } else {
      // the camera follows faster when the footwork is faster, so a 3× sprint does not outrun it
      const fk = 1 + (this.fwMul - 1) * 0.55;
      this.camPos.lerp(tp, 1 - Math.exp(-5 * fk * raw));
      this.camLook.lerp(tl, 1 - Math.exp(-7 * fk * raw));
    }

    // ---- HARD SAFETY: whatever the easing did on its way to the aim, nothing important may leave the picture.
    //      Outside a cinematic beat we measure the shot we actually ended up with and walk the lens back — a robot
    //      cut in half by the edge of the frame is the one thing this camera is not allowed to do.
    if (cineK === 0 && (this.phase === 'fight' || this.phase === 'ko')) {
      const d0 = this.camPos.distanceTo(this.camLook);
      if (d0 > 0.8) {
        this.spillDir.copy(this.camPos).sub(this.camLook).multiplyScalar(1 / d0);
        this.spillPts.length = 0;
        this.spillPads.length = 0;
        fighterBox(this.spillPts, this.spillPads, camMode.ignoreSelf && this.phase === 'fight' ? [e] : [p, e]);
        const fly = this.decap.isOff(e.robot) ? this.decap.headObj(e.robot) : null;
        if (fly) {
          this.spillD.setFromMatrixPosition(fly.matrixWorld);
          this.spillPts.push(this.spillD.x, this.spillD.y, this.spillD.z);
          this.spillPads.push(0.9 * e.scale); // the severed head must not roll off screen either
        }
        // a touch wider than the lens really is: a hair of margin beats a helmet clipped by the frame edge
        const fov = this.baseFov + 2;
        const room = reachAlong(this.camLook, this.spillDir, RING + 11, 2.5, 12.5);
        const d = fitShot(this.view, this.camLook, this.spillDir, fov, this.aspect, this.spillPts, this.spillPads, d0, Math.min(d0 * 1.6 + 8, room), this.camPos);
        if (d > d0) this.camPos.copy(this.spillDir).multiplyScalar(d).add(this.camLook);
      }
    }

    cam.position.copy(this.camPos);
    if (this.phase !== 'menu' || this.menuCamMode !== 'hero') {
      this.camPush *= Math.exp(-8 * raw);
      this.camBump *= Math.exp(-9 * raw);
      this.camRoll *= Math.exp(-7 * raw);
      if (this.camPush > 0.001) {
        const dirv = this.camLook.clone().sub(cam.position).normalize();
        cam.position.addScaledVector(dirv, Math.min(0.9, this.camPush));
      }
      cam.position.y -= this.camBump;
      // handheld life: a slow drift so the lens never feels bolted to a rail (calmer during a cinematic beat)
      this.handPh += raw;
      const hand = (0.055 + this.hype * 0.05 + this.camClose * 0.05) * camMode.hand * (cineK > 0 ? 0.4 : 1);
      cam.position.x += Math.sin(this.handPh * 0.85) * hand;
      cam.position.y += Math.sin(this.handPh * 1.21 + 1.3) * hand * 0.7;
      cam.position.z += Math.cos(this.handPh * 0.73 + 0.6) * hand * 0.8;
      const s = this.trauma * this.trauma * (cineK > 0 ? 0.45 : 1);
      if (s > 0.0005) {
        cam.position.x += Math.sin(t * 61) * s * 0.55;
        cam.position.y += Math.sin(t * 73 + 1) * s * 0.45;
        cam.position.z += Math.sin(t * 53 + 2) * s * 0.55;
      }
      cam.lookAt(this.camLook);
      if (s > 0.0005) {
        cam.rotateZ(Math.sin(t * 47) * s * 0.06);
        cam.rotateX(Math.sin(t * 59) * s * 0.03);
      }
      cam.rotateZ(this.camRoll + Math.sin(this.handPh * 0.61) * hand * 0.03);
    } else {
      // In menu hero mode: ZERO shake, rock-solid lookAt!
      this.camPush = 0;
      this.camBump = 0;
      this.camRoll = 0;
      this.trauma = 0;
      cam.lookAt(this.camLook);
    }
    this.runFov += ((this.player.sprinting ? 4 : 0) - this.runFov) * (1 - Math.exp(-4 * raw));
    // the lens: gameplay breathes with the distance, a cinematic beat drives its own focal length
    this.cineFov += (this.cineFovT - this.cineFov) * (1 - Math.exp(-7 * raw));
    if (!this.cine && Math.abs(this.cineFov - this.baseFov) < 0.2) this.cineFov = this.baseFov; // fully handed back
    const gameFov = cineK > 0 || this.cine ? this.cineFov : this.baseFov;
    cam.fov = (this.phase === 'menu' ? (this.menuCamMode === 'hero' ? 38 : this.shot.fov) : gameFov) + this.fovKick + (cineK > 0 ? 0 : this.runFov);
    cam.updateProjectionMatrix();
    this.bloom.strength = 0.1 + this.trauma * 0.08 + this.flashAmt * 0.05;
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
      aimFlash: this.player.aimT,
      heroPose: this.heroPose,
      menuCamMode: this.menuCamMode,
    });
  }
}