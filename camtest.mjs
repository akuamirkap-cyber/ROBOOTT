// Camera validation harness — run it with:
//     npx esbuild src/game/cammath.ts --bundle --format=esm --platform=node --outfile=.__cam.mjs --external:three
//     node camtest.mjs
//
// It imports the REAL camera code from src/game/cammath.ts — the framing maths, the gameplay camera of every
// preset, and the whole decapitation beat. Only the thin loops that live inside Game.ts (the follow easing, the
// hard safety pass, the aftermath orbit) are mirrored here, and their numbers are kept in sync by hand.
//
// "spill" is how much of the frame a robot eats up: 1.00 = exactly on the frame edge, > 1 = clipped, 3 = behind
// the lens. Comfort targets: nothing above 1.00 ever; the default preset stays under ~0.85 when they are chest
// to chest.
import * as THREE from 'three';
import {
  CAM_MODES,
  gameplayShot,
  newFrame,
  aimFrame,
  spillPoint,
  silhouetteSpill,
  fighterBox,
  fitShot,
  reachAlong,
  ripShot,
  RIP_DUR,
  flightShot,
  stumpShot,
} from './.__cam.mjs';

const RING = 11.9;
const aspect = 16 / 9;
const HEAD_PAD = 0.9; // the severed head's own size
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const F = (x, z, scale = 1, y = 0, state = 'idle') => ({
  pos: { x, y: z },
  vel: { x: 0, y: 0 },
  scale,
  y,
  state,
  fallS: { x: state === 'ko' || state === 'down' ? 1 : 0 },
});

/** the real gameplay camera, from cammath */
function cam(p, e, mode, fov = mode.fov) {
  const gp = new THREE.Vector3();
  const gl = new THREE.Vector3();
  const frame = newFrame();
  const res = gameplayShot(gp, gl, frame, p, e, mode, fov, aspect, RING + 11);
  // what the frame looks like once the comfort margin has been applied — the thing the player actually sees
  const real = silhouetteSpill(frame, gp, gl, fov, aspect, mode.ignoreSelf ? [e] : [p, e]);
  return { gp, gl, frame, d: res.d, spill: res.spill, real, camClose: res.camClose };
}

let fail = 0;
const check = (ok, label, detail) => {
  if (!ok) fail++;
  console.log(`  ${ok ? '✔' : '✘ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
};

console.log('=== 1. GAMEPLAY CAMERA — every preset, every situation ===');
console.log('  preset      | worst spill | spill at clinch | lens at clinch | lens far apart');
let worstAll = 0;
for (const mode of CAM_MODES) {
  let worst = 0;
  let worstCase = '';
  let atClinch = 0;
  let clampDist = 0;
  let farDist = 0;
  for (const dist of [0.6, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20]) {
    for (const vel of [0, 7, 14]) {
      for (const air of [0, 1.5, 3]) {
        for (const st of ['idle', 'ko']) {
          for (const sc of [1, 1.2]) {
            const p = F(-dist / 2, 0);
            const e = F(dist / 2, 0, sc, air, st);
            p.vel.x = vel;
            e.vel.x = vel;
            const r = cam(p, e, mode);
            // what the frame really looks like, measured through the lens that was placed
            if (r.real > worst) {
              worst = r.real;
              worstCase = `dist ${dist} vel ${vel} air ${air} ${st} scale ${sc}`;
            }
            if (vel === 0 && air === 0) {
              if (dist <= 1.5 && r.real > atClinch) {
                atClinch = r.real;
                clampDist = r.d;
              }
              if (dist === 10) farDist = r.d;
            }
          }
        }
      }
    }
  }
  worstAll = Math.max(worstAll, worst);
  console.log(`  ${mode.name.padEnd(11)} | ${worst.toFixed(3).padStart(11)} | ${atClinch.toFixed(3).padStart(15)} | ${clampDist.toFixed(1).padStart(14)} | ${farDist.toFixed(1).padStart(14)}`);
  check(worst <= 1.02, `${mode.name}: nothing ever leaves the frame`, worst > 1.02 ? worstCase : undefined);
}
const siaran = CAM_MODES[0];
{
  // comfort check on the default preset: chest to chest, the robots must not fill the whole screen
  let worstClose = 0;
  for (const dist of [0.4, 0.8, 1.2, 1.6, 2, 2.5, 3]) {
    const r = cam(F(-dist / 2, 0), F(dist / 2, 0), siaran);
    worstClose = Math.max(worstClose, r.real);
  }
  check(worstClose <= 0.9, `${siaran.name} keeps air around the fighters in a clinch`, `spill ${worstClose.toFixed(3)}`);
}

console.log('\n=== 2. COMFORT: how big does a robot look on screen? ===');
console.log('  (fraction of the screen height a standing robot covers — under 0.85 means there is air around him)');
for (const mode of CAM_MODES) {
  const row = [];
  for (const dist of [1, 3, 6, 10]) {
    const r = cam(F(-dist / 2, 0), F(dist / 2, 0), mode);
    aimFrame(r.frame, r.gp, r.gl, mode.fov, aspect);
    row.push(`d${dist}: ${spillPoint(r.frame, r.gp, new THREE.Vector3(0, 6.6, 0), 0).toFixed(2)}`);
  }
  console.log(`  ${mode.name.padEnd(11)} ${row.join('  ')}`);
}

console.log('\n=== 3. SHOULDER CAM: is the enemy visible past our own robot? ===');
{
  const shoulder = CAM_MODES.find((m) => m.style === 'shoulder');
  const frame = newFrame();
  for (const dist of [1, 2, 4, 7]) {
    const p = F(0, 0);
    const e = F(0, dist);
    const r = cam(p, e, shoulder);
    aimFrame(frame, r.gp, r.gl, shoulder.fov, aspect);
    const enemySpill = silhouetteSpill(frame, r.gp, r.gl, shoulder.fov, aspect, [e]);
    const meSpill = silhouetteSpill(frame, r.gp, r.gl, shoulder.fov, aspect, [p]);
    // how far off centre our own chassis sits: a shoulder cam lives on the difference
    const toScreen = (v) => {
      const Fv = new THREE.Vector3().copy(r.gl).sub(r.gp).normalize();
      const Rv = new THREE.Vector3(-Fv.z, 0, Fv.x).normalize();
      const Uv = new THREE.Vector3().crossVectors(Rv, Fv).normalize();
      const d = new THREE.Vector3().copy(v).sub(r.gp);
      const z = d.dot(Fv);
      const tanV = Math.tan((shoulder.fov * Math.PI) / 360);
      return { x: d.dot(Rv) / (tanV * z * aspect), y: d.dot(Uv) / (tanV * z), depth: z };
    };
    const me = toScreen(new THREE.Vector3(0, 3.5, 0));
    console.log(
      `  gap ${dist} | enemy spill ${enemySpill.toFixed(2)} | own robot spill ${meSpill.toFixed(2)} | own centre off-centre ${Math.abs(me.x).toFixed(2)}`,
    );
    if (dist >= 2) check(enemySpill <= 1.02, `shoulder cam keeps the enemy whole at gap ${dist}`);
    // the shoulder composition only matters once there is room between the two robots
    const en = toScreen(new THREE.Vector3(e.pos.x, 3.5, e.pos.y));
    const myHalf = 0.8 / (Math.tan((shoulder.fov * Math.PI) / 360) * (me.depth ?? 0) * aspect);
    if (dist >= 3) {
      check(Math.abs(me.x) >= 0.25, `shoulder cam sits off our own chassis at gap ${dist}`, `off-centre ${Math.abs(me.x).toFixed(2)}`);
      check(Math.abs(me.x) - Math.abs(myHalf) > Math.abs(en.x) + 0.05, `shoulder cam never lets our chassis cover the enemy at gap ${dist}`,
        `own edge ${(Math.abs(me.x) - Math.abs(myHalf)).toFixed(2)} vs enemy ${Math.abs(en.x).toFixed(2)}`);
    }
  }
}

console.log('\n=== 4. FOLLOW LAG + HARD SAFETY — does a sprinting fighter outrun the camera? ===');
function lagTest(mode, label, motion) {
  const frame = newFrame();
  const dir = new THREE.Vector3();
  const pts = [];
  const pads = [];
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const p = F(-4, 0);
  const e = F(4, 0);
  camPos.set(0, 4.55, -12);
  camLook.set(0, 3.05, 0);
  const dt = 1 / 60;
  let worstNo = 0;
  let worstYes = 0;
  for (let i = 0; i < 300; i++) {
    const t = i * dt;
    motion(t, p, e);
    const r = cam(p, e, mode);
    const fk = 1 + (3 - 1) * 0.55; // 3× footwork, the fastest the player can set
    camPos.lerp(r.gp, 1 - Math.exp(-5 * fk * dt));
    camLook.lerp(r.gl, 1 - Math.exp(-7 * fk * dt));
    const survivors = mode.ignoreSelf ? [e] : [p, e];
    worstNo = Math.max(worstNo, silhouetteSpill(frame, camPos, camLook, mode.fov + 2, aspect, survivors));
    // the pass Game.updateCamera runs after the easing
    const d0 = camPos.distanceTo(camLook);
    dir.copy(camPos).sub(camLook).multiplyScalar(1 / d0);
    pts.length = 0;
    pads.length = 0;
    fighterBox(pts, pads, survivors);
    const room = reachAlong(camLook, dir, RING + 11, 2.5, 12.5);
    const d = fitShot(frame, camLook, dir, mode.fov + 2, aspect, pts, pads, d0, Math.min(d0 * 1.6 + 8, room), camPos);
    camPos.copy(dir).multiplyScalar(d).add(camLook);
    worstYes = Math.max(worstYes, silhouetteSpill(frame, camPos, camLook, mode.fov + 2, aspect, survivors));
  }
  console.log(`  ${mode.name.padEnd(11)} ${label}: raw follow ${worstNo.toFixed(3)} → with safety ${worstYes.toFixed(3)}`);
  return worstYes;
}
let worstLag = 0;
for (const mode of CAM_MODES) {
  worstLag = Math.max(
    worstLag,
    lagTest(mode, 'circling 7 m/s', (t, p, e) => {
      const d = Math.min(t, 1.6) * 7;
      p.pos.x = -4; e.pos.x = 4; p.pos.y = d; e.pos.y = d;
    }),
    lagTest(mode, 'dash at the lens', (t, p, e) => {
      const d = t < 0.4 ? 0 : Math.min(t - 0.4, 0.6) * 14;
      p.pos.x = -4; e.pos.x = 4; p.pos.y = d; e.pos.y = d * 0.2;
    }),
  );
}
check(worstLag <= 1.02, 'the safety pass keeps every preset inside the frame even when they sprint', worstLag.toFixed(3));

console.log('\n=== 5. HEAD RIP BEAT (real ripShot) — is the decapitation on screen? ===');
function rip(px, pz, vx, vy, sc, label) {
  const neck = new THREE.Vector3(0, 6.0 * sc, 0);
  const chest = new THREE.Vector3(0, 4.6 * sc, 0);
  const blow = new THREE.Vector3(0, 0, 1);
  const side = new THREE.Vector3(-1, 0, 0);
  const from = new THREE.Vector3(px, 4.6, pz - 8);
  const fromLook = new THREE.Vector3(0, 3.4, 0);
  const head = neck.clone();
  const vel = new THREE.Vector3(0, vy, vx);
  const frame = newFrame();
  const st = {
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, 1),
    fov: 46,
    roll: 0,
    blend: 0,
    spill: 0,
    push: 0,
    phase: 'snap',
  };
  const dt = 1 / 60;
  const floor = 0.5 * sc;
  const headC = new THREE.Vector3();
  let worstFlight = 0;
  let worstStump = 0;
  for (let t = 0; t <= RIP_DUR + 1e-6; t += dt) {
    ripShot(st, frame, t, head, neck, chest, blow, side, sc, aspect, from, fromLook, RING + 8, 2.0, 10.5);
    const rad = Math.hypot(st.pos.x, st.pos.z);
    if (rad > RING + 8) {
      st.pos.x *= (RING + 8) / rad;
      st.pos.z *= (RING + 8) / rad;
    }
    st.pos.y = clamp(st.pos.y, 2.0, 10.5);
    aimFrame(frame, st.pos, st.look, st.fov, aspect);
    headC.set(head.x, head.y + 0.15 * sc, head.z);
    const headSpill = spillPoint(frame, st.pos, headC, 0.72 * sc);
    const body = Math.max(spillPoint(frame, st.pos, neck, 0.78 * sc), spillPoint(frame, st.pos, chest, 1.15 * sc));
    if (t <= 1.95) worstFlight = Math.max(worstFlight, headSpill, body);
    else worstStump = Math.max(worstStump, body);
    head.addScaledVector(vel, dt);
    vel.y -= 30 * dt;
    if (head.y < floor) {
      head.y = floor;
      if (Math.abs(vel.y) > 2.4) {
        vel.y = -vel.y * 0.34;
        vel.x *= 0.55;
        vel.z *= 0.55;
      } else vel.set(0, 0, 0);
    }
  }
  check(worstFlight <= 1.02 && worstStump <= 1.02, `${label}`, `snap+flight ${worstFlight.toFixed(2)}, stump ${worstStump.toFixed(2)}`);
}
rip(0, -6, 9, 10.5, 1, 'slow launch, scale 1');
rip(0, -6, 13, 14.5, 1, 'fast launch, scale 1');
rip(1, -7, 11, 12, 1.2, 'mid launch, scale 1.2');
rip(-2, -5, 12, 13, 0.85, 'mid launch, scale 0.85');

console.log('\n=== 6. KO AFTERMATH ORBIT — the wreckage stays in shot (per preset) ===');
let worstKO = 0;
for (const mode of CAM_MODES) {
  for (const gap of [0, 6, 10, 15]) {
    const loser = { pos: { x: 0, y: 0 }, y: 0, scale: 1, state: 'ko', fallS: { x: 1 } };
    const winner = { pos: { x: 3, y: -2 }, y: 0, scale: 1, state: 'idle', fallS: { x: 0 } };
    const headP = new THREE.Vector3(0, 0.5, gap);
    const rad0 = (gap > 2 ? 8.5 + gap * 0.42 : 8.5) * mode.koScale;
    for (let t = 0; t < 12; t += 0.25) {
      const ang = t * 0.3 + 1.2;
      const camPos = new THREE.Vector3(Math.cos(ang) * Math.min(rad0, RING + 10), 3.3, Math.sin(ang) * Math.min(rad0, RING + 10));
      const camLook = new THREE.Vector3(0, gap > 2 ? 1.7 : 2.0, gap / 2);
      const frame = newFrame();
      const dir = new THREE.Vector3().copy(camPos).sub(camLook).normalize();
      const pts = [];
      const pads = [];
      fighterBox(pts, pads, [loser, winner]);
      pts.push(headP.x, headP.y, headP.z);
      pads.push(HEAD_PAD);
      const d0 = camPos.distanceTo(camLook);
      fitShot(frame, camLook, dir, mode.fov + 2, aspect, pts, pads, d0, d0 * 1.6 + 10, camPos);
      const w = Math.max(
        silhouetteSpill(frame, camPos, camLook, mode.fov + 2, aspect, [loser, winner]),
        spillPoint(frame, camPos, headP, HEAD_PAD),
      );
      worstKO = Math.max(worstKO, w);
    }
  }
}
check(worstKO <= 1.02, 'every preset shows the body and the severed head after the KO', worstKO.toFixed(3));

console.log('\n=== 7. BEAT PARAMETER CURVES ===');
for (const spread of [0, 5, 13, 24]) {
  const f = flightShot(spread);
  const st = stumpShot(spread);
  console.log(
    `  spread ${String(spread).padStart(2)} | flight: lookHead ${f.wHead.toFixed(2)} fov ${f.fov.toFixed(0)} d ${f.d.toFixed(1)} rise ${f.rise.toFixed(1)} | stump: headWeight ${st.wHead.toFixed(2)} fov ${st.fov.toFixed(0)} d ${st.d.toFixed(1)}`,
  );
}

console.log('\nNOTES: the snap beat (t < 0.35) is the tight shot on the neck; from the flight beat on, the framing pass');
console.log('       backs the lens off until the head, the stump and the body all fit. Every gameplay preset keeps a');
console.log('       comfort margin on top of its own framing pass, so no robot is ever pinned to the edge of the screen.');
console.log(`\nOVERALL: ${fail === 0 ? 'PASS — every checked shot stays inside the frame' : `FAIL — ${fail} check(s) broken`}`);
