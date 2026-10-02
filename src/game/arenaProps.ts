import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildJudges } from './judges';

type Upd = (t: number, dt: number, hype: number, focus: THREE.Vector3) => void;

export interface Props {
  update: Upd;
  /** where the pyro fountains shoot from (top of the four corner towers) */
  towers: THREE.Vector3[];
}

const FLOOR = -1.4;
const RB = (w: number, h: number, d: number, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const neon = (hex: number, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** an atlas of 8 simple, made-up national flags (stripes / crosses / discs) */
function flagAtlas() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 170;
  const g = c.getContext('2d')!;
  const W = 128;
  const H = 85;
  const cell = (i: number, draw: (x: number, y: number) => void) => draw((i % 4) * W, Math.floor(i / 4) * H);
  const fill = (col: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  cell(0, (x, y) => {
    fill('#c4161c', x, y, W, H / 3);
    fill('#f2f2f2', x, y + H / 3, W, H / 3);
    fill('#1b4fd8', x, y + (2 * H) / 3, W, H / 3 + 1);
  });
  cell(1, (x, y) => {
    fill('#1f8a4c', x, y, W / 3, H);
    fill('#f2f2f2', x + W / 3, y, W / 3, H);
    fill('#c4161c', x + (2 * W) / 3, y, W / 3 + 1, H);
  });
  cell(2, (x, y) => {
    fill('#15161a', x, y, W, H / 3);
    fill('#c4161c', x, y + H / 3, W, H / 3);
    fill('#e0b020', x, y + (2 * H) / 3, W, H / 3 + 1);
  });
  cell(3, (x, y) => {
    fill('#f2f2f2', x, y, W, H);
    g.fillStyle = '#c4161c';
    g.beginPath();
    g.arc(x + W / 2, y + H / 2, 22, 0, Math.PI * 2);
    g.fill();
  });
  cell(4, (x, y) => {
    fill('#1b3a8a', x, y, W, H);
    fill('#f2f2f2', x + 36, y, 18, H);
    fill('#f2f2f2', x, y + 33, W, 18);
  });
  cell(5, (x, y) => {
    fill('#f2f2f2', x, y, W, H / 2);
    fill('#c4161c', x, y + H / 2, W, H / 2 + 1);
  });
  cell(6, (x, y) => {
    fill('#1b4fd8', x, y, W / 3, H);
    fill('#e8c020', x + W / 3, y, W / 3, H);
    fill('#1b4fd8', x + (2 * W) / 3, y, W / 3 + 1, H);
  });
  cell(7, (x, y) => {
    fill('#c4161c', x, y, W, H);
    g.fillStyle = '#e8c020';
    g.beginPath();
    g.moveTo(x + 10, y + 10);
    g.lineTo(x + 60, y + 10);
    g.lineTo(x + 10, y + 60);
    g.closePath();
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildProps(scene: THREE.Scene): Props {
  const updaters: Upd[] = [];
  const towers: THREE.Vector3[] = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, metalness: 0.85, roughness: 0.4 });
  const metal2 = new THREE.MeshStandardMaterial({ color: 0x2a303f, metalness: 0.8, roughness: 0.35 });

  // ====================================================================== pyro towers (the four corners)
  const TOWERS: [number, number, number][] = [
    [19.8, 19.8, 0x2f7cff],
    [-19.8, 19.8, 0x2f7cff],
    [19.8, -19.8, 0xff3b4a],
    [-19.8, -19.8, 0xff3b4a],
  ];
  const towerStrips: { m: THREE.MeshBasicMaterial; base: THREE.Color; ph: number }[] = [];
  TOWERS.forEach(([x, z, hex], idx) => {
    const g = new THREE.Group();
    g.position.set(x, FLOOR, z);
    scene.add(g);
    const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      g.add(o);
      return o;
    };
    mesh(RB(2.6, 1.2, 2.6, 0.15), metal, 0, 0.6, 0);
    mesh(RB(1.5, 11.4, 1.5, 0.12), metal2, 0, 6.9, 0);
    const stripMat = neon(hex, 1);
    towerStrips.push({ m: stripMat, base: new THREE.Color(hex), ph: idx * 1.3 });
    for (const [sx, sz] of [[0.78, 0], [-0.78, 0], [0, 0.78], [0, -0.78]] as [number, number][]) {
      mesh(RB(sz === 0 ? 0.06 : 0.22, 10.6, sx === 0 ? 0.06 : 0.22, 0.02), stripMat, sx, 6.9, sz);
    }
    for (const yy of [2.2, 5.0, 8.0]) mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24).rotateX(Math.PI / 2), neon(0xdfe8ff, 0.8), 0, yy, 0);
    mesh(new THREE.CylinderGeometry(1.0, 0.8, 0.5, 20), metal, 0, 12.8, 0);
    mesh(new THREE.ConeGeometry(0.45, 0.9, 16), metal2, 0, 13.5, 0);
    mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 28).rotateX(Math.PI / 2), stripMat, 0, 12.6, 0);
    towers.push(new THREE.Vector3(x, FLOOR + 14, z));
  });
  updaters.push((t, _dt, hype) => {
    for (const s of towerStrips) s.m.color.copy(s.base).multiplyScalar(0.7 + hype * 0.9 + 0.15 * Math.sin(t * 4 + s.ph));
  });

  // ====================================================================== TV cameras that follow the fight
  const cams: { head: THREE.Group; tally: THREE.MeshBasicMaterial; x: number; z: number; ph: number }[] = [];
  const addCam = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, FLOOR, z);
    scene.add(g);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 3.0, 6), metal2);
      leg.position.set(Math.cos(a) * 0.55, 1.5, Math.sin(a) * 0.55);
      leg.rotation.z = Math.cos(a) * 0.2;
      leg.rotation.x = -Math.sin(a) * 0.2;
      g.add(leg);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 8), metal);
    post.position.y = 3.1;
    g.add(post);
    const head = new THREE.Group();
    head.position.y = 3.6;
    head.rotation.order = 'YXZ';
    g.add(head);
    const body = new THREE.Mesh(RB(0.9, 0.85, 1.7, 0.1), metal);
    body.position.z = -0.1;
    head.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.0, 16).rotateX(Math.PI / 2), metal2);
    lens.position.z = 1.1;
    head.add(lens);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), neon(0x4f8dff, 0.8));
    glass.position.z = 1.61;
    head.add(glass);
    const vf = new THREE.Mesh(RB(0.3, 0.3, 0.5, 0.05), metal2);
    vf.position.set(0.1, 0.55, -0.4);
    head.add(vf);
    const tallyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(2) });
    const tally = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tallyMat);
    tally.position.set(0, 0.5, 0.75);
    head.add(tally);
    cams.push({ head, tally: tallyMat, x, z, ph: Math.random() * 10 });
  };
  addCam(-11, 21.5);
  addCam(11, 21.5);
  addCam(-21.5, -11);
  addCam(21.5, -11);
  updaters.push((t, dt, _hype, focus) => {
    const k = 1 - Math.exp(-2.5 * dt);
    for (const c of cams) {
      const yaw = Math.atan2(focus.x - c.x, focus.z - c.z);
      const dist = Math.hypot(focus.x - c.x, focus.z - c.z);
      const pitch = Math.atan2(FLOOR + 3.6 - focus.y, dist);
      c.head.rotation.y += wrap(yaw - c.head.rotation.y) * k;
      c.head.rotation.x += (pitch - c.head.rotation.x) * k;
      const on = Math.sin(t * 2.2 + c.ph) > -0.2;
      c.tally.color.setRGB(on ? 2 : 0.15, on ? 0.1 : 0.02, on ? 0.1 : 0.02);
    }
  });

  // ====================================================================== light strips along every row of the stands
  const rowBright = neon(0x6fa0ff, 0.85);
  const rowDim = neon(0x2f5fd0, 0.5);
  const rowHot = neon(0xff4a5a, 0.7);
  for (let k = 0; k < 4; k++) {
    for (let r = 0; r < 3; r++) {
      const R = 32 + k * 6.5 + r * 2.0 + 0.04;
      const y = 0.4 + (k * 3 + r + 1) * 0.85 + 0.03;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.045, 5, 160), r === 0 ? (k % 2 ? rowHot : rowBright) : rowDim);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      scene.add(ring);
    }
  }

  // ====================================================================== light fins on the hall wall
  const FINS = 36;
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 38, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }), FINS);
  const dm = new THREE.Object3D();
  for (let i = 0; i < FINS; i++) {
    const a = (i / FINS) * Math.PI * 2;
    dm.position.set(Math.cos(a) * 63.4, 18.6, Math.sin(a) * 63.4);
    dm.updateMatrix();
    fins.setMatrixAt(i, dm.matrix);
    fins.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  scene.add(fins);
  const finCol = new THREE.Color();
  const cRed = new THREE.Color(0xff3b4a);
  const cBlue = new THREE.Color(0x2f7cff);
  const cWhite = new THREE.Color(0xdfe8ff);
  updaters.push((t, _dt, hype) => {
    for (let i = 0; i < FINS; i++) {
      const w = 0.5 + 0.5 * Math.sin(t * (0.9 + hype * 1.6) - i * 0.55);
      finCol.copy(i % 3 === 0 ? cWhite : i % 3 === 1 ? cBlue : cRed).multiplyScalar(0.12 + w * (0.35 + hype * 0.5));
      fins.setColorAt(i, finCol);
    }
    if (fins.instanceColor) fins.instanceColor.needsUpdate = true;
  });

  // ====================================================================== flags under the roof
  const atlas = flagAtlas();
  const FLAGS = 36;
  const perDesign = [5, 5, 5, 5, 4, 4, 4, 4];
  let fi = 0;
  perDesign.forEach((count, d) => {
    const geo = new THREE.PlaneGeometry(6, 4);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const col = d % 4;
    const row = Math.floor(d / 4);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (col + u) / 4, 1 - (row + (1 - v)) / 2);
    }
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide, color: new THREE.Color(0.8, 0.8, 0.8) }), count);
    for (let i = 0; i < count; i++) {
      const a = (fi++ / FLAGS) * Math.PI * 2 + 0.07;
      const x = Math.cos(a) * 62.4;
      const z = Math.sin(a) * 62.4;
      dm.position.set(x, 37.6, z);
      dm.rotation.set(0, Math.atan2(-x, -z), 0);
      dm.updateMatrix();
      im.setMatrixAt(i, dm.matrix);
    }
    scene.add(im);
  });
  dm.rotation.set(0, 0, 0);

  // ====================================================================== the judges
  const judges = buildJudges(scene);
  updaters.push(judges.update);

  const update: Upd = (t, dt, hype, focus) => {
    for (const u of updaters) u(t, dt, hype, focus);
  };
  return { update, towers };
}
