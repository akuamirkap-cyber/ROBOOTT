// GROUND-TRUTH clash timeline: two real rigs at their marks, animated CONTINUOUSLY through vsClashState —
// exactly what the VS screen plays. Largest coil/twist values drift the settle-harness; this drives the timeline.
// usage: node clashline.mjs [tEnd] [step]
import * as THREE from 'three';
import { Robot } from './.__robot.mjs';
import { VS_CLASH_SEP, vsClashState } from './.__game.mjs';

const D = 1 / 60;
const STYLE = { variant: 'atom', main: 0x8a8f98, secondary: 0x3a3f47, accent: 0x1e9bff, glow: 0x63e0ff };
const HERO_X = -VS_CLASH_SEP;
const FOE_X = VS_CLASH_SEP;
const YAW = 0.42;

function gloveCenter(fistObj) {
  const box = new THREE.Box3();
  fistObj.updateWorldMatrix(true, false);
  fistObj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box.getCenter(new THREE.Vector3());
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

const hero = mkRig('hero');
const foe = mkRig('foe');
const end = parseFloat(process.argv[2] ?? '1.6');
const stepOut = parseFloat(process.argv[3] ?? '0.1');
let next = 0;
// the square-up: the root yaw ramps with the clash state (like the real camera drives it)
for (let t = 0; t <= end; t += D) {
  const ch = vsClashState('hero', t);
  const cf = vsClashState('foe', t);
  hero.root.rotation.y = YAW + ch.yaw;
  foe.root.rotation.y = -(YAW + cf.yaw);
  hero.animate(mkA(ch, t), D);
  foe.animate(mkA(cf, t), D);
  if (t + 1e-9 >= next) {
    next += stepOut;
    hero.root.updateWorldMatrix(true, true);
    foe.root.updateWorldMatrix(true, true);
    const h = gloveCenter(hero.fists[ch.arm]);
    const f = gloveCenter(foe.fists[cf.arm]);
    const gap = h.distanceTo(f);
    console.log(`t=${t.toFixed(3)}  hero hand ${ch.arm} ${h.toArray().map((v) => v.toFixed(2)).join(',')}  foe hand ${cf.arm} ${f.toArray().map((v) => v.toFixed(2)).join(',')}  gap ${gap.toFixed(2)}  y/z: ${h.y.toFixed(2)},${h.z.toFixed(2)} / ${f.y.toFixed(2)},${f.z.toFixed(2)}`);
  }
}
