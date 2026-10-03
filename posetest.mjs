// Get-up + freestyle validation harness — run it with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     npx esbuild src/game/poses.ts --bundle --format=esm --platform=node --outfile=.__poses.mjs --external:three
//     node posetest.mjs
// (or just `npm run test:pose`, which does all three)
//
// It drives the REAL Robot (robot.ts) with the REAL show-off / get-up pose curves (poses.ts), exactly the way
// Game.ts feeds them, and checks the things that make a get-up read as loose instead of stiff:
//   §1  the staging curves are exactly zero at both ends          (no pop into, no pop out of, the rise)
//   §2  the rise is continuous: no jump in any channel, at 60 fps
//   §3  rise = 1 hands the body back to the standing rig with a handover error of ~0
//   §4  a hand actually PLANTS on the canvas, and nothing ever sinks through it
//   §5  the hips lead the torso (that is what "not stiff" means here) — measured, not eyeballed
//   §6  every freestyle move is continuous and returns to the guard
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';
import { FREESTYLE, GUARD, freestylePose, getupFoot, riseArms, riseStages } from './.__poses.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };
let fails = 0;
const ok = (label, cond, info = '') => {
  if (!cond) fails++;
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${label}${info ? '   ' + info : ''}`);
};
const f3 = (v) => v.toFixed(3);

const mk = () => ({
  arms: [
    { sx: 0, sy: 0, sz: 0, ex: -1.2 },
    { sx: 0, sy: 0, sz: 0, ex: -1.2 },
  ],
  twist: 0, lean: 0.08, lunge: 0, dip: 0.12, roll: 0,
  vf: 0, vl: 0, af: 0, al: 0, yawRate: 0,
  hit: 0, hitSign: 1, hitUp: 0, fall: 0, air: 0, time: 0,
  glow: 0, flash: 0, tilt: 0, dash: 0, dashF: 0, dashL: 1,
});

const V = new THREE.Vector3();
/** world position of a joint of the rig (for the "does anything teleport" checks) */
const joint = (r, name, i) => {
  const o = name === 'fist' ? r.fists[i] : name === 'foot' ? r.footJ[i] : name === 'hip' ? r.hipJ[i] : name === 'knee' ? r.kneeJ[i] : r.head;
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(V).clone();
};

class Rig {
  constructor() {
    this.robot = new Robot(STYLE, 1);
    this.robot.snapFeet();
    this.a = mk();
    this.t = 0;
  }
  /** one 60 fps frame with the given AnimState overrides */
  step(over = {}, dt = D) {
    Object.assign(this.a, over);
    this.t += dt;
    this.a.time = this.t;
    this.robot.animate(this.a, dt);
    this.robot.root.updateMatrixWorld(true);
  }
}

const ROUND = 2.0; // the time on the floor (Fighter.downDur)
const RISE_AT = 0.3; // the flat-out beat before the rise starts (Game.ts)
const riseUAt = (t) => Math.max(0, Math.min(1, (1 - Math.max(0, 1 - t / ROUND) - RISE_AT) / (1 - RISE_AT)));

// ============================================================================================== §1 endpoints
console.log('\n§1  staging curves are exactly zero at both ends');
{
  // OFFSET stages must be zero at both ends (they move the body). SATURATING stages must be 0 → 1.
  const OFFSET = ['side', 'head', 'tuck', 'kneel', 'fold', 'reach', 'bounce'];
  const SAT = ['hipUp', 'unroll', 'legs', 'tall'];
  const s0 = riseStages(0);
  const s1 = riseStages(1);
  const bad = [];
  for (const k of OFFSET) {
    if (Math.abs(s0[k]) > 1e-9) bad.push(`u=0 ${k}=${s0[k].toFixed(4)}`);
    if (Math.abs(s1[k]) > 1e-9) bad.push(`u=1 ${k}=${s1[k].toFixed(4)}`);
  }
  for (const k of SAT) {
    if (Math.abs(s0[k]) > 1e-9) bad.push(`u=0 ${k}=${s0[k].toFixed(4)}`);
    if (Math.abs(s1[k] - 1) > 1e-9) bad.push(`u=1 ${k}=${s1[k].toFixed(4)}`);
  }
  ok('offset stages vanish and saturating stages finish at u=0 and u=1', bad.length === 0, bad.join(' '));

  let armBad = 0;
  for (const dir of [1, -1]) {
    const r = riseArms(1, dir);
    armBad = Math.max(armBad, Math.abs(r.a0.sx - GUARD.sx), Math.abs(r.a1.ex - GUARD.ex), Math.abs(r.a1.sz - GUARD.sz));
    if (Math.abs(r.tw) > 1e-9 || Math.abs(r.rl) > 1e-9) armBad = 9;
  }
  ok('at rise = 1 both arms are exactly the guard', armBad < 1e-9, `err ${armBad.toExponential(1)}`);
}

// ============================================================================================== §2 / §4 / §5 rise
console.log('\n§2  the get-up is continuous at 60 fps  ·  §4 hand plants  ·  §5 hips lead the torso');
const riseDir = 1;
{
  const rig = new Rig();
  // settle in the stance, then lie down the way a knock-down leaves him (fall = 1, limp, like Game.ts feeds it)
  for (let i = 0; i < 40; i++) rig.step({});
  const trace = [];
  let riseSteps = 0;
  let prevArms = null;
  let prevJoints = null;
  let maxArmJump = 0;
  let maxJointJump = 0;
  let minProbe = Infinity;
  let minFist = Infinity;
  let minFistU = 0;
  let plantGap = Infinity; // how far the pressing hand sits ABOVE the deepest body probe during the plant window
  let footLo = Infinity; // lowest point of a PLANTED (not stepping) boot once the IK has the legs back
  let footHi = 0; // highest a boot gets while it is mid re-plant
  let bootSink = Infinity; // the deepest a boot is ever allowed to dig into the canvas
  let bodyTouch = Infinity; // the closest a NON-foot part gets to the canvas while he is still down (no floating)
  let kneeEarly = 0; // the deepest knee fold reached while the hips are still on the canvas
  const plantArm = riseArms(0.3, riseDir).a0.sz > 0.6 ? 0 : 1; // the arm that is out on the canvas is the plant
  const n = Math.round(ROUND / D);
  for (let i = 0; i <= n; i++) {
    const t = i * D;
    const u = riseUAt(t);
    const rb = riseArms(u, riseDir);
    // the get-up footwork, the same call the game makes: without it the rig would be measured with its boots
    // still lying where the knock-down left them — a pose the game never actually shows
    const gf = getupFoot(u, riseSteps);
    if (gf) riseSteps = gf.steps;
    const foot = gf ? { punchFoot: gf.foot, punchZ: gf.z, punchX: gf.x, punchDur: gf.dur, punchSeq: gf.seq, stepLift: gf.lift } : {};
    rig.step({ arms: [rb.a0, rb.a1], twist: rb.tw, lean: rb.ln, dip: rb.dp, roll: rb.rl, fall: 1, air: 0, rise: u, riseDir, ...foot });
    const arms = [rig.a.arms[0].sx, rig.a.arms[0].sz, rig.a.arms[1].sx, rig.a.arms[1].sz];
    if (prevArms) maxArmJump = Math.max(maxArmJump, ...arms.map((v, k) => Math.abs(v - prevArms[k])));
    prevArms = arms;
    const j = [joint(rig.robot, 'fist', 0), joint(rig.robot, 'fist', 1), joint(rig.robot, 'head')];
    if (prevJoints) maxJointJump = Math.max(maxJointJump, ...j.map((v, k) => v.distanceTo(prevJoints[k])));
    prevJoints = j;
    // floor probes: the planted hand really presses the canvas, and nothing ever sinks through it
    rig.robot.root.updateMatrixWorld(true);
    const probeMin = (pred) => {
      let lo = Infinity;
      for (const pr of rig.robot.probes) {
        if (!pred(pr)) continue;
        V.copy(pr.p).applyMatrix4(pr.parent.matrixWorld);
        if (V.y < lo) lo = V.y;
      }
      return lo;
    };
    const bootLo = (i) => probeMin((pr) => pr.parent === rig.robot.footJ[i]);
    const lo = probeMin((pr) => pr.parent === rig.robot.fists[plantArm]);
    if (lo < minFist) {
      minFist = lo;
      minFistU = u;
    }
    if (u > 0.14 && u < 0.52) {
      const bodyLo = probeMin((pr) => !pr.foot && pr.parent !== rig.robot.fists[plantArm]);
      plantGap = Math.min(plantGap, lo - bodyLo); // ~0 means the hand IS the thing holding him off the canvas
    }
    // once the IK owns the legs (u > 0.6) a foot that is NOT mid-step has to be sitting on the canvas
    if (u > 0.62) {
      for (let i = 0; i < 2; i++) {
        const boot = bootLo(i);
        if (rig.robot.feet[i].stepping) footHi = Math.max(footHi, boot);
        else footLo = Math.min(footLo, boot);
      }
    }
    // the FOOT probes are the IK's business (and the solver deliberately skips them once the IK owns the feet):
    // this check is about the body never sinking through the canvas
    for (const pr of rig.robot.probes) {
      if (pr.foot) continue;
      V.copy(pr.p).applyMatrix4(pr.parent.matrixWorld);
      if (V.y < minProbe) minProbe = V.y;
    }
    // what the body is doing — the "loose" evidence (the hip JOINT height is what a viewer reads, not the pivot)
    const pitch = rig.robot.body.rotation.x;
    const hipY = joint(rig.robot, 'hip', 0).y;
    const bootA = bootLo(0);
    const bootB = bootLo(1);
    bootSink = Math.min(bootSink, bootA, bootB);
    if (u < 0.45) bodyTouch = Math.min(bodyTouch, probeMin((pr) => !pr.foot));
    if (u <= 0.35) kneeEarly = Math.max(kneeEarly, rig.robot.kneeJ[0].rotation.x, rig.robot.kneeJ[1].rotation.x);
    trace.push({ u, pitch, hipY, yaw: rig.robot.body.rotation.y, roll: rig.robot.body.rotation.z });
  }
  ok('no jump in the arm channels', maxArmJump < 0.9, `worst ${f3(maxArmJump)} rad/frame`);
  ok('no teleport of fist or head', maxJointJump < 0.9, `worst ${f3(maxJointJump)} local/frame`);
  ok('a hand plants on the canvas', minFist < 0.12, `lowest knuckle ${f3(minFist)} at rise ${f3(minFistU)}`);
  ok('the plant hand carries the weight', plantGap < 0.12, `hand sits ${f3(plantGap)} against the body's deepest point`);
  ok('nothing sinks through the floor', minProbe > -0.02, `lowest probe ${f3(minProbe)}`);
  ok('the boots are resting on the canvas once he is up', footLo > -0.05 && footLo < 0.3, `lowest planted boot ${f3(footLo)} (worst step lift ${f3(footHi)})`);
  ok('no boot digs through the canvas on the way up', bootSink > -0.12, `deepest boot ${f3(bootSink)}`);
  ok('he never floats above the canvas while he is down', bodyTouch < 0.2, `closest body part ${f3(bodyTouch)} at the start`);
  ok('the knees are loaded while he is still on the canvas', kneeEarly > 0.9, `deepest knee ${f3(kneeEarly)} rad by rise 0.35`);

  // §5 the hips lead: at the halfway point of the push the hips are most of the way up while the torso is still
  // folded. A stiff get-up is the other way round (the torso rotates up first, the hips follow).
  const at = (u) => trace.reduce((b, s) => (Math.abs(s.u - u) < Math.abs(b.u - u) ? s : b), trace[0]);
  const low = at(0.02);
  const up = at(1);
  const mid = at(0.42);
  const hipFrac = (mid.hipY - low.hipY) / Math.max(0.001, up.hipY - low.hipY);
  const pitchFrac = (mid.pitch - low.pitch) / Math.max(0.001, up.pitch - low.pitch);
  // A rise that reads as a person standing up has its parts on DIFFERENT clocks: the hips start climbing to a
  // crouch on their own while the torso is still folded back over them, and the torso only unwinds at the end.
  // (A stiff get-up rotates the whole body up about the feet in one rigid arc: hipFrac ≈ pitchFrac.)
  ok(
    'the hips are up while the torso is still folded',
    hipFrac > 0.4 && hipFrac < 0.95 && pitchFrac < 0.5 && pitchFrac < hipFrac - 0.1,
    `hips ${(hipFrac * 100).toFixed(0)}% vs torso ${(pitchFrac * 100).toFixed(0)}% at rise 0.42 (torso still ${f3(mid.pitch)} rad back)`,
  );
  const yawAt = trace.reduce((m, s) => Math.max(m, Math.abs(s.yaw)), 0);
  ok('it rolls onto a shoulder on the way up', yawAt > 0.5, `peak body turn ${f3(yawAt)} rad`);
  console.log(
    `        shape: rise ${trace.map((s) => at(0).u === s.u ? '' : '').join('')}` +
      [0.1, 0.3, 0.5, 0.7, 0.9].map((u) => `u${u}=[hip ${f3(at(u).hipY)} pitch ${f3(at(u).pitch)} yaw ${f3(at(u).yaw)}]`).join('  '),
  );
}

// ============================================================================================== §3 handover
console.log('\n§3  rise = 1 hands the body back to the standing rig without a pop');
{
  const guard = riseArms(1, riseDir);
  const arms = [guard.a0, guard.a1]; // the same arms in both rigs: only the BODY staging may differ
  const stand = new Rig();
  for (let i = 0; i < 90; i++) stand.step({ arms, fall: 0 });
  const ended = new Rig();
  for (let i = 0; i < 90; i++) ended.step({ arms, fall: 1, rise: 1, riseDir });
  const dp = stand.robot.body.position.distanceTo(ended.robot.body.position);
  const dr = Math.abs(stand.robot.body.rotation.x - ended.robot.body.rotation.x) + Math.abs(stand.robot.body.rotation.z - ended.robot.body.rotation.z);
  const df = joint(stand.robot, 'fist', 0).distanceTo(joint(ended.robot, 'fist', 0));
  const dh = joint(stand.robot, 'head').distanceTo(joint(ended.robot, 'head'));
  ok('body position matches', dp < 0.05, `Δ ${f3(dp)}`);
  ok('body rotation matches', dr < 0.05, `Δ ${f3(dr)} rad`);
  ok('fists sit in the same place', df < 0.06, `Δ ${f3(df)}`);
  ok('head sits in the same place', dh < 0.06, `Δ ${f3(dh)}`);
}

// ============================================================================================== §6 freestyle
console.log('\n§6  every freestyle move is continuous and returns to the guard');
{
  for (const fs of FREESTYLE) {
    const rig = new Rig();
    for (let i = 0; i < 40; i++) rig.step({});
    let prev = null;
    let maxJump = 0;
    let nan = false;
    const dur = fs.dur;
    const n = Math.round(dur / D);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const fb = freestylePose(fs.id, u, i * D);
      const beat = { arms: [fb.a0, fb.a1], twist: fb.tw, lean: fb.ln, dip: fb.dp, roll: fb.rl };
      rig.step(beat);
      const v = [fb.a0.sx, fb.a0.sy, fb.a0.sz, fb.a0.ex, fb.a1.sx, fb.a1.sy, fb.a1.sz, fb.a1.ex, fb.tw, fb.ln, fb.dp, fb.rl];
      if (v.some((x) => !Number.isFinite(x))) nan = true;
      if (prev) maxJump = Math.max(maxJump, ...v.map((x, k) => Math.abs(x - prev[k])));
      prev = v;
    }
    const end = freestylePose(fs.id, 1, 0);
    // the windmill ends a full turn round the guard: same pose, so compare it modulo 2π
    const wrap = (v, ref) => Math.abs(v - ref - Math.round((v - ref) / (Math.PI * 2)) * Math.PI * 2);
    const endErr = Math.max(
      wrap(end.a0.sx, GUARD.sx), wrap(end.a1.sx, GUARD.sx),
      Math.abs(end.a0.sz - GUARD.sz), Math.abs(end.a1.ex - GUARD.ex),
      Math.abs(end.tw), Math.abs(end.ln - 0.08), Math.abs(end.dp - 0.12), Math.abs(end.rl),
    );
    ok(
      `${fs.key} ${fs.name}`,
      !nan && maxJump < 1.0 && endErr < 0.5,
      `worst ${f3(maxJump)} rad/frame · ends ${endErr.toExponential(1)} off the neutral`,
    );
  }
}

console.log(fails === 0 ? '\nGET-UP + FREESTYLE: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
