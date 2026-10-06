// VS FIST-CLASH validation harness — run it with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     npx esbuild src/game/Game.ts  --bundle --format=esm --platform=node --outfile=.__game.mjs  --external:three
//     node clashtest.mjs
// (or just `npm run test:clash`, which does all three)
//
// It drives the REAL Robot rig with the REAL clash tracks out of Game.ts — the same numbers the VS screen runs — and
// checks the four things that make a fist clash read as a clash instead of two arms waving near each other:
//   §1  the beat: both machines are wound up BEFORE the "2" of the count, and the gloves meet on the "1"
//   §2  the GEOMETRY, per vertex on every frame: all four gloves, no two of them ever inside each other
//   §3  the POWER: a real wind-up, a locked-out elbow, Overdrive weight on the throw, a hand that stays in guard
//   §4  the RIGHT hand: BOTH machines throw the right one — the arm on the inside, facing the middle
//
// The contact is a two-key throw at cinematic speed, so the numbers below are the numbers the stage plays: the same
// arm poses, the same body channels, the same order of arrival (the player's fist is parked on the contact patch
// first; the opponent's straight is what lands on the "1"). §2 measures the MESHES, not the pivots: a 1.3 m glove's
// rounded box is what decides whether two fists touch or sweep through each other.
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
/** how long the rig is left running so the springs settle onto the sampled pose before anything is measured */
const SETTLE = 150;

/**
 * one rig, settled onto the clash pose sampled at `t` — built exactly the way the VS screen builds it. `side` picks
 * the track (the player throws his cross, the opponent his straight), and every channel the state carries goes into
 * the AnimState, because any one of them can move a glove.
 */
function rigAt(t, side) {
  const c = vsClashState(side, t);
  const r = new Robot(STYLE, 1);
  r.snapFeet();
  r.root.position.set(side === 'hero' ? HERO_X : FOE_X, 0, 0);
  // the square-up: the extra yaw the pose itself carries, on top of the stance angle both machines already hold
  r.root.rotation.y = (side === 'hero' ? 1 : -1) * (YAW + (c.yaw ?? 0));
  const a = mk();
  a.arms = c.arms;
  a.twist = c.twist;
  a.lean = c.lean;
  a.dip = c.dip;
  a.roll = c.roll;
  a.lunge = c.lunge;
  a.headYaw = c.head;
  a.lookX = c.lookX;
  a.lookY = c.lookY;
  a.strike = c.strike;
  a.strikePow = c.pow;
  a.punchFoot = c.punch >= 0 ? c.punch : -1;
  a.punchZ = 0.46;
  a.punchX = side === 'hero' ? 0.1 : -0.1;
  a.punchDur = 0.24;
  a.punchSeq = c.punchSeq;
  for (let i = 0; i < SETTLE; i++) {
    a.time += D;
    r.animate(a, D);
  }
  r.root.updateWorldMatrix(true, true);
  return { r, c };
}
const fist = (r, i) => {
  r.fists[i].updateWorldMatrix(true, false);
  return r.fists[i].getWorldPosition(V).clone();
};
/**
 * The GLOVE as it really is: every world-space vertex of the fist mesh (sub-sampled), its box, and its meshes so the
 * strict inside test can ray-cast them. This — not the pivot point — is what decides whether two 1.3 m gloves touch
 * or pass through each other, so it is what §2 measures.
 */
const SUB = 3;
function cloud(fistObj, store = null) {
  const pts = store ?? [];
  const box = new THREE.Box3();
  const meshes = [];
  fistObj.updateWorldMatrix(true, false);
  fistObj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += SUB) {
      V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(V.x, V.y, V.z);
      box.expandByPoint(V);
    }
    meshes.push({ m: o, world: new THREE.Box3().setFromObject(o) });
  });
  return { pts, box, meshes, c: box.getCenter(new THREE.Vector3()) };
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
/** the closest pair itself (both points), so the CONTACT PATCH can be located, not just its width */
function closestPair(A, B) {
  let best = Infinity;
  let a = 0;
  let b = 0;
  for (let i = 0; i < A.pts.length; i += 3) {
    for (let j = 0; j < B.pts.length; j += 3) {
      const dx = A.pts[i] - B.pts[j];
      const dy = A.pts[i + 1] - B.pts[j + 1];
      const dz = A.pts[i + 2] - B.pts[j + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) {
        best = d;
        a = i;
        b = j;
      }
    }
  }
  return {
    g: Math.sqrt(best),
    a: new THREE.Vector3(A.pts[a], A.pts[a + 1], A.pts[a + 2]),
    b: new THREE.Vector3(B.pts[b], B.pts[b + 1], B.pts[b + 2]),
    mid: new THREE.Vector3(A.pts[a], A.pts[a + 1], A.pts[a + 2]).add(new THREE.Vector3(B.pts[b], B.pts[b + 1], B.pts[b + 2])).multiplyScalar(0.5),
  };
}
/**
 * Both gloves of one machine at time `t`. (A clash is four gloves in a small volume: a guard hand can be swept
 * through exactly like a thrown one, so §2 walks all four.)
 */
function glovesAt(t, side) {
  const { r, c } = rigAt(t, side);
  return { thrown: cloud(r.fists[c.arm]), other: cloud(r.fists[1 - c.arm]), arm: c.arm, c };
}
const thrownAt = (t, side) => glovesAt(t, side).thrown;

// The strict one: a minimum vertex-to-vertex distance is NOT proof of no interpenetration — two solids can overlap
// and still keep their vertices apart. Each glove part is a closed convex shell (rounded box / sphere / capsule), so
// a point is inside it iff a ray from that point crosses it an odd number of times. Three rays, majority vote, and
// a per-mesh AABB prefilter so only the vertices actually near the other glove get cast.
const rc = new THREE.Raycaster();
rc.far = 60;
const RAYS = [
  new THREE.Vector3(0.9973, 0.0573, 0.0411).normalize(),
  new THREE.Vector3(-0.0217, 0.9991, 0.0361).normalize(),
  new THREE.Vector3(0.0311, -0.0173, 0.9994).normalize(),
];
function vertsInside(A, B) {
  const inside = (v) => {
    let hits = 0;
    for (const d of RAYS) {
      let n = 0;
      for (const e of B.meshes) {
        if (!e.world.containsPoint(v)) continue;
        rc.set(v, d);
        n += rc.intersectObject(e.m, false).length;
      }
      if (n % 2 === 1) hits++;
    }
    return hits >= 2;
  };
  let n = 0;
  for (let i = 0; i < A.pts.length; i += 3) if (inside(new THREE.Vector3(A.pts[i], A.pts[i + 1], A.pts[i + 2]))) n++;
  return n;
}
const GNAME = ['L', 'R'];

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
    for (let i = 0; i < SETTLE; i++) {
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
  let prev = fist(rigAt(t0, side).r, vsClashState(side, t0).arm);
  for (let t = t0 + D; t <= t1 + 1e-9; t += D) {
    const p = fist(rigAt(t, side).r, vsClashState(side, t).arm);
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
  const SIDES = [['player', 'hero', VS_CLASH_KEYS_CROSS], ['opponent', 'foe', VS_CLASH_KEYS]];
  for (const [name, , keys] of SIDES) {
    ok(`${name}: the track runs forward in time`, keys.every((k, i) => i === 0 || k.t > keys[i - 1].t), keys.map((k) => f2(k.t)).join(' < ') + ' s');
  }
  // the count reads 3 (0-1 s), 2 (1-2 s), 1 (2-3 s): the clash track starts VS_CLASH_AT into it, so a clash-time t
  // lands on the count at VS_CLASH_AT + t. Both machines must be carrying the FULL load by the time the "2" lands,
  // and must still be carrying it a second later — nothing uncoils early.
  const elbow = (side, t) => vsClashState(side, t).arms[1].ex;
  for (const [name, side] of SIDES) {
    const coil = Math.min(elbow(side, 0.3), elbow(side, 0.55));
    ok(`${name}: fully coiled before the "2" (the "2" lands 1.00 s in)`, elbow(side, 0.55) <= -2.4, `deepest coil ${f2(coil)} rad by ${f2(VS_CLASH_AT + 0.55)} s into the count`);
  }
  ok('...and both HOLD the load right through the "2"', elbow('hero', 1.0) < -2.0 && elbow('foe', 1.0) < -2.0, `elbow at 1.45 s into the count: player ${f2(elbow('hero', 1.0))} · opponent ${f2(elbow('foe', 1.0))} rad`);
  // ...and both fists are still a long way from where they will meet: nothing is creeping out early.
  const patch = new THREE.Vector3(VS_CLASH_POINT.x, VS_CLASH_POINT.y, VS_CLASH_POINT.z);
  const away = (side, t) => thrownAt(t, side).c.distanceTo(patch);
  ok('...and neither fist has started travelling towards the other', away('hero', 1.0) > 1.5 && away('foe', 1.0) > 1.5, `gloves ${f2(away('hero', 1.0))} m / ${f2(away('foe', 1.0))} m short of the contact patch at the "2"`);
  ok('the gloves meet exactly on the "1" of the count', Math.abs(VS_CLASH_AT_HIT - 2.0) < 0.06, `${f2(VS_CLASH_AT_HIT)} s into the 3 s count`);
  ok('...which is before the bell, so the transition can cover it', VS_CLASH_AT_HIT < 3.0, 'bell at 3.00 s');
  ok('the clash rides on past the hit (the lock HOLDS until the cover)', VS_CLASH_DUR > VS_CLASH_HIT, `held ${f2(VS_CLASH_DUR - VS_CLASH_HIT)} s after the impact`);
  // THE ORDER OF ARRIVAL. One fist is parked on the contact patch and the other lands on it — a glove that arrives
  // second at 30 m/s sweeps THROUGH a glove that is already sitting there if both arrive together.
  const hitH = thrownAt(VS_CLASH_HIT, 'hero').c;
  const hitF = thrownAt(VS_CLASH_HIT, 'foe').c;
  let parkH = null;
  for (let t = 1.3; t <= 1.52; t += D) {
    if (thrownAt(t, 'hero').c.distanceTo(hitH) < 0.06) {
      parkH = t;
      break;
    }
  }
  const fLate = thrownAt(1.45, 'foe').c.distanceTo(hitF);
  ok('the player is PARKED on the contact patch before his opponent gets there', parkH !== null && parkH <= VS_CLASH_HIT - 0.08 && fLate > 0.5, `player set by ${f2(parkH ?? VS_CLASH_HIT)} s; the opponent's glove is still ${f2(fLate)} m short of the patch at 1.45 s ("1" at ${f2(VS_CLASH_HIT)} s)`);
  const hero = peakStep('hero', 1.05, VS_CLASH_DUR + 0.3);
  const foe = peakStep('foe', 1.0, VS_CLASH_DUR + 0.3);
  ok("the player's cross lands at Overdrive weight", hero.worst > boltStep * 0.45 && hero.worst <= boltStep * 1.25, `${f2(hero.worst)} vs Overdrive ${f2(boltStep)} m/frame (peak at ${f2(hero.at)} s)`);
  ok("...and so does the opponent's straight", foe.worst > boltStep * 0.45 && foe.worst <= boltStep * 1.25, `${f2(foe.worst)} vs Overdrive ${f2(boltStep)} m/frame (peak at ${f2(foe.at)} s)`);
}

// ============================================================================================== §2 the geometry
console.log('\n§2  the geometry, per vertex on EVERY frame: all four gloves meet, and none ever enters another');
{
  let minGap = Infinity;
  let minAt = 0;
  let minPair = '';
  let hitGap = 0;
  let hitDy = 0;
  let hitMid = null;
  let exactFrames = 0;
  let penFrames = 0;
  let penWorst = 0;
  let penAt = 0;
  for (let t = 0; t <= VS_CLASH_DUR + 1e-9; t += D) {
    const H = glovesAt(t, 'hero');
    const F = glovesAt(t, 'foe');
    const HG = [H.other, H.thrown];
    const FG = [F.other, F.thrown];
    for (let hi = 0; hi < 2; hi++) {
      for (let fi = 0; fi < 2; fi++) {
        const A = HG[hi];
        const B = FG[fi];
        const bg = boxGap(A.box, B.box);
        // the boxes only overlap the surface question in the last stretch (before that they are metres apart, and
        // the box distance is already a lower bound) — so the brute-force pass is only paid where it can change the
        // answer. The strict inside test is only paid where the boxes actually touch.
        if (bg > 0.5) continue;
        const cp = closestPair(A, B);
        exactFrames++;
        if (cp.g < minGap) {
          minGap = cp.g;
          minAt = t;
          minPair = `player ${GNAME[hi]} × opponent ${GNAME[fi]}`;
        }
        if (bg === 0) {
          const n = Math.max(vertsInside(A, B), vertsInside(B, A));
          if (n > 0) {
            penFrames++;
            if (n > penWorst) {
              penWorst = n;
              penAt = t;
            }
          }
        }
        if (hi === 1 && fi === 1 && Math.abs(t - VS_CLASH_HIT) < D / 2) {
          hitGap = cp.g;
          hitDy = Math.abs(H.thrown.c.y - F.thrown.c.y);
          hitMid = cp.mid.clone();
        }
      }
    }
  }
  ok('NO interpenetration: the gloves never close inside 3 cm on any frame', minGap > 0.03, `min surface gap ${f3(minGap)} m at ${f2(minAt)} s (${minPair}; ${exactFrames} glove-pair frames measured per vertex)`);
  ok('...and nothing is INSIDE anything: no vertex of any glove lies within another', penFrames === 0, penFrames ? `${penFrames} frames with a vertex inside a glove — worst ${penWorst} verts at ${f2(penAt)} s` : 'ray test on every overlapping pair, front to back');
  ok('the CLOSEST approach of the whole clash is the contact itself, on the "1"', Math.abs(minAt - VS_CLASH_HIT) <= D * 2, `closest at ${f2(minAt)} s, hit at ${f2(VS_CLASH_HIT)} s (no earlier pass-by)`);
  ok('...and at the hit itself they are TOUCHING, not overlapping', hitGap >= 0.05 && hitGap <= 0.25, `${f3(hitGap)} m of air between the two gloves`);
  ok('...and they meet LEVEL, glove to glove', hitDy <= 0.2, `Δy ${f3(hitDy)} m`);
  ok('...in front of both chests', hitMid.z > 0.8 && hitMid.z < 3.5, `contact patch at z ${f2(hitMid.z)} m`);
  ok('...on the middle of the stage, not off at one side', Math.abs(hitMid.x) < 1.6, `contact patch at x ${f2(hitMid.x)} m (the machines stand at ∓${HERO_X < 0 ? -HERO_X : HERO_X} m)`);
  ok('...at chin height, where a clash reads', hitMid.y > 5.0 && hitMid.y < 7.0, `contact patch at y ${f2(hitMid.y)} m`);
  const H2 = thrownAt(VS_CLASH_DUR, 'hero');
  const F2 = thrownAt(VS_CLASH_DUR, 'foe');
  ok('they are STILL locked when the shot is covered', surfaceGap(H2, F2) < 0.5, `${f3(surfaceGap(H2, F2))} m apart at the end`);
}

// ============================================================================================== §3 the power
console.log('\n§3  the power: a real wind-up, a locked elbow, a hand that stays up');
{
  const coil = thrownAt(1.1, 'hero');
  const park = thrownAt(1.4, 'hero');
  const hit = thrownAt(VS_CLASH_HIT, 'hero');
  const travel = coil.c.distanceTo(park.c);
  ok('the fist is pulled a long way back BEFORE the throw', travel > 1.4, `${f2(travel)} m of travel from the hold at 1.10 s to the park at 1.40 s`);
  ok('...and thrown INWARDS, across his own chest towards the middle', park.c.x - coil.c.x > 0.6 && Math.abs(park.c.x) < Math.abs(coil.c.x), `x ${f2(coil.c.x)} → ${f2(park.c.x)} (${f2(park.c.x - coil.c.x)} m inward)`);
  ok('...and it does not drift after it lands (the lock is a lock)', hit.c.distanceTo(park.c) < 0.15 && hit.c.distanceTo(thrownAt(1.5, 'hero').c) < 0.03, `${f3(hit.c.distanceTo(park.c))} m of creep from 1.40 s to the hit, ${f3(hit.c.distanceTo(thrownAt(1.5, 'hero').c))} m in the last 3 frames`);
  const loaded = vsClashState('hero', 1.1).arms[1].ex;
  const hard = vsClashState('hero', VS_CLASH_HIT).arms[1].ex;
  ok('the elbow LOADS then LOCKS OUT', loaded < -2.0 && hard > -0.6, `elbow ${f2(loaded)} → ${f2(hard)} rad`);
  const off = rigAt(VS_CLASH_HIT, 'hero').r;
  const offGlove = cloud(off.fists[1 - vsClashState('hero', VS_CLASH_HIT).arm]).c;
  ok('the other hand never leaves the guard', offGlove.y > 4.4 && offGlove.z < hit.c.z - 1.0, `guard hand y ${f2(offGlove.y)} m, z ${f2(offGlove.z)} vs the thrown glove at ${f2(hit.c.z)} m`);
  const wind = vsClashState('hero', 0).arms[1];
  ok('the arm really winds up (elbow bent, fist cocked high at the chest)', wind.ex < -1.8, `elbow at the count-open ${f2(wind.ex)} rad`);
}

// ============================================================================================== §3b the light
console.log('\n§3b  the light lands on the contact patch, not near it');
{
  const cp = closestPair(thrownAt(VS_CLASH_HIT, 'hero'), thrownAt(VS_CLASH_HIT, 'foe'));
  const err = Math.hypot(cp.mid.x - VS_CLASH_POINT.x, cp.mid.y - VS_CLASH_POINT.y, cp.mid.z - VS_CLASH_POINT.z);
  ok('the impact FX point is ON the two gloves', err < 0.25, `off by ${f2(err)} m (VS_CLASH_POINT ${f2(VS_CLASH_POINT.x)}, ${f2(VS_CLASH_POINT.y)}, ${f2(VS_CLASH_POINT.z)})`);
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
  const ts = [0.0, 0.3, 0.55, 1.05, 1.3, 1.4, VS_CLASH_HIT, 1.77, VS_CLASH_DUR, 2.4];
  for (const t of ts) {
    if (vsClashState('hero', t).arm !== 1 || vsClashState('foe', t).arm !== 1) bothRight = false;
  }
  ok('BOTH sides throw the right hand on every frame sampled', bothRight, `hero ${vsClashState('hero', VS_CLASH_HIT).arm} · foe ${vsClashState('foe', VS_CLASH_HIT).arm} at the hit (${ts.length} frames sampled)`);
  // What makes a clash read from the front: the fist each machine DRIVES is the one that reaches the clash, and the
  // two thrown fists are the pair that ends up nearest each other.
  const H = glovesAt(VS_CLASH_HIT, 'hero');
  const F = glovesAt(VS_CLASH_HIT, 'foe');
  const patch = new THREE.Vector3(VS_CLASH_POINT.x, VS_CLASH_POINT.y, VS_CLASH_POINT.z);
  for (const [name, G] of [['player', H], ['opponent', F]]) {
    const dT = G.thrown.c.distanceTo(patch);
    const dG = G.other.c.distanceTo(patch);
    ok(`${name}: his THROWN right hand is the one that reaches the clash`, dT < dG - 0.3, `thrown glove ${f2(dT)} m from the contact patch, guard hand ${f2(dG)} m back`);
  }
  const cross = [
    [H.thrown.c.distanceTo(F.thrown.c), 'right × right'],
    [H.thrown.c.distanceTo(F.other.c), 'right × left'],
    [H.other.c.distanceTo(F.thrown.c), 'left × right'],
  ].sort((a, b) => a[0] - b[0]);
  ok('...and the two RIGHT hands are the pair that meets', cross[0][1] === 'right × right', `${cross.map(([d, n]) => `${n} ${f2(d)} m`).join(' · ')}`);
}

console.log(fails === 0 ? '\nFIST CLASH: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
