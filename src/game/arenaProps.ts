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
    [19.8, 19.8, 0x4f86e8],
    [-19.8, 19.8, 0x4f86e8],
    [19.8, -19.8, 0xe03a44],
    [-19.8, -19.8, 0xe03a44],
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
    for (const yy of [2.2, 5.0, 8.0]) mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 24).rotateX(Math.PI / 2), neon(0xdfe8ff, 0.35), 0, yy, 0);
    mesh(new THREE.CylinderGeometry(1.0, 0.8, 0.5, 20), metal, 0, 12.8, 0);
    mesh(new THREE.ConeGeometry(0.45, 0.9, 16), metal2, 0, 13.5, 0);
    mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 28).rotateX(Math.PI / 2), stripMat, 0, 12.6, 0);
    towers.push(new THREE.Vector3(x, FLOOR + 14, z));
  });
  updaters.push((t, _dt, hype) => {
    for (const s of towerStrips) s.m.color.copy(s.base).multiplyScalar(0.3 + hype * 0.4 + 0.06 * Math.sin(t * 4 + s.ph));
  });

  // ====================================================================== TV cameras that follow the fight
  // Broadcast pedestal cameras: a wheeled studio pedestal, a fluid head, a boxy camera body with a long hooded
  // lens, a top monitor glowing back at the operator, a tally light, pan bars — and a camera operator in crew
  // black with a headset who walks round the pedestal as the shot pans.
  const camLabel = (() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#15171d';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffffff';
    g.font = '900 54px "Barlow Condensed", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WRC TV', 128, 50);
    g.fillStyle = '#c4161c';
    g.fillRect(40, 86, 176, 10);
    g.fillStyle = '#9aa3b5';
    g.font = '600 20px "Barlow Condensed", Arial, sans-serif';
    g.fillText('BROADCAST  ·  CAM', 128, 112);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const camBody = new THREE.MeshStandardMaterial({ color: 0x14161b, metalness: 0.6, roughness: 0.55 });
  const camRubber = new THREE.MeshStandardMaterial({ color: 0x0b0c10, metalness: 0.2, roughness: 0.9 });
  const camLabelMat = new THREE.MeshStandardMaterial({ map: camLabel, metalness: 0.4, roughness: 0.6 });
  const lensGlass = new THREE.MeshStandardMaterial({ color: 0x060a14, metalness: 0.9, roughness: 0.08 });
  const monitorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fc8ff).multiplyScalar(0.9) });
  const crewBlack = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.8 });
  const crewSkin = new THREE.MeshStandardMaterial({ color: 0xd9ad86, roughness: 0.7 });
  const crewHair = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85 });
  const cams: { head: THREE.Group; op: THREE.Group; tally: THREE.MeshBasicMaterial; x: number; z: number; ph: number }[] = [];
  const addCam = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, FLOOR, z);
    scene.add(g);
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      parent.add(o);
      return o;
    };
    // a camera riser (1 m platform with a lit edge) so the lens looks over the apron, then the pedestal:
    // wheeled base, two-stage column, fluid-head bowl
    put(RB(3.0, 1.0, 3.0, 0.06), metal, g, 0, 0.5, -0.4);
    put(new THREE.BoxGeometry(3.0, 0.04, 0.04), neon(0xdfe8ff, 0.6), g, 0, 1.0, 1.1);
    const rig = new THREE.Group();
    rig.position.y = 1.0;
    g.add(rig);
    put(new THREE.CylinderGeometry(0.62, 0.7, 0.14, 18), metal, rig, 0, 0.07, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      const w = put(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10).rotateZ(Math.PI / 2), camRubber, rig, Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
      w.rotation.y = -a;
    }
    put(new THREE.CylinderGeometry(0.2, 0.26, 0.95, 14), metal2, rig, 0, 0.55, 0);
    put(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 14), metal2, rig, 0, 1.02, 0);
    put(new THREE.CylinderGeometry(0.15, 0.15, 0.75, 12), metal, rig, 0, 1.3, 0);
    put(new THREE.CylinderGeometry(0.28, 0.22, 0.2, 14), metal2, rig, 0, 1.7, 0);
    // the head: everything that pans and tilts
    const head = new THREE.Group();
    head.position.y = 1.82;
    head.rotation.order = 'YXZ';
    rig.add(head);
    put(RB(0.6, 0.16, 0.9, 0.04), metal, head, 0, 0.0, 0.0); // the sliding plate
    const body = put(RB(0.78, 0.74, 1.5, 0.08), camBody, head, 0, 0.48, -0.15);
    body.castShadow = true;
    for (const sx of [-1, 1]) put(new THREE.PlaneGeometry(1.1, 0.5).rotateY(sx * Math.PI / 2), camLabelMat, head, sx * 0.395, 0.5, -0.15);
    put(RB(0.5, 0.1, 1.0, 0.03), camRubber, head, 0, 0.9, -0.2); // the top handle
    put(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).rotateX(Math.PI / 2), metal2, head, 0, 0.85, -0.2);
    // the lens: barrel, focus / zoom rings, a wide hood and the dark glass with a blue coating
    put(new THREE.CylinderGeometry(0.26, 0.3, 1.3, 20).rotateX(Math.PI / 2), camBody, head, 0, 0.5, 1.2);
    put(new THREE.CylinderGeometry(0.31, 0.31, 0.14, 20).rotateX(Math.PI / 2), camRubber, head, 0, 0.5, 0.9);
    put(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 20).rotateX(Math.PI / 2), camRubber, head, 0, 0.5, 1.25);
    put(new THREE.CylinderGeometry(0.4, 0.3, 0.42, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.8, side: THREE.DoubleSide }), head, 0, 0.5, 1.95).rotation.x = Math.PI / 2;
    put(new THREE.CircleGeometry(0.25, 20), lensGlass, head, 0, 0.5, 1.86);
    put(new THREE.CircleGeometry(0.1, 16), neon(0x4f8dff, 0.35), head, 0, 0.56, 1.865);
    // the top monitor on a short arm, angled back at the operator
    put(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6), metal2, head, 0.25, 0.95, -0.55);
    const mon = put(RB(0.72, 0.46, 0.06, 0.02), camBody, head, 0.25, 1.12, -0.6);
    mon.rotation.x = 0.3;
    const monGlow = put(new THREE.PlaneGeometry(0.62, 0.36), monitorMat, head, 0.25, 1.12, -0.635);
    monGlow.rotation.set(0.3, Math.PI, 0);
    // tally light, mic, the pan bars reaching back to the operator
    const tallyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(2) });
    put(RB(0.14, 0.08, 0.08, 0.02), tallyMat, head, -0.2, 0.9, 0.55);
    put(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8).rotateX(Math.PI / 2), camRubber, head, -0.3, 0.98, 0.45);
    for (const sx of [-1, 1]) {
      const bar = put(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), metal2, head, sx * 0.34, 0.1, -0.75);
      bar.rotation.x = Math.PI / 2 + 0.35;
      put(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8), camRubber, head, sx * 0.34, 0.3, -1.25).rotation.x = Math.PI / 2 + 0.35;
    }
    // the cable off the back of the camera down to the floor
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0.2, 2.1, -0.9), new THREE.Vector3(0.35, 1.3, -1.2), new THREE.Vector3(0.9, 0.04, -1.3), new THREE.Vector3(1.6, 0.04, -0.4), new THREE.Vector3(1.55, -0.9, 0.9), new THREE.Vector3(2.4, -1.0, 2.6)]);
    put(new THREE.TubeGeometry(cable, 32, 0.03, 6), camRubber, rig, 0, 0, 0);
    // the operator: crew black, headset, hands on the pan bars; he walks round the pedestal with the pan
    const op = new THREE.Group();
    rig.add(op);
    const man = new THREE.Group();
    man.position.z = -1.5;
    man.scale.setScalar(0.76); // crowd-sized: a 2.5 m human next to a 7 m Titan
    op.add(man);
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(0.28, 0.9, 0.32), crewBlack, man, sx * 0.17, 0.45, 0);
      put(new THREE.BoxGeometry(0.28, 0.85, 0.3), crewBlack, man, sx * 0.17, 1.3, 0.02);
      put(RB(0.2, 0.1, 0.36, 0.04), camRubber, man, sx * 0.17, 0.05, 0.06);
    }
    put(RB(0.78, 0.95, 0.46, 0.14), crewBlack, man, 0, 2.2, 0);
    for (const sx of [-1, 1]) put(new THREE.SphereGeometry(0.16, 8, 6), crewBlack, man, sx * 0.4, 2.6, 0);
    put(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 8), crewSkin, man, 0, 2.78, 0);
    const hd = put(new THREE.SphereGeometry(0.34, 12, 9), crewSkin, man, 0, 3.15, 0.02);
    hd.scale.set(1, 1.08, 1.03);
    put(new THREE.SphereGeometry(0.355, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.42), crewHair, man, 0, 3.17, 0.0);
    // headset: band over the head, cups on the ears, a boom mic
    put(new THREE.TorusGeometry(0.36, 0.025, 6, 20, Math.PI).rotateZ(0), metal, man, 0, 3.2, 0.02);
    for (const sx of [-1, 1]) put(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10).rotateZ(Math.PI / 2), camRubber, man, sx * 0.36, 3.12, 0.02);
    put(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5).rotateZ(1.3), metal2, man, -0.2, 2.95, 0.3);
    // arms reaching forward to the bars
    for (const sx of [-1, 1]) {
      const arm = put(new THREE.CapsuleGeometry(0.1, 0.5, 2, 6), crewBlack, man, sx * 0.42, 2.45, 0.32);
      arm.rotation.x = -1.35;
      put(new THREE.SphereGeometry(0.09, 7, 5), crewSkin, man, sx * 0.36, 2.72, 0.64);
    }
    cams.push({ head, op, tally: tallyMat, x, z, ph: Math.random() * 10 });
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
      const pitch = Math.atan2(FLOOR + 3.3 - focus.y, dist);
      c.head.rotation.y += wrap(yaw - c.head.rotation.y) * k;
      c.head.rotation.x += (pitch - c.head.rotation.x) * k;
      c.op.rotation.y = c.head.rotation.y; // the operator stays behind the viewfinder
      const on = Math.sin(t * 2.2 + c.ph) > -0.2;
      c.tally.color.setRGB(on ? 2 : 0.15, on ? 0.1 : 0.02, on ? 0.1 : 0.02);
    }
  });

  // ====================================================================== light strips along every row of the stands
  const rowBright = neon(0x9fb8e8, 0.28);
  const rowDim = neon(0x4a68b0, 0.12);
  const rowHot = neon(0xd8d0c8, 0.22);
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
  const cRed = new THREE.Color(0xe03a44);
  const cBlue = new THREE.Color(0x4f86e8);
  const cWhite = new THREE.Color(0xdfe8ff);
  updaters.push((t, _dt, hype) => {
    for (let i = 0; i < FINS; i++) {
      const w = 0.5 + 0.5 * Math.sin(t * (0.35 + hype * 0.6) - i * 0.55);
      finCol.copy(i % 6 === 0 ? (i % 12 === 0 ? cBlue : cRed) : cWhite).multiplyScalar(0.05 + w * (0.1 + hype * 0.18));
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
