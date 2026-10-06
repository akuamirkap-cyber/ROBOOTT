// VS FIST-CLASH validation harness — run it with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     npx esbuild src/game/Game.ts  --bundle --format=esm --platform=node --outfile=.__game.mjs  --external:three
//     node clashtest.mjs
// (or just `npm run test:clash`, which does all three)
//
// It drives the REAL Robot rig with the REAL clash track out of Game.ts — the same numbers the VS screen runs — and
// checks the two things that make a fist clash read as a clash instead of two arms waving near each other:
//   §1  the beat: the throw is loaded on the count, and the fists meet before the bell (the transition rides on it)
//   §2  the fist GEOMETRY: the two knuckles actually meet on the centre line, in front of both chests
//   §3  the POWER: a real wind-up, a locked-out elbow, and a hand that never drops its guard
//   §4  the mirror: the opponent is the hero's reflection, so both throw the arm that faces the middle
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';
import { GUARD, MOVES, sampleKeys, VS_CLASH_AT, VS_CLASH_AT_HIT, VS_CLASH_DUR, VS_CLASH_HIT, VS_CLASH_KEYS, VS_CLASH_POINT, vsClashPose } from './.__game.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };
let fails = 0;
const ok = (label, cond, info = '') => {
  if (!cond) fails++;
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${label}${info ? '   ' + info : ''}`);
};
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
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

/** one rig, holding the clash pose sampled at `t` — hero: arm 0 throws; opponent: arm 1 throws (the mirror) */
function rigAt(t, side) {
  const p = vsClashPose(t);
  const arms = side === 'hero' ? [p.p, GUARD] : [GUARD, p.p];
  const r = new Robot(STYLE, 1);
  r.snapFeet();
  const x = side === 'hero' ? HERO_X : FOE_X;
  r.root.position.set(x, 0, 0);
  r.root.rotation.y = side === 'hero' ? YAW : -YAW;
  const a = mk();
  a.arms = arms;
  a.twist = (side === 'hero' ? 1 : -1) * p.twist;
  a.lean = p.lean;
  a.dip = p.dip;
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
const heroFist = (t) => fist(rigAt(t, 'hero'), 0);
const foeFist = (t) => fist(rigAt(t, 'foe'), 1);

// ============================================================================================== §1 the beat
console.log('\n§1  the beat: loaded on the count, fists meeting before the bell');
{
  ok('the track runs forward in time', VS_CLASH_KEYS.every((k, i) => i === 0 || k.t > VS_CLASH_KEYS[i - 1].t), `${VS_CLASH_KEYS.map((k) => k.t).join(' < ')} s`);
  ok('the wind-up is shorter than the throw', VS_CLASH_HIT <= VS_CLASH_AT, `wind ${f2(VS_CLASH_HIT)} s`);
  ok('the fists meet exactly on the "1" of the count', Math.abs(VS_CLASH_AT_HIT - 2.0) < 0.06, `${f2(VS_CLASH_AT_HIT)} s into the 3 s count`);
  ok('...which is before the bell, so the transition can cover it', VS_CLASH_AT_HIT < 3.0, `bell at 3.00 s`);
  ok('the clash rides on past the hit (the lock HOLDS until the cover)', VS_CLASH_DUR > VS_CLASH_HIT, `held ${f2(VS_CLASH_DUR - VS_CLASH_HIT)} s after the impact`);
  // HOW FAST MAY IT THROW? Exactly as fast as the Overdrive the game already ships: the clash is meant to read as
  // an Overdrive-weight collision, so the reference is the real bolt keys driven through the same rig, not a number
  // invented here. (Both are target-space speeds — the fight's springs smooth what you actually see.)
  const step = (sample, span) => {
    let worst = 0;
    let prev = null;
    for (let t = 0; t <= span; t += D) {
      const p = sample(t);
      const r = rigAt(0, 'hero'); // one rig, re-posed: only the fist positions are read
      r.fists[0].updateWorldMatrix(true, false);
      void p;
      void prev;
      void r;
      break;
    }
    return worst;
  };
  void step;
  const fistsOf = (t, arms) => {
    const r = rigAt(t, 'hero');
    void arms;
    return r;
  };
  void fistsOf;
  // the reference: the Overdrive straight's own track, on the same rig
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
      r.root.updateMatrixWorld(true);
      r.fists[0].updateWorldMatrix(true, false);
      const f = r.fists[0].getWorldPosition(V).clone();
      if (prev) worst = Math.max(worst, f.distanceTo(prev));
      prev = f;
    }
    return worst;
  })();
  let worst = 0;
  let prevH = heroFist(0);
  for (let t = D; t <= VS_CLASH_DUR + 0.4; t += D) {
    const h = heroFist(t);
    worst = Math.max(worst, h.distanceTo(prevH));
    prevH = h;
  }
  ok(
    'the clash is at most as fast as the shipped Overdrive',
    worst <= boltStep * 1.12,
    `clash ${f2(worst)} vs Overdrive ${f2(boltStep)} m/frame`,
  );
  ok('...and it is a throw, not a teleport', worst < 1.4, `${f2(worst)} m/frame at 60 fps`);
}

// ============================================================================================== §2 the geometry
console.log('\n§2  the geometry: the two knuckles meet on the centre line');
{
  const h = heroFist(VS_CLASH_HIT);
  const f = foeFist(VS_CLASH_HIT);
  const gap = h.distanceTo(f);
  ok('the fists actually meet', gap < 0.75, `${f2(gap)} m apart`);
  ok('...on the centre line', Math.abs(h.x - f.x) < 0.75 && Math.abs(h.x) < 1.2 && Math.abs(f.x) < 1.2, `hero x ${f2(h.x)} · foe x ${f2(f.x)}`);
  ok('...in front of both chests (thrown at the lens, not sideways)', h.z > 0.8 && f.z > 0.8, `z ${f2(h.z)} / ${f2(f.z)}`);
  ok('...at chin height, where a clash reads', h.y > 5.5 && h.y < 7.4, `y ${f2(h.y)} m`);
  const hEnd = heroFist(VS_CLASH_DUR);
  const fEnd = foeFist(VS_CLASH_DUR);
  ok('they are STILL locked when the shot is covered', hEnd.distanceTo(fEnd) < 0.85, `${f2(hEnd.distanceTo(fEnd))} m apart at the end`);
}

// ============================================================================================== §3 the power
console.log('\n§3  the power: a real wind-up, a locked elbow, a hand that stays up');
{
  const wind = heroFist(0);
  const hit = heroFist(VS_CLASH_HIT);
  const travel = wind.distanceTo(hit);
  ok('the fist is pulled a long way back', travel > 1.4, `${f2(travel)} m of travel in ${f2(VS_CLASH_HIT)} s`);
  ok('...and thrown INWARDS, across his own chest towards the middle', hit.x - wind.x > 0.6 && Math.abs(hit.x) < Math.abs(wind.x), `x ${f2(wind.x)} → ${f2(hit.x)} (${f2(hit.x - wind.x)} m inward)`);
  const hard = vsClashPose(VS_CLASH_HIT).p.ex;
  const loaded = vsClashPose(0).p.ex;
  ok('the elbow LOADS then LOCKS OUT', loaded < -2.0 && hard > -0.3, `elbow ${f2(loaded)} → ${f2(hard)} rad`);
  const off = fist(rigAt(VS_CLASH_HIT, 'hero'), 1);
  const hitFist = heroFist(VS_CLASH_HIT);
  ok('the other hand never leaves the guard', off.y > 4.4 && off.z < hitFist.z - 1.0, `off-hand y ${f2(off.y)} m, z ${f2(off.z)} vs the thrown fist at ${f2(hitFist.z)} m`);
}

// ============================================================================================== §3b the light
console.log('\n§3b  the light lands on the contact patch, not near it');
{
  const h = heroFist(VS_CLASH_HIT);
  const dx = h.x - 0; // the stage centre
  const dy = h.y - VS_CLASH_POINT.y;
  const dz = h.z - VS_CLASH_POINT.z;
  const err = Math.sqrt(dx * dx + dy * dy + dz * dz);
  ok('the impact FX point is ON the fists', err < 0.5, `off by ${f2(err)} m (VS_CLASH_POINT y ${f2(VS_CLASH_POINT.y)} z ${f2(VS_CLASH_POINT.z)})`);
}

// ============================================================================================== §4 the mirror
console.log('\n§4  the mirror: the opponent throws the arm that faces the middle too');
{
  const h = heroFist(VS_CLASH_HIT);
  const f = foeFist(VS_CLASH_HIT);
  ok('the two fists are reflections of each other', Math.abs(h.x + f.x) < 0.12 && Math.abs(h.y - f.y) < 0.12 && Math.abs(h.z - f.z) < 0.12, `(${f2(h.x)}, ${f2(h.y)}, ${f2(h.z)}) vs (${f2(f.x)}, ${f2(f.y)}, ${f2(f.z)})`);
  ok('each machine throws the arm on ITS side of the middle', h.x > HERO_X && f.x < FOE_X, `hero ${f2(h.x)} > ${f2(HERO_X)} · foe ${f2(f.x)} < ${f2(FOE_X)}`);
}

console.log(fails === 0 ? '\nFIST CLASH: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
