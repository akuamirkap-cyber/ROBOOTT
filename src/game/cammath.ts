import * as THREE from 'three';

/**
 * Framing maths shared by the gameplay camera and the cinematic beats.
 *
 * "Spill" is how much of the frame something eats up: 1 = exactly on the edge, above 1 = out of shot, 3 = it is
 * behind the lens. Instead of trusting a fov/distance formula (which always breaks at some angle), the camera
 * aims, measures its own viewfinder and walks back until the shot is clean.
 */

/** a viewfinder: forward / right / up basis plus the half-angle of the lens */
export interface Frame {
  f: THREE.Vector3;
  r: THREE.Vector3;
  u: THREE.Vector3;
  tanV: number;
  aspect: number;
}

export function newFrame(): Frame {
  return { f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), tanV: 1, aspect: 1 };
}

/** points the viewfinder: `pos` is the lens, `look` what it is aimed at */
export function aimFrame(frame: Frame, pos: THREE.Vector3, look: THREE.Vector3, fov: number, aspect: number) {
  frame.aspect = aspect;
  frame.tanV = Math.tan(THREE.MathUtils.degToRad(fov) * 0.5);
  frame.f.copy(look).sub(pos);
  const l = frame.f.length() || 1;
  frame.f.multiplyScalar(1 / l);
  frame.r.set(-frame.f.z, 0, frame.f.x).normalize();
  frame.u.crossVectors(frame.r, frame.f).normalize();
}

const pTmp = new THREE.Vector3();
/** how much of the frame a single point — grown by `pad` in every direction — eats up */
export function spillPoint(frame: Frame, pos: THREE.Vector3, p: THREE.Vector3, pad: number) {
  pTmp.copy(p).sub(pos);
  const z = pTmp.dot(frame.f);
  if (z <= 0.25) return 3; // behind the lens
  const nx = (Math.abs(pTmp.dot(frame.r)) + pad) / (frame.tanV * z * frame.aspect);
  const ny = (Math.abs(pTmp.dot(frame.u)) + pad) / (frame.tanV * z);
  return Math.max(nx, ny);
}

/** worst spill over a flat xyz triple list with one pad per point */
export function spillMany(frame: Frame, pos: THREE.Vector3, pts: number[], pads: number[]) {
  let worst = 0;
  for (let i = 0; i < pads.length; i++) {
    pTmp.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    const s = spillPoint(frame, pos, pTmp, pads[i]);
    if (s >= 3) return 3;
    if (s > worst) worst = s;
  }
  return worst;
}

/** what a robot looks like from the lens: a tall body with a round head */
export interface FighterLike {
  pos: { x: number; y: number };
  y: number;
  scale: number;
  state: string;
  /** the game's fall spring: 0 bolt upright, 1 flat on the canvas */
  fallS?: { x: number };
  /** floor-plane velocity, used to lead the shot */
  vel?: { x: number; y: number };
}

/** STAND_H … how tall a robot is upright, and how little is left of him once he is lying down */
const STAND_H = 6.6;
const FLOOR_H = 1.9;

/** the box round a robot that must stay on screen: head corners plus the sole */
export function fighterBox(pts: number[], pads: number[], fighters: FighterLike[]) {
  for (const f of fighters) {
    const s = f.scale;
    const flat = THREE.MathUtils.clamp(
      f.fallS ? f.fallS.x : f.state === 'ko' || f.state === 'down' ? 1 : 0,
      0,
      1,
    );
    const top = (STAND_H - (STAND_H - FLOOR_H) * flat) * s + f.y;
    pts.push(f.pos.x + 0.8 * s, top, f.pos.y, f.pos.x - 0.8 * s, top, f.pos.y);
    pads.push(0, 0);
    // the sole sits at the fighter's own floor level, so a body launched into the air does not drag a phantom
    // foot along with it
    pts.push(f.pos.x, flat > 0.5 ? 0.12 : Math.max(0.12, f.y + 0.05), f.pos.y);
    pads.push(0);
  }
}

/**
 * Worst spill of the robots in shot. Head corners and the feet are the extremes of the silhouette we refuse to
 * lose: a head cut in half by the edge of frame is exactly the bug this camera exists to kill.
 */
export function silhouetteSpill(
  frame: Frame,
  pos: THREE.Vector3,
  look: THREE.Vector3,
  fov: number,
  aspect: number,
  fighters: FighterLike[],
) {
  aimFrame(frame, pos, look, fov, aspect);
  const pts: number[] = [];
  const pads: number[] = [];
  fighterBox(pts, pads, fighters);
  return spillMany(frame, pos, pts, pads);
}

/**
 * Walks the lens back along `dir` (the unit direction from `look` to the camera) until every sample fits, and
 * writes where it ended up into `out`. Returns the distance it settled on; `spillAt` gives the leftover error.
 */
export function fitShot(
  frame: Frame,
  look: THREE.Vector3,
  dir: THREE.Vector3,
  fov: number,
  aspect: number,
  pts: number[],
  pads: number[],
  startD: number,
  maxD: number,
  out: THREE.Vector3,
): number {
  let d = startD;
  out.copy(dir).multiplyScalar(d).add(look);
  aimFrame(frame, out, look, fov, aspect);
  let spill = spillMany(frame, out, pts, pads);
  for (let i = 0; i < 8 && spill > 1 && d < maxD; i++) {
    d = Math.min(maxD, d * (1 + (spill - 1) * 0.85 + 0.05));
    out.copy(dir).multiplyScalar(d).add(look);
    aimFrame(frame, out, look, fov, aspect);
    spill = spillMany(frame, out, pts, pads);
  }
  return d;
}

/**
 * How far the lens may travel along `dir` before it leaves the arena: a soft cylinder round the ring plus a
 * ceiling and a floor, so a beat that has to back off can never end up inside the crowd.
 */
export function reachAlong(look: THREE.Vector3, dir: THREE.Vector3, radius: number, yMin: number, yMax: number) {
  let limit = Infinity;
  const hx = look.x, hz = look.z;
  const dx = dir.x, dz = dir.z;
  const a = dx * dx + dz * dz;
  if (a > 1e-6) {
    const b = 2 * (hx * dx + hz * dz);
    const cq = hx * hx + hz * hz - radius * radius;
    const disc = b * b - 4 * a * cq;
    if (disc > 0) {
      const t1 = (-b + Math.sqrt(disc)) / (2 * a);
      if (t1 > 0) limit = Math.min(limit, t1);
    }
  }
  if (dir.y > 1e-4) limit = Math.min(limit, (yMax - look.y) / dir.y);
  if (dir.y < -1e-4) limit = Math.min(limit, (yMin - look.y) / dir.y);
  return Math.max(0.6, limit);
}

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);
const seg = (a: number, b: number, u: number) => smooth(THREE.MathUtils.clamp((u - a) / (b - a), 0, 1));

/** how long the decapitation beat owns the camera */
export const RIP_DUR = 3.9;

/** where the rip beat puts the lens this frame */
export interface RipOut {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  dir: THREE.Vector3;
  fov: number;
  roll: number;
  /** 0 while the beat owns the shot, 1 once the resting camera should have it back */
  blend: number;
  /** how much of the head/stump/body is outside the frame of the shot that was actually built */
  spill: number;
  /** how far off the aimed distance the framing pass had to push the lens */
  push: number;
  phase: 'snap' | 'flight' | 'stump';
}

/**
 * THE HEAD RIP, beat by beat. `head` is the severed head, `neck` the stump it came off, `chest` the body it
 * belonged to, `blow` the direction the punch travelled (the head follows it) and `from`/`fromLook` the lens we
 * cut away from.
 *
 * Every beat is only a *wish*: where to look, from which side, how wide. The wish is then passed through a
 * framing pass that walks the lens back until the head, the stump and the body are all inside the picture, so
 * whatever the physics does — a head launched across the ring, a body dropping as it falls — the decapitation
 * cannot end up happening off screen.
 */
export function ripShot(
  out: RipOut,
  frame: Frame,
  t: number,
  head: THREE.Vector3,
  neck: THREE.Vector3,
  chest: THREE.Vector3,
  blow: THREE.Vector3,
  side: THREE.Vector3,
  scale: number,
  aspect: number,
  from: THREE.Vector3,
  fromLook: THREE.Vector3,
  reach: number,
  yMin: number,
  yMax: number,
) {
  const sc = THREE.MathUtils.clamp(scale, 0.6, 2);
  const gap = head.distanceTo(neck);
  const spread = Math.min(30, head.distanceTo(chest));
  const inA = seg(0, 0.3, t); // whip in from wherever the lens was
  const s12 = seg(0.3, 0.75, t); // snap → flight
  const s23 = seg(1.95, 2.5, t); // flight → stump
  const tail = seg(2.9, RIP_DUR, t); // hand the shot back to the resting camera

  const f = flightShot(spread);
  const c = stumpShot(gap);

  // A — THE SNAP: just off the shoulder, looking at the neck and the torso it is still attached to
  const aLook = chest.clone().lerp(neck, 0.45).addScaledVector(UP, 0.25);
  const aDir = side.clone().multiplyScalar(0.8).addScaledVector(blow, -0.5).addScaledVector(UP, 0.22).normalize();
  const aD = 5.6 * sc;

  // B — THE HEAD IN FLIGHT: aim between the head and the body, stand off to the side of the flight line
  const bLook = head.clone().lerp(chest, 1 - f.wHead).addScaledVector(UP, 0.1);
  const bDir = side.clone().addScaledVector(blow, -f.back).addScaledVector(UP, f.rise / f.d).normalize();
  const bD = f.d;

  // C — THE STUMP: push in on the torn cables, drifting towards wherever the head came to rest
  const cLook = neck.clone().lerp(head, c.wHead).addScaledVector(UP, 0.3);
  const cDir = side.clone().addScaledVector(blow, -c.back).addScaledVector(UP, c.rise / c.d).normalize();
  const cD = c.d;

  // ---- the wish: a blend of the three beats, eased out of the lens we are cutting from
  const look = aLook.lerp(bLook, s12).lerp(cLook, s23);
  const dir = aDir.lerp(bDir, s12).lerp(cDir, s23).normalize();
  out.fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(46, f.fov, s12), c.fov, s23);
  const wantD = THREE.MathUtils.lerp(THREE.MathUtils.lerp(aD, bD, s12), cD, s23);
  const ctl = 1 - inA;
  const wish = new THREE.Vector3()
    .copy(look)
    .addScaledVector(dir, wantD)
    .lerp(from, ctl);
  look.lerp(fromLook, ctl);
  dir.copy(wish).sub(look).normalize();

  // ---- FRAMING PASS: everything the shot must not lose. The flight refuses to lose the head; the stump
  //      close-up is allowed to let it go once it has rolled away, because by then it has had its close-up.
  const headW = 1 - s23;
  const full = [head.x, head.y + 0.15 * sc, head.z, neck.x, neck.y, neck.z, chest.x, chest.y, chest.z];
  const fullPads = [0.72 * sc, 0.78 * sc, 1.05 * sc];
  const body = [neck.x, neck.y, neck.z, chest.x, chest.y, chest.z];
  const bodyPads = [0.78 * sc, 1.05 * sc];
  const startD = Math.max(1.2, wish.distanceTo(look)); // never inside the subject
  const dMax = Math.min(26 * sc, reachAlong(look, dir, reach, yMin, yMax));
  const dFull = fitShot(frame, look, dir, out.fov, aspect, full, fullPads, startD, dMax, out.pos);
  const dBody = fitShot(frame, look, dir, out.fov, aspect, body, bodyPads, startD, dMax, out.pos);
  // 6 % of insurance: the lens eases towards the framing instead of snapping to it, and the head does not
  // wait for it
  const d = THREE.MathUtils.lerp(dBody * 1.04, dFull * 1.09, headW);
  out.pos.copy(dir).multiplyScalar(d).add(look);
  out.push = d - startD;
  aimFrame(frame, out.pos, look, out.fov, aspect);
  out.spill = Math.max(spillMany(frame, out.pos, full, fullPads) * headW, spillMany(frame, out.pos, body, bodyPads));

  out.look.copy(look);
  out.dir.copy(dir);
  out.roll = 0.035 * (1 - tail) * Math.sin(t * 7.5);
  out.blend = tail;
  out.phase = s23 > 0.5 ? 'stump' : s12 > 0.5 ? 'flight' : 'snap';
}

export const CAM_MODES: CamMode[] = [
  {
    id: 'siaran',
    name: 'SIARAN',
    tag: 'TV',
    desc: 'Kamera siaran TV: jauh, tinggi, lensa panjang, sangat tenang. Kedua robot selalu kelihatan utuh dengan ruang lega — paling nyaman untuk membaca jarak.',
    fov: 46,
    dist: 12.6,
    minDist: 10.9,
    margin: 1.1,
    orbit: 0.22,
    height: 5.7,
    closeBias: 0.15,
    lookY: 3.0,
    down: 0.6,
    hand: 0.35,
    lead: 0.12,
    koScale: 1.35,
  },
  {
    id: 'aksi',
    name: 'AKSI',
    tag: 'CLASSIC',
    desc: 'Kamera aksi standar: ikut irama pertarungan, sedikit dari samping, dinamis — tapi tidak lagi mepet saat adu jotos jarak dekat.',
    fov: 56,
    dist: 10.6,
    minDist: 9.5,
    margin: 1.12,
    orbit: 0.44,
    height: 5.0,
    closeBias: 0.5,
    lookY: 3.05,
    down: 0.9,
    hand: 1.0,
    lead: 0.24,
    koScale: 1.05,
  },
  {
    id: 'dekat',
    name: 'DEKAT',
    tag: 'IMPACT',
    desc: 'Sedekat mungkin tanpa bikin pusing: setiap hantaman terasa di layar. Robot mengisi frame hampir penuh, kamera ikut goyang saat kena.',
    fov: 54,
    dist: 6.9,
    minDist: 6.4,
    margin: 1.05,
    orbit: 0.55,
    height: 4.5,
    closeBias: 0.55,
    lookY: 3.3,
    down: 1.1,
    hand: 1.35,
    lead: 0.3,
    koScale: 0.85,
  },
  {
    id: 'ring',
    name: 'RING LUAS',
    tag: 'TACTICAL',
    desc: 'Kamera luas dari atas ring: seluruh kanvas, tali, dan sudut terlihat. Paling enak untuk mengatur jarak dan melihat lawan bersiap.',
    fov: 68,
    dist: 17.5,
    minDist: 15.5,
    margin: 1.08,
    orbit: 0.34,
    height: 8.6,
    closeBias: 0,
    lookY: 2.7,
    down: 0.2,
    hand: 0.2,
    lead: 0.06,
    koScale: 1.6,
  },
  {
    id: 'pundak',
    name: 'PUNDAK',
    tag: 'IMMERSIVE',
    desc: 'Kamera di belakang pundak robotmu: melihat dari kacamata petarung, lawan tepat di depan mata. Paling seru untuk berburu kepala.',
    fov: 56,
    dist: 3.4,
    minDist: 3.0,
    margin: 1.1,
    orbit: 0.5,
    height: 5.2,
    closeBias: 0.35,
    lookY: 4.2,
    down: 0.9,
    hand: 0.8,
    lead: 0.2,
    koScale: 1.0,
    style: 'shoulder',
    ignoreSelf: true,
  },
];

/**
 * B — THE HEAD IN FLIGHT. `spread` is how far the head has travelled from the body. The further it gets, the more
 * the shot leans towards the head, the wider the lens and the lower the camera has to sit so both ends of the
 * flight stay in one frame.
 */
export function flightShot(spread: number) {
  const s = THREE.MathUtils.clamp(spread, 0, 30);
  const wHead = THREE.MathUtils.clamp(0.5 - s * 0.009, 0.3, 0.5);
  return {
    wHead, // how much of the middle ground the head gets
    fov: THREE.MathUtils.clamp(46 + s * 0.55, 46, 62),
    // a flat angle: rising hard would eat the headroom the lens needs for the flight
    rise: THREE.MathUtils.clamp(1.95 + s * 0.055, 1.95, 3.1),
    back: 0.36, // how far behind the line the lens sits
    // deliberately closer than the framing pass would choose on its own, so the pass has to push back and the
    // shot ends up filling the frame instead of floating far away
    d: THREE.MathUtils.clamp(6.8 + s * 0.42, 7.6, 12),
  };
}

/**
 * C — THE STUMP. The severed head is already on the canvas by now, so this pushes in on the torn cables and the
 * sparks, drifting towards wherever the head came to rest without ever letting the stump leave the shot.
 */
export function stumpShot(gap: number) {
  const g = THREE.MathUtils.clamp(gap, 0, 30);
  return {
    wHead: THREE.MathUtils.clamp(0.42 - g * 0.03, 0, 0.42),
    fov: THREE.MathUtils.clamp(44 + g * 0.5, 44, 58),
    d: THREE.MathUtils.clamp(5 + g * 0.35, 5.4, 13),
    rise: 1.35,
    back: 0.62,
  };
}

/**
 * The operator's presets. The gameplay camera is not one look but a family: every mode places the lens its own
 * way, aims at its own thing and leans on its own lens — and every one of them is put through the same framing
 * pass, so whichever you pick, nothing important leaves the picture.
 */
export interface CamMode {
  id: string;
  name: string;
  tag: string;
  desc: string;
  /** the lens; the game fov breathes around it */
  fov: number;
  /** how far the operator wants to stand at a normal gap */
  dist: number;
  /** never closer than this, however tight the fight gets — the comfort floor */
  minDist: number;
  /** extra air around the robots on top of the framing pass (1.1 = 10 % of breathing room) */
  margin: number;
  /** how far off the fight axis the lens sits */
  orbit: number;
  /** lens height above the canvas */
  height: number;
  /** how much closer the shot creeps in during a clinch (0 = never) */
  closeBias: number;
  /** what the lens aims at, and how much harder it tilts down when they close in */
  lookY: number;
  down: number;
  /** handheld drift multiplier and action lead */
  hand: number;
  lead: number;
  /** the knockout aftermath orbit is scaled by this */
  koScale: number;
  /** 'shoulder' sits behind the player looking past him instead of across the fight */
  style?: 'axis' | 'shoulder';
  /** a shoulder cam is allowed to crop the fighter whose shoulder we are behind */
  ignoreSelf?: boolean;
}

/** the lens never stands further from the ring than this */
const MAX_CAM_D = 23;
/** the shoulder cam: a fixed offset behind and beside the player, plus a little more the further it stands */
const SHOULDER_BACK = 2.4;
const SHOULDER_LAT = 2.8;
const SHOULDER_BACK_K = 0.55;
const SHOULDER_LAT_K = 0.04;
/** how much air the lens may use, and how high it may go */
const CAM_Y_MIN = 2.5;
const CAM_Y_MAX = 12.5;

export interface GameplayOut {
  /** how tight the fight is: 0 far apart … 1 in a clinch. The fov and the handheld drift ride on it. */
  camClose: number;
  /** how far the lens ended up from what it is aimed at */
  d: number;
  /** how tight the shot is: 1 means a robot exactly on the frame edge, below that is comfort margin */
  spill: number;
}

const gF = new THREE.Vector2();
const gR = new THREE.Vector2();
const gDir = new THREE.Vector3();
const gAnchor = new THREE.Vector3();
const gPts: number[] = [];
const gPads: number[] = [];

/**
 * THE GAMEPLAY CAMERA. Built from the active mode, then put through two framing passes: one with the lead-ahead
 * aim, and — if that would clip anything — one with the plain midpoint aim. The mode's comfort margin goes on top
 * of that, so the shot always keeps air around the fighters instead of pinning them to the edges of the screen.
 *
 * The mode decides where the operator stands, how high, how far off the fight axis, what he aims at, how the
 * lens breathes and how much the camera is allowed to shake. Everything else is one guarantee shared by all five
 * of them: nothing important ever leaves the picture.
 */
export function gameplayShot(
  out: THREE.Vector3,
  look: THREE.Vector3,
  frame: Frame,
  a: FighterLike,
  b: FighterLike,
  mode: CamMode,
  fov: number,
  aspect: number,
  reach: number,
): GameplayOut {
  const f = gF.set(b.pos.x - a.pos.x, b.pos.y - a.pos.y); // a → b: the axis of the fight
  if (f.lengthSq() < 1e-6) f.set(0, 1);
  f.normalize();
  const r = gR.set(-f.y, f.x); // sideways
  const dist = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
  const midX = (a.pos.x + b.pos.x) * 0.5;
  const midZ = (a.pos.y + b.pos.y) * 0.5;
  const vx = ((a.vel?.x ?? 0) + (b.vel?.x ?? 0)) * 0.5;
  const vz = ((a.vel?.y ?? 0) + (b.vel?.y ?? 0)) * 0.5;
  // the camera leads the pair — a close-quarters luxury: with the fighters far apart it would shove the near man
  // into the lens, so the amount fades out as the gap grows
  const leadK = mode.lead * THREE.MathUtils.clamp(1 - (dist - 5) / 12, 0.22, 1);

  const close = THREE.MathUtils.clamp((5.4 - dist) / 2.6, 0, 1);
  const air = Math.max(b.y, a.y); // somebody is off the floor

  // when somebody is on the canvas the shot drops down to him instead of looking over the fight
  const downed = a.state === 'ko' || a.state === 'down' || b.state === 'ko' || b.state === 'down';
  const shoulder = mode.style === 'shoulder';

  // where the lens looks: at the fight, or — over the shoulder — straight at the man in front of us, so our own
  // chassis slides off to the side of the frame instead of standing in the middle of the shot
  const aimX = shoulder ? b.pos.x : midX;
  const aimZ = shoulder ? b.pos.y : midZ;
  const aimY = (downed ? 1.95 : mode.lookY) + close * 0.35 * mode.down + air * 0.6;

  const place = (d: number, lx: number, lz: number) => {
    // just above the top rope (ropes sit at 1.5 / 2.7 / 3.9), lifting for clinches and launches
    const py = (downed ? 3.15 : mode.height) + close * mode.down * 0.6 + Math.max(0, dist - 6) * 0.05 + air * 0.4;
    if (shoulder) {
      // right behind the player's shoulder and well out to the side: his chassis ends up on the edge of the
      // frame with the man he is fighting in the middle of it
      const back = SHOULDER_BACK + d * SHOULDER_BACK_K;
      const lat = SHOULDER_LAT + d * SHOULDER_LAT_K;
      out.set(a.pos.x - f.x * back + r.x * lat, py, a.pos.y - f.y * back + r.y * lat);
    } else {
      const orbit = mode.orbit + close * 0.12 * (1 - mode.closeBias * 0.5);
      out.set(lx - f.x * d * Math.cos(orbit) + r.x * d * Math.sin(orbit), py, lz - f.y * d * Math.cos(orbit) + r.y * d * Math.sin(orbit));
    }
  };

  /** the operator's standing distance, and the comfort floor under it */
  const wantD = Math.max(mode.minDist, mode.dist - mode.closeBias * 2.4 * close);
  let spill = 0;

  const shoot = (k: number) => {
    const lx = shoulder ? aimX + vx * k * 0.5 : midX + vx * k;
    const lz = shoulder ? aimZ + vz * k * 0.5 : midZ + vz * k;
    look.set(lx, aimY, lz);

    // the lens never leaves the building, whatever the shot wants
    let dMax: number;
    if (shoulder) {
      // the lens travels along this offset from a fixed point behind the shoulder, so the limit is measured
      // from there and scaled back into the beat's own units
      gAnchor.set(a.pos.x - f.x * SHOULDER_BACK + r.x * SHOULDER_LAT, 3.5, a.pos.y - f.y * SHOULDER_BACK + r.y * SHOULDER_LAT);
      gDir.set(-f.x * SHOULDER_BACK_K + r.x * SHOULDER_LAT_K, 0, -f.y * SHOULDER_BACK_K + r.y * SHOULDER_LAT_K);
      const scale = gDir.length() || 1;
      gDir.multiplyScalar(1 / scale);
      dMax = reachAlong(gAnchor, gDir, reach, CAM_Y_MIN, CAM_Y_MAX) / scale;
    } else {
      gDir.set(-f.x * Math.cos(mode.orbit) + r.x * Math.sin(mode.orbit), 0, -f.y * Math.cos(mode.orbit) + r.y * Math.sin(mode.orbit));
      gDir.normalize();
      gAnchor.set(lx, 3.5, lz);
      dMax = reachAlong(gAnchor, gDir, reach, CAM_Y_MIN, CAM_Y_MAX);
    }
    dMax = Math.min(MAX_CAM_D, Math.max(3, dMax));

    // a shoulder cam is allowed to crop the man whose shoulder we are standing behind
    gPts.length = 0;
    gPads.length = 0;
    fighterBox(gPts, gPads, shoulder ? [b] : [a, b]);

    const want = Math.min(wantD, dMax);
    let d = want;
    place(d, lx, lz);
    aimFrame(frame, out, look, fov, aspect);
    spill = spillMany(frame, out, gPts, gPads);
    for (let i = 0; i < 7 && spill > 1 && d < dMax - 0.01; i++) {
      d = Math.min(dMax, d * (1 + (spill - 1) * 0.85 + 0.05));
      place(d, lx, lz);
      aimFrame(frame, out, look, fov, aspect);
      spill = spillMany(frame, out, gPts, gPads);
    }
    // comfort: stand a little further back so the robots are not pinned to the edges of the frame
    place(Math.min(dMax, Math.max(want, d * mode.margin)), lx, lz);
    return spill;
  };

  if (shoot(leadK) > 1) shoot(leadK * 0.25); // the lead broke the frame: shoot it again on the plain midpoint
  aimFrame(frame, out, look, fov, aspect);
  return { camClose: close, d: out.distanceTo(look), spill };
}
