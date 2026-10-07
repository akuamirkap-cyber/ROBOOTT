// VS FIST-CLASH validation harness — run it with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     npx esbuild src/game/Game.ts  --bundle --format=esm --platform=node --outfile=.__game.mjs  --external:three
//     node clashtest.mjs
// (or just `npm run test:clash`, which does all three)
//
// It drives the REAL Robot rigs CONTINUOUSLY through the REAL clash tracks out of Game.ts — the same frames the
// VS screen plays, from t = 0 to the cover — and checks:
//   §1  the beat: a tandem wind-up with real loaded depth (ancang-ancang), both gloves meeting on the "1"
//   §2  the GEOMETRY, per vertex on every REAL frame: all four gloves, no two of them ever inside each other
//   §3  the POWER: a deep coil, a whip at real punch speed, a locked elbow, a hand that stays in guard
//   §4  the RIGHT hand: BOTH machines throw it — the arm on the inside, facing the middle
// NOTE: earlier cuts snapped a separate freshly-settled rig per sampled frame. That harness lies once the pose
// carries a 1.4 rad chest coil (the balance solver re-anchors the feet mid-settle) — the measurements below come
// from the continuous timeline itself, exactly as played.
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';
import { GUARD, sampleKeys, VS_CLASH_AT_HIT, VS_CLASH_DUR, VS_CLASH_HIT, VS_CLASH_KEYS, VS_CLASH_KEYS_CROSS, VS_CLASH_POINT, vsClashState } from './.__game.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };
let fails = 0;
const ok = (label, cond, info = '') => {
  if (!cond) fails++;
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${label}${info ? '   ' : ''}${info}`);
};
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
const V = new THREE.Vector3();
const HERO_X = -2.75;
const FOE_X = 2.75;
const YAW = 0.42;

// ---------------------------------------------------------- the CONTINUOUS timeline, exactly as the VS screen plays it
function gloveCloud(fistObj) {
  const pts = [];
  const box = new THREE.Box3();
  const meshes = [];
  fistObj.updateWorldMatrix(true, false);
  fistObj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(V.x, V.y, V.z);
      box.expandByPoint(V);
    }
    meshes.push({ m: o });
  });
  return { pts, box, meshes, c: box.getCenter(new THREE.Vector3()) };
}

const mkRig = (side) => {
  const r = new Robot(STYLE, 1);
  r.snapFeet();
  r.root.position.set(side === 'hero' ? HERO_X : FOE_X, 0, 0);
  r.root.rotation.y = (side === 'hero' ? 1 : -1) * YAW;
  return r;
};
const mkA = (c, t) => ({
  arms: c.arms, twist: c.twist, lean: c.lean, lunge: c.lunge, dip: c.dip, roll: c.roll,
  vf: 0, vl: 0, af: 0, al: 0, yawRate: 0, hit: 0, hitSign: 1, hitUp: 0, fall: 0, air: 0, time: t,
  glow: c.glow, flash: c.shock, tilt: 0, dash: 0, dashF: 0, dashL: 1,
  lookX: c.lookX, lookY: c.lookY, headYaw: c.head,
  strike: c.strike, strikePow: c.pow,
  punchFoot: c.punch, punchSeq: c.punchSeq, punchZ: c.punchZ, punchX: c.punchX, punchDur: c.punchDur,
});

const frames = []; // [{t, h:{thrown,guard,chest}, f:{...}}]
{
  const hero = mkRig('hero');
  const foe = mkRig('foe');
  for (let t = 0; t <= VS_CLASH_DUR + 1e-9; t += D) {
    const ch = vsClashState('hero', t);
    const cf = vsClashState('foe', t);
    hero.root.rotation.y = YAW + ch.yaw;
    foe.root.rotation.y = -(YAW + cf.yaw);
    hero.animate(mkA(ch, t), D);
    foe.animate(mkA(cf, t), D);
    hero.root.updateWorldMatrix(true, true);
    foe.root.updateWorldMatrix(true, true);
    frames.push({
      t,
      h: { thrown: gloveCloud(hero.fists[1]), guard: gloveCloud(hero.fists[0]), chest: hero.chest.getWorldPosition(new THREE.Vector3()) },
      f: { thrown: gloveCloud(foe.fists[1]), guard: gloveCloud(foe.fists[0]), chest: foe.chest.getWorldPosition(new THREE.Vector3()) },
    });
  }
}
const frameAt = (t) => {
  let best = frames[0];
  let bd = 1e9;
  for (const fr of frames) {
    const d = Math.abs(fr.t - t);
    if (d < bd) { bd = d; best = fr; }
  }
  return best;
};
/** distance between two boxes (0 when they touch/overlap) — a SAFE LOWER BOUND on the real surface distance */
const boxGap = (a, b) => Math.hypot(
  Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
  Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
  Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z),
);
const closestPair = (A, B) => {
  let best = Infinity;
  const mid = new THREE.Vector3();
  for (let i = 0; i < A.pts.length; i += 3) {
    for (let j = 0; j < B.pts.length; j += 3) {
      const dx = A.pts[i] - B.pts[j];
      const dy = A.pts[i + 1] - B.pts[j + 1];
      const dz = A.pts[i + 2] - B.pts[j + 2];
      const d = Math.hypot(dx, dy, dz);
      if (d < best) {
        best = d;
        mid.set((A.pts[i] + B.pts[j]) / 2, (A.pts[i + 1] + B.pts[j + 1]) / 2, (A.pts[i + 2] + B.pts[j + 2]) / 2);
      }
    }
  }
  return { g: best, mid };
};
/** strict penetration: is any glove vertex INSIDE the other's meshes? ray-cast from one point, count crossings */
const RAY = new THREE.Raycaster();
const vertsInside = (A, B) => {
  let n = 0;
  const dir = new THREE.Vector3(1, 0.37, 0.23).normalize();
  for (let i = 0; i < A.pts.length; i += 3) {
    RAY.set(new THREE.Vector3(A.pts[i], A.pts[i + 1], A.pts[i + 2]), dir);
    RAY.far = 60;
    let hits = 0;
    for (const { m } of B.meshes) {
      const res = RAY.intersectObject(m, false);
      if (res.length > 0) hits = Math.max(hits, res.length);
    }
    if (hits % 2 === 1 && hits > 0) n++;
  }
  return n;
};
const GNAME = ['L', 'R'];

// ============================================================================================== §1 the beat
console.log('\n§1  the beat: a tandem gameplay coil (ancang-ancang), both gloves meeting exactly on the "1"');
{
  const SIDES = [['player', 'hero', VS_CLASH_KEYS_CROSS], ['opponent', 'foe', VS_CLASH_KEYS]];
  for (const [name, , keys] of SIDES) {
    ok(`${name}: the track runs forward in time`, keys.every((k, i) => i === 0 || k.t > keys[i - 1].t), keys.map((k) => f2(k.t)).join(' < ') + ' s');
  }
  const elbow = (side, t) => vsClashState(side, t).arms[1].ex;
  const coilD = (side, t) => (side === 'hero' ? -1 : 1) * vsClashState(side, t).twist;
  for (const [name, side] of SIDES) {
    // the ancang-ancang: elbow folded deep AND the chest counter-wound past a full radian — the whole machine
    // visibly loads before the whip, not just the arm wagging
    ok(`${name}: deep coil by mid-wind-up (elbow AND chest)`, elbow(side, 0.62) <= -2.4 && Math.abs(coilD(side, 0.62)) >= 1.15, `elbow ${f2(elbow(side, 0.62))} rad, chest coil ${f2(Math.abs(coilD(side, 0.62)))} rad at 0.62 s`);
  }
  // TANDEM: both machines carry the same coil through the same beats — no one goes early
  const spread = (t) => Math.abs(-(vsClashState('hero', t).twist) - vsClashState('foe', t).twist);
  let maxSpread = 0;
  for (let t = 0.1; t <= 0.92; t += D) maxSpread = Math.max(maxSpread, spread(t));
  ok('BOTH machines wind in TANDEM (coil depth stays matched through the beats)', maxSpread < 0.26, `worst twist mismatch ${f3(maxSpread)} rad across the wind-up`);
  // the wind-up must be REAL: from the guard the gloves retreat a long way behind the body lines
  const guardH = frameAt(0.05).h.thrown.c;
  const coilH = Math.max(...frames.filter((f) => f.t >= 0.5 && f.t <= 0.96).map((f) => f.h.chest.distanceTo(f.h.thrown.c)));
  ok('the wind-up physically retreats the fists a long way', coilH > 2.1, `deepest fist-off-chest reach ${f2(coilH)} m during the coil`);
  ok('the gloves meet exactly on the "1" of the count', Math.abs(VS_CLASH_AT_HIT - 1.36) < 0.06, `${f2(VS_CLASH_AT_HIT)} s into the count (~2 s total)`);
  ok('...which is before the bell, so the transition can cover it', VS_CLASH_AT_HIT < 2.05, 'bell at ~2.04 s');
  ok('the clash rides on past the hit (the lock HOLDS until the cover)', VS_CLASH_DUR > VS_CLASH_HIT, `held ${f2(VS_CLASH_DUR - VS_CLASH_HIT)} s after the impact`);
  // the whip: measure the REAL peak glove step across the throw window in the timeline
  for (const [name, side, from, to] of [['player', 'h', 0.86, VS_CLASH_HIT + 0.05], ['opponent', 'f', 0.86, VS_CLASH_HIT + 0.05]]) {
    let worst = 0;
    let at = 0;
    let prev = null;
    for (const fr of frames) {
      if (fr.t < from || fr.t > to) continue;
      const c = fr[side].thrown.c;
      if (prev) {
        const d = c.distanceTo(prev);
        if (d > worst) { worst = d; at = fr.t; }
      }
      prev = c;
    }
    ok(`${name}'s cross whips at gameplay punch speed`, worst > 0.3 && worst <= 2.2, `${f2(worst)} m/frame peak at ${f2(at)} s`);
  }
}

// ============================================================================================== §2 the geometry
console.log('\n§2  the geometry, per vertex on every REAL frame: all four gloves meet, and none ever enters another');
{
  let minGap = Infinity;
  let minAt = 0;
  let minPair = '';
  let hitGap = 0;
  let hitDy = 0;
  let hitMid = null;
  let penFrames = 0;
  let penWorst = 0;
  let penAt = 0;
  let exactFrames = 0;
  for (const fr of frames) {
    const HG = [fr.h.guard, fr.h.thrown];
    const FG = [fr.f.guard, fr.f.thrown];
    for (let hi = 0; hi < 2; hi++) {
      for (let fi = 0; fi < 2; fi++) {
        const A = HG[hi];
        const B = FG[fi];
        if (boxGap(A.box, B.box) > 0.5) continue;
        const cp = closestPair(A, B);
        exactFrames++;
        if (cp.g < minGap) {
          minGap = cp.g;
          minAt = fr.t;
          minPair = `player ${GNAME[hi]} × opponent ${GNAME[fi]}`;
        }
        if (boxGap(A.box, B.box) === 0) {
          const n = Math.max(vertsInside(A, B), vertsInside(B, A));
          if (n > 0) {
            penFrames++;
            if (n > penWorst) { penWorst = n; penAt = fr.t; }
          }
        }
      }
    }
  }
  const hitFr = frameAt(VS_CLASH_HIT);
  const hitCp = closestPair(hitFr.h.thrown, hitFr.f.thrown);
  hitGap = hitCp.g;
  hitDy = Math.abs(hitFr.h.thrown.c.y - hitFr.f.thrown.c.y);
  hitMid = hitCp.mid;
  ok('NO interpenetration: no vertex of any glove lies within another glove on ANY real frame', penFrames === 0, penFrames ? `${penFrames} frames with a vertex inside a glove — worst ${penWorst} verts at ${f2(penAt)} s` : 'ray test on every overlapping pair across the whole clash');
  ok('there is NO close pass anywhere before the "1" (the gloves only get near each other AT the hit)', minAt >= VS_CLASH_HIT - 0.12, `closest approach at ${f2(minAt)} s (${minPair}), the "1" at ${f2(VS_CLASH_HIT)} s`);
  ok('...and at the hit itself the two gloves are TOUCHING, not overlapping', hitGap >= -0.02 && hitGap <= 0.22, `${f3(hitGap)} m of air between the two gloves at ${f2(VS_CLASH_HIT)} s`);
  ok('...and they meet LEVEL, glove to glove', hitDy <= 0.22, `Δy ${f3(hitDy)} m`);
  ok('...in front of both chests', hitMid.z > 0.8 && hitMid.z < 3.5, `contact patch at z ${f2(hitMid.z)} m`);
  ok('...dead centre on the stage, not off at one side', Math.abs(hitMid.x) < 1.6, `contact patch at x ${f2(hitMid.x)} m (the machines stand at ∓2.75 m)`);
  ok('...at chin height, where a clash reads', hitMid.y > 5.0 && hitMid.y < 7.0, `contact patch at y ${f2(hitMid.y)} m`);
  const end = frames[frames.length - 1];
  ok('they are STILL locked when the shot is covered', closestPair(end.h.thrown, end.f.thrown).g < 0.5, `${f3(closestPair(end.h.thrown, end.f.thrown).g)} m apart at the cover`);
}

// ============================================================================================== §3 the power
console.log('\n§3  the power: a deep coil, a whip, a locked elbow, a hand that stays up');
{
  const coil = frameAt(0.64).h.thrown.c;
  const park = frameAt(VS_CLASH_HIT).h.thrown.c;
  const travel = coil.distanceTo(park);
  ok('the fist is chambered a LONG way back BEFORE the throw (the ancang-ancang)', travel > 2.5, `${f2(travel)} m of flight from the deep coil to the contact patch`);
  ok('...and thrown INWARDS, across to the middle', Math.abs(park.x) < Math.abs(coil.x) && park.x - coil.x > 1.5, `x ${f2(coil.x)} → ${f2(park.x)} (${f2(park.x - coil.x)} m inward from the coil)`);
  const loaded = vsClashState('hero', 0.62).arms[1].ex;
  const hard = vsClashState('hero', VS_CLASH_HIT).arms[1].ex;
  ok('the elbow LOADS then LOCKS OUT', loaded < -2.2 && hard > -0.6, `elbow ${f2(loaded)} → ${f2(hard)} rad`);
  const off = frameAt(VS_CLASH_HIT).h.guard.c;
  ok('the other hand never leaves the guard', off.y > 4.4 && off.z < park.z - 0.8, `guard hand y ${f2(off.y)} m, z ${f2(off.z)} vs the thrown glove at ${f2(park.z)} m`);
  const wind = vsClashState('hero', 0).arms[1];
  ok('the clash opens from a real guard (elbow folded, fist cocked)', wind.ex < -1.8, `elbow at the count-open ${f2(wind.ex)} rad`);
}

// ============================================================================================== §3b the light
console.log('\n§3b  the light lands on the contact patch, not near it');
{
  const fr = frameAt(VS_CLASH_HIT);
  const cp = closestPair(fr.h.thrown, fr.f.thrown);
  const err = Math.hypot(cp.mid.x - VS_CLASH_POINT.x, cp.mid.y - VS_CLASH_POINT.y, cp.mid.z - VS_CLASH_POINT.z);
  ok('the impact FX point is ON the two gloves', err < 0.25, `off by ${f2(err)} m (VS_CLASH_POINT ${f2(VS_CLASH_POINT.x)}, ${f2(VS_CLASH_POINT.y)}, ${f2(VS_CLASH_POINT.z)})`);
}

// ============================================================================================== §4 the right hand
console.log('\n§4  the right hand: BOTH machines throw it, and it is the arm on the inside');
{
  const r0 = new Robot(STYLE, 1);
  r0.snapFeet();
  r0.root.position.set(0, 0, 0);
  r0.root.updateWorldMatrix(true, true);
  const s0 = r0.shoulders[0].getWorldPosition(new THREE.Vector3());
  const s1 = r0.shoulders[1].getWorldPosition(new THREE.Vector3());
  ok('arm 1 IS the right arm of the rig (−x, the machine faces +z)', s1.x < s0.x, `shoulder x: arm 0 ${f2(s0.x)} · arm 1 ${f2(s1.x)}`);
  let bothRight = true;
  for (const t of [0.0, 0.3, 0.55, 0.9, 1.05, VS_CLASH_HIT, 1.4, VS_CLASH_DUR]) {
    if (vsClashState('hero', t).arm !== 1 || vsClashState('foe', t).arm !== 1) bothRight = false;
  }
  ok('BOTH sides throw the right hand on every frame sampled', bothRight, `hero ${vsClashState('hero', VS_CLASH_HIT).arm} · foe ${vsClashState('foe', VS_CLASH_HIT).arm} at the hit`);
  const fr = frameAt(VS_CLASH_HIT);
  const patch = new THREE.Vector3(VS_CLASH_POINT.x, VS_CLASH_POINT.y, VS_CLASH_POINT.z);
  for (const [name, S] of [['player', fr.h], ['opponent', fr.f]]) {
    const dT = S.thrown.c.distanceTo(patch);
    const dG = S.guard.c.distanceTo(patch);
    ok(`${name}: his THROWN right hand is the one that reaches the clash`, dT < dG - 0.3, `thrown glove ${f2(dT)} m from the contact patch, guard hand ${f2(dG)} m back`);
  }
}

console.log(fails === 0 ? '\nFIST CLASH: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
