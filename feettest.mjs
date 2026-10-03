// Footwork validation harness — run it with:
//     npx esbuild src/game/robot.ts --bundle --format=esm --platform=node --outfile=.__robot.mjs --external:three
//     node feettest.mjs
//
// It drives the REAL Robot (src/game/robot.ts) with the same acceleration numbers the game feeds it, and reads the
// feet back out of the object. Three things are checked here:
//   • a flicked A/D must not read as a stride   (the walk cycle only starts once the key is really held)
//   • every strike re-plants the foot on the punching side, metred by the distance to the enemy
//   • every strike also fires the ocular motion effects (lock-on ring, streak, eye flash)
//   • the (redesigned) boot still rests exactly on the canvas
//   • a blow throws the body in the direction it actually came from (§11)
// "local" = robot-local units (the same units the foot targets use), so ~1.0 local is a full step.
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };

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

class Rig {
  constructor() {
    this.robot = new Robot(STYLE, 1);
    this.robot.snapFeet();
    this.feet = this.robot.feet;
    this.a = mk();
    this.t = 0;
    this.gaitSteps = 0;
    this.punchSteps = 0;
    this.acc = { x: 0, y: 0 };
    this.prevV = { f: 0, l: 0 };
    this.wasStepping = [false, false];
    this.run(1.2); // settle into the boxing stance
  }
  get S() {
    return this.robot.root.scale.x;
  }
  loc(i) {
    const rp = this.robot.root.position;
    return { x: (this.feet[i].x - rp.x) / this.S, z: (this.feet[i].z - rp.z) / this.S };
  }
  frame(vf, vl, extra) {
    const a = this.a;
    // the same smoothed acceleration Game.ts hands the robot
    const ax = (vl - this.prevV.l) / D;
    const az = (vf - this.prevV.f) / D;
    const k = 1 - Math.exp(-10 * D);
    this.acc.x += (ax - this.acc.x) * k;
    this.acc.y += (az - this.acc.y) * k;
    this.prevV.f = vf;
    this.prevV.l = vl;
    a.vf = vf;
    a.vl = vl;
    a.af = this.acc.y;
    a.al = this.acc.x;
    Object.assign(a, extra ?? {});
    // integrate the body exactly like Game.ts does (AnimState velocities are per f.scale; local = /0.94)
    const rp = this.robot.root.position;
    rp.x += vl * (this.S / 0.94) * D;
    rp.z += vf * (this.S / 0.94) * D;
    this.t += D;
    a.time = this.t;
    this.robot.animate(a, D);
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.stepping && !this.wasStepping[i]) {
        if (f.gaitStep) this.gaitSteps++;
        if (f.punchStep) this.punchSteps++;
      }
      this.wasStepping[i] = f.stepping;
    }
  }
  run(seconds, vf = 0, vl = 0, extra) {
    for (let i = 0, n = Math.round(seconds / D); i < n; i++) this.frame(vf, vl, extra);
  }
  /** the game's velocity model: accelerate towards `wish` while the key is held, brake once it is released */
  move(hold, wish, dir = 'side', extra) {
    let v = 0;
    let t = 0;
    for (let i = 0, n = Math.ceil((hold + 0.6) / D); i < n; i++) {
      const held = t < hold;
      const acc = held ? 28 : 18;
      v = held ? Math.min(wish, v + acc * D) : Math.max(0, v - acc * D);
      this.frame(dir === 'side' ? 0 : v, dir === 'side' ? v : 0, extra);
      t += D;
    }
  }
  /** distance of each planted foot from the boxing stance it should hold (local units) */
  off() {
    const wide = 1.18 + this.a.dip * 0.3;
    const ideal = [
      { x: wide, z: 0.62 },
      { x: -wide, z: -0.72 },
    ];
    return [0, 1].map((i) => {
      const l = this.loc(i);
      return Math.hypot(l.x - ideal[i].x, l.z - ideal[i].z);
    });
  }
}

let fails = 0;
const check = (name, ok, info) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  if (!ok) fails++;
};

console.log('=== 1. A FLICK OF A/D MUST NOT STRIDE ===');
for (const hold of [0.05, 0.08]) {
  const r = new Rig();
  const before = [0, 1].map((i) => r.loc(i));
  r.move(hold, 4.9, 'side');
  const after = [0, 1].map((i) => r.loc(i));
  const travel = Math.max(...[0, 1].map((i) => Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z)));
  check(
    `flick ${(hold * 1000) | 0}ms: feet stay put`,
    travel < 0.42 && r.gaitSteps === 0,
    `travel ${travel.toFixed(3)} local, gait steps ${r.gaitSteps}, err ${r.feet.map((f) => f.err.toFixed(2)).join('/')}`,
  );
}

console.log('=== 2. A REAL HOLD STILL WALKS (REGRESSION) ===');
{
  const r = new Rig();
  r.move(1.4, 5.7, 'fwd');
  const z = r.robot.root.position.z / r.robot.root.scale.x;
  const err = Math.max(...r.feet.map((f) => f.err));
  check('hold 1.4s: gait runs normally', r.gaitSteps >= 3 && err < 1.3 && z > 4, `steps ${r.gaitSteps}, body z ${z.toFixed(2)}, worst err ${err.toFixed(2)}`);
}

console.log('=== 3. A MEDIUM TAP LANDS BACK IN THE STANCE ===');
{
  const r = new Rig();
  r.move(0.22, 4.9, 'side');
  const off = Math.max(...r.off());
  check('tap 220ms: lands in the stance', off < 0.62, `steps ${r.gaitSteps}, worst off-stance ${off.toFixed(3)} local`);
}

console.log('=== 4. EVERY PUNCH RE-PLANTS THE PUNCHING LEG ===');
{
  const r = new Rig();
  for (let i = 0; i < 24; i++) r.frame(0, 0, { punchFoot: 0, punchZ: 0.5, punchX: -0.03, punchDur: 0.25, punchSeq: 1 });
  const lead = r.loc(0).z - 0.62;
  const rearMoved = Math.abs(r.loc(1).z + 0.72);
  check('left hand: lead (left) foot steps in', r.punchSteps === 1 && lead > 0.3 && lead < 0.62 && rearMoved < 0.2, `lead +${lead.toFixed(3)} (want 0.30-0.62), rear moved ${rearMoved.toFixed(3)}, plants ${r.punchSteps}`);
  const l2 = r.loc(0);
  for (let i = 0; i < 20; i++) r.frame(0, 0, { punchFoot: 0, punchZ: 0.5, punchX: -0.03, punchDur: 0.25, punchSeq: 1 });
  check('the same strike does not plant twice', r.punchSteps === 1 && Math.abs(r.loc(0).z - l2.z) < 0.02, `plants ${r.punchSteps}`);
  for (let i = 0; i < 24; i++) r.frame(0, 0, { punchFoot: 1, punchZ: 0.5, punchX: 0.05, punchDur: 0.25, punchSeq: 2 });
  const rear = r.loc(1).z + 0.72;
  check('right hand: rear (right) foot steps in', r.punchSteps === 2 && rear > 0.3 && rear < 0.62, `rear +${rear.toFixed(3)} (want 0.30-0.62)`);
  check('the stance never becomes a lunge', r.loc(0).z - 0.62 < 0.62, `lead still +${(r.loc(0).z - 0.62).toFixed(3)} ahead`);
}

console.log('=== 5. THE STEP IS METRED BY THE DISTANCE ===');
{
  const r = new Rig();
  const plant = (seq, z) => {
    for (let i = 0; i < 24; i++) r.frame(0, 0, { punchFoot: 0, punchZ: z, punchX: 0, punchDur: 0.2, punchSeq: seq });
    return r.loc(0).z - 0.62;
  };
  const near = plant(10, 0.13);
  const far = plant(11, 0.59);
  check('closer enemy = smaller step', near < far - 0.2 && near < 0.3, `clinch +${near.toFixed(3)} vs out of range +${far.toFixed(3)}`);
}

console.log('=== 6. REPEATED FLICKS SHUFFLE, NEVER STRIDE ===');
{
  const r = new Rig();
  let worst = 0;
  for (let k = 0; k < 6; k++) {
    r.move(0.08, 4.9, 'side');
    r.run(0.12);
    worst = Math.max(worst, ...r.feet.map((f) => f.err));
  }
  check('6 flicks in a row', r.gaitSteps === 0 && worst < 0.95 && Math.max(...r.off()) < 0.95, `worst err ${worst.toFixed(2)}, off-stance ${Math.max(...r.off()).toFixed(2)}, stride steps ${r.gaitSteps}`);
}

console.log('=== 7. PUNCHING ON THE MOVE STAYS STABLE ===');
{
  const r = new Rig();
  let bad = 0;
  for (let k = 0; k < 5; k++) {
    r.move(0.3, 5.7, 'fwd', { punchFoot: 0, punchZ: 0.42, punchX: -0.04, punchDur: 0.22, punchSeq: 10 + k });
    bad += r.feet.some((f) => !Number.isFinite(f.x) || !Number.isFinite(f.z)) ? 1 : 0;
  }
  r.run(0.4);
  check('walking + punching: feet stay sane', bad === 0 && r.punchSteps === 5, `plants ${r.punchSteps}/5, bad frames ${bad}`);
}

console.log('=== 8. EVERY PUNCH FIRES THE EYE OPTICS ===');
{
  const r = new Rig();
  const pulse = r.robot.eyePulses[0];
  const beam = r.robot.eyeBeams[0];
  const pupil = r.robot.eyePupils[0];
  const flare = r.robot.eyeFlares[0];
  const light = r.robot.eyeLights[0];
  const op = (m) => m.material.opacity;
  r.run(0.6);
  const idle = op(pulse);
  // wind-up: the fist is on its way out
  for (let i = 0; i < 6; i++) r.frame(0, 0, { strike: 0.5, strikePow: 0.6 });
  const charged = pupil.scale.y;
  // release: the crossing fires the one-shot
  let peakPulse = 0;
  let peakBeam = 0;
  let peakLight = 0;
  let peakFlare = 0;
  let stretched = 0;
  for (let i = 0; i < 22; i++) {
    r.frame(0, 0, { strike: 1, strikePow: 0.6 });
    peakPulse = Math.max(peakPulse, op(pulse));
    peakBeam = Math.max(peakBeam, op(beam));
    peakLight = Math.max(peakLight, light.intensity);
    peakFlare = Math.max(peakFlare, flare.scale.x);
    stretched = Math.max(stretched, beam.scale.z);
  }
  for (let i = 0; i < 70; i++) r.frame(0, 0);
  check('idle optics are dark', idle < 0.01, `pulse opacity ${idle.toFixed(3)}`);
  check('wind-up narrows the pupil', charged < 0.95, `pupil scale.y ${charged.toFixed(3)}`);
  check('release pops the lock-on ring', peakPulse > 0.2, `ring opacity peak ${peakPulse.toFixed(3)}`);
  check('release throws the motion streak', peakBeam > 0.05 && stretched > 1.2, `streak opacity ${peakBeam.toFixed(3)}, stretch ${stretched.toFixed(2)}x`);
  check('release flashes the eye light + flare', peakLight > 3 && peakFlare > 1.5, `light ${peakLight.toFixed(2)}, flare ${peakFlare.toFixed(2)}x`);
  check('optics settle back to idle', op(pulse) < 0.02 && op(beam) < 0.02, `pulse ${op(pulse).toFixed(3)}, streak ${op(beam).toFixed(3)}`);
}

console.log('=== 9. THE CLEANED-UP BOOT STILL STANDS ON THE CANVAS ===');
{
  const r = new Rig();
  r.run(1.0);
  r.robot.root.updateMatrixWorld(true);
  let lowest = Infinity;
  let lowestFoot = Infinity;
  for (const pr of r.robot.probes) {
    const y = pr.p.clone().applyMatrix4(pr.parent.matrixWorld).y;
    lowest = Math.min(lowest, y);
    if (pr.foot) lowestFoot = Math.min(lowestFoot, y);
  }
  check('sole rests on the canvas', lowestFoot > 0.0 && lowestFoot < 0.06, `lowest boot point y=${lowestFoot.toFixed(3)}`);
  check('nothing else punches through the floor', lowest > -0.001, `lowest body point y=${lowest.toFixed(3)}`);
  // the probes are a proxy — this walks the ACTUAL boot meshes in world space (toes, heel, sole pads)
  const v = new THREE.Vector3();
  let minY = Infinity;
  for (const foot of r.robot.footJ) {
    foot.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
        if (v.y < minY) minY = v.y;
      }
    });
  }
  check('every boot vertex sits on the canvas', minY > -0.005 && minY < 0.045, `lowest boot vertex y=${minY.toFixed(3)}`);
}

console.log('=== 11. THE HIT REACTION FOLLOWS THE PUNCH (direction / angle / point of impact) ===');
{
  // A blow is described in the victim's own frame: hitF (knocked back), hitL (across to his left),
  // hitUp (lifted by an uppercut / folded by a body shot), hitPt (head shot = 1, chest shot = 0).
  // Each probe settles the rig, then takes the blow for 0.3 s and reports where the head ended up,
  // in robot-local units, relative to the same rig standing untouched.
  const v = new THREE.Vector3();
  const probe = (hit) => {
    const r = new Rig();
    const base = new Rig();
    r.run(0.2);
    base.run(0.2);
    const read = (rig) => {
      rig.robot.root.updateMatrixWorld(true);
      rig.robot.head.getWorldPosition(v);
      const rp = rig.robot.root.position;
      const yaw = rig.robot.root.rotation.y;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const dx = v.x - rp.x;
      const dz = v.z - rp.z;
      return {
        x: dx * c - dz * sn,
        y: v.y,
        z: dx * sn + dz * c,
      };
    };
    for (let i = 0; i < Math.round(0.3 / D); i++) {
      r.frame(0, 0, { hit: 1, hitSign: 1, ...hit });
      base.frame(0, 0, {});
    }
    const a = read(r);
    const b = read(base);
    return { dx: a.x - b.x, dy: a.y - b.y, dz: a.z - b.z };
  };
  const straight = probe({ hitF: -1, hitL: 0, hitUp: 0, hitPt: 1, hitSpin: 0 });
  const hook = probe({ hitF: -0.25, hitL: 1, hitUp: 0, hitPt: 1, hitSpin: 1.7 });
  const upper = probe({ hitF: -0.3, hitL: 0, hitUp: 1, hitPt: 1, hitSpin: 0 });
  const body = probe({ hitF: -0.6, hitL: 0, hitUp: -0.9, hitPt: 0, hitSpin: 0 });
  check('a straight snaps the head BACK down the line', straight.dz < -0.15 && Math.abs(straight.dx) < 0.06, `head dz ${straight.dz.toFixed(3)}, dx ${straight.dx.toFixed(3)}`);
  check('a hook pushes the head ACROSS (to his left)', hook.dx > 0.12 && hook.dx > straight.dx + 0.1, `head dx ${hook.dx.toFixed(3)} vs straight ${straight.dx.toFixed(3)}`);
  check('an uppercut lifts the head', upper.dy > 0.06 && upper.dy > straight.dy + 0.05, `head dy ${upper.dy.toFixed(3)} vs straight ${straight.dy.toFixed(3)}`);
  check('a body shot folds him forward, head trailing low', body.dz > straight.dz + 0.08 && body.dy < upper.dy, `dz ${body.dz.toFixed(3)} (straight ${straight.dz.toFixed(3)}), dy ${body.dy.toFixed(3)}`);
  // the impact point decides how much of the blow the HEAD itself takes (its own rotation on the neck):
  // a head shot whips it, a body shot only rocks the chest and the head trails after it
  const neckSnap = (hit) => {
    const r = new Rig();
    r.run(0.2);
    let peak = 0;
    for (let i = 0; i < Math.round(0.3 / D); i++) {
      r.frame(0, 0, { hit: 1, hitSign: 1, ...hit });
      // the head's own TWIST on the neck: the classic "his head snapped round" — a shoulder taking the same
      // punch barely turns it at all
      peak = Math.max(peak, Math.abs(r.robot.head.rotation.y));
    }
    return peak;
  };
  const headShot = neckSnap({ hitF: -1, hitL: 0.9, hitUp: 0, hitPt: 1, hitSpin: 1.5 });
  const bodyShot = neckSnap({ hitF: -1, hitL: 0.9, hitUp: -0.9, hitPt: 0, hitSpin: 1.5 });
  check('the impact point decides the head snap', headShot > bodyShot * 1.5, `head-shot neck angle ${headShot.toFixed(3)} rad vs body-shot ${bodyShot.toFixed(3)} rad`);
}

console.log('=== 12. THE FOOTWORK ITSELF: NO SKATING, NO CROSSING, NO POPS ===');
{
  const r = new Rig();
  const prev = r.feet.map((f) => ({ x: f.x, z: f.z, stepping: f.stepping, pitch: f.pitch }));
  let skate = 0; // worst slide of a PLANTED foot in one frame (local units)
  let cross = 99; // the closest the two feet ever get
  let pop = 0; // worst single-frame change in a foot's pitch (the ankle smoothing)
  for (let i = 0; i < 60 * 9; i++) {
    const t = i / 60;
    r.frame(Math.sin(t * 1.4) * 7 + 2, Math.cos(t * 0.7) * 5, {
      punchFoot: i % 70 === 5 ? 1 : -1,
      punchZ: 0.42,
      punchX: 0.07,
      punchDur: 0.26,
      punchSeq: Math.floor(i / 70),
      punchSeqMax: 0,
      strike: i % 70 === 5 ? 1 : 0,
      dip: 0.14 + Math.sin(t * 3) * 0.05,
    });
    for (let k = 0; k < 2; k++) {
      const f = r.feet[k];
      const p0 = prev[k];
      if (!f.stepping && !p0.stepping) {
        const d = Math.hypot(f.x - p0.x, f.z - p0.z) / r.S;
        if (d > skate) skate = d;
      }
      const dp = Math.abs(f.pitch - p0.pitch);
      if (dp > pop) pop = dp;
      if (dp > 0.09 && process.env.POPDIAG) console.log(`  f${i} foot${k} ${p0.pitch.toFixed(3)}->${f.pitch.toFixed(3)} step=${f.stepping} gait=${f.gaitStep} punch=${f.punchStep} u=${f.u.toFixed(2)}`);
      p0.x = f.x;
      p0.z = f.z;
      p0.stepping = f.stepping;
      p0.pitch = f.pitch;
    }
    const l0 = r.loc(0);
    const l1 = r.loc(1);
    cross = Math.min(cross, Math.hypot(l0.x - l1.x, l0.z - l1.z));
  }
  check('a planted foot never slides', skate < 0.004, `worst slide ${skate.toFixed(4)} local/frame`);
  check('the feet never cross or tread on each other', cross > 0.55, `closest approach ${cross.toFixed(3)} local`);
  // 0.12 rad in a frame is a fast but continuous push-off (the ankle rolling onto the ball); a real pop — a
  // touch-down that snapped into its landing pose — used to jump 0.34
  check('the ankles never pop', pop < 0.12, `worst pitch change ${pop.toFixed(4)} rad/frame`);
}

console.log('=== 10. BOTH BUILDS: NO BROKEN GEOMETRY, NO CLUTTER ===');
for (const variant of ['atom', 'brute']) {
  const robot = new Robot({ ...STYLE, variant }, variant === 'brute' ? 1.22 : 1);
  robot.snapFeet();
  const a = mk();
  let bad = 0;
  let meshes = 0;
  let tris = 0;
  for (let i = 0; i < 90; i++) {
    a.vl = Math.sin(i * 0.08) * 3.4;
    a.vf = Math.cos(i * 0.05) * 2.2;
    a.strike = i % 24 === 0 ? 1 : (i % 24) < 8 ? 0.5 : 0;
    a.strikePow = 0.7;
    a.arms = [
      { sx: -0.5 + Math.sin(i * 0.1), sy: 0.2, sz: 0.4, ex: -1.4 },
      { sx: -0.4, sy: -0.2, sz: 0.5, ex: -1.3 },
    ];
    a.time += D;
    robot.animate(a, D);
  }
  robot.root.updateMatrixWorld(true);
  robot.root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const pos = o.geometry.attributes.position;
    tris += (o.geometry.index ? o.geometry.index.count : pos.count) / 3;
    for (let i = 0; i < pos.count; i++) {
      if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
        bad++;
        break;
      }
    }
  });
  check(`${variant}: geometry + motion clean`, bad === 0 && meshes > 0, `${meshes} meshes, ~${Math.round(tris)} tris, non-finite meshes ${bad}`);
}

console.log(fails === 0 ? '\nFOOTWORK + OPTICS + ART: ALL PASS' : `\nFOOTWORK + OPTICS + ART: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
