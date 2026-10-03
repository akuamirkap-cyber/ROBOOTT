import * as THREE from 'three';
import { Spring } from './spring';
import { buildRobot, ATOM_OPT, BRUTE_OPT } from './build';
import { L1, L2, HIP_Y, UP } from './rig';
import { riseStages } from './poses';

export interface Pose {
  sx: number; // shoulder pitch (negative = raise forward)
  sy: number; // shoulder yaw  (negative = inward)
  sz: number; // shoulder abduction (positive = outward)
  ex: number; // elbow (negative = bend forward)
}

export interface RobotStyle {
  variant?: 'brute' | 'atom';
  main: number;
  secondary: number;
  accent: number;
  glow: number;
}

export interface AnimState {
  arms: Pose[];
  twist: number;
  lean: number;
  lunge: number;
  dip: number;
  roll: number;
  vf: number; // true local forward velocity (robot units / s)
  vl: number; // true local lateral velocity (+ = robot's left)
  af: number; // local forward acceleration
  al: number; // local lateral acceleration
  yawRate: number;
  hit: number;
  hitSign: number;
  hitUp: number; // vertical part of the blow: an uppercut lifts him (+), a body shot folds him (−)
  // THE GEOMETRY OF THE HIT (optional): the recoil is built from where the fist came from and where it landed.
  hitF?: number; // + = the force drives him forward, − = he is knocked backwards (his own frame)
  hitL?: number; // + = the force drives him across to his own left
  hitPt?: number; // 1 = the impact point was the head, 0 = the chest plate
  hitSpin?: number; // yaw torque: an angled / hooking shot twists him round
  fall: number;
  air: number;
  time: number;
  glow: number;
  flash: number;
  tilt: number;
  dash: number; // 1 while a dash / sidestep / backstep is playing
  dashF: number; // dash direction in robot-local space (forward / lateral)
  dashL: number;
  lookX?: number; // target gaze direction X (-1 to 1)
  lookY?: number; // target gaze direction Y (-1 to 1)
  // PUNCH FOOTWORK (all optional: callers that don't fight on the feet simply leave them out)
  punchFoot?: number; // -1 = no strike, 0 = the lead (left) foot re-plants, 1 = the rear (right) foot re-plants
  punchZ?: number; // how far that foot reaches towards the enemy (robot-local units, + = forward)
  punchX?: number; // lateral part of the same re-plant (+ = the robot's left)
  punchDur?: number; // how long the re-plant takes (s)
  punchSeq?: number; // strike id: a NEW number re-plants the foot once (jab, jab, jab → one plant each)
  strike?: number; // 0..1: how close the punch is to leaving the guard (1 = released). Drives the eye optics.
  strikePow?: number; // 0..1 weight of that punch — a heavy hook fires a bigger optical flash than a jab
  // GET-UP (only present while he is on the floor): the staged rise — see riseStages in poses.ts
  rise?: number; // 0 = still flat on the canvas, 1 = back on his feet
  riseDir?: number; // ±1: the shoulder he rolls onto and pushes off
  riseOut?: number; // 1 → 0 over the beat after he stands: the loose settle (shoulders shake out, chest drops)
  stepLift?: number; // optional foot clearance for a scripted step (the get-up plants its feet high and slow)
}


const ANKLE_H = 0.23; // ankle joint height above the floor when the foot is flat (sole is 0.21 below the ankle → 2 cm clearance)
const STAND_Y = 2.88 + UP * 0.95 + 0.3; // relaxed hip height: knees softly bent, legs clearly long // pelvis height when standing

/**
 * Ankle height needed so the LOWEST point of the boot just touches the floor when the foot is pitched by p
 * (p > 0: heel up, the toe is the lowest point; p < 0: toe up, the heel is the lowest point).
 * Boot geometry (ankle-local): sole bottom 0.21 below the ankle, toe tip 1.27 ahead, heel 0.55 behind.
 * The previous approximation under-lifted the foot, which pushed the toe through the floor.
 */
const SOLE = 0.21;
const TOE_Z = 1.24;
const HEEL_Z = 0.62;
const ankleLift = (p: number) => Math.max(0, Math.max(SOLE * Math.cos(p) + TOE_Z * Math.sin(p), SOLE * Math.cos(p) - HEEL_Z * Math.sin(p)) - SOLE);
const RUN_HIP_LOW = 3.3; // hip height in mid-stance while running (standing ≈ 3.6): knees flexed ~60°
const RUN_HIP_BOB = 0.2; // how much higher the hips travel at touch-down / toe-off / flight
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sm = (u: number) => u * u * (3 - 2 * u);
/** foot-height curve of a swing: lifts early, peaks around 45%, and touches down with ~zero vertical speed */
const swingArc = (u: number) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.82))), 1.5);
/** smooth minimum: never exceeds min(a, b) but has no kink where the two cross */
const softMin = (a: number, b: number, k: number) => (a + b - Math.sqrt((a - b) * (a - b) + k * k)) * 0.5;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Foot {
  x: number;
  z: number; // planted world position
  fx: number;
  fz: number; // step start
  stepping: boolean;
  u: number;
  dur: number;
  lift: number;
  err: number;
  pitch: number;
  curX: number;
  curZ: number; // current (possibly mid-step) world position
  lag: number; // how far the planted foot trails behind along the travel direction
  yawOff: number;
  stT: number; // time since touchdown (gait stance progress)
  gaitStep: boolean; // current swing belongs to the walk cycle
  shuffle: boolean; // current swing is part of a boxing dash shuffle
  punchStep: boolean; // current swing is a strike re-plant (the foot follows the punching hand)
  tx: number; // local target of a strike re-plant
  tz: number;
  p0: number; // foot pitch at the moment it left the ground (the swing blends from here → no pop at toe-off)
  follow: number; // 0..1: how much the foot hangs with the shin instead of staying level (mid-swing)
}

export class Robot {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly pelvis = new THREE.Group();
  readonly waist = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly clavs: THREE.Group[] = [];
  readonly caps: THREE.Group[] = [];
  readonly shoulders: THREE.Group[] = [];
  readonly elbows: THREE.Group[] = [];
  readonly wrists: THREE.Group[] = [];
  readonly hipJ: THREE.Group[] = [];
  readonly kneeJ: THREE.Group[] = [];
  readonly footJ: THREE.Group[] = [];
  readonly kneeCaps: THREE.Group[] = [];
  readonly faulds: THREE.Group[] = [];
  readonly fists: THREE.Object3D[] = [];
  readonly eyeOptics: THREE.Group[] = [];
  readonly eyePupils: THREE.Group[] = [];
  readonly eyeScanners: THREE.Mesh[] = [];
  readonly eyeFlares: THREE.Mesh[] = [];
  readonly eyeLights: THREE.PointLight[] = [];
  readonly eyeIris: THREE.Mesh[] = []; // the glowing iris plate (atom head)
  readonly eyePulses: THREE.Mesh[] = []; // lock-on ring fired the instant a punch leaves the guard
  readonly eyeBeams: THREE.Mesh[] = []; // additive motion streak thrown forward with the punch
  private eyeLookX = 0;
  private eyeLookY = 0;
  private eyeFire = 0; // strike-optics one-shot envelope (1 = just released, 0 = settled)
  private strikeCharge = 0; // last frame's punch charge, so the release is caught on the exact frame
  private eyeBase = new THREE.Color(0xffffff); // style glow colour, before any flash whitens it
  private eyeWhite = new THREE.Color(0xffffff);
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private bodyMats: THREE.MeshStandardMaterial[] = [];
  onStep?: (foot: number, speed: number, x: number, z: number) => void;

  // procedural footwork
  private feet: Foot[] = [0, 1].map(() => ({ x: 0, z: 0, fx: 0, fz: 0, stepping: false, u: 0, dur: 0.2, lift: 0, err: 0, pitch: 0, curX: 0, curZ: 0, lag: 0, yawOff: 0, stT: 0, gaitStep: false, shuffle: false, punchStep: false, tx: 0, tz: 0, p0: 0, follow: 0 }));
  private needSnap = true;
  private ikW = 1;
  private airW = 0; // smoothed 'airborne' weight so leg poses blend instead of snapping
  private bounce = 0;
  private sLand = new Spring();
  private sPsi = new Spring();
  private sGaitYaw = new Spring(); // pelvis rotation caused by the stride (smoothed)
  private sGaitRoll = new Spring(); // pelvis drop caused by the stride (smoothed)
  private sArm = new Spring(); // contralateral arm swing
  private sHip = new Spring(2.6 + UP);
  private runW = 0; // 0..1 "how much of a sprint is this" (copy of runK used by animate)
  private runK = 0; // the same value, low-pass filtered inside updateFeet so every gait parameter blends smoothly
  private probes: { parent: THREE.Object3D; p: THREE.Vector3; foot: boolean }[] = []; // points used to keep the whole body above the floor
  private gait = false;
  private firstStep = false;
  private dashOn = false;
  private dashT = 0;
  private dashDirX = 0;
  private dashDirZ = 1;
  private dashGo = [false, false];
  private dashLead = 0;
  private postDashT = 0;
  private gaitW = 0;
  private back = false;
  private stepDist = 0;
  private nextFoot = 0;
  // A short tap of a movement key must not read as a full stride: `moveT` measures how long the body has actually
  // been moving, `movePeak` how fast that burst got, and `tapT` is the "that was only a tap" window that follows.
  private moveT = 0;
  private movePeak = 0;
  private tapT = 0;
  private punchSeq = -1; // last strike that already re-planted a foot (so one strike = one re-plant)
  private prevSpd = 0; // last frame's speed: a hard drop means the key is already gone (a tap, not a hold)
  private dipK = 0.12; // smoothed stance inputs: a punch or a landing spikes dip/lunge, and the stance must not jerk
  private lungeK = 0;
  private punchYaw = 0; // the pivot the current re-plant turns the foot through
  private feetL = [
    { x: 0, z: 0, y: 0 },
    { x: 0, z: 0, y: 0 },
  ];
  ikErr = [0, 0];

  // secondary-motion springs
  private sLean = new Spring();
  private sRoll = new Spring();
  private sPelvisYaw = new Spring();
  private sWaistYaw = new Spring();
  private sChestYaw = new Spring();
  private sHeadX = new Spring();
  private sHeadY = new Spring();
  private sHeadZ = new Spring();
  private sSway = new Spring();
  private sWrist = [new Spring(), new Spring()];
  private sShoulderLag = [new Spring(), new Spring()];
  private prevEx = [-2, -2];

  private tv = new THREE.Vector3();
  private qk = new THREE.Quaternion();
  private qd = new THREE.Quaternion();
  private qf = new THREE.Quaternion();
  private eu = new THREE.Euler();

  constructor(style: RobotStyle, scale = 1) {
    const mk = (color: number, metalness: number, roughness: number) => {
      const m = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive: 0xffffff, emissiveIntensity: 0 });
      this.bodyMats.push(m);
      return m;
    };
    const atom = style.variant === 'atom';
    const main = mk(style.main, atom ? 0.5 : 0.8, atom ? 0.3 : 0.34);
    const sec = mk(style.secondary, 0.7, 0.5);
    const dark = mk(0x121317, 0.9, 0.5);
    const steel = mk(0xa4abb5, 1, 0.24);
    const accent = mk(style.accent, 0.55, 0.32);
    const joint = mk(atom ? 0x2c3038 : 0x1e2026, 0.75, 0.5);
    const rubber = mk(0x0c0d10, 0.15, 0.88);
    const visor = mk(0x04060a, 0.9, 0.1);
    visor.side = THREE.DoubleSide;
    const glow = new THREE.MeshStandardMaterial({ color: style.glow, emissive: style.glow, emissiveIntensity: 2, roughness: 0.4 });
    this.glowMats.push(glow);

    this.root.add(this.body);
    this.root.scale.setScalar(scale * 0.94);
    this.body.add(this.pelvis);

    const core = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.4, roughness: 0.3 });
    this.eyeBase.setHex(style.glow);

    buildRobot(this, { main, sec, dark, steel, accent, glow, joint, rubber, visor, core, style }, atom ? ATOM_OPT : BRUTE_OPT);
    this.addProbes();
  }

  private addProbe(parent: THREE.Object3D, x: number, y: number, z: number, foot = false) {
    this.probes.push({ parent, p: new THREE.Vector3(x, y, z), foot });
  }

  /** Points on the outermost surfaces of every body part (robot-local to the part). */
  private addProbes() {
    const P = (o: THREE.Object3D, pts: number[][], foot = false) => pts.forEach(([x, y, z]) => this.addProbe(o, x, y, z, foot));
    P(this.chest, [[0.9, 0.1, -1.0], [-0.9, 0.1, -1.0], [0.9, 1.5, -1.0], [-0.9, 1.5, -1.0], [0, 0.8, -1.05], [0.9, 1.2, 0.75], [-0.9, 1.2, 0.75], [0, 0.3, 0.6], [1.2, 1.4, 0], [-1.2, 1.4, 0]]);
    P(this.head, [[0, 0.72, -0.05], [0, -0.45, 0.35], [0.45, 0.1, 0], [-0.45, 0.1, 0], [0, 0.1, -0.5], [0, 0.1, 0.47]]);
    P(this.pelvis, [[1.09, 2.85, -0.52], [-1.09, 2.85, -0.52], [1.09, 2.85, 0.52], [-1.09, 2.85, 0.52], [0, 2.22, -0.42], [0, 2.22, 0.42], [0.66, 3.3, 0.44], [-0.66, 3.3, 0.44], [0.56, 2.9, -0.62], [-0.56, 2.9, -0.62]]);
    for (let i = 0; i < 2; i++) {
      P(this.caps[i], [[0, -0.5, 0], [0, 0.15, 0.78], [0, 0.15, -0.78], [0.72, 0.1, 0], [-0.72, 0.1, 0]]);
      P(this.shoulders[i], [[0.5, -0.6, 0], [-0.5, -0.6, 0], [0, -0.6, 0.5], [0, -0.6, -0.5]]);
      P(this.elbows[i], [[0.5, -0.55, 0], [-0.5, -0.55, 0], [0, -0.55, 0.5], [0, -0.55, -0.5], [0, 0, -0.36]]);
      P(this.fists[i], [[0.54, -0.5, 0], [-0.54, -0.5, 0], [0, -1.0, 0.55], [0, -1.0, -0.5], [0, -0.5, 0.6], [0, -0.5, -0.6], [0, -1.04, 0]]);
      P(this.hipJ[i], [[0.62, -0.6, 0], [-0.62, -0.6, 0], [0, -0.6, 0.64], [0, -0.6, -0.64]]);
      P(this.kneeJ[i], [[0, 0, 0.62], [0, 0, -0.5], [0.5, 0, 0], [-0.5, 0, 0], [0, -0.8, -0.58], [0, -0.9, 0.52]]);
      // boot: heel, toe tip and the four sole corners (only used when the legs are not IK-planted)
      P(this.footJ[i], [[0, -SOLE, -HEEL_Z], [0, -SOLE, TOE_Z], [0.45, -SOLE, 0.8], [-0.45, -SOLE, 0.8], [0.45, -SOLE, -0.3], [-0.45, -SOLE, -0.3]], true);
    }
  }

  /**
   * Floor contact: if any part of the body is below the floor, lift the whole body by exactly that much.
   * (Planted feet are handled by the IK; this catches falls, knock-downs, air poses and animation overshoot.)
   */
  private groundSolve(S: number, ik: number, floorPose = false) {
    this.root.updateMatrixWorld(true);
    let minY = Infinity;
    for (const pr of this.probes) {
      // THE BOOTS NEVER PROP HIM UP. Once the IK owns the feet the ankles are placed on the canvas by the solve
      // itself, so a boot probe can only do harm: on the floor a single boot poking through the canvas used to
      // lift the WHOLE body until that boot cleared — the robot floated a full metre above the mat, lying flat,
      // standing on one heel. The body has to rest on its back, hip or shoulder there. (And while he is standing
      // the boot probes only ever asked for the 6 mm of mesh/probe slack the art has, tipping the soles off the
      // canvas — the IK already plants them flush.)
      if (pr.foot && (floorPose || ik > 0.85)) continue;
      this.tv.copy(pr.p).applyMatrix4(pr.parent.matrixWorld);
      if (this.tv.y < minY) minY = this.tv.y;
    }
    const margin = 0.04;
    if (minY < margin) this.body.position.y += (margin - minY) / S;
  }

  setStyleGlow(color: number) {
    for (const m of this.glowMats) {
      m.color.setHex(color);
      m.emissive.setHex(color);
    }
    this.eyeBase.setHex(color);
    for (const f of this.eyeFlares) {
      if (f.material instanceof THREE.MeshBasicMaterial) f.material.color.setHex(color);
    }
    for (const m of this.eyeIris) {
      if (m.material instanceof THREE.MeshBasicMaterial) m.material.color.setHex(color);
    }
    for (const m of this.eyePulses) {
      if (m.material instanceof THREE.MeshBasicMaterial) m.material.color.setHex(color);
    }
    for (const m of this.eyeBeams) {
      if (m.material instanceof THREE.MeshBasicMaterial) m.material.color.setHex(color);
    }
    for (const l of this.eyeLights) {
      l.color.setHex(color);
    }
  }

  /** Re-plant feet under the body on the next frame (after teleports / resets). */
  snapFeet() {
    this.needSnap = true;
    this.ikW = 1;
    this.airW = 0;
    for (const s of [this.sLean, this.sRoll, this.sPelvisYaw, this.sWaistYaw, this.sChestYaw, this.sHeadX, this.sHeadY, this.sHeadZ, this.sSway]) s.set(0);
    for (const s of this.sWrist) s.set(0);
    for (const s of this.sShoulderLag) s.set(0);
    this.sLand.set(0);
    this.sPsi.set(0);
    this.sGaitYaw.set(0);
    this.sGaitRoll.set(0);
    this.sArm.set(0);
    this.runW = 0;
    this.runK = 0;
    this.sHip.set(2.6 + UP);
    this.gait = false;
    this.gaitW = 0;
    this.stepDist = 0;
    this.dashOn = false;
    this.firstStep = false;
    this.postDashT = 0;
    this.moveT = 0;
    this.movePeak = 0;
    this.tapT = 0;
    this.punchSeq = -1;
    this.prevSpd = 0;
  }

  // ------------------------------------------------------------------ footwork
  // Walking = a real gait cycle (heel strike -> flat -> heel off -> toe off -> swing), driven by the distance
  // travelled so stride length follows speed. Hips & feet turn towards the direction of travel while the chest
  // keeps facing the opponent (no crab-walking). Standing still = boxer stance with a light bounce.
  private updateFeet(a: AnimState, dt: number, S: number, yaw: number, psi: number) {
    const rp = this.root.position;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const toW = (lx: number, lz: number) => ({ x: rp.x + S * (lx * c + lz * sn), z: rp.z + S * (-lx * sn + lz * c) });
    const toL = (wx: number, wz: number) => {
      const dx = (wx - rp.x) / S;
      const dz = (wz - rp.z) / S;
      return { x: dx * c - dz * sn, z: dx * sn + dz * c };
    };
    const spdRaw = Math.hypot(a.vf, a.vl);
    const spd = Math.min(spdRaw, 60);
    const sp01 = Math.min(1, spd / 4.5);
    const dirx = spdRaw > 0.3 ? a.vl / spdRaw : 0;
    const dirz = spdRaw > 0.3 ? a.vf / spdRaw : 0;
    const K = 1 / 0.94; // velocity (per f.scale) -> robot-local units
    // 0 = walking, 1 = full sprint (running has a flight phase, longer strides and a high knee drive)
    // The target comes from the speed, but it goes through a low-pass filter (~0.1 s) and an S-curve, so stride,
    // swing time, foot roll, lift and arm pose all morph together instead of snapping when the speed crosses a threshold.
    const runU = clamp((spdRaw - 6.4) / 3.2, 0, 1);
    this.runK += (runU * runU * (3 - 2 * runU) - this.runK) * (1 - Math.exp(-10 * dt));
    const run = this.runK;

    // boxing stance (used when standing still / skidding). dip and lunge are filtered first: a punch or a landing
    // spikes both of them, and letting that through would jerk the stance the planted feet are measured against.
    this.dipK += (a.dip - this.dipK) * (1 - Math.exp(-14 * dt));
    this.lungeK += (a.lunge - this.lungeK) * (1 - Math.exp(-12 * dt));
    const wide = 1.18 + this.dipK * 0.3;
    const ideal = [
      { x: wide, z: 0.62 + this.lungeK * 0.28 },
      { x: -wide, z: -0.72 + this.lungeK * 0.12 },
    ];
    const restP = [0.05, 0.2];
    const restYaw = [0.1, -0.5];

    this.bounce += dt * Math.PI * 2 * (1.8 + sp01 * 0.5);
    const h = 0.5 + 0.5 * Math.sin(this.bounce);
    const bounceAmt = 1 - this.gaitW;
    const bob = (h - 0.5) * 0.12 * bounceAmt;

    if (this.needSnap) {
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        const w = toW(ideal[i].x, ideal[i].z);
        f.x = f.curX = w.x;
        f.z = f.curZ = w.z;
        f.stepping = false;
        f.lift = 0;
        f.pitch = restP[i];
        f.yawOff = restYaw[i];
        f.lag = 0;
        f.stT = 0;
        f.follow = 0;
        f.p0 = restP[i];
        f.punchStep = false;
        f.shuffle = false;
        f.gaitStep = false;
      }
      this.gait = false;
      if (this.ikW > 0.85) this.needSnap = false;
      this.storeFeetLocal(toL);
      return { sway: 0, roll: 0, yaw: 0, bob: 0, swing: 0, arm: 0, flight: 0, run: 0, depth: 0 };
    }

    // ---- boxing dash: lead foot slides out first, rear foot snaps in behind it ----
    const dashing = a.dash > 0.5 && this.ikW > 0.5;
    if (dashing && !this.dashOn) {
      this.dashOn = true;
      this.dashT = 0;
      const dn = Math.hypot(a.dashL, a.dashF) || 1;
      this.dashDirX = a.dashL / dn;
      this.dashDirZ = a.dashF / dn;
      const fwn = (i: number) => ideal[i].x * this.dashDirX + ideal[i].z * this.dashDirZ;
      this.dashLead = fwn(0) >= fwn(1) ? 0 : 1;
      this.dashGo = [false, false];
    } else if (!dashing && this.dashOn) {
      this.dashOn = false;
      this.postDashT = 0.4;
    }
    if (this.dashOn) this.dashT += dt;
    this.postDashT = Math.max(0, this.postDashT - dt);

    // ---- movement-burst tracking: a very short tap of A/D must not read as a full stride ----
    if (spdRaw > 0.9) {
      this.moveT += dt;
      this.movePeak = Math.max(this.movePeak, spdRaw);
    } else {
      // the key was only flicked: remember it so the next steps stay small and calm
      if (this.moveT > 0.02 && this.moveT < 0.17 && this.movePeak > 0.8) this.tapT = 0.45;
      this.moveT = 0;
      this.movePeak = 0;
    }
    this.tapT = Math.max(0, this.tapT - dt);

    // ---- gait mode hysteresis ----
    const wasGait = this.gait;
    // A key that was only flicked must not fire a full first stride: the walk cycle starts only once the body has
    // really been moving (moveT) AND is still being driven (not already braking → the key is gone). The tap then
    // glides over the stance with a small shuffle instead of a long, exaggerated step.
    // (the raw frame-to-frame speed drop reacts at once; the smoothed af/al lags by a few frames)
    const dv = dt > 0 ? (spdRaw - this.prevSpd) / dt : 0;
    this.prevSpd = spdRaw;
    const accAlong = (a.vf * a.af + a.vl * a.al) / Math.max(0.5, spdRaw);
    const braking = dv < -4 || accAlong < -1.5;
    if (this.dashOn) this.gait = false;
    else if (!this.gait && !braking && spdRaw > 0.9 && spdRaw < 90 && this.moveT > 0.12) this.gait = true;
    else if (this.gait && (spdRaw < 0.5 || spdRaw > 100)) this.gait = false;
    this.gaitW += ((this.gait ? 1 : 0) - this.gaitW) * (1 - Math.exp(-7 * dt));

    // Step length grows with speed (like a person: slow = short steps, fast = long steps), which keeps the
    // cadence natural (~1.7–2.3 steps/s) instead of a scurrying 3 steps/s.
    const walkStride = clamp((0.5 + 0.34 * spdRaw) * (this.back ? 0.88 : 1), 0.9, 2.5);
    // running: ~2.9 footfalls per second, so the stride keeps growing with speed instead of capping out
    // (longer than before: ~2.7 footfalls per second at full speed, so a sprint covers real ground per stride)
    // Cadence rises gently above sprint speed, so very fast footwork (2×, 3×) stays readable.
    const runCad = 2.7 + Math.max(0, spdRaw - 11.5) * 0.1;
    const strideL = lerp(walkStride, clamp(spdRaw / runCad, 2.2, 6.0), run);
    // Duty factor = the share of its 2-step cycle a foot spends on the ground: walk 0.6 → run 0.38 → faster = more flight.
    // The foot lands `half` ahead of the hips and leaves `half` behind them (half = duty × step length). Capping `half`
    // keeps the legs inside their reach, so the hips never have to dive to make a long stride possible.
    const HALF_MAX = 1.85;
    const duty = clamp(Math.min(lerp(0.6, 0.38, run) - clamp((spdRaw - 11.5) / 45, 0, 0.1), HALF_MAX / strideL), 0.2, 0.66);
    const half = duty * strideL;

    if (this.gait && !wasGait) {
      // start walking: the foot that is further behind (along the travel direction) steps first
      const l0 = toL(this.feet[0].x, this.feet[0].z);
      const l1 = toL(this.feet[1].x, this.feet[1].z);
      this.nextFoot = l0.x * dirx + l0.z * dirz <= l1.x * dirx + l1.z * dirz ? 0 : 1;
      if (this.feet[this.nextFoot].stepping) this.nextFoot = 1 - this.nextFoot;
      this.stepDist = strideL * 0.9;
      this.firstStep = true; // the first step fires on the very next frame → responsive
    }

    // planted-foot error against the boxing stance (used by the standing / skid logic)
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.stepping) continue;
      const l = toL(f.x, f.z);
      const ex = l.x - ideal[i].x;
      const ez = l.z - ideal[i].z;
      // A foot that stays planted is NEVER dragged sideways to fake a correction — that is what made the feet
      // skate. A real imbalance is answered the way a fighter answers it: with a quick recovery step (below).
      f.err = Math.hypot(ex, ez);
    }

    // ---- start a new step ----
    if (this.dashOn) {
      this.stepDist = 0;
      for (const i of [this.dashLead, 1 - this.dashLead]) {
        const f = this.feet[i];
        if (this.dashGo[i] || this.dashT < (i === this.dashLead ? 0 : 0.07)) continue;
        this.dashGo[i] = true;
        f.fx = f.stepping ? f.curX : f.x;
        f.fz = f.stepping ? f.curZ : f.z;
        f.stepping = true;
        f.gaitStep = false;
        f.shuffle = true;
        f.u = 0;
        f.p0 = f.pitch; // swings blend out of the pitch the foot really has — no pop at step-off
        f.dur = i === this.dashLead ? 0.14 : 0.16;
        f.lift = 0.11;
      }
    } else if (this.gait) {
      this.stepDist += spdRaw * dt;
      let trigger = this.firstStep || this.stepDist >= strideL;
      // safety: a stance foot trailing far behind must go now
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        if (f.stepping) continue;
        const l = toL(f.x, f.z);
        const behind = -(l.x * dirx + l.z * dirz);
        if (behind > half * 1.5 + 0.5) {
          this.nextFoot = i;
          trigger = true;
        }
      }
      const f = this.feet[this.nextFoot];
      if (trigger && !f.stepping) {
        this.stepDist = Math.max(0, this.stepDist - strideL);
        this.firstStep = false;
        f.stepping = true;
        f.gaitStep = true;
        f.u = 0;
        f.fx = f.x;
        f.fz = f.z;
        // Swing time follows from the duty factor: a foot is airborne for (1 − duty) of its 2-step cycle. When duty < 0.5
        // the two swings overlap → a real flight phase. (max(speed, 3.3) = a snappy first step when starting from rest.)
        f.dur = clamp((2 * (1 - duty) * strideL) / Math.max(spdRaw, 3.3), 0.13, 0.7);
        f.lift = lerp(clamp(0.2 + spd * 0.04, 0.24, 0.46), 0.85, run); // walking: low clearance; running: high knee drive
        f.p0 = f.pitch; // the swing blends from the pitch the foot actually has now (no pop at toe-off)
        f.follow = 0;
        this.nextFoot = 1 - this.nextFoot;
      }
    } else {
      this.stepDist = 0;
      // ---- PUNCH FOOTWORK: the foot on the punching side re-plants for every strike ----
      // A strike throws the body forward (see beginStrike), and the leg answers it. Which leg comes from the hand:
      // the lead (left) foot drives the left-hand strike, the rear (right) foot swings in behind the right hand.
      // How far comes from the distance — a short, flat nudge at the clinch, a real step-in from out of range.
      const pf = this.dashOn ? -1 : Math.round(a.punchFoot ?? -1);
      const pSeq = a.punchSeq ?? -1;
      let planted = false;
      if (pf >= 0 && pf <= 1 && pSeq !== this.punchSeq) {
        this.punchSeq = pSeq;
        const f = this.feet[pf];
        if (!f.stepping) {
          const z = clamp(a.punchZ ?? 0.2, -0.25, 0.95);
          const x = clamp(a.punchX ?? 0, -0.5, 0.5);
          f.punchStep = true;
          f.gaitStep = false;
          f.shuffle = false;
          f.stepping = true;
          f.u = 0;
          f.p0 = f.pitch;
          f.fx = f.x;
          f.fz = f.z;
          f.tx = ideal[pf].x + x;
          f.tz = ideal[pf].z + z;
          // a re-plant is short and low: the step of a fighter, not of a marcher
          f.dur = clamp(a.punchDur ?? 0.19, 0.1, 0.32) * (1 + this.tapT * 0.35);
          f.lift = a.stepLift ?? 0.06 + Math.min(0.09, Math.abs(z) * 0.07);
          f.err = 0;
          this.punchYaw = clamp((a.punchX ?? 0) * 1.1, -0.28, 0.28);
          planted = true;
        }
      }
      if (!planted) {
        let pick = -1;
        let best = 0;
        // while a flicked key is still cooling down, only a real imbalance may trigger a step.
        // ON THE FLOOR the balance steps are OFF altogether: the feet stay exactly where the knock-down left them
        // (a fighter does not shuffle his boots around while he is on his back) — the get-up re-plants them itself.
        const thr = a.rise !== undefined ? 1e9 : (this.postDashT > 0 ? 0.5 : 0.9) + this.tapT * 0.5;
        const messy = Math.max(this.feet[0].err, this.feet[1].err) > 1.9; // badly off balance → step now, quietly
        for (let i = 0; i < 2; i++) {
          const f = this.feet[i];
          const o = this.feet[1 - i];
          if (f.stepping || f.err < thr) continue;
          if (o.stepping && f.err < 1.7) continue;
          const score = f.err + (i === 0 ? 0.05 : 0);
          if (score > best) {
            best = score;
            pick = i;
          }
        }
        if (pick >= 0) {
          const f = this.feet[pick];
          f.punchStep = false;
          f.stepping = true;
          f.gaitStep = false;
          f.u = 0;
          f.p0 = f.pitch;
          f.fx = f.x;
          f.fz = f.z;
          // a recovery step is quick and low so it reads as a shuffle, not as a lunge
          const rec = messy ? 0.78 : 1;
          f.dur = clamp(0.25 - spd * 0.024, 0.1, 0.23) * (f.err > 1.5 ? 0.8 : 1) * (1 + this.tapT * 0.45) * rec;
          f.lift = (0.09 + sp01 * 0.13) * (1 - this.tapT * 0.5) * (messy ? 0.8 : 1);
        }
      }
    }

    // ---- animate each foot ----
    let sway = 0;
    let roll = 0;
    let yawS = 0;
    let swingW = 0;
    const toeOut = [0.07, -0.07];
    // foot pitch at touch-down / toe-off: sprinters land on the mid-foot and push off hard from the toes
    const landP = lerp(-0.2, 0.1, run);
    const toeP = lerp(0.44, 0.78, run);
    const pr = { x: Math.cos(psi), z: -Math.sin(psi) };
    const stanceDur = (2 * duty * strideL) / Math.max(spdRaw, 1.2);
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const s = i === 0 ? 1 : -1;
      if (!f.stepping) {
        if (this.gait) {
          // stance: heel strike -> foot flat -> heel rises -> toe pushes off
          f.stT += dt;
          const us = clamp(f.stT / stanceDur, 0, 1);
          let pit: number;
          if (us < 0.14) pit = lerp(landP, 0, sm(us / 0.14));
          else if (us < 0.46) pit = 0;
          else pit = toeP * sm((us - 0.46) / 0.54);
          // the first third of the stance rolls out of the pitch the foot ACTUALLY touched down with: a foot that
          // lands up on its ball (straight after a punch) rolls flat instead of snapping into a heel-strike pose
          pit = lerp(f.p0, pit, sm(clamp(us / 0.3, 0, 1)));
          f.pitch = lerp(f.pitch, pit, 1 - Math.exp(-(20 + run * 14) * dt)); // a walk rolls off the toe gently
          f.yawOff = lerp(f.yawOff, psi + toeOut[i], 1 - Math.exp(-14 * dt));
        } else {
          const extra = (i === 0 ? 0.1 : 0.17) * h * bounceAmt;
          f.pitch = lerp(f.pitch, restP[i] + extra, 1 - Math.exp(-20 * dt));
          f.yawOff = lerp(f.yawOff, restYaw[i] * (1 - 0.75 * sp01), 1 - Math.exp(-7.5 * dt));
        }
        f.curX = f.x;
        f.curZ = f.z;
        continue;
      }
      f.u = Math.min(1, f.u + dt / f.dur);
      const u = f.u;
      const rem = (1 - u) * f.dur;
      let tl: { x: number; z: number };
      if (f.shuffle) {
        // land in the stance, offset along the dash: lead foot reaches out, rear foot closes the gap
        const reach = i === this.dashLead ? 0.85 : 0.45;
        let ox = this.dashDirX * reach + a.vl * K * rem * 0.5;
        let oz = this.dashDirZ * reach + a.vf * K * rem * 0.5;
        const om = Math.hypot(ox, oz);
        if (om > 1.2) {
          ox *= 1.2 / om;
          oz *= 1.2 / om;
        }
        tl = { x: ideal[i].x + ox, z: ideal[i].z + oz };
      } else if (f.gaitStep) {
        // land ahead of the hips by 0.6 of a stride: touch-down and toe-off are then symmetric about the hips,
        // so neither leg ever over-stretches. Step width stays close to hip width, like a person walking.
        // = half of the distance the hips travel while this foot is on the ground → symmetric about the hips for both walking and running
        const wW = lerp(0.84, 0.7, run) + a.dip * 0.12; // runners place their feet closer to the centre line
        tl = {
          x: dirx * half + pr.x * s * wW + a.vl * K * rem * 0.95,
          z: dirz * half + pr.z * s * wW + a.vf * K * rem * 0.95,
        };
        if (!this.gait) {
          // the gait ended mid-swing (the key was flicked): come down into the boxing stance instead of
          // finishing a full stride — this is what made a short tap look exaggerated
          const k = 0.78;
          tl.x = lerp(tl.x, ideal[i].x, k);
          tl.z = lerp(tl.z, ideal[i].z, k);
        }
      } else if (f.punchStep) {
        // strike re-plant: a short, flat, deliberate step onto the target the punch was thrown from
        tl = { x: f.tx, z: f.tz };
      } else {
        const moving = spdRaw > 0.45;
        // the slower the body travels, the smaller the shuffle: a light tap of A/D gets a nudge, not a lunge
        const over = moving ? clamp(0.16 + spd * 0.075, 0.16, 0.66) * (1 - this.tapT * 0.4) : 0;
        let ox = dirx * over + a.vl * rem * 0.8;
        let oz = dirz * over + a.vf * rem * 0.8;
        const om = Math.hypot(ox, oz);
        if (om > 1.2) {
          ox *= 1.2 / om;
          oz *= 1.2 / om;
        }
        tl = { x: ideal[i].x + ox, z: ideal[i].z + oz };
      }
      // keep daylight between the feet: a landing foot is pushed back to its own side of the stance, so the two
      // never cross or land on top of each other (that is what made the fast shuffles look sloppy)
      const other = this.feet[1 - i];
      if (!other.stepping) {
        const ol = toL(other.x, other.z);
        const sep = tl.x - ol.x;
        const minSep = 0.62;
        if (Math.abs(sep) < minSep) tl.x = ol.x + (i === 0 ? minSep : -minSep);
      }
      const tw = toW(tl.x, tl.z);
      // gait swings start and end with ~zero ground speed (no skidding on touch-down, no jerk at toe-off)
      const e = f.shuffle ? 1 - Math.pow(1 - u, 2.2) : f.gaitStep ? lerp(u, sm(u), 0.95) : lerp(sm(u), 1 - Math.pow(1 - u, 2), 0.55);
      f.curX = f.fx + (tw.x - f.fx) * e;
      f.curZ = f.fz + (tw.z - f.fz) * e;
      const w = Math.sin(Math.PI * u);
      if (f.shuffle) {
        // skimming the floor on the balls of the feet
        f.pitch = lerp(f.p0, restP[i] + 0.2 + (i === this.dashLead ? 0 : 0.12 * (1 - u)), w);
        f.yawOff = lerp(f.yawOff, restYaw[i], 1 - Math.exp(-16 * dt));
        sway += -s * 0.05 * w;
      } else if (f.gaitStep) {
        // toe-off pitch fades through the swing into a toes-up heel strike
        f.pitch = lerp(f.p0, landP, sm(clamp(u * 1.1, 0, 1)));
        // mid-swing the foot hangs with the shin (blended back to level well before touch-down)
        f.follow = u < 0.92 ? 0.85 * Math.pow(Math.sin(Math.PI * (u / 0.92)), 0.8) : 0;
        f.yawOff = lerp(f.yawOff, psi + toeOut[i], 1 - Math.exp(-16 * dt));
        sway += -s * 0.13 * w * (1 + run * 0.5); // weight shifts over the stance foot
        roll += -s * 0.05 * w * (1 + run * 0.7); // the pelvis dips on the swinging side
        swingW = Math.max(swingW, w);
      } else if (f.punchStep) {
        // the foot slides forward for the punch, staying low (a fighter's re-plant, no knee lift). It also PIVOTS:
        // the rear foot rolls onto its ball and turns out with the shot, the lead foot turns in behind it.
        const heel = i === 1 ? 0.07 : 0.01;
        f.pitch = lerp(f.p0, restP[i] + 0.14 + heel, w);
        f.yawOff = lerp(f.yawOff, restYaw[i] + (i === 1 ? -0.13 : 0.06) * w - this.punchYaw * w, 1 - Math.exp(-20 * dt));
        sway += -s * 0.055 * w;
      } else {
        f.pitch = lerp(f.p0, restP[i] + 0.27, w);
        f.yawOff = lerp(f.yawOff, restYaw[i] * (1 - 0.75 * sp01), 1 - Math.exp(-14 * dt));
        sway += -s * 0.1 * w;
        roll += s * 0.05 * w;
        yawS += -s * 0.07 * w * (a.vf >= 0 ? 1 : -1) * Math.min(1, Math.abs(a.vf) / 2);
      }
      if (u >= 1) {
        f.x = f.curX = tw.x;
        f.z = f.curZ = tw.z;
        f.stepping = false;
        f.stT = 0;
        f.follow = 0;
        // touch-down NEVER snaps the ankle: it steps towards the landing pose by at most ~4 deg a frame, so the
        // roll from the swing into the stance is continuous whatever pitch the foot happened to be carrying
        const settle = (target: number) => {
          f.pitch += clamp(target - f.pitch, -0.07, 0.07);
        };
        f.p0 = f.pitch; // the pitch this stance has to roll out of
        if (f.shuffle) {
          f.shuffle = false;
          settle(restP[i] + 0.1);
          this.sLand.v -= 0.3;
        } else if (f.punchStep) {
          f.punchStep = false;
          settle(restP[i] + 0.08);
          f.yawOff += i === 1 ? -0.05 : 0.02; // the pivot leaves a touch of turn behind; it eases out next stance
          this.sLand.v -= 0.24 + spd * 0.12; // the fist lands on the same beat as the foot
        } else if (f.gaitStep) {
          settle(landP); // heel strike (walk) / mid-foot strike (run)
          this.sLand.v -= 0.16 + spd * 0.08 + run * 0.35; // weight transfer; a sprint lands harder
        } else {
          settle(restP[i] + 0.12);
          this.sLand.v -= 0.3 + spd * 0.2;
        }
        this.onStep?.(i, spd, f.x, f.z);
      }
    }
    this.storeFeetLocal(toL);
    // flight phase: both feet are in the air (only possible while running)
    let flight = 0;
    if (this.feet[0].stepping && this.feet[1].stepping) flight = Math.min(Math.sin(Math.PI * this.feet[0].u), Math.sin(Math.PI * this.feet[1].u));
    // Smooth, position-based gait signals. They are functions of where the feet actually are, so they stay clean sine-like
    // curves even while the two swings overlap (the old per-swing "humps" stacked up and made the arms / hips twitch).
    const l0 = toL(this.feet[0].curX, this.feet[0].curZ);
    const l1 = toL(this.feet[1].curX, this.feet[1].curZ);
    // +1 when foot 0 is a full stride ahead of foot 1, −1 the other way round; faded in with the gait mode
    const zD = clamp((l0.z - l1.z) / (2 * half), -1, 1) * this.gaitW;
    // the hip on the side whose foot is forward turns forward; the chest counter-rotates (see animate)
    const gaitYaw = -0.085 * (1 + run * 1.1) * zD;
    // how deep into its stance the planted foot is (0 at touch-down / toe-off, 1 in mid-stance): drives the run bob
    let depth = 0;
    if (this.gait && !this.dashOn) {
      for (let i = 0; i < 2; i++) {
        if (this.feet[i].stepping) continue;
        const li = i === 0 ? l0 : l1;
        const ahead = li.x * dirx + li.z * dirz;
        depth = Math.max(depth, Math.sin(Math.PI * clamp((half - ahead) / (2 * half), 0, 1)));
      }
    }
    return { sway, roll, yaw: yawS + gaitYaw, bob, swing: swingW, arm: zD, flight, run, depth };
  }

  private storeFeetLocal(toL: (wx: number, wz: number) => { x: number; z: number }) {
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const l = toL(f.curX, f.curZ);
      this.feetL[i].x = l.x;
      this.feetL[i].z = l.z;
      this.feetL[i].y = ANKLE_H + ankleLift(f.pitch) + (f.stepping ? swingArc(f.u) * f.lift : 0);
    }
  }

  animate(a: AnimState, dt: number) {
    const t = a.time;
    const S = this.root.scale.x;
    const yaw = this.root.rotation.y;
    const e = clamp(a.fall, 0, 1.06);
    // ---- GET-UP STAGING (poses.ts owns the curves) ----
    // The knock-down is one solid pose; the rise is not. The legs come back under the body first (the hips lead
    // the push), the torso is the last part of the lie to leave the canvas, and the whole thing rolls onto one
    // shoulder on the way through — so `e` is no longer used raw, it is split into a leg weight and a torso
    // weight with the stage curves on top. Both weights are exactly zero at rise = 1, which is what lets the
    // game drop the get-up and hand the body straight back to the ordinary standing rig without a pop.
    const riseU = clamp(a.rise ?? 0, 0, 1);
    const riseDir = (a.riseDir ?? 1) < 0 ? -1 : 1;
    const rs = riseStages(riseU);
    const riseOut = clamp(a.riseOut ?? 0, 0, 1);
    // The legs are the LAST thing the standing rig gets back. While he is on the canvas they are posed by hand
    // (the knee tuck / the kneel below) and the IK only takes them over as he drives up out of the crouch, which
    // is what stops the old behaviour: boots snapped onto lying positions while the body climbed over them.
    const eIk = clamp(e * (1 - rs.legs), 0, 1.06);
    const eSpan = clamp(e * (1 - rs.unroll) * (1 - rs.hipUp * 0.3), 0, 1.06); // the torso unfolds late, and softly
    // ...and it does not unwind straight to zero: it passes through a deep forward fold, chest over the knees,
    // which is the shape a real stand-up has. `fold` peaks around two thirds of the way up and is gone at both ends.
    const eFold = rs.fold * 0.62 * (0.55 + 0.45 * (1 - eSpan));
    // ON THE FLOOR THE LEGS GO BACK TO THE IK. The boots are sitting on the canvas, so solving the legs from them
    // is what gives a real knock-down pose: the knees fold exactly as far as the lie needs, the boots stay ON the
    // mat, and nothing has to be guessed by hand — the game's get-up footwork then just walks the feet back under
    // him and the legs follow their own bones. (FK is for the AIRBORNE flail, where nothing touches the floor.)
    const ikTarget = a.rise !== undefined ? 1 : (1 - clamp(a.air, 0, 1)) * (1 - sm(Math.min(1, eIk * 1.8)));
    this.ikW += (ikTarget - this.ikW) * (1 - Math.exp(-(ikTarget > this.ikW ? 5 : 14) * dt));
    const ik = this.ikW;
    this.airW += (clamp(a.air, 0, 1) - this.airW) * (1 - Math.exp(-11 * dt));
    if (ik < 0.4) this.needSnap = true;

    // direction of travel relative to the facing: legs/hips turn to it, chest stays on the opponent
    const spdNow = Math.hypot(a.vf, a.vl);
    const ang = Math.atan2(a.vl, a.vf);
    let psiT = 0;
    if (spdNow > 0.7 && ik > 0.6) {
      if (this.back) {
        if (Math.abs(ang) < 1.75) this.back = false;
      } else if (Math.abs(ang) > 2.05) this.back = true;
      psiT = this.back ? clamp(Math.atan2(-a.vl, -a.vf), -1.0, 1.0) : clamp(ang, -1.2, 1.2);
    }
    if (a.dash > 0.5) psiT *= 0.22; // pros keep the hips square while shuffling
    const psi = this.sPsi.update(psiT, a.dash > 0.5 ? 9 : 4.6, 0.9, dt);

    const fw = this.updateFeet(a, dt, S, yaw, psi);
    this.runW = fw.run; // already low-pass filtered in updateFeet — filtering twice only added lag
    const rw = this.runW;
    const land = this.sLand.update(0, 5.2, 0.38, dt);

    // ---------------- inertia springs ----------------
    // forward lean grows with speed → the body "leads" the legs like a person walking with intent
    // (the lean is shared between body, waist and chest, so each share must stay small: a sprint now leans ~24° in total,
    //  it used to add up to ~55°, which is what made the run look hunched and "wrong")
    const leanA = this.sLean.update(clamp(a.af * 0.011 + a.vf * 0.017 + rw * 0.05, -0.3, 0.34), 2.8, 0.7, dt);
    const rollA = this.sRoll.update(-clamp(a.al * 0.009 + a.vl * 0.01, -0.22, 0.22), 2.4, 0.7, dt);
    const sway = this.sSway.update(fw.sway, 7, 0.8, dt);
    const lag = -clamp(a.yawRate * 0.07, -0.4, 0.4); // chest trails the turn

    // ---------------- HIT REACTION: built from the real geometry of the punch ----------------
    // Every link of the chain takes the blow from the same place, but each one takes a bigger share than the one
    // below it: the pelvis rotates a little, the chest turns more, the head snaps. `hitSnap` (0…1) is how much of
    // the blow landed on the head — a head shot whips the neck, a body shot folds the chest and lets the head
    // trail after it (the springs do the whiplash for free).
    const hMag = a.hit;
    const hF = clamp(a.hitF ?? -1, -1.4, 1.4);
    const hL = clamp(a.hitL ?? 0, -1.4, 1.4);
    const hPt = clamp(a.hitPt ?? 0.5, 0, 1);
    const hSp = clamp(a.hitSpin ?? hL, -2.4, 2.4);
    const hUp = a.hitUp;
    // one signed term per axis: knocked back / lifted / turned (HK keeps a full-power blow to a readable snap —
    // the chain below adds up, so a single link must stay small)
    const HK = 0.17;
    const hPitch = (hF * 0.6 - hUp * 0.42) * hMag * HK;
    const hRoll = -hL * 0.52 * hMag * HK;
    const hYaw = hSp * 0.4 * hMag * HK;
    const tw = a.twist + hYaw * 1.05;

    const pY = this.sPelvisYaw.update(tw * 0.4, 12, 0.8, dt);
    // stride-driven pelvis motion goes through its own slow springs → rolling, continuous motion (no twitching)
    const gy = this.sGaitYaw.update(fw.yaw, 6.5, 0.85, dt);
    const gr = this.sGaitRoll.update(fw.roll, 7, 0.85, dt);
    const armW = this.sArm.update(fw.arm, 8, 0.8, dt);
    const wY = this.sWaistYaw.update(tw * 0.3, 9, 0.75, dt);
    const cY = this.sChestYaw.update(tw * 0.3 + lag, 7.5, 0.62, dt);
    const pelvisYaw = pY + gy + psi;

    // ---------------- body & spine ----------------
    const gw = this.gaitW;
    const bodyX = sway;
    const bodyZ = a.lunge * 0.55 + hF * hMag * 0.5; // the hips ride back with the blow (or fold in on a body shot)
    // desired hip height: relaxed knees standing; walking is a touch taller and rises on single support
    // walking: the hips sink a little at double support (touch-down) and rise smoothly over the stance leg.
    // The height follows the stride phase directly, so it is a clean sine-like bob, not a reach-limited kink.
    const sw2 = fw.swing * fw.swing;
    // running: the body sinks into each stride (knees absorb the landing) and springs up during the flight phase
    const walkBob = -0.14 + 0.22 * sw2;
    const baseHd = clamp(STAND_Y - a.dip * 1.25, 1.6 + UP * 0.6, 3.1 + UP);
    // running: the knees stay bent; the hips are lowest in mid-stance and rise gently towards touch-down / toe-off / flight.
    // `depth` is a smooth sine of the stance progress, so the bob is a clean ~6% wave (the old version spiked by 25%).
    const runHd = RUN_HIP_LOW + RUN_HIP_BOB * (1 - fw.depth);
    const hd = lerp(baseHd + gw * walkBob, runHd, rw);
    // never ask a leg to stretch further than it can reach
    let cap = 9;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const hx = bodyX + s * 0.76 * Math.cos(pelvisYaw);
      const hz = bodyZ - s * 0.76 * Math.sin(pelvisYaw);
      const hd2 = Math.hypot(this.feetL[i].x - hx, this.feetL[i].z - hz);
      const R = (L1 + L2) * 0.972;
      cap = Math.min(cap, Math.sqrt(Math.max(0.01, R * R - hd2 * hd2)) + this.feetL[i].y);
    }
    // soft limit: the reach cap can no longer introduce a kink in the vertical motion
    const hipH = this.sHip.update(softMin(hd, cap, 0.12), rw > 0.3 ? 17 : this.dashOn || gw > 0.5 ? 10 : 15, 0.9, dt);
    const yIK = hipH - HIP_Y - UP + a.hitUp * 0.42 - Math.max(0, -hF) * hMag * 0.16;
    const tipE = clamp(eSpan + a.tilt / 1.5, 0, 1.06);
    // Height of the body pivot while he is on the canvas. It is deliberately LOW: the floor solver (groundSolve)
    // then lifts the body by exactly the amount its lowest surface needs, so he really rests ON the canvas instead
    // of hanging above it. (It used to ask for 0.78, which left the whole torso floating ~0.7 above the floor,
    // propped up on one boot — that was a large part of why the knock-down and the get-up looked wrong.)
    const yFall = lerp(0.04, 0.2, sm(Math.min(1, tipE)));
    // ---- the staged rise, layered on top of the lie ----
    // `side` peaks about a third of the way in: he rolls off his back onto one shoulder, the hips slide across over
    // the planted hand, the body drifts forward over the knees, and the last beat dips so the rise LANDS.
    const riseX = riseDir * 0.32 * rs.side;
    // every staged term below is scaled to vanish at BOTH ends of the rise (a term that survived to rise = 1 would
    // pop out of the pose the instant the game hands the body back to the ordinary rig)
    const riseZ = rs.tuck * 0.1 + (rs.fold + rs.kneel) * 0.09 - rs.tall * 0.05 * (1 - riseU);
    const riseY = -rs.bounce * 0.18 - riseOut * 0.05;
    // turning a lying body about its own spine reads exactly as the log-roll onto the side; as the pitch unwinds
    // the very same channel becomes the twist that squares him back up to the enemy
    const riseYaw = riseDir * 1.0 * rs.side + Math.sin(t * 7) * 0.03 * riseOut;
    const riseRoll = riseDir * 0.24 * rs.side;
    // the pivot height while he is on the floor: the hips climb on their own stage curve (they lead the whole
    // move), and only once he is upright does the standing rig's height take over (heightW → ik).
    const heightW = a.rise !== undefined ? rs.hipUp : ik;
    this.body.position.set(bodyX + riseX, lerp(yFall, yIK + fw.bob + land, heightW) + riseY, bodyZ + riseZ);
    this.body.rotation.set(
      a.lean * 0.3 + leanA * 0.4 + hPitch * 0.4 - eSpan * 1.5 + eFold - a.tilt,
      riseYaw,
      a.roll + rollA * 0.5 + hRoll * 0.45 + riseRoll,
    );
    const breathe = Math.sin(t * 2.4) * 0.015;
    // chest/waist cancel the hip turn so the upper body keeps facing the opponent
    // pelvis and chest counter-rotate (net chest yaw = -0.5 × pelvis yaw) and the chest stays level over the pelvis dip
    this.pelvis.rotation.set(a.lean * 0.06, pelvisYaw, gr);
    this.waist.rotation.set(a.lean * 0.3 + leanA * 0.3 + hPitch * 0.28, wY - psi * 0.5 - gy * 0.7 + hYaw * 0.3, -gr * 0.6 + hRoll * 0.3);
    this.chest.rotation.set(
      a.lean * 0.38 + leanA * 0.25 + breathe + 0.04 + hPitch * (0.3 + (1 - hPt) * 0.3),
      cY - psi * 0.4 - gy * 0.8 + hYaw * 0.55,
      -rollA * 0.3 - gr * 0.4 + hRoll * 0.3,
    );

    // head: lags the chest and counter-rotates to keep eyes on the opponent
    const hSnap = 0.25 + hPt * 1.15; // a head shot whips the neck, a body shot barely turns it
    // ...and during the get-up the head leads the whole move: chin tucked while he is flat, lifted early so he is
    // already looking at you before the torso arrives, then a small nod as he settles into the stance.
    const hRise =
      rs.head * 0.42 // the head comes up off the chest FIRST (before the hips, before the torso)
      + eSpan * 0.3 - rs.hipUp * 0.34 * (1 - rs.unroll) - eFold * 0.55 + rs.bounce * 0.1
      - riseOut * 0.06 * Math.sin(t * 11);
    const hx = this.sHeadX.update(-0.06 - a.lean * 0.5 + hRise - leanA * 0.3 + hPitch * hSnap - hUp * 0.3 * hMag, 5.4, 0.45, dt);
    const hy = this.sHeadY.update(-a.twist * 0.72 - lag * 0.5 + hYaw * (0.6 + hPt * 0.9), 5.6, 0.5, dt);
    const hz = this.sHeadZ.update(-rollA * 0.4 + hRoll * (0.4 + hPt * 0.8), 5.2, 0.5, dt);
    this.neck.rotation.set(hx * 0.45, hy * 0.5, hz * 0.5);
    this.head.rotation.set(hx * 0.55, hy * 0.5, hz * 0.5);

    // ---------------- ocular motion & eye effects ----------------
    if (this.eyePupils.length > 0 || this.eyePulses.length > 0) { // the brute head has the optics but no pupils
      // 0. STRIKE OPTICS. `strike` ramps 0 → 1 as the fist leaves the guard; the crossing fires a one-shot:
      //    the pupils snap narrow, the iris blows out white, a lock-on ring pops off the socket and a light
      //    streak stretches forward with the throw. Then everything settles back into the idle shimmer.
      const ch = clamp(a.strike ?? 0, 0, 1);
      const sp = clamp(a.strikePow ?? 0.5, 0, 1);
      if (ch >= 1 && this.strikeCharge < 1) this.eyeFire = 1;
      this.strikeCharge = ch;
      this.eyeFire = Math.max(0, this.eyeFire - dt / (0.22 + sp * 0.18));
      const fire = this.eyeFire * this.eyeFire * (3 - 2 * this.eyeFire); // smooth 1 → 0 envelope
      const heat = clamp(fire * (0.55 + sp * 0.8), 0, 1);
      const charge = ch * (1 - fire); // charging (wind-up) weight

      // 1. Target gaze tracking: if lookX/lookY provided, track towards target; otherwise autonomous cybernetic saccades
      const scanPhase = t * 1.5;
      const saccadeT = t * 2.4;
      const dartX = (Math.sin(saccadeT * 1.7) > 0.65 ? 0.016 : -0.012) * (Math.sin(saccadeT * 0.7) > 0.15 ? 1 : 0);
      const wanderX = Math.sin(scanPhase * 0.7) * 0.012 + Math.sin(scanPhase * 1.9) * 0.007;
      const wanderY = Math.cos(scanPhase * 0.5) * 0.006;
      // while a punch is being thrown the darting stops: the machine locks on
      const lock = 1 - clamp(charge + fire, 0, 1);

      const targetLookX = (a.lookX ?? 0) * 0.03 + (wanderX + dartX) * lock;
      const targetLookY = (a.lookY ?? 0) * 0.018 + wanderY * lock;

      // Spring-damped eye look position
      this.eyeLookX += (targetLookX - this.eyeLookX) * Math.min(1, 16 * dt);
      this.eyeLookY += (targetLookY - this.eyeLookY) * Math.min(1, 16 * dt);

      // 2. Scanline sweep: a slow ranging sweep at rest; at the release it snaps into a fast lock sweep
      const scanY = Math.sin(t * 4.5) * 0.035 * (1 - fire) + Math.sin(t * 52) * 0.026 * fire;

      // 3. Neural pulse & micro-blink: breathing pulse + occasional rapid double-blink digital recalibration
      //    (no blinking while a punch is in the air — the optics stay wide open and hot)
      const blinkCycle = (t * 0.22) % 1; // every ~4.5 seconds
      let blink = 1.0;
      if (blinkCycle < 0.035) {
        // Quick optical shutter blink
        blink = Math.max(0.08, Math.sin((blinkCycle / 0.035) * Math.PI));
      } else if (blinkCycle > 0.055 && blinkCycle < 0.085) {
        // Rapid double-blink pulse
        blink = Math.max(0.12, Math.sin(((blinkCycle - 0.055) / 0.03) * Math.PI));
      }
      blink = lerp(blink, 1, clamp(charge + fire, 0, 1));

      const flareScaleX = (1.0 + Math.sin(t * 5.5) * 0.22 + Math.abs(this.eyeLookX) * 10) * blink * (1 + fire * (1.3 + sp * 2.8));
      const flareOpacity = clamp(0.45 + Math.sin(t * 4.8) * 0.25 + a.glow * 0.25 + heat * 0.5, 0.2, 1) * blink;

      for (let i = 0; i < this.eyePupils.length; i++) {
        const pupil = this.eyePupils[i];
        // a hard mechanical jitter right at the release, then dead still
        pupil.position.x = this.eyeLookX + Math.sin(t * 130) * 0.006 * fire;
        pupil.position.y = this.eyeLookY + Math.cos(t * 150) * 0.005 * fire;
        pupil.scale.set(1.0 - charge * 0.05 - fire * 0.12, blink * (1.0 - charge * 0.2 - fire * 0.42), 1.0);
      }

      for (let i = 0; i < this.eyeScanners.length; i++) {
        const scanner = this.eyeScanners[i];
        scanner.position.y = scanY;
        scanner.scale.set((0.9 + Math.sin(t * 8) * 0.1) * (1 + fire * 1.8), 1.0, 1.0);
        if (scanner.material instanceof THREE.MeshBasicMaterial) {
          scanner.material.opacity = clamp(0.32 + Math.sin(t * 5) * 0.22 + heat * 0.65, 0, 1);
        }
      }

      for (let i = 0; i < this.eyeFlares.length; i++) {
        const flare = this.eyeFlares[i];
        flare.scale.set(flareScaleX, blink * (1 + fire * 0.5), 1.0);
        if (flare.material instanceof THREE.MeshBasicMaterial) {
          flare.material.opacity = flareOpacity;
          flare.material.color.copy(this.eyeBase).lerp(this.eyeWhite, Math.min(1, heat * 0.85));
        }
      }

      // iris plate: dims while the punch charges, then flashes white on the release
      for (let i = 0; i < this.eyeIris.length; i++) {
        const iris = this.eyeIris[i];
        if (iris.material instanceof THREE.MeshBasicMaterial) {
          iris.material.color.copy(this.eyeBase).multiplyScalar(1 - charge * 0.4).lerp(this.eyeWhite, heat);
        }
      }

      // lock-on ring: pops out of the socket and fades on every punch
      for (let i = 0; i < this.eyePulses.length; i++) {
        const pulse = this.eyePulses[i];
        const u = 1 - this.eyeFire;
        pulse.scale.setScalar(0.5 + u * (1.6 + sp * 1.4));
        if (pulse.material instanceof THREE.MeshBasicMaterial) {
          pulse.material.opacity = fire * (0.3 + sp * 0.45);
          pulse.material.color.copy(this.eyeBase).lerp(this.eyeWhite, Math.min(1, heat * 1.1));
        }
      }

      // motion streak: a thin light ribbon off the socket that stretches forward with the throw
      for (let i = 0; i < this.eyeBeams.length; i++) {
        const beam = this.eyeBeams[i];
        if (beam.userData.z0 === undefined) beam.userData.z0 = beam.position.z;
        const len = 0.3 + fire * (0.7 + sp * 1.3);
        beam.scale.set(1, 1, len / 0.5);
        beam.position.z = (beam.userData.z0 as number) + len * 0.5;
        if (beam.material instanceof THREE.MeshBasicMaterial) {
          beam.material.opacity = fire * (0.22 + sp * 0.3);
          beam.material.color.copy(this.eyeBase).lerp(this.eyeWhite, Math.min(1, heat * 0.9));
        }
      }

      for (let i = 0; i < this.eyeLights.length; i++) {
        const light = this.eyeLights[i];
        light.intensity = (1.2 + Math.sin(t * 3.8) * 0.4 + a.glow * 0.4) * blink * (1 + heat * 2.6);
        if (heat > 0.01) light.color.copy(this.eyeBase).lerp(this.eyeWhite, Math.min(1, heat * 0.85));
        else light.color.copy(this.eyeBase);
      }
    }

    // ---------------- arms ----------------
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const p = a.arms[i];
      const fwd = clamp(-p.sx / 1.7, 0, 1.2);
      const abd = clamp(p.sz, 0, 1.5);
      this.clavs[i].rotation.set(0, -s * (fwd * 0.32 + abd * 0.05), s * (abd * 0.14 + fwd * 0.06));
      this.caps[i].rotation.set(p.sx * 0.28, 0, s * p.sz * 0.3);
      const lagX = this.sShoulderLag[i].update(-leanA * 0.5, 5, 0.5, dt);
      const swayA = Math.sin(t * 5.2 + i) * 0.025;
      // contralateral arm swing while walking (only when the arm is in its guard, so punches stay clean)
      const guardK = clamp((p.sx + 1.2) / 0.5, 0, 1);
      // walking: a light counter-swing; sprinting: big pumping arms (the run pose keeps the elbows bent at ~100°)
      const swing = lerp(0.11, 0.95, rw) * s * armW * guardK;
      // the guard is knocked about by the blow: the arm on the side the fist lands on swings out, the other braces
      const flail = hMag * 0.24 * (0.35 + 0.65 * clamp(s * hL, 0, 1)) * (0.4 + hPt * 0.6);
      this.shoulders[i].rotation.set(p.sx + swayA + lagX + swing - flail * 0.5, p.sy * s, (p.sz + flail) * s);
      const ex = Math.min(0.02, p.ex);
      this.elbows[i].rotation.x = ex;
      // wrist whips with forearm angular speed (follow-through)
      let target = 0;
      if (dt > 0) {
        const ev = (ex - this.prevEx[i]) / dt;
        target = clamp(-ev * 0.03, -0.6, 0.6);
        this.prevEx[i] = ex;
      }
      this.wrists[i].rotation.x = this.sWrist[i].update(target, 6, 0.35, dt);
    }

    // ---------------- legs: IK onto planted feet ----------------
    this.pelvis.updateWorldMatrix(true, false);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const f = this.feet[i];
      const hipPos = this.hipJ[i].position;
      this.tv.set(f.curX, this.root.position.y + S * (ANKLE_H + ankleLift(f.pitch) + (f.stepping ? swingArc(f.u) * f.lift : 0)), f.curZ);
      const tgtW = this.tv.clone();
      this.pelvis.worldToLocal(this.tv);
      const xt = this.tv.x - hipPos.x;
      const yt = this.tv.y - hipPos.y;
      const zt = this.tv.z - hipPos.z;
      const g = Math.atan2(xt, -yt);
      const y0 = -Math.hypot(xt, yt);
      const d = clamp(Math.hypot(zt, y0), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.015);
      const kx = Math.acos(clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1));
      const phi = Math.atan2(-zt, -y0);
      const beta = Math.atan2(L2 * Math.sin(kx), L1 + L2 * Math.cos(kx));
      const ikHx = phi - beta;

      // FK pose used in the air / when knocked down
      const flail = Math.sin(t * 9 + i * Math.PI) * 0.22;
      const airHx = (i === 0 ? -0.65 : 0.25) + flail;
      const airKx = (i === 0 ? 0.95 : 0.45) + flail * 0.5;
      // LYING LIMP: the pelvis is pitched back almost 90°, so the legs have to be near-zero in this frame to
      // actually lie ON the mat. A bent knee here hangs the boot under the canvas, and the floor solver is then
      // left choosing between a boot through the mat and a body floating a metre above it.
      const fallHx = 0.02 * s;
      const fallKx = 0.1;
      const am = this.airW;
      // GET-UP: the legs are the load-bearing part of the whole move, and they are posed here by hand (the IK
      // does not get them back until he drives up out of the crouch). The LEAD leg — the one on the side he rolls
      // towards — folds hard, knee up over the boot, and stays under him; the TRAIL leg draws in behind it, its
      // shin lying on the canvas with him up on that knee. The `kneel` beat then rolls the weight onto the lead
      // foot: the trail hip extends, the lead hip drives over it — the push a real stand-up is built on.
      const tuckW = rs.tuck * (1 - ik);
      const kneelW = rs.kneel * (1 - ik);
      const lead = riseDir > 0 ? 0 : 1;
      const leadW = i === lead ? 1 : 0;
      const trailW = 1 - leadW;
      const fkHx = lerp(fallHx, airHx, am) - 1.25 * leadW * tuckW - 0.3 * leadW * kneelW + 0.4 * trailW * kneelW;
      const fkKx = lerp(fallKx, airKx, am) + 2.0 * leadW * tuckW + 1.6 * trailW * tuckW;
      const fkHz = lerp(s * 0.12, s * 0.2, am) + s * 0.34 * tuckW;

      const hxF = lerp(fkHx, ikHx, ik);
      const kxF = lerp(fkKx, kx, ik);
      this.hipJ[i].rotation.set(hxF, 0, lerp(fkHz, g, ik));
      this.kneeJ[i].rotation.x = kxF;
      const fd = this.faulds[i];
      if (fd) fd.rotation.x = hxF * 0.55; // hip skirts are gone; keep working if one is ever added back
      this.kneeCaps[i].rotation.x = -kxF * 0.4;

      // keep the foot flat to the ground (with heel/toe roll while stepping)
      this.kneeJ[i].updateWorldMatrix(true, false);
      this.kneeJ[i].getWorldQuaternion(this.qk);
      this.qd.setFromEuler(this.eu.set(f.pitch, yaw + f.yawOff, 0, 'YXZ'));
      this.qf.copy(this.qk).invert().multiply(this.qd);
      if (f.follow > 0.001) {
        // mid-swing the foot hangs with the shin (slightly plantar-flexed) instead of staying level in the world —
        // a level foot on a shin that is folded back is what produced the twisted-ankle look
        this.qd.setFromEuler(this.eu.set(0.3, 0, 0, 'XYZ'));
        this.qf.slerp(this.qd, f.follow);
      }
      if (ik < 1) {
        // Off the feet (in the air, knocked down, getting up) the boot stops chasing the floor: it hangs off the
        // shin the way a relaxed foot does — toes up while he is down, pointed while he is in the air. The old
        // version blended towards a WORLD orientation, which left the boots pointing straight at the canvas and
        // the whole robot propped up on a toe.
        this.qd.setFromEuler(this.eu.set(-0.3 + am * 0.55, 0, 0, 'XYZ'));
        this.qf.slerp(this.qd, 1 - ik);
      }
      this.footJ[i].quaternion.copy(this.qf);
      this.footJ[i].updateWorldMatrix(true, false);
      this.footJ[i].getWorldPosition(this.tv);
      this.ikErr[i] = this.tv.distanceTo(tgtW) / S;
    }

    // last step: nothing may ever sink below the floor (falls, knock-downs, overshoot, odd poses)
    this.groundSolve(S, ik, a.rise !== undefined);

    const gl = (0.85 + a.glow * 0.7 + Math.sin(t * 3) * 0.12) * (1 - eSpan * 0.85);
    for (const m of this.glowMats) m.emissiveIntensity = gl;
    for (const m of this.bodyMats) m.emissiveIntensity = a.flash * 0.5;
  }
}
