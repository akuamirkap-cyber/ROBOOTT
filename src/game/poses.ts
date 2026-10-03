/**
 * SHOW-OFF POSES — the freestyle book and the knock-down get-up.
 *
 * Everything here is pure: given a progress `u` (0 → 1) and a couple of flags it returns the arm poses plus the
 * body channels (twist / lean / dip / roll) for one beat of a move. Game.ts feeds the result into the fighter's
 * spring rig the same way it feeds a punch sample, and robot.ts reads the same staging curves for the body, the
 * hips, the head and the legs — so the limbs and the torso can never disagree about what stage of the move it is.
 *
 * Keeping it in its own module also means it can be exercised outside the browser (see posetest.mjs / .__poseshot.mjs).
 */
import type { Pose } from './robot';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const sm = (u: number) => u * u * (3 - 2 * u);
/** 0 → 1 across [a, b], smoothed */
export const S = (u: number, a: number, b: number) => sm(clamp((u - a) / Math.max(0.0001, b - a), 0, 1));
/** 1 at `c`, falling to 0 at `c ± w` (a soft one-shot beat) */
export const bump = (u: number, c: number, w: number) => Math.max(0, 1 - Math.abs(u - c) / w);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const P = (sx: number, sy: number, sz: number, ex: number): Pose => ({ sx, sy, sz, ex });
export const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  sx: lerp(a.sx, b.sx, t),
  sy: lerp(a.sy, b.sy, t),
  sz: lerp(a.sz, b.sz, t),
  ex: lerp(a.ex, b.ex, t),
});

/** the fighting guard — every freestyle hands the arms back to it, so the return never reads as a snap */
export const GUARD: Pose = P(-0.72, -0.5, 0.04, -2.0);

/** one beat of a move: the arms plus the body channels the rig springs towards */
export interface Beat {
  a0: Pose;
  a1: Pose;
  tw: number;
  ln: number;
  dp: number;
  rl: number;
  kk: number;
}

// ============================================================================================ FREESTYLE BOOK
/**
 * THE FREESTYLE BOOK. Every move is something a 3 m steel boxing machine can actually do — shoulder rolls,
 * pneumatic flexes, a piston rev — rather than a human gesture it has no anatomy for.
 *
 * `dur` is how long the move holds, `meter` how much Overdrive it banks per second, and `cues` are the
 * one-shots (sound / sparks / crowd) fired when the move crosses that progress.
 */
export interface Freestyle {
  id: number;
  key: string;
  name: string; // HUD legend
  tag: string; // popup text
  say: string; // what the machine rumbles / the crowd hears
  dur: number;
  meter: number;
  glow: number;
  cues: { p: number; s: string }[];
}

export const FREESTYLE: Freestyle[] = [
  {
    // 0 — M: the classic chest pound
    id: 0,
    key: 'KeyM',
    name: 'pound dada',
    tag: 'TAUNT!',
    say: 'Come on!',
    dur: 1.5,
    meter: 16,
    glow: 1.6,
    cues: [
      { p: 0.26, s: 'beat' },
      { p: 0.52, s: 'beat' },
    ],
  },
  {
    // 1 — N: both fists overhead, belt raised (the old Zeus pose)
    id: 1,
    key: 'KeyN',
    name: 'angkat sabuk',
    tag: 'SANG JUARA!',
    say: 'I am the champion!',
    dur: 2.2,
    meter: 14,
    glow: 2.4,
    cues: [{ p: 0.48, s: 'raise' }],
  },
  {
    // 2 — B: the shoulder roll (Dempsey showboat): loose hands, shoulders rolling in a figure-8
    id: 2,
    key: 'KeyB',
    name: 'gulir bahu',
    tag: 'GULIR BAHU!',
    say: 'Come on, then!',
    dur: 2.0,
    meter: 18,
    glow: 1.5,
    cues: [
      { p: 0.25, s: 'roll' },
      { p: 0.75, s: 'roll' },
    ],
  },
  {
    // 3 — U: the double beckon — palms up, forearms flicking you in
    id: 3,
    key: 'KeyU',
    name: 'lambaikan tangan',
    tag: 'AYO SINI!',
    say: 'Bring it!',
    dur: 1.6,
    meter: 15,
    glow: 1.4,
    cues: [
      { p: 0.3, s: 'beckon' },
      { p: 0.6, s: 'beckon' },
    ],
  },
  {
    // 4 — I: the cable flex — arms out wide, elbows up, tension crackling through the shoulders
    id: 4,
    key: 'KeyI',
    name: 'pamer kabel',
    tag: 'TEGANG!',
    say: 'Feel that?',
    dur: 2.4,
    meter: 17,
    glow: 2.2,
    cues: [
      { p: 0.3, s: 'flex' },
      { p: 0.5, s: 'flex' },
      { p: 0.7, s: 'flex' },
    ],
  },
  {
    // 5 — Y: both arms windmill right around, then slam the fists together
    id: 5,
    key: 'KeyY',
    name: 'kincir tinju',
    tag: 'KINCIR LALU HENTAK!',
    say: 'Clang!',
    dur: 2.3,
    meter: 16,
    glow: 1.8,
    cues: [{ p: 0.78, s: 'clap' }],
  },
  {
    // 6 — O: the piston rev — drop low, elbows driving back, the chest reactor burning, then stand up
    id: 6,
    key: 'KeyO',
    name: 'gas piston',
    tag: 'MESIN NYALA!',
    say: 'Ha! More!',
    dur: 2.5,
    meter: 19,
    glow: 2.6,
    cues: [
      { p: 0.34, s: 'rev' },
      { p: 0.5, s: 'rev' },
      { p: 0.66, s: 'rev' },
      { p: 0.88, s: 'roar' },
    ],
  },
];

export const freestyleOf = (style: number): Freestyle => FREESTYLE[clamp(Math.round(style), 0, FREESTYLE.length - 1)];
export const freestyleByKey = (key: string): Freestyle | undefined => FREESTYLE.find((f) => f.key === key);

/**
 * One beat of a freestyle. `u` runs 0 → 1 across the move, `t` is the animation clock (for the idle wobble), and
 * anything a move does not need is simply left alone. Every move eases back into the guard over its last 12%,
 * so the springs that carry the arms home have almost nothing left to do.
 */
export function freestylePose(style: number, u: number, t: number): Beat {
  const uc = clamp(u, 0, 1);
  const b: Beat = { a0: GUARD, a1: GUARD, tw: 0, ln: 0.08, dp: 0.12, rl: 0, kk: 30 };
  const back = S(uc, 0.88, 1); // hand the arms back to the guard over the last beat
  // the windmill comes out of a full turn, so for that one move the guard is a turn away (same pose, no spin-back)
  const base = freestyleOf(style).id === 5 ? -Math.PI * 2 : 0;
  const rest = P(GUARD.sx + base, GUARD.sy, GUARD.sz, GUARD.ex);

  switch (freestyleOf(style).id) {
    // ------------------------------------------------------------------ 0: chest pound
    case 0: {
      const hit = Math.max(bump(uc, 0.26, 0.16), bump(uc, 0.52, 0.16));
      const open = Math.max(bump(uc, 0.1, 0.12), bump(uc, 0.4, 0.1), bump(uc, 0.78, 0.22));
      const sx = lerp(-0.55, -2.0, open) + hit * 0.55;
      const sz = lerp(0.35, 1.45, open) - hit * 1.25;
      const ex = lerp(-1.1, -2.0, open) - hit * 0.7;
      b.a0 = P(sx, -0.5 - hit * 0.5, sz, ex);
      b.a1 = P(sx, -0.5 - hit * 0.5, sz, ex);
      b.ln = -0.3 - open * 0.18 + hit * 0.3;
      b.dp = 0.1 + hit * 0.16;
      b.rl = Math.sin(uc * Math.PI * 4) * 0.05;
      b.tw = Math.sin(uc * Math.PI * 2) * 0.12;
      b.kk = 42;
      break;
    }
    // ------------------------------------------------------------------ 1: champion belt raise
    case 1: {
      const up = S(uc, 0.2, 0.5) * (1 - S(uc, 0.86, 1));
      const grip = S(uc, 0, 0.16) * (1 - S(uc, 0.16, 0.34));
      const shake = Math.sin(uc * Math.PI * 7) * 0.05 * up;
      const sx = lerp(-0.25 + grip * 0.22, -2.92 + shake, up);
      const sz = lerp(0.22, 0.6, up);
      const ex = lerp(-1.95 - grip * 0.35, -0.3, up);
      b.a0 = P(sx, -0.25, sz, ex);
      b.a1 = P(sx, -0.25, sz, ex);
      b.ln = grip * 0.3 - up * 0.62;
      b.dp = 0.1 + grip * 0.26 - up * 0.08;
      b.tw = Math.sin(uc * Math.PI * 2) * 0.07 * up;
      b.rl = Math.sin(uc * Math.PI * 3.5) * 0.04 * up;
      b.kk = 30;
      break;
    }
    // ------------------------------------------------------------------ 2: shoulder roll / showboat weave
    case 2: {
      // a figure-8: the shoulders roll one way while the hips answer the other way, hands staying low and loose
      const ph = uc * Math.PI * 2 * 1.6;
      const roll = Math.sin(ph);
      const fig8 = Math.sin(ph * 2);
      const loose = 0.5 + 0.5 * Math.sin(t * 6.5); // the fists never quite settle — servos idling
      b.a0 = P(0.3 - roll * 0.55 + loose * 0.06, -0.3 - fig8 * 0.3, 0.95 + roll * 0.35, -1.25 - loose * 0.2);
      b.a1 = P(0.3 + roll * 0.55 - loose * 0.06, -0.3 + fig8 * 0.3, 0.95 - roll * 0.35, -1.25 - (1 - loose) * 0.2);
      b.tw = roll * 0.42;
      b.rl = fig8 * 0.17;
      b.dp = 0.3 + Math.abs(roll) * 0.08;
      b.ln = 0.16 + fig8 * 0.05;
      b.kk = 24;
      break;
    }
    // ------------------------------------------------------------------ 3: double beckon ("bring it")
    case 3: {
      const flick = Math.max(bump(uc, 0.3, 0.15), bump(uc, 0.6, 0.15));
      const rise = S(uc, 0.05, 0.24) * (1 - S(uc, 0.86, 1));
      const sx = lerp(0.1, -1.2 + flick * 0.42, rise);
      const sz = lerp(0.4, 0.5, rise) + flick * 0.1;
      const ex = lerp(-0.4, -1.45 + flick * 0.95, rise);
      b.a0 = P(sx, -0.55 + flick * 0.18, sz, ex);
      b.a1 = P(sx, -0.55 - flick * 0.18, sz, ex);
      b.ln = -0.14 + flick * 0.1 + rise * 0.06;
      b.dp = 0.14 + flick * 0.06;
      b.tw = -0.08 + flick * 0.12;
      b.rl = flick * 0.03;
      b.kk = 26;
      break;
    }
    // ------------------------------------------------------------------ 4: cable flex (double biceps)
    case 4: {
      const up = S(uc, 0.12, 0.42);
      const flex = 0.5 + 0.5 * Math.sin(uc * Math.PI * 5);
      const hold = 1 - S(uc, 0.86, 1);
      const k = up * hold;
      b.a0 = P(lerp(0.1, -1.42 - flex * 0.12, k), lerp(0, 0.16, k), lerp(0.35, 1.06 + flex * 0.1, k), lerp(-0.3, -2.15 - flex * 0.3, k));
      b.a1 = P(lerp(0.1, -1.42 - (1 - flex) * 0.12, k), lerp(0, -0.16, k), lerp(0.35, 1.06 + (1 - flex) * 0.1, k), lerp(-0.3, -2.15 - (1 - flex) * 0.3, k));
      b.ln = -0.2 * k + 0.08 * (1 - k);
      b.dp = lerp(0.12, 0.1, k);
      b.tw = Math.sin(uc * Math.PI * 2) * 0.08 * k;
      b.rl = Math.sin(uc * Math.PI * 3) * 0.05 * k;
      b.kk = 34;
      break;
    }
    // ------------------------------------------------------------------ 5: windmill → fist clap
    case 5: {
      const spin = S(uc, 0.03, 0.56); // the full circle, accelerating into it
      const clap = bump(uc, 0.8, 0.1); // fists hammering together
      const ang = -Math.PI * 2 * spin;
      const sx = lerp(ang, -1.32 - Math.PI * 2, clap); // the fists keep going round into the clap (no spin-back)
      const sz = lerp(0.85, 0.06, clap);
      const sy = lerp(0, -0.85, clap);
      const ex = lerp(-0.28, -2.45, clap);
      b.a0 = P(sx, sy, sz, ex);
      b.a1 = P(sx, -sy, sz, ex);
      b.ln = -0.1 + spin * 0.06 + clap * 0.34; // the body snaps forward on the clap (also whips the head down)
      b.dp = 0.12 + clap * 0.2;
      b.tw = lerp(0, Math.sin(uc * Math.PI * 3) * 0.06, 1 - clap);
      b.rl = Math.sin(uc * Math.PI * 4) * 0.06;
      b.kk = 26;
      break;
    }
    // ------------------------------------------------------------------ 6: piston rev (drop low, rev, stand)
    case 6: {
      const drop = S(uc, 0.05, 0.3) * (1 - S(uc, 0.55, 0.88));
      const rev = bump(uc, 0.34, 0.06) + bump(uc, 0.5, 0.06) + bump(uc, 0.66, 0.06);
      const sx = lerp(0.1, 0.72 - rev * 0.25, drop);
      const sz = lerp(0.35, 0.5 + rev * 0.35, drop);
      const ex = lerp(-0.3, -0.5 - rev * 1.15, drop);
      b.a0 = P(sx, -0.1, sz, ex);
      b.a1 = P(sx, 0.1, sz, ex);
      b.ln = 0.5 * drop + rev * 0.08;
      b.dp = 0.12 + drop * 0.55;
      b.tw = Math.sin(uc * Math.PI * 3) * 0.05 * drop;
      b.kk = 30 + rev * 40;
      break;
    }
  }

  if (back > 0.001) {
    // the arms and the torso both relax towards the guard — the last beat of every show-off move
    b.a0 = lerpPose(b.a0, rest, back);
    b.a1 = lerpPose(b.a1, rest, back);
    b.tw = lerp(b.tw, 0, back);
    b.ln = lerp(b.ln, 0.08, back);
    b.dp = lerp(b.dp, 0.12, back);
    b.rl = lerp(b.rl, 0, back);
  }
  return b;
}

// ============================================================================================ GET-UP
/**
 * THE STAGES OF A KNOCK-DOWN GET-UP. All weights are exactly 0 at u = 0 (still flat on the floor) and exactly 0
 * again at u = 1 (back on the feet, standing) — that is what lets robot.ts blend the staged rise over the
 * knock-down pose without a single pop, and what lets the game drop the whole get-up the moment it is done.
 *
 *  side   — rolling off the back onto the shoulder (this is a yaw of a lying body: it turns him onto his side)
 *  hipUp  — the hips lead: the push through the legs starts before the torso moves at all
 *  unroll — the torso follows, later and faster, and the last of the lie disappears here
 *  tuck   — one knee tucks in and swings under the body to take the weight
 *  fold   — the torso comes up THROUGH a deep forward fold (chest over the knees) instead of reclining through it.
 *           This is the single most important beat of the whole move: without it the middle of the rise reads as
 *           a man falling backwards onto his own hips.
 *  tall   — the final straightening into the stance
 *  bounce — the settle after standing (a small dip so the rise lands instead of just stopping)
 */
export function riseStages(u: number) {
  const uc = clamp(u, 0, 1);
  return {
    side: Math.sin(Math.PI * clamp(uc / 0.62, 0, 1)),
    hipUp: S(uc, 0.06, 0.56),
    unroll: S(uc, 0.3, 0.72),
    tuck: Math.sin(Math.PI * S(uc, 0.1, 0.72)),
    fold: Math.sin(Math.PI * S(uc, 0.26, 0.82)),
    tall: S(uc, 0.62, 0.96),
    bounce: Math.sin(Math.PI * S(uc, 0.78, 1)),
  };
}

/**
 * The arms of the get-up. He rolls onto one shoulder, plants that hand flat on the canvas, swings the free arm
 * across his body to pull himself up, then both arms swing loose and settle into the guard.
 */
export function riseArms(u: number, dir: number): Beat {
  const uc = clamp(u, 0, 1);
  const d = dir < 0 ? -1 : 1;
  const st = riseStages(uc);
  const plant = d > 0 ? 0 : 1; // the shoulder he rolls onto pushes off the floor
  // press: the hand slides out and presses the canvas BEFORE the push starts (measured on the real rig —
  // posetest §4 — so the deepest fist probe lands exactly on the floor and the solver barely has to prop him up)
  const press = S(uc, 0.05, 0.27);
  const unweight = S(uc, 0.36, 0.68); // ...and it rolls off the canvas as the torso climbs through the fold
  const swing = Math.sin(Math.PI * S(uc, 0.1, 0.85));
  const low = S(uc, 0.5, 0.86); // both arms drop to the ribs on the way to the guard
  const back = S(uc, 0.86, 1);
  // limp on the canvas — this is the exact pose the knock-down leaves him in, so the arms never pop at the start
  const U = P(0.1, 0, 0.35, -0.3);
  const PLANT = P(0.24, 0.0, 1.02, -0.28); // flat on the floor beside the hip, elbow almost locked
  const PLANT_UP = P(0.1, -0.12, 0.34, -1.2); // the same arm, unweighted and hanging low beside the thigh
  const HAUL = P(-0.78, -0.38, 0.5, -1.7); // momentum arm: off the floor, folded across the chest
  const HAUL_OUT = P(-0.34, -0.18, 0.34, -1.45); // ...released, low in front of the ribs
  const plantArm = lerpPose(lerpPose(U, PLANT, press), PLANT_UP, press * unweight);
  const freeArm = lerpPose(lerpPose(U, HAUL, swing), HAUL_OUT, low);
  let a0 = plant === 0 ? plantArm : freeArm;
  let a1 = plant === 0 ? freeArm : plantArm;
  a0 = lerpPose(a0, GUARD, back);
  a1 = lerpPose(a1, GUARD, back);

  return {
    a0,
    a1,
    // a little twist out of the roll, but the heavy turning is done on the body group (see robot.ts)
    tw: d * 0.2 * (1 - st.unroll),
    // curled up while the hips are still doing the work, and straight by the time he is on his feet:
    // every term below is zero again at u = 1, so the settle pose starts from the plain neutral stance
    ln: 0.08 + (1 - st.unroll) * 0.26,
    dp: 0.12 + st.tuck * 0.22 + st.bounce * 0.22,
    rl: d * 0.2 * (1 - st.unroll),
    kk: 20 + 26 * (1 - st.unroll), // the springs stay quick while a floor pose has to hold its line
  };
}
