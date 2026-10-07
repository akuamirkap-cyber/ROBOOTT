// Renders the VS clash scene to PNG (point cloud through the REAL camera math) — no browser needed.
// Usage: node clashviz.mjs <t> <out.png> [heroSep foeSep scaleF]
import * as THREE from 'three';
import zlib from 'zlib';
import fs from 'fs';
import { Robot } from './.__robot.mjs';
import { VS_CLASH_HIT, VS_CLASH_POINT, VS_CLASH_SEP, vsClashState } from './.__game.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };
const W = 960, H = 540;

const t = parseFloat(process.argv[2] ?? VS_CLASH_HIT);
const out = process.argv[3] ?? 'clashviz.png';
const heroSep = parseFloat(process.argv[4] ?? VS_CLASH_SEP);
const foeSep = parseFloat(process.argv[5] ?? VS_CLASH_SEP);
const scaleF = parseFloat(process.argv[6] ?? 1.0);
const YAW = 0.42, SETTLE = 110;

function readyAnim(tt) {
  const br = Math.sin(tt * 1.3) * 0.016;
  return {
    arms: [
      { sx: -0.8 + br, sy: -0.1, sz: 0.25, ex: -2.4 - br },
      { sx: -0.55, sy: -0.4, sz: 0, ex: -1.8 },
    ],
    twist: 0.22, lean: 0.1, lunge: 0, dip: 0.11, roll: 0,
    vf: 0, vl: 0, af: 0, al: 0, yawRate: 0, air: 0, hit: 0, hitSign: 1, hitUp: 0, fall: 0, time: 0,
    glow: 0.45, flash: 0, tilt: 0, dash: 0, dashF: 0, dashL: 0,
  };
}

function clashAnim(side, ct, tt) {
  const c = vsClashState(side, Math.max(0, ct), 9);
  return {
    arms: c.arms, twist: c.twist, lean: c.lean, dip: c.dip, roll: c.roll, lunge: c.lunge,
    vf: 0, vl: 0, af: 0, al: 0, yawRate: 0, air: 0, hit: 0, hitSign: 1, hitUp: 0, fall: 0, time: tt,
    glow: c.glow, flash: 0, tilt: 0, dash: 0, dashF: 0, dashL: 1,
    headYaw: c.head, lookX: c.lookX, lookY: c.lookY, strike: c.strike, strikePow: c.pow,
    punchFoot: c.punch, punchZ: c.punchZ, punchX: c.punchX, punchDur: c.punchDur, punchSeq: c.punchSeq,
    _yaw: c.yaw,
  };
}

// timeline: run the whole sequence CONTINUOUSLY like the game (stare-down 2 s → clash 0..t).
function runRobot(side, tEnd) {
  const r = new Robot(STYLE, side === 'foe' ? scaleF : 1);
  r.snapFeet();
  r.root.position.set(side === 'hero' ? -heroSep : foeSep, 0, 0);
  r.root.rotation.y = (side === 'hero' ? 1 : -1) * YAW;
  let tt = 0;
  // stare-down settle
  for (let i = 0; i < 100; i++) { const a = readyAnim(tt); a.time = tt; r.animate(a, D); tt += D; }
  // clash
  for (let ct = 0; ct < tEnd - 1e-9; ct += D) {
    const a = clashAnim(side, ct, tt);
    r.root.rotation.y = (side === 'hero' ? 1 : -1) * (YAW + a._yaw);
    a.time = tt;
    r.animate(a, D);
    tt += D;
  }
  r.root.updateWorldMatrix(true, true);
  return r;
}

const heroR = runRobot('hero', t);
const foeR = runRobot('foe', t);

// ---- camera: the game's VS camera at clash time t
function camAt(t) {
  const wind = THREE.MathUtils.clamp(t / VS_CLASH_HIT, 0, 1);
  const build = wind * wind * (3 - 2 * wind);
  const dive = t >= VS_CLASH_HIT ? 1 : 0;
  const clashZoom = 1 - 0.035 * Math.sin(Math.PI * build) + 0.1 * build * build - 0.26 * dive;
  const clashLift = dive * (VS_CLASH_POINT.y - 5.45) + build * 0.2;
  const clashLookZ = build * 0.9 + dive * 0.8;
  const camDist = 9.6 * clashZoom;
  return {
    pos: new THREE.Vector3(0, 5.55 + clashLift, camDist),
    look: new THREE.Vector3(VS_CLASH_POINT.x * build, 5.45 + clashLift, clashLookZ),
    fov: 46,
  };
}
const cm = camAt(t);
const cam = new THREE.PerspectiveCamera(cm.fov, W / H, 0.1, 200);
cam.position.copy(cm.pos);
cam.lookAt(cm.look);
cam.updateMatrixWorld();
cam.updateProjectionMatrix();

// ---- rasterize point cloud
const img = new Uint8Array(W * H * 3);
// background: dark blue-grey gradient + floor hint
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    img[i] = 10 + (y / H) * 12;
    img[i + 1] = 12 + (y / H) * 10;
    img[i + 2] = 20 + (y / H) * 8;
  }
// floor stripes
for (let x = 0; x < W; x++) if (x % 12 === 0) for (let y = H - 60; y < H; y++) { const i = (y * W + x) * 3; img[i] += 8; img[i + 1] += 8; img[i + 2] += 8; }

const pv = new THREE.Vector3();
function dot(px, py, r, col) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = px + dx, y = py + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = (y * W + x) * 3;
      img[i] = Math.max(img[i], col[0]);
      img[i + 1] = Math.max(img[i + 1], col[1]);
      img[i + 2] = Math.max(img[i + 2], col[2]);
    }
}
function plotRobot(r, base, glowCol) {
  r.root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      pv.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).project(cam);
      if (pv.z > 1 || pv.z < -1) continue;
      const sx = Math.round(((pv.x + 1) / 2) * W);
      const sy = Math.round(((1 - pv.y) / 2) * H);
      dot(sx, sy, 1, base);
    }
  });
}
function plotBone(obj, col, r = 5) {
  obj.getWorldPosition(pv).project(cam);
  dot(Math.round(((pv.x + 1) / 2) * W), Math.round(((1 - pv.y) / 2) * H), r, col);
}
plotRobot(heroR, [60, 90, 120]);
plotRobot(foeR, [120, 90, 80]);
// markers: chests (white ring), heads (dim), inner clash gloves (bright cyan hero / orange foe)
for (const [side, r, fistCol] of [['hero', heroR, [0, 255, 255]], ['foe', foeR, [255, 160, 40]]]) {
  r.chest.getWorldPosition(pv); const cp = pv.clone().project(cam);
  dot(Math.round(((cp.x + 1) / 2) * W), Math.round(((1 - cp.y) / 2) * H), 8, [200, 200, 200]);
  const arm = vsClashState(side, t).arm;
  plotBone(r.fists[arm], fistCol, 7);
  plotBone(r.fists[1 - arm], [120, 120, 120], 4);
}
// contact patch marker (VS_CLASH_POINT)
{
  pv.set(VS_CLASH_POINT.x, VS_CLASH_POINT.y, VS_CLASH_POINT.z).project(cam);
  dot(Math.round(((pv.x + 1) / 2) * W), Math.round(((1 - pv.y) / 2) * H), 6, [255, 0, 255]);
  pv.set(0, 5.4, 0).project(cam); // stage centre line at glove height
  dot(Math.round(((pv.x + 1) / 2) * W), Math.round(((1 - pv.y) / 2) * H), 3, [0, 255, 0]);
}

// ---- PNG writer (no deps)
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; img.slice(y * W * 3, (y + 1) * W * 3).forEach((v, i) => (raw[y * (1 + W * 3) + 1 + i] = v)); }
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
fs.writeFileSync(out, png);
console.log(`wrote ${out} (t=${t}, heroSep=${heroSep}, foeSep=${foeSep}, foeScale=${scaleF})`);
// also print measured glove facts
const gc = (r, i) => { const b = new THREE.Box3(); r.fists[i].updateWorldMatrix(true, true); r.fists[i].traverse((o) => { if (o.isMesh) b.expandByObject(o); }); return b.getCenter(new THREE.Vector3()); };
const heroArm = vsClashState('hero', t).arm;
const foeArm = vsClashState('foe', t).arm;
const h1 = gc(heroR, heroArm), f1 = gc(foeR, foeArm);
console.log(`player right hand ${heroArm}: ${h1.x.toFixed(2)},${h1.y.toFixed(2)},${h1.z.toFixed(2)} | opponent right hand ${foeArm}: ${f1.x.toFixed(2)},${f1.y.toFixed(2)},${f1.z.toFixed(2)} | center gap ${h1.distanceTo(f1).toFixed(2)} m`);
console.log(`hero chest: ${heroR.chest.getWorldPosition(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))} | foe chest: ${foeR.chest.getWorldPosition(new THREE.Vector3()).toArray().map((v) => v.toFixed(2))}`);
