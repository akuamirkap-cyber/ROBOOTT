import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * OFFICIAL JUDGES: three ringside judges' tables (three judges at each) in formal wear — built to the same human
 * proportions as the crowd (small heads, real necks and shoulders, dark eyes set on the skull, not cartoon balls).
 * They sit in executive chairs behind a branded, back-lit desk with a monitor, a tablet scorecard, a microphone
 * and a name plate each; forearms rest on the desk, the eyes follow the fight and glance down to score.
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
const DISPLAY = '"Barlow Condensed", Impact, "Arial Black", sans-serif';

const plateTex = (text: string) =>
  canvasTex(256, 96, (g) => {
    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 0, 256, 5);
    g.fillRect(0, 91, 256, 5);
    g.fillStyle = '#ffffff';
    g.font = `800 48px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 50);
  });

const deskTex = () =>
  canvasTex(1024, 128, (g) => {
    const gr = g.createLinearGradient(0, 0, 1024, 0);
    gr.addColorStop(0, '#080d1c');
    gr.addColorStop(0.5, '#0d1430');
    gr.addColorStop(1, '#080d1c');
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 128);
    // brushed-metal lines
    g.fillStyle = 'rgba(255,255,255,0.03)';
    for (let y = 0; y < 128; y += 3) g.fillRect(0, y, 1024, 1);
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
    g.font = `900 30px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WRC', 90, 66);
    g.textAlign = 'left';
    g.font = `900 58px ${DISPLAY}`;
    g.fillStyle = '#ffffff';
    g.fillText('JURI RESMI', 175, 46);
    g.font = `600 26px ${DISPLAY}`;
    g.fillStyle = '#c9a24a';
    g.fillText('OFFICIAL JUDGES  ·  WORLD ROBOT CHAMPIONSHIP', 178, 96);
    g.fillStyle = '#c4161c';
    g.fillRect(960, 0, 64, 128);
    g.fillStyle = '#1b5cff';
    g.fillRect(900, 0, 60, 128);
  });

const screenTex = (n: number) =>
  canvasTex(256, 160, (g) => {
    g.fillStyle = '#071326';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#1b5cff';
    g.fillRect(0, 0, 256, 18);
    g.fillStyle = '#ffffff';
    g.font = `800 14px ${DISPLAY}`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(`WRC SCORING · JUDGE ${n}`, 8, 9);
    // the two score columns
    for (let r = 0; r < 3; r++) {
      const y = 36 + r * 36;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(8, y, 240, 28);
      g.fillStyle = '#4da3ff';
      g.fillRect(8, y, 110, 28);
      g.fillStyle = '#ff4a5a';
      g.fillRect(138, y, 110, 28);
      g.fillStyle = '#ffffff';
      g.font = `800 18px ${DISPLAY}`;
      g.textAlign = 'center';
      g.fillText('10', 63, y + 14);
      g.fillText('9', 193, y + 14);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = `600 11px ${DISPLAY}`;
      g.fillText(`R${r + 1}`, 128, y + 14);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 160; y += 3) g.fillRect(0, y, 256, 1);
  });

interface Rig {
  head: THREE.Group;
  armR: THREE.Group; // right forearm (writes)
  body: THREE.Group;
  ph: number;
  wx: number;
  wz: number;
  yaw: number;
}

export function buildJudges(scene: THREE.Scene) {
  const rigs: Rig[] = [];
  const deskMat = std(0x11141f, 0.4, 0.7);
  const deskTop = std(0x1a1f2e, 0.3, 0.75);
  const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4f8dff).multiplyScalar(1.1) });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(0.9) });
  const goldLine = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc9a24a).multiplyScalar(0.9) });
  const chairMat = std(0x13171f, 0.55, 0.1);
  const chairFrame = std(0x2a2f3a, 0.4, 0.8);
  const white = std(0xe6e6e2, 0.6);
  const gold = std(0xc9a24a, 0.35, 0.8);
  const eyeM = std(0x1a1b20, 0.45);
  const mouthM = std(0x3a1418, 0.6);
  const glassM = std(0x15161c, 0.3, 0.7);
  const dark = std(0x20242c, 0.4, 0.7);

  // ---- the human kit (crowd proportions)
  const headG = new THREE.SphereGeometry(0.345, 14, 10);
  headG.scale(1.0, 1.08, 1.03);
  const browG = new THREE.SphereGeometry(1, 8, 4);
  browG.scale(0.2, 0.042, 0.085);
  const eyeG = new THREE.SphereGeometry(1, 7, 5);
  eyeG.scale(0.052, 0.04, 0.034);
  const noseG = new THREE.BoxGeometry(0.06, 0.11, 0.08);
  const mouthG = new THREE.SphereGeometry(0.062, 6, 4);
  mouthG.scale(1.5, 0.7, 0.5);
  const earG = new THREE.SphereGeometry(0.055, 6, 5);
  earG.scale(0.6, 1, 0.8);
  const neckG = new THREE.CylinderGeometry(0.125, 0.16, 0.22, 8);
  const shoulderG = new THREE.SphereGeometry(0.165, 8, 6);
  const torsoG = new RoundedBoxGeometry(0.8, 0.9, 0.5, 2, 0.18);
  const collarG = new THREE.BoxGeometry(0.11, 0.16, 0.03);
  const thighG = new RoundedBoxGeometry(0.32, 0.6, 0.36, 1, 0.1);
  const shinG = new RoundedBoxGeometry(0.3, 0.54, 0.32, 1, 0.1);
  const armUpG = new THREE.CapsuleGeometry(0.105, 0.3, 2, 6);
  armUpG.translate(0, -0.22, 0);
  const armLoG = new THREE.CapsuleGeometry(0.09, 0.3, 2, 6);
  armLoG.translate(0, -0.24, 0);
  const handG = new THREE.SphereGeometry(0.1, 7, 5);
  handG.scale(1, 0.7, 1.15);
  const hairG = new THREE.SphereGeometry(0.366, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.42);
  const hairBackG = new RoundedBoxGeometry(0.58, 0.6, 0.2, 1, 0.08);
  const glassG = new THREE.TorusGeometry(0.075, 0.011, 5, 14);

  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  // desk geometry shared by the props below (desk local: +z towards the ring, top surface at y = TOP)
  const TOP = 1.2;
  const SEAT_Z = -1.45; // where the judges sit (behind the desk)

  const makeJudge = (desk: THREE.Group, x: number, n: number, deskYaw: number, dx: number, dz: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, SEAT_Z);
    desk.add(g);
    const suit = std(pick(SUITS), 0.55);
    const skin = std(pick(SKINS), 0.7);
    const hairMat = std(pick(HAIRS), 0.8);
    const tie = std(pick(TIES), 0.5);

    // executive chair: base star, column, seat, tall back with headrest, armrests
    mesh(g, new THREE.CylinderGeometry(0.42, 0.46, 0.06, 10), chairFrame, 0, 0.03, 0);
    mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), chairFrame, 0, 0.26, 0);
    mesh(g, new RoundedBoxGeometry(0.92, 0.16, 0.9, 2, 0.06), chairMat, 0, 0.52, 0.02);
    const back = mesh(g, new RoundedBoxGeometry(0.9, 1.25, 0.14, 2, 0.06), chairMat, 0, 1.18, -0.46);
    back.rotation.x = -0.08;
    mesh(g, new RoundedBoxGeometry(0.5, 0.26, 0.14, 2, 0.05), chairMat, 0, 1.9, -0.52);
    for (const s of [-1, 1]) {
      mesh(g, new THREE.BoxGeometry(0.08, 0.3, 0.5), chairFrame, s * 0.5, 0.8, 0.05);
      mesh(g, new THREE.BoxGeometry(0.1, 0.05, 0.56), chairMat, s * 0.5, 0.97, 0.05);
    }
    // legs (seated): thighs forward under the desk, shins down
    for (const s of [-1, 1]) {
      const th = mesh(g, thighG, suit, s * 0.2, 0.68, 0.32);
      th.rotation.x = Math.PI / 2;
      mesh(g, shinG, suit, s * 0.2, 0.3, 0.62);
      mesh(g, new RoundedBoxGeometry(0.18, 0.1, 0.34, 1, 0.04), std(0x0b0b0e, 0.4, 0.3), s * 0.2, 0.05, 0.74);
    }
    // upper body: a group so the whole torso can breathe
    const body = new THREE.Group();
    body.position.y = 0.6; // seat height
    g.add(body);
    mesh(body, torsoG, suit, 0, 0.5, 0);
    for (const s of [-1, 1]) mesh(body, shoulderG, suit, s * 0.4, 0.86, 0);
    // shirt, collar, tie, lapels, badge
    mesh(body, new THREE.BoxGeometry(0.26, 0.62, 0.03), white, 0, 0.6, 0.255);
    for (const s of [-1, 1]) {
      const col = mesh(body, collarG, white, s * 0.1, 0.9, 0.24);
      col.rotation.z = s * 0.5;
      const lap = mesh(body, new THREE.BoxGeometry(0.12, 0.6, 0.035), std(0x0a0c12, 0.5), s * 0.18, 0.58, 0.26);
      lap.rotation.z = s * 0.2;
    }
    mesh(body, new THREE.BoxGeometry(0.08, 0.46, 0.03), tie, 0, 0.56, 0.272);
    mesh(body, new THREE.BoxGeometry(0.09, 0.11, 0.02), gold, 0.25, 0.5, 0.262);
    // neck + head
    mesh(body, neckG, skin, 0, 1.0, 0.0);
    const head = new THREE.Group();
    head.position.set(0, 1.42, 0.02);
    body.add(head);
    mesh(head, headG, skin);
    mesh(head, browG, std(0x2a1c12, 0.8), 0, 0.12, 0.33);
    for (const s of [-1, 1]) {
      mesh(head, eyeG, eyeM, s * 0.125, 0.04, 0.345);
      mesh(head, earG, skin, s * 0.345, 0.0, 0.0);
    }
    mesh(head, noseG, skin, 0, -0.04, 0.37);
    mesh(head, mouthG, mouthM, 0, -0.18, 0.325);
    const style = Math.floor(Math.random() * 4); // 0 crop · 1 bald · 2 grey · 3 long
    if (style !== 1) {
      const hm = style === 2 ? std(pick([0x8c8c8c, 0xd6d6d2]), 0.8) : hairMat;
      mesh(head, hairG, hm, 0, 0.02, -0.01);
      if (style === 3) mesh(head, hairBackG, hm, 0, -0.14, -0.3);
    }
    if (Math.random() < 0.5) {
      for (const s of [-1, 1]) mesh(head, glassG, glassM, s * 0.125, 0.04, 0.36);
      mesh(head, new THREE.BoxGeometry(0.08, 0.011, 0.011), glassM, 0, 0.045, 0.365);
    }
    // arms: upper arm from the shoulder down-forward to the desk edge, forearm lying on the desk top
    const elbowY = TOP + 0.1 - body.position.y; // in body space
    const elbowZ = -SEAT_Z - 1.0 + 0.05; // just over the near edge of the desk
    const mkArm = (s: number) => {
      const sh = new THREE.Vector3(s * 0.46, 0.84, 0.0);
      const el = new THREE.Vector3(s * 0.42, elbowY, elbowZ);
      const up = new THREE.Group();
      up.position.copy(sh);
      body.add(up);
      const d = el.clone().sub(sh);
      const len = d.length();
      const upMesh = mesh(up, armUpG, suit);
      upMesh.scale.y = len / 0.52;
      up.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.normalize());
      const fore = new THREE.Group();
      fore.position.copy(el);
      body.add(fore);
      fore.rotation.set(-Math.PI / 2 - 0.04, s * -0.25, 0); // flat on the desk, hands drifting towards the centre
      mesh(fore, armLoG, suit);
      mesh(fore, handG, skin, 0, -0.52, 0.04);
      return fore;
    };
    mkArm(-1);
    const armR = mkArm(1);

    // desk props for this judge: scoring monitor (facing the judge), tablet scorecard, pen, microphone, name plate
    const scrStand = mesh(desk, new THREE.BoxGeometry(0.5, 0.04, 0.3), dark, x + 0.95, TOP + 0.02, -0.2);
    scrStand.castShadow = false;
    mesh(desk, new THREE.BoxGeometry(0.08, 0.3, 0.04), dark, x + 0.95, TOP + 0.17, -0.1);
    const scr = mesh(desk, new THREE.BoxGeometry(0.92, 0.6, 0.04), dark, x + 0.95, TOP + 0.52, -0.02);
    scr.rotation.set(0.22, 0, 0);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.52), new THREE.MeshBasicMaterial({ map: screenTex(n), color: new THREE.Color(0.95, 0.95, 0.95) }));
    glow.position.set(x + 0.95, TOP + 0.525, -0.045);
    glow.rotation.set(0.22, Math.PI, 0);
    desk.add(glow);
    const tab = mesh(desk, new RoundedBoxGeometry(0.5, 0.025, 0.68, 1, 0.01), dark, x - 0.05, TOP + 0.015, -0.55);
    tab.rotation.y = (Math.random() - 0.5) * 0.2;
    mesh(tab, new THREE.PlaneGeometry(0.44, 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(0.8) }), 0, 0.014, 0);
    const pen = mesh(desk, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), std(0x0b0b0e, 0.3, 0.6), x + 0.4, TOP + 0.015, -0.5);
    pen.rotation.set(Math.PI / 2, 0, 0.5);
    mesh(desk, new THREE.CylinderGeometry(0.06, 0.08, 0.03, 10), dark, x - 0.7, TOP + 0.015, -0.1);
    const mic = mesh(desk, new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), dark, x - 0.7, TOP + 0.22, -0.02);
    mic.rotation.x = 0.35;
    mesh(desk, new THREE.SphereGeometry(0.04, 8, 6), std(0x0b0b0e, 0.5, 0.4), x - 0.7, TOP + 0.42, 0.06);
    mesh(desk, new THREE.CylinderGeometry(0.05, 0.045, 0.16, 10), std(0xdfe8ff, 0.15, 0.1, ), x - 1.15, TOP + 0.09, -0.3); // water glass
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.48), new THREE.MeshBasicMaterial({ map: plateTex(`JURI ${n}`), color: new THREE.Color(0.95, 0.95, 0.95) }));
    plate.position.set(x, TOP + 0.26, 0.92);
    plate.rotation.x = -0.18;
    desk.add(plate);
    mesh(desk, new THREE.BoxGeometry(1.32, 0.08, 0.26), std(0x14182a, 0.4, 0.7), x, TOP + 0.04, 0.88);

    // where the head really is in the world (for the eye-tracking)
    const c = Math.cos(deskYaw);
    const s = Math.sin(deskYaw);
    rigs.push({ head, armR, body, ph: Math.random() * 10, wx: dx + c * x + s * SEAT_Z, wz: dz - s * x + c * SEAT_Z, yaw: deskYaw });
  };

  const buildDesk = (angle: number, firstNo: number) => {
    const px = Math.cos(angle) * DESK_R;
    const pz = Math.sin(angle) * DESK_R;
    const yaw = Math.atan2(-px, -pz); // local +z points at the ring
    const G = new THREE.Group();
    G.position.set(px, FLOOR, pz);
    G.rotation.y = yaw;
    scene.add(G);
    // the desk: a thick top, a solid branded front, side cheeks, a gold line and a blue under-glow
    mesh(G, new RoundedBoxGeometry(9.6, 0.1, 2.1, 2, 0.03), deskTop, 0, TOP - 0.05, 0);
    mesh(G, new THREE.BoxGeometry(9.4, 1.1, 0.14), deskMat, 0, 0.6, 0.96);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 0.86), new THREE.MeshBasicMaterial({ map: deskTex(), color: new THREE.Color(0.9, 0.9, 0.9) }));
    front.position.set(0, 0.6, 1.035);
    G.add(front);
    for (const s of [-1, 1]) mesh(G, new THREE.BoxGeometry(0.16, 1.15, 2.05), deskMat, s * 4.72, 0.58, 0);
    mesh(G, new THREE.BoxGeometry(9.6, 0.03, 0.03), goldLine, 0, TOP + 0.005, 1.05);
    mesh(G, new THREE.BoxGeometry(9.4, 0.03, 0.03), edgeMat, 0, 1.06, 1.04);
    mesh(G, new THREE.BoxGeometry(9.4, 0.05, 0.05), trimMat, 0, 0.08, 1.04);
    // a soft pool of the under-glow on the floor in front of the desk
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9.8, 1.6), new THREE.MeshBasicMaterial({ color: 0x2a5cff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.02, 1.8);
    G.add(pool);
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
      // the writing hand: a small scribble while scoring, still otherwise
      j.armR.rotation.y = -0.25 + Math.sin(t * 7 + j.ph) * 0.05 * glance;
      j.armR.rotation.x = -Math.PI / 2 - 0.04 + Math.sin(t * 9 + j.ph) * 0.02 * glance;
      // the whole room tenses up in the big moments
      j.body.position.y = 0.6 + Math.sin(t * 2.2 + j.ph) * 0.008 + hype * 0.02 * Math.max(0, Math.sin(t * 5 + j.ph));
    }
  };

  return { update };
}
