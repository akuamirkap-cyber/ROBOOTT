// Crowd validation harness — run it with:
//     npx esbuild crowdscene.ts --bundle --format=esm --platform=node --outfile=.__crowdscene.mjs --external:three
//     node crowdtest.mjs
// `crowdscene.ts` builds a doubled-density test stand out of the same `buildCrowd` the arena uses.
// Production capacity is approximately doubled from ~1,350 to ~2,700 people; the 6 × 32 stand below
// checks the denser instanced crowd stays complete and within a practical geometry budget.
import * as THREE from 'three';
import { makeCrowd } from './.__crowdscene.mjs';

let fails = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`);
  if (!ok) fails++;
};

const scene = makeCrowd();
scene.updateMatrixWorld(true);

let meshes = 0;
let tris = 0;
let instanced = 0;
const parts = new Map();
scene.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
  const count = o.isInstancedMesh ? o.count : 1;
  if (o.isInstancedMesh) instanced++;
  tris += (n / 3) * count;
  parts.set(o.geometry.uuid, (parts.get(o.geometry.uuid) || 0) + count);
  const pos = o.geometry.attributes.position;
  let bad = false;
  for (let i = 0; i < pos.count; i++) {
    if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) bad = true;
  }
  if (bad) check('a part has broken geometry', false, o.geometry.type);
});
check('no broken geometry anywhere', true);
const people = Math.max(...parts.values());
check('the doubled-density stand is full of people', people >= 300, `${people} spectators in this test stand, across ${parts.size} instanced parts`);
check('every part is instanced', instanced === meshes, `${instanced}/${meshes} instanced meshes`);
check('doubled-crowd triangle budget stays sane', tris < 420000, `~${Math.round(tris)} tris in ${meshes} draw calls`);
console.log(fails === 0 ? '\nCROWD: ALL PASS' : `\nCROWD: ${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
