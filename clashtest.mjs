// VS FIST-CLASH validation harness — run it with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     npx esbuild src/game/Game.ts  --bundle --format=esm --platform=node --outfile=.__game.mjs  --external:three
//     node clashtest.mjs
// (or just `npm run test:clash`, which does all three)
//
// It drives the REAL Robot rig with the REAL clash tracks out of Game.ts — the same numbers the VS screen runs — and
// checks the four things that make a fist clash read as a clash instead of two arms waving near each other:
//   §1  the beat: both machines are wound up BEFORE the "2" of the count, and the gloves meet on the "1"
//   §2  the GEOMETRY, measured per vertex on every frame: the two gloves meet, and they never pass through each other
//   §3  the POWER: a real wind-up, a locked-out elbow, Overdrive weight on the throw, a hand that stays in guard
//   §4  the RIGHT hand: BOTH machines throw the right one — the arm on the inside, facing the middle
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';
import { GUARD, MOVES, sampleKeys, VS_CLASH_AT, VS_CLASH_AT_HIT, VS_CLASH_DUR, VS_CLASH_HIT, VS_CLASH_KEYS, VS_CLASH_KEYS_CROSS, VS_CLASH_POINT, vsClashState } from './.__game.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };
let fails = 0;
const ok = (label, cond, info = '') => {
  if (!cond) fails++;
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${label}${info ? '   ' + info : ''}`);
};
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
const V = new THREE.Vector3();
const mk = () => ({
  arms: [GUARD, GUARD],
  twist: 0, lean: 0.08, lunge: 0, dip: 0.12, roll: 0,
  vf: 0, vl: 0, af: 0, al: 0, yawRate: 0, hit: 0, hitSign: 1, hitUp: 0, fall: 0, air: 0, time: 0,
  glow: 0.45, flash: 0, tilt: 0, dash: 0, dashF: 0, dashL: 1,
});
/** the VS stage: the hero on the left mark, the opponent on the right one, both angled in at the middle */
const HERO_X = -2.75;
const FOE_X = 2.75;
const YAW = 0.42;

/** one rig, settled onto the clash pose sampled at `t` (the same thing the VS screen plays) */
function rigAt(t, side) {
  const c = vsClashState(side, t);
  const r = new Robot(STYLE, 1);
  r.snapFeet();
  r.root.position.set(side === 'hero' ? HERO_X : FOE_X, 0, 0);
  r.root.rotation.y = side === 'hero' ? YAW : -YAW;
  const a = mk();
  a.arms = c.arms;
  a.twist = c.twist;
  a.lean = c.lean;
  a.dip = c.dip;
  a.roll = c.roll;
  for (let i = 0; i < 130; i++) {
    a.time += D;
    r.animate(a, D);
  }
  r.root.updateMatrixWorld(true);
  return r;
}
const fist = (r, i) => {
  r.fists[i].updateWorldMatrix(true, false);
  return r.fists[i].getWorldPosition(V).clone();
};
/**
 * The GLOVE as it really is: every world-space vertex of the fist mesh (sub-sampled), plus its box. This — not the
 * pivot point — is what decides whether two 1.3 m gloves touch or pass through each other, so it is what §2 measures.
 */
const SUB = 3;
function cloud(fistObj, store = null) {
  const pts = store ?? [];
  const box = new THREE.Box3();
  fistObj.updateWorldMatrix(true, false);
  fistObj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += SUB) {
      V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(V.x, V.y, V.z);
      box.expandByPoint(V);
    }
  });
  return { pts, box, c: box.getCenter(new THREE.Vector3()) };
}
/** distance between two boxes (0 when they touch/overlap) — a SAFE LOWER BOUND on the real surface distance */
const boxGap = (a, b) => Math.hypot(
  Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
  Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
  Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z),
);
/** the real thing: the closest pair of glove vertices, brute force. Only paid where the boxes are already close. */
const surfaceGap = (A, B) => {
  let best = Infinity;
  for (let i = 0; i < A.pts.length; i += 3) {
    for (let j = 0; j < B.pts.length; j += 3) {
      const dx = A.pts[i] - B.pts[j];
      const dy = A.pts[i + 1] - B.pts[j + 1];
      const dz = A.pts[i + 2] - B.pts[j + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
};
const gloveAt = (t, side) => {
  const r = rigAt(t, side);
  return cloud(r.fists[vsClashState(side, t).arm]);
};

// The reference throw for the WEIGHT of the clash: the Overdrive straight the game already ships, driven through
// the same rig. The clash is meant to land at that weight, so the tests compare against it instead of a made-up
// number. (Both are target-space speeds — the fight's springs smooth what you actually see.)
const boltStep = (() => {
  let worst = 0;
  let prev = null;
  for (let t = 0; t <= 0.8; t += D) {
    const p = sampleKeys(MOVES.bolt.keys, t);
    const r = new Robot(STYLE, 1);
    r.snapFeet();
    r.root.position.set(HERO_X, 0, 0);
    r.root.rotation.y = YAW;
    const a = mk();
    a.arms = [p.p, GUARD];
    a.twist = p.twist;
    a.lean = p.lean;
    a.dip = p.dip;
    for (let i = 0; i < 130; i++) {
      a.time += D;
      r.animate(a, D);
    }
    r.root.updateWorldMatrix(true, true);
    const f = fist(r, 0);
    if (prev) worst = Math.max(worst, f.distanceTo(prev));
    prev = f;
  }
  return worst;
})();
const peakStep = (side, t0, t1) => {
  let worst = 0;
  let at = 0;
  let prev = fist(rigAt(t0, side), vsClashState(side, t0).arm);
  for (let t = t0 + D; t <= t1 + 1e-9; t += D) {
    const p = fist(rigAt(t, side), vsClashState(side, t).arm);
    const d = p.distanceTo(prev);
    if (d > worst) {
      worst = d;
      at = t;
    }
    prev = p;
  }
  return { worst, at };
};

// ============================================================================================== §1 the beat
console.log('\n§1  the beat: wound up BEFORE the "2", gloves meeting on the "1"');
{
  for (const [name, keys] of [['player', VS_CLASH_KEYS_CROSS], ['opponent', VS_CLASH_KEYS]]) {
    ok(`${name}: the track runs forward in time`, keys.every((k, i) => i === 0 || k.t > keys[i - 1].t), keys.map((k) => f2(k.t)).join(' < ') + ' s');
  }
  // the count reads 3 (0-1 s), 2 (1-2 s), 1 (2-3 s): the clash track starts VS_CLASH_AT into it, so a clash-time t
  // lands on the count at VS_CLASH_AT + t. The deepest coil of BOTH machines must be in before the "2" lands.
  const deepest = (keys) => keys.reduce((a, b) => (b.p.ex < a.p.ex ? b : a));
  for (const [name, keys] of [['player', VS_CLASH_KEYS_CROSS], ['opponent', VS_CLASH_KEYS]]) {
    const d = deepest(keys);
    const count = VS_CLASH_AT + d.t;
    ok(`${name}: fully coiled before the "2" (the "2" lands 1.00 s in)`, count <= 1.03, `deepest coil at ${f2(count)} s, elbow ${f2(d.p.ex)} rad`);
  }
  const heldAt = (side, t) => vsClashState(side, t).arms[1].ex;
  ok('...and both HOLD the load right through the "2"', heldAt('hero', 1.0) < -2.0 && heldAt('foe', 1.0) < -2.0, `elbow at 1.45 s into the count: player ${f2(heldAt('hero', 1.0))} · opponent ${f2(heldAt('foe', 1.0))} rad`);
  ok('...right up to the release (nothing drops early)', heldAt('hero', 1.3) < -2.0 && heldAt('foe', 1.0) < -2.0, 'the first machine only fires once the other fist is out');
  ok('the gloves meet exactly on the "1" of the count', Math.abs(VS_CLASH_AT_HIT - 2.0) < 0.06, `${f2(VS_CLASH_AT_HIT)} s into the 3 s count`);
  ok('...which is before the bell, so the transition can cover it', VS_CLASH_AT_HIT < 3.0, 'bell at 3.00 s');
  ok('the clash rides on past the hit (the lock HOLDS until the cover)', VS_CLASH_DUR > VS_CLASH_HIT, `held ${f2(VS_CLASH_DUR - VS_CLASH_HIT)} s after the impact`);
  const hero = peakStep('hero', 1.10, VS_CLASH_DUR + 0.3);
  const foe = peakStep('foe', 0.55, VS_CLASH_DUR + 0.3);
  ok('the player\'s cross lands at Overdrive weight', hero.worst > boltStep * 0.45 && hero.worst <= boltStep * 1.4, `${f2(hero.worst)} vs Overdrive ${f2(boltStep)} m/frame (peak at ${f2(hero.at)} s)`);
  ok('...and so does the opponent\'s straight', foe.worst > boltStep * 0.45 && foe.worst <= boltStep * 1.4, `${f2(foe.worst)} vs Overdrive ${f2(boltStep)} m/frame (peak at ${f2(foe.at)} s)`);
}

// ============================================================================================== §2 the geometry
console.log('\n§2  the geometry, per vertex on EVERY frame: they meet, and they never pass through each other');
{
  let minGap = Infinity;
  let minAt = 0;
  let exactFrames = 0;
  let hitGap = 0;
  let hitDy = 0;
  let hitBox = [null, null];
  for (let t = 0; t <= VS_CLASH_DUR + 1e-9; t += D) {
    const H = gloveAt(t, 'hero');
    const F = gloveAt(t, 'foe');
    const bg = boxGap(H.box, F.box);
    // the boxes only overlap the surface question in the last stretch (before that they are metres apart, and the
    // box distance is already a lower bound) — so the brute-force pass is only paid where it can change the answer
    const g = bg > 0.5 ? bg : surfaceGap(H, F);
    if (bg <= 0.5) exactFrames++;
    if (g < minGap) {
      minGap = g;
      minAt = t;
    }
    if (Math.abs(t - VS_CLASH_HIT) < D / 2) {
      hitGap = g;
      hitDy = Math.abs(H.c.y - F.c.y);
      hitBox = [H.c, F.c];
    }
  }
  ok('NO interpenetration: the gloves never close inside 3 cm on any frame', minGap > 0.03, `min surface gap ${f3(minGap)} m at ${f2(minAt)} s (${exactFrames} frames measured per vertex)`);
  ok('...and at the hit itself they are TOUCHING, not overlapping', hitGap >= 0.05 && hitGap <= 0.2, `${f3(hitGap)} m of air between the two gloves`);
  ok('...and they meet LEVEL, glove to glove', hitDy <= 0.2, `Δy ${f3(hitDy)} m`);
  ok('...thrown at the lens, in front of both chests', hitBox[0].z > 0.8 && hitBox[1].z > 0.8, `z ${f2(hitBox[0].z)} / ${f2(hitBox[1].z)} m`);
  ok('...on the middle of the stage, not off at one side', Math.abs(hitBox[0].x) < 1.2 && Math.abs(hitBox[1].x) < 1.2, `x ${f2(hitBox[0].x)} / ${f2(hitBox[1].x)} m`);
  ok('...at chin height, where a clash reads', hitBox[0].y > 5.2 && hitBox[0].y < 7.0, `y ${f2(hitBox[0].y)} m`);
  const H = gloveAt(VS_CLASH_DUR, 'hero');
  const F = gloveAt(VS_CLASH_DUR, 'foe');
  ok('they are STILL locked when the shot is covered', surfaceGap(H, F) < 0.5, `${f3(surfaceGap(H, F))} m apart at the end`);
}

// ============================================================================================== §3 the power
console.log('\n§3  the power: a real wind-up, a locked elbow, a hand that stays up');
{
  const coil = gloveAt(1.15, 'hero');
  const hit = gloveAt(VS_CLASH_HIT, 'hero');
  const travel = coil.c.distanceTo(hit.c);
  ok('the fist is pulled a long way back BEFORE the throw', travel > 1.4, `${f2(travel)} m of travel from the hold at 1.15 s`);
  ok('...and thrown INWARDS, across his own chest towards the middle', hit.c.x - coil.c.x > 0.6 && Math.abs(hit.c.x) < Math.abs(coil.c.x), `x ${f2(coil.c.x)} → ${f2(hit.c.x)} (${f2(hit.c.x - coil.c.x)} m inward)`);
  const loaded = vsClashState('hero', 1.15).arms[1].ex;
  const hard = vsClashState('hero', VS_CLASH_HIT).arms[1].ex;
  ok('the elbow LOADS then LOCKS OUT', loaded < -2.0 && hard > -0.6, `elbow ${f2(loaded)} → ${f2(hard)} rad`);
  const off = rigAt(VS_CLASH_HIT, 'hero');
  const offGlove = cloud(off.fists[0]).c;
  ok('the other hand never leaves the guard', offGlove.y > 4.4 && offGlove.z < hit.c.z - 1.0, `guard hand y ${f2(offGlove.y)} m, z ${f2(offGlove.z)} vs the thrown glove at ${f2(hit.c.z)} m`);
  const wind = vsClashState('hero', 0).arms[1];
  ok('the arm really winds up (elbow bent, fist cocked high at the chest)', wind.ex < -1.8, `elbow at the count-open ${f2(wind.ex)} rad`);
}

// ============================================================================================== §3b the light
console.log('\n§3b  the light lands on the contact patch, not near it');
{
  const mid = gloveAt(VS_CLASH_HIT, 'hero').c.clone().add(gloveAt(VS_CLASH_HIT, 'foe').c).multiplyScalar(0.5);
  const err = Math.hypot(mid.x - VS_CLASH_POINT.x, mid.y - VS_CLASH_POINT.y, mid.z - VS_CLASH_POINT.z);
  ok('the impact FX point is ON the two gloves', err < 0.5, `off by ${f2(err)} m (VS_CLASH_POINT ${f2(VS_CLASH_POINT.x)}, ${f2(VS_CLASH_POINT.y)}, ${f2(VS_CLASH_POINT.z)})`);
}

// ============================================================================================== §4 the right hand
console.log('\n§4  the right hand: BOTH machines throw it, and it is the arm on the inside');
{
  // the rig is built facing +z (its boots sit heel −z, toe +z), so with the root at yaw 0 its RIGHT side is −x.
  // Arm index 1 has to live there — that is what makes `arm: 1` mean "the right hand" and not just "the far arm".
  const r0 = new Robot(STYLE, 1);
  r0.snapFeet();
  r0.root.position.set(0, 0, 0);
  r0.root.updateWorldMatrix(true, true);
  const s0 = r0.shoulders[0].getWorldPosition(new THREE.Vector3());
  const s1 = r0.shoulders[1].getWorldPosition(new THREE.Vector3());
  ok('arm 1 IS the right arm of the rig (−x, the machine faces +z)', s1.x < s0.x, `shoulder x: arm 0 ${f2(s0.x)} · arm 1 ${f2(s1.x)}`);
  let bothRight = true;
  const ts = [0.0, 0.3, 0.55, 1.05, 1.33, VS_CLASH_HIT, 1.77, VS_CLASH_DUR, 2.4];
  for (const t of ts) {
    if (vsClashState('hero', t).arm !== 1 || vsClashState('foe', t).arm !== 1) bothRight = false;
  }
  ok('BOTH sides throw the right hand on every frame sampled', bothRight, `hero ${vsClashState('hero', VS_CLASH_HIT).arm} · foe ${vsClashState('foe', VS_CLASH_HIT).arm} at the hit (${ts.length} frames sampled)`);
  for (const side of ['hero', 'foe']) {
    const r = rigAt(VS_CLASH_HIT, side);
    const i = vsClashState(side, VS_CLASH_HIT).arm;
    const thrown = fist(r, i);
    const other = fist(r, 1 - i);
    ok(`${side}: the thrown right hand is the one on the inside`, Math.abs(thrown.x) < Math.abs(other.x), `|x| ${f2(Math.abs(thrown.x))} (thrown) vs ${f2(Math.abs(other.x))} (guard)`);
  }
}

console.log(fails === 0 ? '\nFIST CLASH: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
