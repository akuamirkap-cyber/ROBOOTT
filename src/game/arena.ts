import * as THREE from 'three';
import { buildShow, type Show } from './arenaShow';
import { buildCrowd, type Spot } from './crowd';
import { buildProps } from './arenaProps';
import { buildSheen } from './mirror';
import { buildSpotRig } from './spotlights';
import { markReflect, REFLECT_LIGHTS_LAYER } from './layers';

export interface Arena {
  update(t: number, dt: number, hype: number, focus?: THREE.Vector3): void;
  /** the pyro nozzles on top of the four corner towers */
  towers: THREE.Vector3[];
  setScreen(left: string, right: string, sub: string, lc: string, rc: string): void;
  /** the giant face boards: live portraits of both fighters */
  setFaces: Show['setFaces'];
  ropeHit(x: number, z: number, strength: number): void;
  /** called every frame a fighter leans on the ropes: depth = how far the rope is pushed out */
  ropePress(x: number, z: number, depth: number): void;
  /**
   * RING ENTRY: the ropes are held open at (x, z) — the top rope lifted, the two lower ropes pressed down to the
   * canvas — by `amount` (0..1). Call it every frame while they are held; they close on their own (with a wobble)
   * once the calls stop.
   */
  ropeSpread(x: number, z: number, amount: number): void;
  /** a heavy body slams onto the canvas at (x, z): the whole ring dips and springs back, every rope jolts */
  canvasSlam(x: number, z: number, strength: number): void;
  /** TEAM MATCH: the whole ring (canvas, apron, posts, ropes) grows by this factor; 1 = the standard 1v1 ring */
  setRingScale(s: number): void;
  /**
   * the glossy floors (real planar reflections of the Titans and the lights). The canvas sheen and the hall floor
   * are switched separately — the quality ladder drops the hall first, then the canvas.
   */
  setMirrors(canvasOn: boolean, hallOn?: boolean): void;
  keyLight: THREE.DirectionalLight;
  rimRed: THREE.SpotLight;
  rimBlue: THREE.SpotLight;
  /** the hero followspots lock onto these two (the fighters' feet, world space); null = lamp parked */
  track(a: THREE.Vector3 | null, b: THREE.Vector3 | null): void;
  /** IMPACT LIGHTING: the whole rig kicks for a beat on a heavy blow (0..1) */
  strobe(k: number): void;
}

const FONT = '800 {S}px "Barlow Condensed", Impact, "Arial Black", sans-serif';
const font = (s: number) => FONT.replace('{S}', String(s));

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}
function toTex(c: HTMLCanvasElement, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
}
/** the WRC (World Robot Championship) emblem: a hexagon with the three letters */
function wrcEmblem(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  hexPath(g, cx, cy, r);
  const grd = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grd.addColorStop(0, '#16213f');
  grd.addColorStop(1, '#0a0e1c');
  g.fillStyle = grd;
  g.fill();
  g.lineWidth = r * 0.06;
  g.strokeStyle = '#d8dee8';
  g.stroke();
  hexPath(g, cx, cy, r * 0.84);
  g.lineWidth = r * 0.025;
  g.strokeStyle = 'rgba(201,162,74,0.8)';
  g.stroke();
  g.fillStyle = '#e8ecf2';
  g.font = font(Math.round(r * 0.78));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('WRC', cx, cy + r * 0.02);
  g.fillStyle = 'rgba(201,162,74,0.9)';
  g.fillRect(cx - r * 0.5, cy + r * 0.46, r * 1.0, r * 0.05);
}
function arcText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, a0: number) {
  let a = a0;
  g.textAlign = 'center';
  for (const ch of text) {
    const w = g.measureText(ch).width;
    g.save();
    g.translate(cx, cy);
    g.rotate(a + w / 2 / r);
    g.translate(0, -r);
    g.fillText(ch, 0, 0);
    g.restore();
    a += w / r;
  }
}

function ringTexture() {
  const S = 1024;
  const { c, g } = canvas(S, S);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#1a1d24');
  grad.addColorStop(1, '#12151b');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // the weave of the canvas
  g.fillStyle = 'rgba(255,255,255,0.028)';
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < S; x += 3) g.fillRect(x, 0, 1, S);
  // scuffs and sweat
  for (let i = 0; i < 1400; i++) {
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.lineWidth = Math.random() * 1.4;
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 140, y + (Math.random() - 0.5) * 140);
    g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 30 + Math.random() * 90;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(0,0,0,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // the boundary line and the centre mark
  g.strokeStyle = 'rgba(230,234,240,0.5)';
  g.lineWidth = 5;
  g.strokeRect(64, 64, S - 128, S - 128);
  g.beginPath();
  g.arc(S / 2, S / 2, 332, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(230,234,240,0.22)';
  g.lineWidth = 4;
  g.stroke();
  // centre: the emblem, printed into the fabric
  g.globalAlpha = 0.72;
  wrcEmblem(g, S / 2, S / 2 - 30, 180);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(230,234,240,0.62)';
  g.font = font(44);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('WORLD ROBOT CHAMPIONSHIP', S / 2, S / 2 + 200);
  g.fillStyle = 'rgba(201,162,74,0.7)';
  g.fillRect(S / 2 - 150, S / 2 + 236, 300, 3);
  return toTex(c);
}

/** one long LED / apron strip: [emblem] WORLD ROBOT CHAMPIONSHIP · STEEL TITANS … repeated */
function stripTexture(dark: boolean) {
  const W = 2048;
  const Hh = 128;
  const { c, g } = canvas(W, Hh);
  g.fillStyle = dark ? '#0b0d13' : '#07080d';
  g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < Hh; y += 3) g.fillRect(0, y, W, 1);
  g.fillStyle = 'rgba(201,162,74,0.55)';
  g.fillRect(0, 6, W, 2);
  g.fillRect(0, Hh - 8, W, 2);
  const seg = W / 2;
  for (let s = 0; s < 2; s++) {
    const x0 = s * seg;
    g.globalAlpha = 0.85;
    wrcEmblem(g, x0 + 90, Hh / 2, 44);
    g.globalAlpha = 1;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = font(54);
    g.fillStyle = 'rgba(232,236,242,0.9)';
    g.fillText('WORLD ROBOT CHAMPIONSHIP', x0 + 165, Hh / 2 + 2);
    g.fillStyle = 'rgba(170,180,200,0.8)';
    g.fillText('STEEL TITANS', x0 + 165 + 660, Hh / 2 + 2);
    g.fillStyle = 'rgba(201,162,74,0.8)';
    g.fillRect(x0 + 165 + 620, Hh / 2 - 22, 3, 44);
  }
  const t = toTex(c, 4);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function bannerTexture() {
  const W = 1024;
  const Hh = 512;
  const { c, g } = canvas(W, Hh);
  const grd = g.createLinearGradient(0, 0, W, Hh);
  grd.addColorStop(0, '#0a1226');
  grd.addColorStop(1, '#131c3d');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, Hh);
  g.fillStyle = 'rgba(150,28,38,0.55)';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(260, 0);
  g.lineTo(120, Hh);
  g.lineTo(0, Hh);
  g.fill();
  g.fillStyle = 'rgba(40,70,160,0.55)';
  g.beginPath();
  g.moveTo(W, 0);
  g.lineTo(W - 260, 0);
  g.lineTo(W - 120, Hh);
  g.lineTo(W, Hh);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 2;
  for (let i = -Hh; i < W; i += 38) {
    g.beginPath();
    g.moveTo(i, Hh);
    g.lineTo(i + Hh, 0);
    g.stroke();
  }
  wrcEmblem(g, 300, Hh / 2, 175);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.font = font(96);
  g.fillText('WORLD ROBOT', 520, Hh / 2 - 70);
  g.fillStyle = '#d8b86a';
  g.fillText('CHAMPIONSHIP', 520, Hh / 2 + 30);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '700 34px Arial, sans-serif';
  g.fillText('STEEL TITANS · WORLD FINALS', 524, Hh / 2 + 120);
  g.strokeStyle = 'rgba(216,222,232,0.7)';
  g.lineWidth = 6;
  g.strokeRect(10, 10, W - 20, Hh - 20);
  return toTex(c);
}

function wallTexture() {
  const W = 2048;
  const Hh = 256;
  const { c, g } = canvas(W, Hh);
  g.fillStyle = '#0a0d16';
  g.fillRect(0, 0, W, Hh);
  g.strokeStyle = 'rgba(160,185,255,0.08)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, Hh);
    g.stroke();
  }
  for (let y = 0; y <= Hh; y += 64) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  // light strips
  for (const y of [40, 120, 200]) {
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(120,150,255,0.0)');
    gr.addColorStop(0.5, 'rgba(120,150,255,0.5)');
    gr.addColorStop(1, 'rgba(120,150,255,0.0)');
    for (let k = 0; k < 8; k++) {
      g.fillStyle = gr;
      g.fillRect((k * W) / 8 + 20, y, W / 8 - 40, 3);
    }
  }
  // panel grime
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`;
    g.fillRect(Math.random() * W, Math.random() * Hh, Math.random() * 60, Math.random() * 30);
  }
  return toTex(c, 4);
}

function floorDecalTexture() {
  const S = 1024;
  const { c, g } = canvas(S, S);
  g.fillStyle = '#0a0c14';
  g.fillRect(0, 0, S, S);
  for (let r = 60; r < S / 2; r += 34) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.strokeStyle = `rgba(150,170,210,${0.03 + (r % 68 === 26 ? 0.03 : 0)})`;
    g.lineWidth = 2;
    g.stroke();
  }
  // bold ring with lettering
  g.beginPath();
  g.arc(S / 2, S / 2, 460, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(200,210,230,0.16)';
  g.lineWidth = 10;
  g.stroke();
  g.beginPath();
  g.arc(S / 2, S / 2, 432, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(201,162,74,0.22)';
  g.lineWidth = 3;
  g.stroke();
  g.font = font(34);
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.3)';
  arcText(g, 'WORLD ROBOT CHAMPIONSHIP  ·  WRC  ·  STEEL TITANS  ·  ', S / 2, S / 2, 392, -Math.PI * 0.5);
  arcText(g, 'WORLD ROBOT CHAMPIONSHIP  ·  WRC  ·  STEEL TITANS  ·  ', S / 2, S / 2, 392, Math.PI * 0.5 + 0.06);
  return toTex(c, 4);
}

export function buildArena(scene: THREE.Scene): Arena {
  scene.background = new THREE.Color(0x03050c);
  // the haze is what makes the light show visible: a little more of it, and warmer, so every beam has something
  // to bite on and the hall reads as a lit volume instead of a black void
  scene.fog = new THREE.FogExp2(0x060a16, 0.0056);

  // ---------- Balanced Stadium Broadcast & Championship Ring Lighting (Zero extra light overhead) ----------
  scene.add(new THREE.AmbientLight(0x9fb4e4, 0.18)); // a hair above the old 0.16: the dark side of a Titan is not muddy, but it is still DARK
  scene.add(new THREE.HemisphereLight(0x8faeee, 0x1d1520, 0.37));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.45);
  key.position.set(12, 40, 18);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 2;
  const sc = key.shadow.camera;
  sc.left = -20;
  sc.right = 20;
  sc.top = 20;
  sc.bottom = -20;
  sc.near = 10;
  sc.far = 90;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);

  const mkRim = (color: number, x: number, z: number, intensity = 3.2) => {
    const s = new THREE.SpotLight(color, intensity, 60, 1.05, 0.7, 1.1);
    s.position.set(x, 22, z);
    s.target.position.set(0, 2.4, 0);
    scene.add(s, s.target);
    return s;
  };
  // THE RING KEY: one big warm followspot straight down onto the canvas — the ring blazes, the hall falls off
  // into the dark, the way a title fight is lit for television. Brighter, wider and with a hotter falloff than
  // before, so the canvas is a pool of real light and every scuff on it reads.
  const ringKey = new THREE.SpotLight(0xfff3e2, 64, 92, 0.68, 0.5, 0.94);
  ringKey.position.set(5, 33, 7);
  ringKey.target.position.set(0, 0, 0);
  scene.add(ringKey, ringKey.target);
  // ...and a second, cool-white wash from the opposite corner: it lifts the ring apron and gives every fighter
  // a crisp edge on BOTH shoulders, which is what makes a shot read as lit rather than merely bright
  const ringFill = new THREE.SpotLight(0xdceaff, 22, 86, 0.86, 0.62, 1.0);
  ringFill.position.set(-11, 30, -13);
  ringFill.target.position.set(0, 0, 0);
  scene.add(ringFill, ringFill.target);
  // the coloured corner rims are cinematic rims now — a warm crimson and a cool steel-blue edge light on the
  // fighters' shoulders — and the white kicker from the side cuts them out of the dark
  const rimRed = mkRim(0xff4a3c, -22, -28, 4.5);
  const rimBlue = mkRim(0x4a92ff, 22, 28, 4.5);
  const rimSide = mkRim(0xd8e4ff, 30, -12, 2.4); // a clean white-blue side kicker instead of the purple wash

  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshStandardMaterial({ color: 0x0b0e18, roughness: 0.28, metalness: 0.58 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  floor.receiveShadow = true;
  scene.add(floor);
  const decal = new THREE.Mesh(new THREE.CircleGeometry(31, 64), new THREE.MeshStandardMaterial({ map: floorDecalTexture(), roughness: 0.34, metalness: 0.45 }));
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = -1.39;
  decal.receiveShadow = true;
  scene.add(decal);

  // ---------- ring ----------
  const ringTex = ringTexture();
  const topMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.74, metalness: 0.04 });
  const apronTex = stripTexture(true);
  apronTex.repeat.set(1, 1);
  const apronMat = new THREE.MeshStandardMaterial({ map: apronTex, emissiveMap: apronTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.3, roughness: 0.66, metalness: 0.22 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.6, metalness: 0.6 });
  const ring = new THREE.Group(); // everything that must grow with the ring in TEAM MATCH (2v2)
  scene.add(ring);
  let ringScale = 1;
  const platform = new THREE.Mesh(new THREE.BoxGeometry(31, 1.4, 31), [apronMat, apronMat, topMat, baseMat, apronMat, apronMat]);
  platform.position.y = -0.7;
  platform.receiveShadow = true;
  platform.castShadow = true;
  ring.add(platform);

  // ---------- THE GLOSSY FLOORS: real reflections of the Titans and the lights in the canvas and the hall floor
  const canvasSheen = buildSheen(new THREE.PlaneGeometry(30.6, 30.6), { strength: 0.55, res: 512 });
  canvasSheen.mesh.rotation.x = -Math.PI / 2;
  canvasSheen.mesh.position.y = 0.025;
  ring.add(canvasSheen.mesh);
  const hallSheen = buildSheen(new THREE.RingGeometry(14, 62, 72, 1), { strength: 0.6, res: 384, layer: REFLECT_LIGHTS_LAYER });
  hallSheen.mesh.rotation.x = -Math.PI / 2;
  hallSheen.mesh.position.y = -1.375;
  scene.add(hallSheen.mesh);
  // the two glossies are switched separately: the canvas sheen carries the heroes (switch it off last), the hall
  // floor is the big, soft one that the quality governor gives up first
  const setMirrors = (canvasOn: boolean, hallOn = canvasOn) => {
    canvasSheen.setEnabled(canvasOn);
    hallSheen.setEnabled(hallOn);
  };

  const neonRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4350).multiplyScalar(0.8) });
  const neonBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5f9bff).multiplyScalar(0.8) });
  const mkStrip = (w: number, d: number, x: number, z: number, m: THREE.Material, y = -0.05) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), m);
    mesh.position.set(x, y, z);
    markReflect(mesh, true);
    ring.add(mesh);
  };
  mkStrip(31.1, 0.14, 0, 15.5, neonBlue);
  mkStrip(31.1, 0.14, 0, -15.5, neonRed);
  mkStrip(0.14, 31.1, 15.5, 0, neonBlue);
  mkStrip(0.14, 31.1, -15.5, 0, neonRed);

  // posts + ropes
  const post = new THREE.MeshStandardMaterial({ color: 0x20232b, metalness: 0.9, roughness: 0.35 });
  const H = 13.6;
  const ropeYs = [2.0, 3.6, 5.2]; // like a real ring: the top rope catches a 7 m robot across the chest / upper back
  const padMats = [0xb0222c, 0x24479a];
  const corners: [number, number][] = [
    [H, H],
    [-H, H],
    [H, -H],
    [-H, -H],
  ];
  corners.forEach(([x, z], i) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 6.8, 12), post);
    p.position.set(x, 3.4, z);
    p.castShadow = true;
    markReflect(p);
    ring.add(p);
    const padM = new THREE.MeshStandardMaterial({ color: padMats[i % 2], roughness: 0.55, metalness: 0.05 });
    for (const y of ropeYs) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.95), padM);
      pad.position.set(x, y, z);
      pad.castShadow = true;
      markReflect(pad);
      ring.add(pad);
    }
  });
  const ropeColors = [0xb8262e, 0xe8e6e0, 0x2a4fb8];
  // sides: 0:+z 1:-z 2:+x 3:-x. Each rope is a finely segmented tube that bends around the contact point.
  const ROPE_SEG = 56;
  const ropeLen = H * 2;
  const nSign = [1, -1, 1, -1]; // outward direction in the rope group's local z
  const ropeW = [0.55, 0.8, 1.0]; // lower / middle / upper rope: the chest / upper back leans on the top rope, the hips brush the middle one, the knees barely reach the bottom one
  interface RopeMesh {
    geo: THREE.BufferGeometry;
    base: Float32Array;
    w: number;
    k: number; // 0 bottom · 1 middle · 2 top
  }
  const ropeSides: RopeMesh[][] = [[], [], [], []];
  /** one held-open spot on a side: u = where along the rope, a = how far open (smoothed), t = this frame's target */
  interface Spread {
    u: number;
    a: number;
    t: number;
  }
  const ropeS = [0, 1, 2, 3].map(() => ({ x: 0, v: 0, u: 0, press: 0, active: false, spreads: [] as Spread[] }));
  // how far each rope moves when the ropes are held open for a ring entry: the top rope goes UP (the gloves lift
  // it), the middle and bottom ropes are pressed DOWN to the canvas — a 7 m machine ducks under one and steps over
  // the others exactly the way a boxer climbs through
  const SPREAD_Y = [-1.75, -3.1, 1.75];
  ropeYs.forEach((y, k) => {
    const mat = new THREE.MeshStandardMaterial({ color: ropeColors[k], roughness: 0.62, metalness: 0.08, emissive: ropeColors[k], emissiveIntensity: 0.02 });
    const mk = (side: number, rx: number, rz: number, rotY: number) => {
      const geo = new THREE.CylinderGeometry(0.12, 0.12, ropeLen, 10, ROPE_SEG, false);
      geo.rotateZ(Math.PI / 2); // length along local X
      const r = new THREE.Mesh(geo, mat);
      r.castShadow = true;
      r.frustumCulled = false;
      markReflect(r);
      const g = new THREE.Group();
      g.add(r);
      g.position.set(rx, y, rz);
      g.rotation.y = rotY;
      ring.add(g);
      ropeSides[side].push({ geo, base: (geo.attributes.position.array as Float32Array).slice(), w: ropeW[k], k });
    };
    mk(0, 0, H, 0);
    mk(1, 0, -H, 0);
    mk(2, H, 0, Math.PI / 2);
    mk(3, -H, 0, Math.PI / 2);
  });
  const sideOf = (x: number, z: number) => (Math.abs(x) > Math.abs(z) ? (x > 0 ? 2 : 3) : z > 0 ? 0 : 1);
  const alongOf = (side: number, x: number, z: number) => (side < 2 ? x : -z); // local X of that rope group
  const setRingScale = (s: number) => {
    ringScale = s;
    ring.scale.set(s, 1, s);
    // the walkways slide out with the edge of the bigger ring so the ramps still land on the apron
    const d = (s - 1) * 15.5;
    for (const e of entrances) e.g.position.set(e.out.x * d, -1.4, e.out.y * d);
  };
  const ropeHit = (x0: number, z0: number, strength: number) => {
    const x = x0 / ringScale;
    const z = z0 / ringScale;
    const sd = sideOf(x, z);
    const st = ropeS[sd];
    st.u = alongOf(sd, x, z);
    const kick = Math.min(5, strength) * 5.5;
    st.v += kick;
    st.active = true;
    // the ropes run through the corner posts: a slam on one side jerks the two adjoining sides too (more on the
    // side whose post is nearer the impact), so the whole ring answers the blow instead of one rope on its own
    for (const cs of [1, -1]) {
      let adj: number;
      let adjU: number;
      let cornerU: number;
      if (sd < 2) {
        // side 0 (+z) / 1 (-z): corners at x = ±H, shared with side 2 (+x) / 3 (-x) at their local z-end
        adj = cs > 0 ? 2 : 3;
        cornerU = cs * H;
        adjU = -(sd === 0 ? 1 : -1) * H;
      } else {
        // side 2 (+x) / 3 (-x): local along = -z, corners at z = ∓H, shared with side 0 (+z) / 1 (-z)
        adj = cs > 0 ? 1 : 0; // along = +H → z = -H → side 1
        cornerU = cs * H;
        adjU = (sd === 2 ? 1 : -1) * H;
      }
      const near = Math.max(0, 1 - Math.abs(st.u - cornerU) / (2 * H)); // 1 at the shared post, 0.5 mid-rope, 0 at the far post
      const a = ropeS[adj];
      if (near <= 0.05) continue;
      a.u += (adjU * 0.8 - a.u) * 0.5; // the jolt lives near the shared post
      a.v += kick * 0.32 * near;
      a.active = true;
    }
  };
  const ropePress = (x0: number, z0: number, depth: number) => {
    const x = x0 / ringScale;
    const z = z0 / ringScale;
    const sd = sideOf(x, z);
    const st = ropeS[sd];
    st.u += (alongOf(sd, x, z) - st.u) * 0.5;
    st.press = Math.max(st.press, depth);
    st.active = true;
  };
  const ropeSpread = (x0: number, z0: number, amount: number) => {
    const x = x0 / ringScale;
    const z = z0 / ringScale;
    const sd = sideOf(x, z);
    const st = ropeS[sd];
    const u = alongOf(sd, x, z);
    let sp = st.spreads.find((q) => Math.abs(q.u - u) < 1.6);
    if (!sp) {
      if (st.spreads.length >= 3) return;
      sp = { u, a: 0, t: 0 };
      st.spreads.push(sp);
    }
    sp.u += (u - sp.u) * 0.5;
    sp.t = Math.max(sp.t, Math.min(1, amount));
    st.active = true;
  };
  // the ring platform is sprung: a landing / a knock-down makes the whole thing dip and ring back up
  let ringY = 0;
  let ringVy = 0;
  const canvasSlam = (x: number, z: number, strength: number) => {
    ringVy -= Math.min(3, strength) * 0.55;
    const h = 20 * ringScale;
    ropeHit(x, h, strength * 0.45);
    ropeHit(x, -h, strength * 0.45);
    ropeHit(h, z, strength * 0.45);
    ropeHit(-h, z, strength * 0.45);
  };
  const updateRing = (dt: number) => {
    if (Math.abs(ringY) < 0.0005 && Math.abs(ringVy) < 0.002) {
      ringY = 0;
      ringVy = 0;
      ring.position.y = 0;
      return;
    }
    const w = Math.PI * 2 * 3.4;
    const zeta = 0.3;
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const hh = dt / n;
    for (let i = 0; i < n; i++) {
      ringVy += (-w * w * ringY - 2 * zeta * w * ringVy) * hh;
      ringY += ringVy * hh;
    }
    ring.position.y = Math.max(-0.16, ringY);
  };
  const updateRopes = (dt: number) => {
    for (let sd = 0; sd < 4; sd++) {
      const st = ropeS[sd];
      if (!st.active) continue;
      // the held-open spots ease towards this frame's target (opening a touch slower than they close), and go away
      // once they have closed
      let spreading = false;
      for (const sp of st.spreads) {
        sp.a += (sp.t - sp.a) * (1 - Math.exp(-(sp.t > sp.a ? 5.5 : 7.5) * dt));
        sp.t = 0;
        if (sp.a > 0.002) spreading = true;
      }
      if (!spreading) st.spreads.length = 0;
      // under-damped spring: the rope follows the robot, then wobbles back
      const w = Math.PI * 2 * 6.5;
      const zeta = 0.34;
      const n = Math.max(1, Math.ceil(dt / 0.006));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        st.v += (w * w * (st.press - st.x) - 2 * zeta * w * st.v) * h;
        st.x += st.v * h;
      }
      st.press = 0;
      // the rope wraps AROUND the body: it moves out by the body's penetration plus a pad so it sits on the far side
      // of the armour instead of through its middle (the pad fades in over the first few cm of contact)
      const amp = st.x + 0.16 * Math.min(1, Math.max(0, st.x) / 0.06);
      const still = Math.abs(st.x) < 0.002 && Math.abs(st.v) < 0.02 && !spreading;
      for (const rm of ropeSides[sd]) {
        const pos = rm.geo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        const sy = SPREAD_Y[rm.k];
        for (let i = 0; i < arr.length; i += 3) {
          const px = rm.base[i];
          let d = 0;
          let lift = 0;
          if (!still) {
            const du = (px - st.u) / 4.8;
            const taper = Math.max(0, 1 - (px / H) * (px / H)); // anchored at the corner posts
            d = amp * rm.w * Math.exp(-du * du) * taper;
            for (const sp of st.spreads) {
              const ds = (px - sp.u) / 3.1;
              lift += sp.a * sy * Math.exp(-ds * ds) * taper;
            }
          }
          arr[i + 1] = rm.base[i + 1] - Math.abs(d) * 0.12 + lift;
          arr[i + 2] = rm.base[i + 2] + nSign[sd] * d;
        }
        pos.needsUpdate = true;
      }
      if (still) {
        st.x = 0;
        st.v = 0;
        st.active = false;
      }
    }
  };

  // ---------- LED ring boards around the ring (scrolling WRC ads) ----------
  // The boards are broken at the two ENTRANCE aisles (see buildEntrance below) so the walkways run straight through
  // them, each gap closed off with a lit end-post.
  const ENTRY_A = [1.247, 4.389]; // azimuths (x = cos a, z = sin a) of the blue / red entrance aisles
  const ENTRY_GAP = 0.19; // half-angle of the opening in the boards (≈ 5 m at r 26.5)
  const ledTex = stripTexture(false);
  ledTex.repeat.set(-6, 1); // negative: the strip is seen from inside the cylinder
  const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.BackSide, color: new THREE.Color(0.9, 0.9, 0.9) });
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fabff).multiplyScalar(0.86) });
  const arcs: [number, number][] = [
    [ENTRY_A[0] + ENTRY_GAP, ENTRY_A[1] - ENTRY_GAP],
    [ENTRY_A[1] + ENTRY_GAP, ENTRY_A[0] + Math.PI * 2 - ENTRY_GAP],
  ];
  for (const [a0, a1] of arcs) {
    const len = a1 - a0;
    // CylinderGeometry: x = r·sin θ, z = r·cos θ → θ = π/2 − a
    const led = new THREE.Mesh(new THREE.CylinderGeometry(26.5, 26.5, 1.8, Math.ceil((96 * len) / (Math.PI * 2)), 1, true, Math.PI / 2 - a1, len), ledMat);
    led.position.y = -0.5;
    scene.add(led);
    const rimG = new THREE.Group();
    rimG.rotation.y = -a0; // a torus arc starts at azimuth 0; a yaw of −a0 moves its start to a0
    const ledRim = new THREE.Mesh(new THREE.TorusGeometry(26.55, 0.08, 6, Math.ceil((96 * len) / (Math.PI * 2)), len), rimMat);
    ledRim.rotation.x = Math.PI / 2;
    ledRim.position.y = 0.42;
    rimG.add(ledRim);
    scene.add(rimG);
  }
  const endPost = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.4, metalness: 0.85 });
  for (const a of ENTRY_A) {
    for (const sgn of [-1, 1]) {
      const b = a + sgn * ENTRY_GAP;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.9, 0.32), endPost);
      post.position.set(Math.cos(b) * 26.5, -0.45, Math.sin(b) * 26.5);
      post.rotation.y = -b;
      scene.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.36), rimMat);
      cap.position.set(Math.cos(b) * 26.5, 0.52, Math.sin(b) * 26.5);
      cap.rotation.y = -b;
      scene.add(cap);
    }
  }

  // ---------- stands: stepped rows of seats with aisles ----------
  const tiers = 4;
  const rowsPer = 3;
  const rowW = 2.0;
  const rIn = (k: number) => 32 + k * 6.5;
  const rowInner = (k: number, r: number) => rIn(k) + r * rowW;
  const rowH = (k: number, r: number) => 0.4 + (k * rowsPer + r + 1) * 0.85;
  // the LOWER bowl (tiers 0–1) is built in two arcs: the entrance tunnels (buildEntrance) pass through the gaps
  // between them. The UPPER bowl (tiers 2–3) is one full ring behind the tunnel housings.
  const LOWER = 2;
  const lower: THREE.Vector2[] = [new THREE.Vector2(rIn(0), -1.4)];
  const upper: THREE.Vector2[] = [];
  for (let k = 0; k < tiers; k++) {
    for (let r = 0; r < rowsPer; r++) {
      (k < LOWER ? lower : upper).push(new THREE.Vector2(rowInner(k, r), rowH(k, r)), new THREE.Vector2(rowInner(k, r) + rowW, rowH(k, r)));
    }
  }
  upper.unshift(lower[lower.length - 1].clone());
  upper.push(new THREE.Vector2(rowInner(tiers - 1, rowsPer - 1) + rowW, -1.4));
  const standsMat = new THREE.MeshStandardMaterial({ color: 0x151822, roughness: 0.9, metalness: 0.2, side: THREE.DoubleSide });
  const STAND_GAP = 0.135; // half-angle of the tunnel cut (8.6 m wide at the mouth, r = 32)
  for (const [a0, a1] of [
    [ENTRY_A[0] + STAND_GAP, ENTRY_A[1] - STAND_GAP],
    [ENTRY_A[1] + STAND_GAP, ENTRY_A[0] + Math.PI * 2 - STAND_GAP],
  ]) {
    const len = a1 - a0;
    // LatheGeometry: x = r·sin φ, z = r·cos φ → φ = π/2 − a
    const stands = new THREE.Mesh(new THREE.LatheGeometry(lower, Math.ceil((96 * len) / (Math.PI * 2)), Math.PI / 2 - a1, len), standsMat);
    stands.receiveShadow = true;
    scene.add(stands);
  }
  const standsUp = new THREE.Mesh(new THREE.LatheGeometry(upper, 96), standsMat);
  standsUp.receiveShadow = true;
  scene.add(standsUp);

  // ---------- ENTRANCE WALKWAYS (the ring walk) ----------
  // Two runways, one per corner, each cut into the lower bowl at an aisle: a tunnel gate with a lit portal and
  // floodlights, a flat lit runway with crowd barriers and chevrons pointing at the ring, and a LAUNCH WEDGE at the
  // end. The runway does NOT join the ring: it stops short of the apron, and the machines take off from the wedge,
  // flip over the ropes and land on the canvas (see Game.ts RING WALK).
  // Local frame: +z points OUT from the ring down the aisle, y = 0 is the hall floor (-1.4 world).
  const entrances: { g: THREE.Group; out: THREE.Vector2 }[] = [];
  const buildEntrance = (ang: number, hex: number) => {
    const g = new THREE.Group();
    g.position.y = -1.4;
    g.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
    scene.add(g);
    entrances.push({ g, out: new THREE.Vector2(Math.cos(ang), Math.sin(ang)) });
    const col = new THREE.Color(hex);
    const deck = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.42, metalness: 0.7, emissive: col.clone().multiplyScalar(0.05) });
    const carpet = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.55), roughness: 0.6, metalness: 0.2, emissive: col.clone().multiplyScalar(0.42) });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.4, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x070910, roughness: 0.9, metalness: 0.2 });
    const led = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.95) });
    const ledW = new THREE.MeshBasicMaterial({ color: 0xe8f4ff });
    const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.receiveShadow = true;
      o.castShadow = m !== led && m !== ledW;
      g.add(o);
      return o;
    };
    const W = 6.6; // runway width
    // flat runway from the gate to the foot of the wedge
    const Z0 = 23.5; // foot of the wedge
    const Z1 = 19.8; // the lip of the wedge — the take-off point, a clear 3.5 m short of the ring platform
    const rise = 0.5;
    const flatL = 35 - Z0;
    const flatZ = (35 + Z0) / 2;
    put(new THREE.BoxGeometry(W, 0.14, flatL), deck, 0, 0.07, flatZ);
    // the launch wedge: a solid steel ramp that climbs 0.5 m to a sharp lip
    const wedge = new THREE.Shape();
    wedge.moveTo(-Z0, 0);
    wedge.lineTo(-Z1, rise);
    wedge.lineTo(-Z1, 0);
    wedge.closePath();
    const wg = new THREE.Mesh(new THREE.ExtrudeGeometry(wedge, { depth: W, bevelEnabled: false }), deck);
    wg.rotation.y = Math.PI / 2; // shape x → −z, extrusion → +x
    wg.position.x = -W / 2;
    wg.castShadow = true;
    wg.receiveShadow = true;
    g.add(wg);
    const slope = Math.atan2(rise, Z0 - Z1);
    const SL = Math.hypot(rise, Z0 - Z1);
    const SZ = (Z0 + Z1) / 2;
    // the team-colour carpet down the middle of the runway and up the wedge
    put(new THREE.BoxGeometry(W * 0.5, 0.02, flatL), carpet, 0, 0.15, flatZ);
    put(new THREE.BoxGeometry(W * 0.5, 0.02, SL), carpet, 0, rise / 2 + 0.02, SZ, slope, 0, 0);
    // LED edge strips the whole way and a bright white lip on the wedge
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(0.14, 0.18, flatL), led, sx * (W / 2 - 0.1), 0.18, flatZ);
      put(new THREE.BoxGeometry(0.14, 0.18, SL), led, sx * (W / 2 - 0.1), rise / 2 + 0.1, SZ, slope, 0, 0);
    }
    put(new THREE.BoxGeometry(W, 0.08, 0.22), ledW, 0, rise + 0.04, Z1 + 0.1);
    put(new THREE.PlaneGeometry(W, rise - 0.08), led, 0, rise / 2, Z1 - 0.01, 0, Math.PI, 0); // the lit face of the lip, toward the ring
    put(new THREE.BoxGeometry(W, 0.06, 0.2), ledW, 0, 0.16, Z0);
    // runway lights: white LED studs down both edges of the carpet
    for (let z = 33.5; z > Z1 + 0.4; z -= 1.1) {
      const y0 = z >= Z0 ? 0 : (rise * (Z0 - z)) / (Z0 - Z1);
      for (const sx of [-1, 1]) put(new THREE.SphereGeometry(0.07, 8, 6), ledW, sx * (W * 0.25 + 0.12), y0 + 0.17, z);
    }
    // chevrons on the deck pointing at the ring
    for (let z = 33; z > Z0 + 0.5; z -= 1.7) {
      put(new THREE.BoxGeometry(0.14, 0.03, 1.5), led, -0.55, 0.16, z, 0, -0.65, 0);
      put(new THREE.BoxGeometry(0.14, 0.03, 1.5), led, 0.55, 0.16, z, 0, 0.65, 0);
    }
    // crowd barriers both sides of the flat runway: posts + a double rail + a light on every post
    for (let z = Z0 + 0.5; z <= 34; z += 2.4) {
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 + 0.35);
        put(new THREE.CylinderGeometry(0.06, 0.07, 1.15, 10), steel, x, 0.57, z);
        put(new THREE.SphereGeometry(0.11, 12, 8), led, x, 1.2, z);
      }
    }
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.35);
      put(new THREE.BoxGeometry(0.06, 0.06, flatL - 1), steel, x, 1.05, flatZ + 0.5);
      put(new THREE.BoxGeometry(0.06, 0.06, flatL - 1), steel, x, 0.65, flatZ + 0.5);
    }
    // the tunnel gate: a tunnel housing through the lower bowl (dark inside, steel-trimmed outside with a lit roof
    // edge), a lit portal frame, a sign and two floodlights
    put(new THREE.BoxGeometry(W + 1.4, 8.6, 10), dark, 0, 4.3, 39.5);
    put(new THREE.BoxGeometry(W + 1.0, 0.1, 9), dark, 0, 0.05, 39);
    put(new THREE.BoxGeometry(W + 2.0, 0.3, 10.4), steel, 0, 8.75, 39.7); // the roof slab
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(0.3, 8.6, 10.2), steel, sx * (W / 2 + 0.85), 4.3, 39.6); // side skins
      put(new THREE.BoxGeometry(0.12, 0.12, 10.2), led, sx * (W / 2 + 1.0), 8.95, 39.6); // lit roof edges
    }
    put(new THREE.BoxGeometry(W + 2.0, 0.12, 0.12), led, 0, 8.95, 44.8);
    for (const sx of [-1, 1]) put(new THREE.BoxGeometry(0.2, 2.7, 2.8), steel, sx * (W / 2 + 1.0), 1.35, 33.2); // caps on the cut front row
    for (const sx of [-1, 1]) {
      put(new THREE.BoxGeometry(1.1, 9.4, 1.1), steel, sx * (W / 2 + 1.1), 4.7, 34.5);
      put(new THREE.BoxGeometry(0.16, 8.6, 0.16), led, sx * (W / 2 + 0.55), 4.3, 34.0);
      put(new THREE.BoxGeometry(0.16, 8.6, 0.16), led, sx * (W / 2 + 0.55), 4.3, 35.0);
    }
    put(new THREE.BoxGeometry(W + 3.3, 1.5, 1.2), steel, 0, 10.1, 34.5);
    put(new THREE.BoxGeometry(W + 1.2, 0.16, 0.16), led, 0, 9.3, 34.0);
    put(new THREE.PlaneGeometry(W + 0.6, 1.0), led, 0, 10.1, 33.85, 0, Math.PI, 0); // the sign face toward the ring
    for (const sx of [-1, 1]) {
      // floodlights on the pillars, aimed down the runway, with a soft visible beam
      const lx = sx * (W / 2 + 1.1);
      put(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 16), steel, lx, 9.1, 33.6, Math.PI / 2 + 0.55, 0, 0);
      put(new THREE.CircleGeometry(0.38, 16), ledW, lx, 9.1 - Math.sin(0.55) * 0.26, 33.6 - Math.cos(0.55) * 0.26, -Math.PI / 2 - 0.55 + Math.PI, 0, 0);
      const lightAt = new THREE.Vector3(lx, 9.1, 33.6);
      const hitAt = new THREE.Vector3(lx - sx * 1.6, 0.2, 21.5);
      const beamLen = lightAt.distanceTo(hitAt);
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, beamLen, 24, 1, true).rotateX(Math.PI / 2), // apex on +z
        new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.6), transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      beam.position.copy(lightAt).add(hitAt).multiplyScalar(0.5);
      beam.renderOrder = 3;
      g.add(beam);
      g.updateMatrixWorld(true);
      beam.lookAt(lightAt.clone().applyMatrix4(g.matrixWorld));
    }
  };
  buildEntrance(ENTRY_A[0], 0x2f7cff); // the blue corner's aisle
  buildEntrance(ENTRY_A[1], 0xff3b4a); // the red corner's aisle

  // seats on a regular grid; a few empty ones; 6 aisles
  const spots: Spot[] = [];
  const AISLE = Math.PI / 3;
  for (let k = 0; k < tiers; k++) {
    for (let r = 0; r < rowsPer; r++) {
      const rs = rowInner(k, r) + rowW * 0.5;
      const n = Math.floor((Math.PI * 2 * rs) / 2.0);
      const off = r * 0.5 + k * 0.3;
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * Math.PI * 2;
        const m = (((a - 0.2) % AISLE) + AISLE) % AISLE;
        const dAisle = Math.min(m, AISLE - m) * rs;
        if (dAisle < 1.3) continue; // aisle
        // the two entrance tunnels cut a wider hole through the lower bowl
        const dEntry = Math.min(...ENTRY_A.map((ea) => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea))))) * rs;
        if (k < 2 && dEntry < 5.4) continue;
        const x = Math.cos(a) * rs;
        const z = Math.sin(a) * rs;
        spots.push({ x, y: rowH(k, r), z, yaw: Math.atan2(-x, -z), empty: Math.random() < 0.15 });
      }
    }
  }
  const crowd = buildCrowd(scene, spots, 120);
  // corner pyro towers, TV cameras, stand lights, wall fins, flags and the OFFICIAL JUDGES' desks
  const props = buildProps(scene);
  const show = buildShow(scene, ENTRY_A);
  const ORIGIN = new THREE.Vector3(0, 3.4, 0);

  // ---------- the hall: walls, roof, WRC banners ----------
  const wallTex = wallTexture();
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(-1, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(64, 64, 44, 96, 1, true), new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, color: new THREE.Color(0.92, 0.92, 0.99) }));
  wall.position.y = 20.6;
  scene.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(64, 14, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x090b12, side: THREE.BackSide }));
  roof.position.y = 49.6;
  scene.add(roof);
  const roofRim = new THREE.Mesh(new THREE.TorusGeometry(62.5, 0.5, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9db6ff).multiplyScalar(0.42) }));
  roofRim.rotation.x = Math.PI / 2;
  roofRim.position.y = 42;
  scene.add(roofRim);

  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture(), color: new THREE.Color(0.93, 0.93, 0.93) });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    const x = Math.cos(a) * 63.3;
    const z = Math.sin(a) * 63.3;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), bannerMat);
    b.position.set(x, 19, z);
    b.rotation.y = Math.atan2(-x, -z);
    scene.add(b);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(31, 16), new THREE.MeshBasicMaterial({ color: 0x05060a }));
    frame.position.set(x * 0.9995, 19, z * 0.9995);
    frame.rotation.y = b.rotation.y;
    scene.add(frame);
  }

  // ---------- truss + beams ----------
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, metalness: 0.9, roughness: 0.4 });
  const truss = new THREE.Mesh(new THREE.TorusGeometry(18, 0.45, 8, 56), trussMat);
  truss.rotation.x = Math.PI / 2;
  truss.position.y = 27;
  scene.add(truss);
  // outer light rig with 40 lamps
  const truss2 = new THREE.Mesh(new THREE.TorusGeometry(40, 0.5, 8, 96), trussMat);
  truss2.rotation.x = Math.PI / 2;
  truss2.position.y = 34;
  scene.add(truss2);
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdbe6ff).multiplyScalar(1.26) }), 40);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    dm.position.set(Math.cos(a) * 40, 33.2, Math.sin(a) * 40);
    dm.updateMatrix();
    lamps.setMatrixAt(i, dm.matrix);
  }
  scene.add(lamps);

  // the broadcast light rig: eight followspots on the inner truss + four moving heads on the outer one
  const spotRig = buildSpotRig(scene);

  // ---------- jumbotron ----------
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 1024;
  sCanvas.height = 576;
  const sctx = sCanvas.getContext('2d')!;
  const sTex = new THREE.CanvasTexture(sCanvas);
  sTex.colorSpace = THREE.SRGBColorSpace;
  const setScreen = (left: string, right: string, sub: string, lc: string, rc: string) => {
    const g = sctx;
    const grd = g.createLinearGradient(0, 0, 1024, 0);
    grd.addColorStop(0, '#0a1230');
    grd.addColorStop(0.5, '#090a12');
    grd.addColorStop(1, '#2a0a10');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 576);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < 576; y += 6) g.fillRect(0, y, 1024, 2);
    wrcEmblem(g, 512, 78, 52);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font(86);
    g.fillStyle = lc;
    g.fillText(left.toUpperCase(), 270, 220);
    g.fillStyle = rc;
    g.fillText(right.toUpperCase(), 754, 220);
    g.fillStyle = '#ffffff';
    g.font = font(120);
    g.fillText('VS', 512, 320);
    g.font = '700 44px Arial, sans-serif';
    g.fillStyle = '#ffb030';
    g.fillText(sub, 512, 462);
    g.fillStyle = '#ffffff';
    g.font = '700 30px Arial, sans-serif';
    g.fillText('WRC · WORLD ROBOT CHAMPIONSHIP', 512, 522);
    sTex.needsUpdate = true;
  };
  setScreen('Atlas', 'Scrap-9', 'ROUND 1', '#4da3ff', '#ff6a4d');
  const jumbo = new THREE.Group();
  jumbo.position.y = 27;
  jumbo.scale.setScalar(2.2);
  const hous = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.7, 6.2), new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.8, roughness: 0.5 }));
  jumbo.add(hous);
  const scrMat = new THREE.MeshBasicMaterial({ map: sTex, color: new THREE.Color(1.02, 1.02, 1.02) });
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(5.9, 3.32), scrMat);
    const a = (i * Math.PI) / 2;
    p.position.set(Math.sin(a) * 3.12, 0, Math.cos(a) * 3.12);
    p.rotation.y = a;
    jumbo.add(p);
  }
  scene.add(jumbo);
  for (const [x, z] of [[2.5, 2.5], [-2.5, 2.5], [2.5, -2.5], [-2.5, -2.5]]) {
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6, 4), post);
    cab.position.set(x * 0.7, 16.2, z * 0.7);
    jumbo.add(cab);
    cab.position.y = 4.4;
  }

  let smoothHype = 0;
  let frame = 0;
  let kick = 0; // the impact kick on the ring key
  const strobe = (k: number) => {
    kick = Math.max(kick, Math.min(1, k));
    spotRig.strobe(k);
  };
  const update = (t: number, dt: number, hype: number, focus?: THREE.Vector3) => {
    smoothHype += (hype - smoothHype) * (1 - Math.exp(-3 * dt));
    kick = Math.max(0, kick - dt * 5);
    updateRopes(dt);
    updateRing(dt);
    frame++;
    crowd.update(t, smoothHype, frame & 1);
    const foc = focus ?? ORIGIN;
    props.update(t, dt, smoothHype, foc);
    rimSide.intensity = 2.4 + smoothHype * 0.55;
    // the ring key breathes: a slow tide under the fight, and a hard SURGE on every heavy impact (the whole ring
    // blows out for a moment, the way a camera's auto-exposure reacts to a flash bulb)
    ringKey.intensity = 64 + smoothHype * 10 + Math.sin(t * 0.7) * 1.2 + kick * kick * 38;
    ringFill.intensity = 22 + smoothHype * 5;
    ledTex.offset.x = (ledTex.offset.x + dt * 0.012) % 1;
    spotRig.update(t, dt, smoothHype, foc);
    jumbo.rotation.y = t * 0.12;
    show.update(t, dt, smoothHype);
    // the apron LEDs breathe with the crowd
    const ap = 0.7 + Math.max(0, Math.sin(t * 2.6)) * (0.12 + smoothHype * 0.2);
    neonRed.color.setHex(0xff4350).multiplyScalar(ap);
    neonBlue.color.setHex(0x5f9bff).multiplyScalar(ap);
  };

  return { update, setScreen, setFaces: show.setFaces, ropeHit, ropePress, ropeSpread, canvasSlam, setRingScale, setMirrors, keyLight: key, rimRed, rimBlue, towers: props.towers, track: spotRig.track, strobe };
}
