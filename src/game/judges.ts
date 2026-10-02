import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * OFFICIAL JUDGES: three ringside judges' tables (three judges at each) in formal wear. They sit behind a branded
 * desk with a laptop, a scorecard and a name plate, follow the fight with their eyes, glance down to score and write.
 */

const SKINS = [0xf1cfae, 0xdcae86, 0xb98058, 0x8a5a3a, 0x5a3a28];
const HAIRS = [0x0e0e10, 0x241a12, 0x3b2a1c, 0x5a3d25, 0x8c8c8c, 0xd6d6d2];
const SUITS = [0x0e1016, 0x161b2a, 0x20242c, 0x2a2420, 0x1b2a2a];
const TIES = [0x7a1f2b, 0x1f2d52, 0xb89a4a, 0x2b2b30, 0x244a45];
const DESK_R = 20.6; // distance of the desks from the centre of the ring
const FLOOR = -1.4;

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const std = (hex: number, rough = 0.7, metal = 0.05) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const plateTex = (text: string) =>
  canvasTex(256, 96, (g) => {
    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 0, 256, 6);
    g.fillRect(0, 90, 256, 6);
    g.fillStyle = '#ffffff';
    g.font = '900 46px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 50);
  });

const deskTex = () =>
  canvasTex(1024, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 1024, 0);
    gr.addColorStop(0, '#0a1226');
    gr.addColorStop(0.5, '#0e1630');
    gr.addColorStop(1, '#0a1226');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 128);
    // emblem
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const x = 90 + Math.cos(a) * 46;
      const y = 64 + Math.sin(a) * 46;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = '#141d3c';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = '900 28px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WRC', 90, 66);
    g.textAlign = 'left';
    g.font = '900 54px Impact, "Arial Black", sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText('JURI RESMI', 175, 46);
    g.font = '700 26px Arial, sans-serif';
    g.fillStyle = '#c9a24a';
    g.fillText('OFFICIAL JUDGES · WORLD ROBOT CHAMPIONSHIP', 178, 96);
    g.fillStyle = '#c4161c';
    g.fillRect(960, 0, 64, 128);
    g.fillStyle = '#1b5cff';
    g.fillRect(900, 0, 60, 128);
  });

interface Rig {
  head: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  body: THREE.Group;
  ph: number;
  wx: number;
  wz: number;
  yaw: number;
}

export function buildJudges(scene: THREE.Scene) {
  const rigs: Rig[] = [];
  const deskMat = std(0x161b28, 0.45, 0.65);
  const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4f8dff).multiplyScalar(1.1) });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(0.9) });
  const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fc4ff).multiplyScalar(0.95) });
  const paper = std(0xefe9d8, 0.9);
  const chairMat = std(0x1b2334, 0.7);
  const white = std(0xe6e6e2, 0.6);
  const gold = std(0xc9a24a, 0.35, 0.8);
  const eyeW = std(0xf4f4f0, 0.4);
  const pupilM = std(0x14151a, 0.3);
  const mouthM = std(0x2e0f12, 0.6);
  const glassM = std(0x15161c, 0.3, 0.7);

  const thighG = new RoundedBoxGeometry(0.38, 0.62, 0.44, 1, 0.12);
  const shinG = new RoundedBoxGeometry(0.38, 0.55, 0.42, 1, 0.12);
  const torsoG = new RoundedBoxGeometry(0.92, 0.98, 0.62, 2, 0.2);
  const headG = new THREE.SphereGeometry(0.47, 14, 10);
  const eyeG = new THREE.SphereGeometry(0.085, 6, 5);
  eyeG.scale(1, 1.2, 0.5);
  const pupilG = new THREE.SphereGeometry(0.042, 6, 4);
  const mouthG = new THREE.SphereGeometry(0.075, 6, 4);
  mouthG.scale(1.4, 0.7, 0.5);
  const armG = new THREE.CapsuleGeometry(0.13, 0.42, 3, 8);
  armG.translate(0, -0.34, 0);
  const handG = new THREE.SphereGeometry(0.125, 8, 6);
  const hairG = new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const hairBackG = new RoundedBoxGeometry(0.84, 0.74, 0.2, 1, 0.1);
  const glassG = new THREE.TorusGeometry(0.1, 0.014, 5, 14);

  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  const makeJudge = (desk: THREE.Group, x: number, n: number, deskYaw: number, dx: number, dz: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, -1.55);
    desk.add(g);
    const suit = std(pick(SUITS), 0.55);
    const skin = std(pick(SKINS), 0.7);
    const hairMat = std(pick(HAIRS), 0.8);
    const tie = std(pick(TIES), 0.5);

    // chair
    mesh(g, new THREE.BoxGeometry(1.05, 0.2, 0.95), chairMat, 0, 0.1, 0);
    mesh(g, new THREE.BoxGeometry(1.05, 1.1, 0.12), chairMat, 0, 0.62, -0.52);
    // legs (seated)
    for (const s of [-1, 1]) {
      const th = mesh(g, thighG, suit, s * 0.23, 0.41, 0.3);
      th.rotation.x = Math.PI / 2;
      mesh(g, shinG, suit, s * 0.23, 0.275, 0.56);
    }
    // upper body: it is a group so the whole torso can breathe
    const body = new THREE.Group();
    g.add(body);
    mesh(body, torsoG, suit, 0, 0.94, -0.02);
    mesh(body, new THREE.BoxGeometry(0.3, 0.64, 0.04), white, 0, 1.14, 0.33);
    mesh(body, new THREE.BoxGeometry(0.09, 0.48, 0.04), tie, 0, 1.08, 0.355);
    mesh(body, new THREE.BoxGeometry(0.1, 0.12, 0.03), gold, 0.26, 1.0, 0.335); // judge's badge
    for (const s of [-1, 1]) {
      const lap = mesh(body, new THREE.BoxGeometry(0.12, 0.62, 0.04), std(0x0a0c12, 0.5), s * 0.2, 1.1, 0.335);
      lap.rotation.z = s * 0.22;
    }
    // arms (pivot at the shoulder)
    const mkArm = (s: number) => {
      const a = new THREE.Group();
      a.position.set(s * 0.6, 1.35, 0);
      body.add(a);
      mesh(a, armG, suit);
      mesh(a, handG, skin, 0, -0.72, 0);
      return a;
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);
    armL.rotation.set(-1.5, 0, 0.1);
    armR.rotation.set(-1.5, 0, -0.1);

    // head
    const head = new THREE.Group();
    head.position.set(0, 1.85, 0);
    g.add(head);
    mesh(head, headG, skin);
    for (const s of [-1, 1]) {
      mesh(head, eyeG, eyeW, s * 0.17, 0.05, 0.44);
      mesh(head, pupilG, pupilM, s * 0.17, 0.045, 0.478);
    }
    mesh(head, mouthG, mouthM, 0, -0.17, 0.45);
    const style = Math.floor(Math.random() * 4); // 0 crop · 1 bald · 2 grey · 3 long
    if (style !== 1) {
      const hm = style === 2 ? std(pick([0x8c8c8c, 0xd6d6d2]), 0.8) : hairMat;
      mesh(head, hairG, hm, 0, 0.02, -0.02);
      if (style === 3) mesh(head, hairBackG, hm, 0, -0.16, -0.38);
    }
    if (Math.random() < 0.5) {
      for (const s of [-1, 1]) mesh(head, glassG, glassM, s * 0.17, 0.05, 0.495);
      mesh(head, new THREE.BoxGeometry(0.1, 0.014, 0.014), glassM, 0, 0.06, 0.5);
    }

    // desk props for this judge: scorecard, laptop, name plate
    const card = mesh(desk, new THREE.BoxGeometry(0.62, 0.025, 0.8), paper, x - 0.05, 1.205, -0.78);
    card.rotation.y = (Math.random() - 0.5) * 0.25;
    mesh(desk, new THREE.BoxGeometry(1.0, 0.05, 0.7), std(0x20242c, 0.4, 0.7), x + 1.05, 1.225, -0.35);
    const scr = mesh(desk, new THREE.BoxGeometry(1.0, 0.62, 0.04), std(0x20242c, 0.4, 0.7), x + 1.05, 1.55, 0.02);
    scr.rotation.x = 0.25;
    const glow = mesh(desk, new THREE.PlaneGeometry(0.88, 0.5), screenMat, x + 1.05, 1.56, -0.005);
    glow.rotation.set(0.25, Math.PI, 0);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: plateTex(`JURI ${n}`), color: new THREE.Color(0.95, 0.95, 0.95) }));
    plate.position.set(x, 1.5, 0.9);
    plate.rotation.x = -0.2;
    desk.add(plate);
    mesh(desk, new THREE.BoxGeometry(1.5, 0.1, 0.3), std(0x14182a, 0.4, 0.7), x, 1.24, 0.9);

    // where the head really is in the world (for the eye-tracking)
    const c = Math.cos(deskYaw);
    const s = Math.sin(deskYaw);
    const lz = -1.55;
    rigs.push({ head, armR, armL, body, ph: Math.random() * 10, wx: dx + c * x + s * lz, wz: dz - s * x + c * lz, yaw: deskYaw });
  };

  const buildDesk = (angle: number, firstNo: number) => {
    const px = Math.cos(angle) * DESK_R;
    const pz = Math.sin(angle) * DESK_R;
    const yaw = Math.atan2(-px, -pz); // local +z points at the ring
    const G = new THREE.Group();
    G.position.set(px, FLOOR, pz);
    G.rotation.y = yaw;
    scene.add(G);
    mesh(G, new RoundedBoxGeometry(9.4, 0.14, 2.1, 2, 0.04), deskMat, 0, 1.13, 0);
    mesh(G, new THREE.BoxGeometry(9.2, 1.0, 0.12), deskMat, 0, 0.58, 0.96);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 0.86), new THREE.MeshBasicMaterial({ map: deskTex(), color: new THREE.Color(0.9, 0.9, 0.9) }));
    front.position.set(0, 0.58, 1.03);
    G.add(front);
    for (const s of [-1, 1]) mesh(G, new THREE.BoxGeometry(0.16, 1.1, 2.0), deskMat, s * 4.62, 0.6, 0);
    mesh(G, new THREE.BoxGeometry(9.2, 0.04, 0.04), trimMat, 0, 1.04, 1.03);
    mesh(G, new THREE.BoxGeometry(9.4, 0.03, 0.03), edgeMat, 0, 1.21, 1.05);
    mesh(G, new THREE.BoxGeometry(9.2, 0.04, 0.04), trimMat, 0, 0.1, 1.03);
    [-2.9, 0, 2.9].forEach((x, i) => makeJudge(G, x, firstNo + i, yaw, px, pz));
  };

  // three desks: one behind each side of the ring that the main camera does not stand on
  buildDesk(-Math.PI / 2, 1);
  buildDesk(0, 4);
  buildDesk(Math.PI, 7);

  const update = (t: number, dt: number, hype: number, focus: THREE.Vector3) => {
    const k = 1 - Math.exp(-4 * dt);
    for (const j of rigs) {
      let a = Math.atan2(focus.x - j.wx, focus.z - j.wz) - j.yaw;
      a = clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.95, 0.95);
      // every few seconds a judge looks down to score
      const glance = Math.sin(t * 0.33 + j.ph) > 0.8 ? 1 : 0;
      j.head.rotation.y += (a * 0.85 * (1 - 0.55 * glance) - j.head.rotation.y) * k;
      j.head.rotation.x += (0.03 + glance * 0.42 - hype * 0.06 - j.head.rotation.x) * k;
      j.armR.rotation.x = -1.5 + Math.sin(t * 8 + j.ph) * 0.025 * (0.4 + glance);
      j.armR.rotation.z = -(0.1 + Math.sin(t * 5.3 + j.ph) * 0.09 * (0.35 + glance));
      // the whole room tenses up in the big moments
      j.body.position.y = Math.sin(t * 2.2 + j.ph) * 0.008 + hype * 0.02 * Math.max(0, Math.sin(t * 5 + j.ph));
    }
  };

  return { update };
}
