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
    dur: 1.35,
    meter: 18,
    glow: 1.9,
    cues: [
      { p: 0.2, s: 'beat' },
      { p: 0.42, s: 'beat' },
      { p: 0.64, s: 'beat' },
      { p: 0.8, s: 'chin' },
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
  {
    // 7 — 1: the servo check — the arm walks down its own checklist: shoulder, elbow, wrist, one step at a time
    id: 7,
    key: 'Digit1',
    name: 'cek servo',
    tag: 'SISTEM OK!',
    say: 'Calibrating.',
    dur: 2.1,
    meter: 15,
    glow: 1.7,
    cues: [
      { p: 0.2, s: 'check' },
      { p: 0.52, s: 'check' },
      { p: 0.86, s: 'check' },
    ],
  },
  {
    // 8 — 2: the core overload — he rocks back, the reactor winds up, then the shockwave leaves the chest
    id: 8,
    key: 'Digit2',
    name: 'inti nyala',
    tag: 'INTI PENUH!',
    say: 'Reactor: hot.',
    dur: 2.4,
    meter: 20,
    glow: 3.0,
    cues: [
      { p: 0.3, s: 'charge' },
      { p: 0.56, s: 'charge' },
      { p: 0.76, s: 'roar' },
    ],
  },
  {
    // 9 — 3: the drill fists — both fists spin up in front of the chest, then stop dead on a metal clap
    id: 9,
    key: 'Digit3',
    name: 'bor tinju',
    tag: 'BOR MULAI!',
    say: 'Drilling.',
    dur: 2.3,
    meter: 17,
    glow: 2.0,
    cues: [
      { p: 0.24, s: 'spin' },
      { p: 0.46, s: 'spin' },
      { p: 0.68, s: 'spin' },
      { p: 0.9, s: 'clap' },
    ],
  },
  {
    // 10 — 4: the FIST CLASH — both gloves slammed together in front of the sternum, three times, sparks on every hit,
    // then a cocky chin-up "come get it"
    id: 10,
    key: 'Digit4',
    name: 'adu tinju',
    tag: 'ADU TINJU!',
    say: "Let's go!",
    dur: 1.6,
    meter: 20,
    glow: 2.2,
    cues: [
      { p: 0.2, s: 'clash' },
      { p: 0.4, s: 'clash' },
      { p: 0.6, s: 'clash' },
      { p: 0.8, s: 'chin' },
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
  // the windmill comes out of a full turn, so for that one move the arm is a turn away: same pose, and the tail
  // blend has to walk back the LONG way round, or the shoulder unwinds 360° in the last 12% of the move.
  // (The pose the function RETURNS is still exactly the guard: that is what the rig hands back to the game.)
  const base = freestyleOf(style).id === 5 ? Math.PI * 2 : 0;
  const rest = P(GUARD.sx - base, GUARD.sy, GUARD.sz, GUARD.ex);

  switch (freestyleOf(style).id) {
    // ------------------------------------------------------------------ 0: chest pound
    case 0: {
      // THREE fast chest thumps (snappy wind-up, hard landing) and a cocky chin-up at the end
      const hit = Math.max(bump(uc, 0.2, 0.11), bump(uc, 0.42, 0.11), bump(uc, 0.64, 0.11));
      const open = Math.max(bump(uc, 0.08, 0.1), bump(uc, 0.31, 0.09), bump(uc, 0.53, 0.09));
      const chin = S(uc, 0.7, 0.8) * (1 - S(uc, 0.86, 1)); // arms flung wide, chest out: "and what?"
      const sx = lerp(lerp(-0.55, -1.9, open) + hit * 0.55, -1.25, chin);
      const sz = lerp(lerp(0.35, 1.45, open) - hit * 1.25, 1.55, chin);
      const ex = lerp(lerp(-1.1, -2.0, open) - hit * 0.7, -0.5, chin);
      b.a0 = P(sx, -0.5 - hit * 0.5, sz, ex);
      b.a1 = P(sx, -0.5 - hit * 0.5, sz, ex);
      b.ln = -0.3 - open * 0.18 + hit * 0.32 - chin * 0.3;
      b.dp = 0.1 + hit * 0.16 - chin * 0.04;
      b.rl = Math.sin(uc * Math.PI * 6) * 0.05;
      b.tw = Math.sin(uc * Math.PI * 3) * 0.12;
      b.kk = 48;
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
    // ------------------------------------------------------------------ 7: servo check (the arm steps through its joints)
    case 7: {
      // three smooth STEPS (not a sweep): shoulder → elbow → fist, the way a machine walks down a checklist.
      // The left arm runs the list first, the right arm answers it, then the head ticks over on the last beat.
      const stairs = (x: number, n: number) => {
        const tt = clamp(x, 0, 1) * n;
        const i = Math.min(n - 1, Math.floor(tt));
        return (i + sm(clamp((tt - i) / 0.75, 0, 1))) / (n - 1);
      };
      const down = P(0.08, -0.1, 0.3, -0.5); // fist low at the hip
      const out = P(-0.25, -0.2, 1.45, -1.6); // arm out to the side, elbow folded 90°
      const fwd = P(-1.5, -0.15, 0.4, -0.12); // punched straight out, elbow locked — the check finished
      const poseAt = (v: number): Pose => (v < 0.5 ? lerpPose(down, out, v * 2) : lerpPose(out, fwd, (v - 0.5) * 2));
      const l1 = S(uc, 0.06, 0.3);
      const r1 = S(uc, 0.4, 0.64);
      const enter = S(uc, 0.02, 0.12);
      const aL = poseAt(stairs(l1, 3));
      const aR = poseAt(stairs(r1, 3));
      b.a0 = lerpPose(GUARD, aL, enter);
      b.a1 = lerpPose(GUARD, aR, enter);
      const tick = S(uc, 0.74, 0.84); // the head ticks over as the check completes
      b.ln = 0.06 + enter * 0.04;
      b.dp = 0.14 + tick * 0.06;
      b.tw = Math.sin(uc * Math.PI * 4) * 0.05 * enter + tick * 0.1;
      b.rl = tick * 0.12;
      b.kk = 34;
      break;
    }
    // ------------------------------------------------------------------ 8: core overload (charge, then the burst)
    case 8: {
      // rock back with the elbows drawn behind the ribs, let the reactor wind up, then drive BOTH fists forward
      // and let the shockwave come off the chest plate
      const wind = S(uc, 0.06, 0.36) * (1 - S(uc, 0.5, 0.6));
      const fire = S(uc, 0.58, 0.7) * (1 - S(uc, 0.86, 1));
      const shake = Math.sin(uc * Math.PI * 30) * 0.03 * wind;
      const sx = lerp(lerp(GUARD.sx, 0.72, wind), -1.28, fire) + shake;
      const sz = lerp(lerp(GUARD.sz, 0.42, wind), 0.3, fire);
      const ex = lerp(lerp(GUARD.ex, -0.55, wind), -0.22, fire);
      b.a0 = P(sx, -0.5 + fire * 0.2, sz, ex);
      b.a1 = P(sx, -0.5 - fire * 0.2, sz, ex);
      b.ln = lerp(lerp(0.08, -0.4, wind), 0.3, fire);
      b.dp = 0.12 + wind * 0.22 - fire * 0.06;
      b.tw = Math.sin(uc * Math.PI * 6) * 0.03 * wind;
      b.rl = shake;
      b.kk = 26 + fire * 30;
      break;
    }
    // ------------------------------------------------------------------ 9: drill fists (spin up, stop dead)
    case 9: {
      // both fists describe small circles in front of the chest — three revolutions, servo whine, sparks off the
      // wrists — and then they stop dead on the clap
      const ph = uc * Math.PI * 6;
      const on = S(uc, 0.06, 0.2) * (1 - S(uc, 0.84, 0.94));
      const sx = -1.15 + Math.sin(ph) * 0.22 * on;
      const sz = 0.42 + Math.cos(ph) * 0.2 * on;
      const ex = -1.95 + Math.sin(ph * 1.5) * 0.16 * on;
      b.a0 = lerpPose(GUARD, P(sx, -0.45, sz, ex), on);
      b.a1 = lerpPose(GUARD, P(sx, -0.45, sz, ex), on);
      b.ln = 0.08 + on * 0.16;
      b.dp = 0.12 + on * 0.12 + Math.sin(ph * 2) * 0.03 * on;
      b.tw = Math.sin(ph) * 0.07 * on;
      b.rl = Math.cos(ph) * 0.05 * on;
      b.kk = 40;
      break;
    }
    // ------------------------------------------------------------------ 10: fist clash (3× gloves slammed together)
    case 10: {
      // wind-up: both arms swing wide and high — slam: both gloves meet dead-centre in front of the sternum (the
      // pose below puts the glove faces ~0.8 units apart, i.e. pressed together). Three times, each one faster and
      // harder, then the chin lifts and the arms spread: "come get it".
      const hit = Math.max(bump(uc, 0.2, 0.09), bump(uc, 0.4, 0.085), bump(uc, 0.6, 0.08));
      const open = Math.max(bump(uc, 0.09, 0.1), bump(uc, 0.3, 0.09), bump(uc, 0.5, 0.085));
      const on = S(uc, 0, 0.08);
      const chin = S(uc, 0.66, 0.78) * (1 - S(uc, 0.86, 1));
      const READY = P(-1.0, -0.42, 0.55, -1.75); // fists hovering apart in front of the chest between slams
      const WIDE = P(-1.25, -0.3, 1.05, -1.25); // the wind-up: arms flung out
      const MET = P(-0.85, -0.52, -0.3, -1.65); // the slam: gloves pressed together on the sternum line
      const CHIN = P(-1.3, -0.2, 1.6, -0.45); // chest out, arms spread, chin up
      let arm = lerpPose(lerpPose(READY, WIDE, open), MET, hit);
      arm = lerpPose(arm, CHIN, chin);
      b.a0 = lerpPose(GUARD, arm, on);
      b.a1 = lerpPose(GUARD, arm, on);
      b.ln = 0.14 + open * 0.04 + hit * 0.24 - chin * 0.32;
      b.dp = 0.14 + hit * 0.14 - chin * 0.05;
      b.tw = Math.sin(uc * Math.PI * 6) * 0.05;
      b.rl = Math.sin(uc * Math.PI * 9) * 0.03 * (1 - chin);
      b.kk = 52;
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
 * THE STAGES OF A KNOCK-DOWN GET-UP. All offset weights are exactly 0 at u = 0 (still flat on the floor) and
 * exactly 0 again at u = 1 (back on the feet, standing) — that is what lets robot.ts blend the staged rise over
 * the knock-down pose without a single pop, and what lets the game drop the whole get-up the moment it is done.
 * The saturating weights (hipUp, unroll, legs, tall) run 0 → 1: they are the ones the standing rig takes back.
 *
 *  side   — rolling off the back onto the shoulder (a yaw of a lying body: it turns him onto his side)
 *  head   — the head comes up FIRST: the chin lifts off the chest while the hips are still on the canvas
 *  tuck   — the knees draw up under the hips, so the legs are loaded before the body moves at all
 *  hipUp  — the hips lead: the push through the legs starts before the torso moves
 *  unroll — the torso follows on its own, slower clock
 *  fold   — the torso comes up THROUGH a deep forward curl (chest over the knees) instead of reclining through it.
 *           This is the single most important beat of the move: without it the middle of the rise reads as a man
 *           falling backwards onto his own hips.
 *  kneel  — the one-knee beat: one boot planted under him, the other knee still down on the canvas
 *  reach  — the hand-off: the free arm drives down and back past the hip, pushing off the lead knee
 *  tall   — the final straightening into the stance
 *  bounce — the settle after standing (a small dip, so the rise LANDS instead of just stopping)
 */
/**
 * THE COLLAPSE (knock-down / KO), staged on the fall weight `e` (0 upright → 1 flat on the canvas). A body does not
 * rotate stiffly about its hips onto its back: the knees give way FIRST and the hips drop, the torso is still nearly
 * upright while that happens and only then goes over, and it lands a little on one side with one knee up — never
 * a plank. Every term is zero at e = 0 (nothing pops at the start of the fall).
 */
export function fallStages(e: number) {
  const ec = clamp(e, 0, 1.06);
  return {
    buckle: Math.sin(Math.PI * S(ec, 0.0, 0.62)), // the knees fold, the hips drop out from under the torso
    lay: S(ec, 0.16, 1.0), // the torso goes over (late: the legs have already gone)
    side: S(ec, 0.4, 1.0), // ...and settles a little onto one side, knee up
  };
}

export function riseStages(u: number) {
  const uc = clamp(u, 0, 1);
  return {
    // ---- offset beats (zero at both ends) ----
    side: Math.sin(Math.PI * clamp(uc / 0.46, 0, 1)), // the roll onto the shoulder, done by the halfway mark
    head: Math.sin(Math.PI * S(uc, 0.02, 0.44)), // the look-up beat, before anything else has moved
    tuck: Math.sin(Math.PI * S(uc, 0.05, 0.62)), // the knees fold and swing in under the hips
    kneel: Math.sin(Math.PI * S(uc, 0.2, 0.74)), // the one-knee beat the leg staging is built on
    fold: Math.sin(Math.PI * S(uc, 0.26, 0.94)), // chest over the knees as he comes up
    reach: Math.sin(Math.PI * S(uc, 0.3, 0.68)), // the arm pushes off the knee on the way up
    bounce: Math.sin(Math.PI * S(uc, 0.86, 1)), // the landing dip
    // ---- saturating beats (0 → 1) ----
    hipUp: S(uc, 0.12, 0.74), // the hips climb all the way through the move
    unroll: S(uc, 0.24, 0.88), // the torso unfolds on a slower clock (the hips lead the whole way)
    legs: S(uc, 0.34, 0.86), // the standing rig only gets the legs back as he drives up out of the crouch
    tall: S(uc, 0.66, 0.98), // the final straightening
  };
}

/**
 * THE GET-UP FOOTWORK. Two plants on the beat of the rise: the REAR boot first (that is the one the knee tuck
 * hands the weight to), then the lead boot as the hips come over it. Each plant walks the foot home to its
 * standing stance spot, which is exactly where the leg IK wants it — so the boots are already under him, planted
 * flat, by the time the IK takes the legs back.
 *
 * Pure, and shared: Game.ts feeds it the payload and the tests drive the rig with the very same values, so the
 * animation that ships is the one that gets measured.
 */
export function getupFoot(riseU: number, steps: number) {
  const want = riseU > 0.42 ? 2 : riseU > 0.18 ? 1 : 0;
  if (want <= steps) return null;
  const foot = want === 1 ? 1 : 0;
  return { steps: want, foot, z: 0, x: 0, dur: 0.4, seq: 900 + want, lift: 0.26 };
}

/**
 * The arms of the get-up. He rolls onto one shoulder and slides that hand out flat on the canvas, FOLDS THE ELBOW
 * as it reaches, then drives the elbow straight under load — that straightening arm is what makes the push read as
 * bone and steel instead of a spring. The free arm swings across the chest for momentum, drives down past the hip
 * off the lead knee once the legs have the weight, and both hands settle into the guard as he comes up.
 *
 * (Measured on the real rig — posetest §4 — so the deepest knuckle probe lands on the canvas instead of guessing.)
 */
export function riseArms(u: number, dir: number): Beat {
  const uc = clamp(u, 0, 1);
  const d = dir < 0 ? -1 : 1;
  const st = riseStages(uc);
  const plant = d > 0 ? 0 : 1; // the shoulder he rolls onto pushes off the floor
  const slide = S(uc, 0.03, 0.18); // the hand slides out over the canvas
  const push = S(uc, 0.24, 0.46); // THE PUSH: the elbow drives straight and takes his weight
  const off = S(uc, 0.5, 0.7); // ...and rolls off the canvas once the legs are under him
  const swing = Math.sin(Math.PI * S(uc, 0.06, 0.8)); // the free arm's momentum swing across the chest
  const drive = st.reach; // then it drives back off the lead knee
  const ribs = S(uc, 0.62, 0.88); // ...and comes back to the ribs
  const back = S(uc, 0.88, 1); // the guard closes over the last beat
  // limp on the canvas — this is the exact pose the knock-down leaves him in, so the arms never pop at the start
  const U = P(0.1, 0, 0.35, -0.3);
  const REACH = P(0.2, -0.05, 0.7, -1.05); // hand out beside the hip, elbow folded
  const PRESS = P(0.34, 0.05, 1.0, -0.18); // pushed straight: the arm is a post
  const OFF = P(0.06, -0.12, 0.42, -1.4); // off the canvas, elbow soft again
  const HAUL = P(-0.8, -0.3, 0.42, -1.9); // momentum arm, folded across the chest
  const DRIVE = P(-0.72, -0.2, -0.2, -0.85); // hand down on the lead knee, arm long, pushing
  const RIBS = P(-0.5, -0.3, 0.16, -1.6); // hands back in front of the ribs
  const plantArm = lerpPose(lerpPose(lerpPose(U, REACH, slide), PRESS, push), OFF, off);
  const freeArm = lerpPose(lerpPose(lerpPose(U, HAUL, swing), DRIVE, drive), RIBS, ribs);
  let a0 = plant === 0 ? plantArm : freeArm;
  let a1 = plant === 0 ? freeArm : plantArm;
  a0 = lerpPose(a0, GUARD, back);
  a1 = lerpPose(a1, GUARD, back);
  // the shoulders shake the last of the roll out of them as he settles into the stance
  const shake = Math.sin(uc * Math.PI * 7) * S(uc, 0.88, 1) * 0.07;
  a0 = { ...a0, sz: a0.sz + shake };
  a1 = { ...a1, sz: a1.sz - shake };

  return {
    a0,
    a1,
    // a little twist out of the roll, but the heavy turning is done on the body group (see robot.ts).
    // Everything below rides on the `side` weight, so the first frame of the rise is the plain lying pose
    // (u = 0 is neutral in every channel: the landing springs have nothing to jump to) and the last frame is
    // the plain standing one.
    tw: d * 0.22 * st.side * (1 - st.unroll) + shake * 0.4,
    ln: 0.08 + st.side * (0.26 * (1 - st.unroll) + 0.22 * st.fold),
    dp: 0.12 + st.tuck * 0.18 + st.bounce * 0.13,
    rl: d * 0.2 * st.side * (1 - st.unroll) + shake * 0.11,
    kk: 20 + 26 * (1 - st.unroll), // the springs stay quick while a floor pose has to hold its line
  };
}
