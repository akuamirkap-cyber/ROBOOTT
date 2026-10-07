// Legacy VS FIST-CLASH rig diagnostic (the live matchmaking flow intentionally does NOT play this pose) — run with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     npx esbuild src/game/Game.ts  --bundle --format=esm --platform=node --outfile=.__game.mjs  --external:three
//     node clashtest.mjs
// (or just `npm run test:clash`, which does all three)
//
// It drives the REAL Robot rigs CONTINUOUSLY through the LEGACY diagnostic tracks out of Game.ts, from t = 0
// through the impact and cover, and checks:
//   §1  the beat: side-tuned chambers on one shared timeline, both right gloves converging on the "1"
//   §2  the GEOMETRY, sampled on real frames: all four gloves, no interpenetration
//   §3  the POWER: long chambers, smooth whips, locked elbows and hands that stay up
//   §4  BOTH duelists throw their OWN RIGHT hand (arm 1)
// NOTE: earlier cuts snapped a separate freshly-settled rig per sampled frame. That harness lies once the pose
// carries a 1.4 rad chest coil (the balance solver re-anchors the feet mid-settle) — the measurements below come
// from the continuous timeline itself, exactly as played.
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';
import { Game, TRANSITIONS, VS_CLASH_DUR, VS_CLASH_HIT, VS_CLASH_KEYS, VS_CLASH_KEYS_FOE, VS_CLASH_POINT, VS_CLASH_SEP, VS_LOCK_BEAT, VS_LOCK_BEATS, VS_LOCK_DUR, VS_OPPONENT_YAW, VS_PLAYER_YAW, vsClashState } from './.__game.mjs';

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
const HERO_X = -VS_CLASH_SEP;
const FOE_X = VS_CLASH_SEP;
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
    // Keep a spatially distributed surface sample. Full 20k-vertex gloves made the offline ray test quadratic
    // without making the contact measurement more useful; ~220 samples per mesh still resolves the knuckles.
    const stride = Math.max(1, Math.floor(pos.count / 220));
    for (let i = 0; i < pos.count; i += stride) {
      V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push(V.x, V.y, V.z);
    }
    box.expandByObject(o); // exact bounds; only the expensive surface-distance/ray queries use the sample above
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
      h: { thrown: gloveCloud(hero.fists[ch.arm]), guard: gloveCloud(hero.fists[1 - ch.arm]), chest: hero.chest.getWorldPosition(new THREE.Vector3()) },
      f: { thrown: gloveCloud(foe.fists[cf.arm]), guard: gloveCloud(foe.fists[1 - cf.arm]), chest: foe.chest.getWorldPosition(new THREE.Vector3()) },
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
/** strict penetration: is any sampled glove-surface vertex INSIDE the other's meshes? count ray crossings */
const RAY = new THREE.Raycaster();
const vertsInside = (A, B) => {
  let n = 0;
  const dir = new THREE.Vector3(1, 0.37, 0.23).normalize();
  // Raycaster defaults to FrontSide; that counts only the near face of an outside pass and falsely labels it
  // "inside". DoubleSide gives an even enter/exit count from outside and an odd exit count from inside.
  const savedSides = [];
  for (const { m } of B.meshes) {
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      savedSides.push([mat, mat.side]);
      mat.side = THREE.DoubleSide;
    }
  }
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
  for (const [mat, side] of savedSides) mat.side = side;
  return n;
};
const GLOVE_KIND = ['guard hand', 'thrown hand'];

// ============================================================================================== §1 the beat
console.log('\n§1  the beat: side-tuned right-hand crosses, both gloves meeting on the "1"');
{
  const SIDES = [['player', 'hero', VS_CLASH_KEYS], ['opponent', 'foe', VS_CLASH_KEYS_FOE]];
  const playerTimes = VS_CLASH_KEYS.map((k) => k.t);
  const opponentTimes = VS_CLASH_KEYS_FOE.map((k) => k.t);
  ok('side-tuned poses share the exact same authored beat grid', playerTimes.length === opponentTimes.length && playerTimes.every((t, i) => Math.abs(t - opponentTimes[i]) < 1e-9), 'independent right-hand chambers, synchronized release and contact');
  for (const [name, , keys] of SIDES) {
    ok(`${name}: its track runs forward in time`, keys.every((k, i) => i === 0 || k.t > keys[i - 1].t), keys.map((k) => f2(k.t)).join(' < ') + ' s');
  }
  const elbow = (side, t) => {
    const c = vsClashState(side, t);
    return c.arms[c.arm].ex;
  };
  const coilD = (side, t) => (side === 'hero' ? -1 : 1) * vsClashState(side, t).twist;
  for (const [name, side] of SIDES) {
    // A long, high chamber comes from a folded arm AND a counter-wound chest — not from distance numbers alone.
    const coilHand = frameAt(0.62)[side === 'hero' ? 'h' : 'f'].thrown.c;
    ok(`${name}: fist is high in a loaded coil, elbow folded and chest wound`, elbow(side, 0.62) <= -2.0 && Math.abs(coilD(side, 0.62)) >= 1.05 && coilHand.y > 6.0, `elbow ${f2(elbow(side, 0.62))} rad · chest ${f2(Math.abs(coilD(side, 0.62)))} rad · glove y ${f2(coilHand.y)} m`);
  }
  // Their local arcs differ because the fighters face opposite directions, but both right gloves must converge on
  // the same countdown beat after starting comfortably apart.
  const preGap = closestPair(frameAt(VS_CLASH_HIT - 0.12).h.thrown, frameAt(VS_CLASH_HIT - 0.12).f.thrown).g;
  const impactGap = closestPair(frameAt(VS_CLASH_HIT).h.thrown, frameAt(VS_CLASH_HIT).f.thrown).g;
  ok('both right-hand arcs converge together on the impact beat', preGap > impactGap + 0.2 && impactGap <= 0.04, `surface gap ${f3(preGap)} → ${f3(impactGap)} m`);
  const spread = (t) => Math.abs(-(vsClashState('hero', t).twist) - vsClashState('foe', t).twist);
  let maxSpread = 0;
  for (let t = 0.1; t <= 0.92; t += D) maxSpread = Math.max(maxSpread, spread(t));
  ok('both chests unwind in tandem', maxSpread < 0.08, `worst twist mismatch ${f3(maxSpread)} rad across the wind-up`);
  for (const [name, side] of [['player', 'h'], ['opponent', 'f']]) {
    const reach = Math.max(...frames.filter((f) => f.t >= 0.5 && f.t <= 0.96).map((f) => f[side].chest.distanceTo(f[side].thrown.c)));
    ok(`${name}: the fist chambers clearly off the chest line`, reach > 2.1, `deepest fist-off-chest reach ${f2(reach)} m during the coil`);
  }
  ok('the live 3–2–1 countdown stays quick and evenly paced', VS_LOCK_BEATS === 3 && VS_LOCK_DUR <= 1.6, `${VS_LOCK_BEATS} beats × ${f2(VS_LOCK_BEAT)} s = ${f2(VS_LOCK_DUR)} s`);
  ok('the full countdown duration matches its beat clock', Math.abs(VS_LOCK_DUR - VS_LOCK_BEATS * VS_LOCK_BEAT) < 1e-6, `${f2(VS_LOCK_DUR)} s total`);
  const coverFitsLastBeat = TRANSITIONS.every((tr) => tr.cover <= VS_LOCK_BEAT * 1000);
  ok('the selected ring transition fits between "1" and launch', coverFitsLastBeat, `max cover ${Math.max(...TRANSITIONS.map((tr) => tr.cover))} ms · final beat ${VS_LOCK_BEAT * 1000} ms`);
  ok('the diagnostic legacy clash track still holds its post-impact pose', VS_CLASH_DUR > VS_CLASH_HIT, `held ${f2(VS_CLASH_DUR - VS_CLASH_HIT)} s in the offline rig test`);
  // Compare real 60 fps glove steps for abruptness; local launch arcs can differ but neither should snap.
  const peakStep = (side) => {
    let peak = 0;
    let at = 0;
    let prev = null;
    for (const fr of frames) {
      if (fr.t < 0.56 || fr.t > VS_CLASH_HIT + 0.05) continue;
      const c = fr[side].thrown.c;
      if (prev) {
        const step = c.distanceTo(prev);
        if (step > peak) { peak = step; at = fr.t; }
      }
      prev = c;
    }
    return { peak, at };
  };
  const heroStep = peakStep('h');
  const foeStep = peakStep('f');
  ok('both right gloves whip in smoothly without a snap', heroStep.peak <= 0.45 && foeStep.peak <= 0.45, `player ${f2(heroStep.peak)} at ${f2(heroStep.at)} s · opponent ${f2(foeStep.peak)} at ${f2(foeStep.at)} s`);
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
  for (const fr of frames) {
    const HG = [fr.h.guard, fr.h.thrown];
    const FG = [fr.f.guard, fr.f.thrown];
    for (let hi = 0; hi < 2; hi++) {
      for (let fi = 0; fi < 2; fi++) {
        const A = HG[hi];
        const B = FG[fi];
        if (boxGap(A.box, B.box) > 0.5) continue;
        const cp = closestPair(A, B);
        if (cp.g < minGap) {
          minGap = cp.g;
          minAt = fr.t;
          minPair = `player ${GLOVE_KIND[hi]} × opponent ${GLOVE_KIND[fi]}`;
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
  ok('NO glove interpenetration: sampled surface vertices stay outside the opposing gloves', penFrames === 0, penFrames ? `${penFrames} frames with a sampled vertex inside a glove — worst ${penWorst} at ${f2(penAt)} s` : 'DoubleSide ray parity on every overlapping pair across the whole clash');
  ok('there is NO close pass anywhere before the "1" (the gloves only get near each other AT the hit)', minAt >= VS_CLASH_HIT - 0.12, `closest surface approach ${f3(minGap)} m at ${f2(minAt)} s (${minPair}), the "1" at ${f2(VS_CLASH_HIT)} s`);
  ok('...and at the hit itself the two gloves are within 4 cm, not overlapping', hitGap >= -0.01 && hitGap <= 0.04, `${f3(hitGap)} m between the glove surfaces at ${f2(VS_CLASH_HIT)} s`);
  ok('...and they meet LEVEL, glove to glove', hitDy <= 0.22, `Δy ${f3(hitDy)} m`);
  ok('...in front of both chests', hitMid.z > 0.8 && hitMid.z < 3.5, `contact patch at z ${f2(hitMid.z)} m`);
  ok('...dead centre on the stage, not off at one side', Math.abs(hitMid.x) < 1.6, `contact patch at x ${f2(hitMid.x)} m (the machines stand at ∓${f2(VS_CLASH_SEP)} m)`);
  ok('...at chin height, where a clash reads', hitMid.y > 5.0 && hitMid.y < 7.0, `contact patch at y ${f2(hitMid.y)} m`);
  const end = frames[frames.length - 1];
  ok('they are STILL locked when the shot is covered', closestPair(end.h.thrown, end.f.thrown).g < 0.5, `${f3(closestPair(end.h.thrown, end.f.thrown).g)} m apart at the cover`);
}

// ============================================================================================== §3 the power
console.log('\n§3  the power: a deep coil, a whip, a locked elbow, a hand that stays up');
{
  const coilH = frameAt(0.62).h.thrown.c;
  const coilF = frameAt(0.62).f.thrown.c;
  const parkH = frameAt(VS_CLASH_HIT).h.thrown.c;
  const parkF = frameAt(VS_CLASH_HIT).f.thrown.c;
  const travelH = coilH.distanceTo(parkH);
  const travelF = coilF.distanceTo(parkF);
  ok('the player right fist launches from a long, high chamber', travelH > 4.8, `${f2(travelH)} m from the loaded fist to contact`);
  ok('the opponent right fist also draws back for a full cross', travelF > 3.0, `${f2(travelF)} m from the loaded fist to contact`);
  ok('both fists drive INWARDS from their own loaded sides', Math.abs(parkH.x) < Math.abs(coilH.x) && coilH.x < parkH.x && Math.abs(parkF.x) < Math.abs(coilF.x) && coilF.x > parkF.x, `player x ${f2(coilH.x)} → ${f2(parkH.x)} · opponent x ${f2(coilF.x)} → ${f2(parkF.x)}`);
  const heroArm = vsClashState('hero', 0).arm;
  const loaded = vsClashState('hero', 0.62).arms[heroArm].ex;
  const hard = vsClashState('hero', VS_CLASH_HIT).arms[heroArm].ex;
  ok('the elbow loads deep, then locks out at impact', loaded < -2.0 && hard > -0.6, `elbow ${f2(loaded)} → ${f2(hard)} rad`);
  const off = frameAt(VS_CLASH_HIT).h.guard.c;
  ok('the free hand stays high in guard', off.y > parkH.y + 0.3, `guard hand y ${f2(off.y)} m vs the thrown glove at ${f2(parkH.y)} m`);
  const wind = vsClashState('hero', 0).arms[heroArm];
  ok('the clash opens from a real guard (elbow folded, fist cocked)', wind.ex < -1.8, `elbow at the count-open ${f2(wind.ex)} rad`);
}

// ============================================================================================== §3b the light
console.log('\n§3b  the light lands on the contact patch, not near it');
{
  const fr = frameAt(VS_CLASH_HIT);
  const cp = closestPair(fr.h.thrown, fr.f.thrown);
  const err = Math.hypot(cp.mid.x - VS_CLASH_POINT.x, cp.mid.y - VS_CLASH_POINT.y, cp.mid.z - VS_CLASH_POINT.z);
  ok('the impact FX point is ON the two gloves', err < 0.25, `off by ${f2(err)} m; measured contact (${f2(cp.mid.x)}, ${f2(cp.mid.y)}, ${f2(cp.mid.z)})`);
}

// ============================================================================================== §4 both right hands
console.log('\n§4  both the player and opponent use their own right hand');
{
  const sampleTimes = [0.0, 0.3, 0.55, 0.9, 1.05, VS_CLASH_HIT, 1.4, VS_CLASH_DUR];
  const correctHands = sampleTimes.every((t) => vsClashState('hero', t).arm === 1 && vsClashState('foe', t).arm === 1);
  ok('both duelists keep right hand (arm 1) selected throughout the clash', correctHands, `hero ${vsClashState('hero', VS_CLASH_HIT).arm} · opponent ${vsClashState('foe', VS_CLASH_HIT).arm} at impact`);
  const fr = frameAt(VS_CLASH_HIT);
  const patch = new THREE.Vector3(VS_CLASH_POINT.x, VS_CLASH_POINT.y, VS_CLASH_POINT.z);
  for (const [name, S] of [['player', fr.h], ['opponent', fr.f]]) {
    const dT = S.thrown.c.distanceTo(patch);
    const dG = S.guard.c.distanceTo(patch);
    ok(`${name}: the selected clash glove reaches contact; the free glove stays in guard`, dT < dG - 0.3, `clash glove ${f2(dT)} m from impact, guard ${f2(dG)} m back`);
  }
}

// ============================================================================================== §5 matchmaking portrait
console.log('\n§5  matchmaking reuses the menu pose, mirrored inward and held still');
{
  const samePose = (a, b) => ['sx', 'sy', 'sz', 'ex'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  const poseTools = { heroArms: Game.prototype.heroArms };
  const menuPose = Game.prototype.heroAnimState.call(poseTools, 'guard', 0, 0, 0, false);
  const matchPose = Game.prototype.heroAnimState.call(poseTools, 'guard', 8, 0.5, -0.5, false, true);
  const foePose = Game.prototype.heroAnimState.call(poseTools, 'guard', 8, 0.5, -0.5, true, true);
  const sameStance = matchPose.arms.every((p, i) => samePose(p, menuPose.arms[i])) &&
    ['twist', 'lean', 'lunge', 'dip', 'roll'].every((k) => Math.abs(matchPose[k] - menuPose[k]) < 1e-9);
  ok('matchmaking keeps the same selected guard pose as the initial menu', sameStance, 'same arm and body channels at the frozen menu frame');
  ok('the opponent receives the reflected menu pose', samePose(foePose.arms[0], menuPose.arms[1]) && samePose(foePose.arms[1], menuPose.arms[0]) && foePose.twist === -menuPose.twist, 'arms swapped, torso turn reflected');
  ok('the player on the left faces right into the centre', Math.sin(VS_PLAYER_YAW) > 0, `yaw ${f2(VS_PLAYER_YAW)} rad`);
  ok('the opponent on the right faces left into the centre', Math.sin(VS_OPPONENT_YAW) < 0, `yaw ${f2(VS_OPPONENT_YAW)} rad`);

  const rig = new Robot(STYLE, 1);
  rig.snapFeet();
  const heights = [];
  for (let i = 0; i < 120; i++) {
    rig.animate(matchPose, D);
    if (i >= 60) heights.push(rig.body.position.y);
  }
  const bob = Math.max(...heights) - Math.min(...heights);
  ok('the frozen menu pose stays vertically still after it is staged', matchPose.idleBounce === 0 && matchPose.time === 0 && bob < 0.002, `idle-bob range ${f3(bob)} local over 1 s`);
}

console.log(fails === 0 ? '\nMATCHMAKING + LEGACY RIG: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
