import * as THREE from 'three';
import { buildCrowd, type Spot } from './crowd';
import { buildProps } from './arenaProps';

export interface Arena {
  update(t: number, dt: number, hype: number, focus?: THREE.Vector3): void;
  /** the pyro nozzles on top of the four corner towers */
  towers: THREE.Vector3[];
  setScreen(left: string, right: string, sub: string, lc: string, rc: string): void;
  ropeHit(x: number, z: number, strength: number): void;
  /** called every frame a fighter leans on the ropes: depth = how far the rope is pushed out */
  ropePress(x: number, z: number, depth: number): void;
  keyLight: THREE.DirectionalLight;
  rimRed: THREE.SpotLight;
  rimBlue: THREE.SpotLight;
}

const FONT = '900 {S}px Impact, "Arial Black", sans-serif';
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
  g.lineWidth = r * 0.07;
  g.strokeStyle = '#ffffff';
  g.stroke();
  hexPath(g, cx, cy, r * 0.84);
  g.lineWidth = r * 0.03;
  g.strokeStyle = '#ff3b3b';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = font(Math.round(r * 0.78));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('WRC', cx, cy + r * 0.02);
  g.fillStyle = '#ffb030';
  g.fillRect(cx - r * 0.5, cy + r * 0.46, r * 1.0, r * 0.06);
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
  grad.addColorStop(0, '#1b2230');
  grad.addColorStop(1, '#10141d');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1800; i++) {
    g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.lineWidth = Math.random() * 1.5;
    const x = Math.random() * S;
    const y = Math.random() * S;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120);
    g.stroke();
  }
  g.strokeStyle = 'rgba(120,160,255,0.07)';
  g.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    g.beginPath();
    g.moveTo((i * S) / 16, 0);
    g.lineTo((i * S) / 16, S);
    g.moveTo(0, (i * S) / 16);
    g.lineTo(S, (i * S) / 16);
    g.stroke();
  }
  g.fillStyle = '#c4161c';
  g.fillRect(0, 0, S, 46);
  g.fillRect(0, S - 46, S, 46);
  g.fillStyle = '#1b5cff';
  g.fillRect(0, 0, 46, S);
  g.fillRect(S - 46, 0, 46, S);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.strokeRect(70, 70, S - 140, S - 140);
  g.beginPath();
  g.arc(S / 2, S / 2, 330, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 8;
  g.stroke();
  g.beginPath();
  g.arc(S / 2, S / 2, 300, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,170,40,0.7)';
  g.lineWidth = 3;
  g.stroke();
  // centre: WRC emblem + championship name
  wrcEmblem(g, S / 2, S / 2 - 40, 190);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = font(46);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('WORLD ROBOT', S / 2, S / 2 + 190);
  g.fillStyle = 'rgba(255,170,40,0.95)';
  g.fillText('CHAMPIONSHIP', S / 2, S / 2 + 240);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 8; i++) g.fillRect(100 + i * 24, 100, 10, 60);
  return toTex(c);
}

/** one long LED / apron strip: [emblem] WORLD ROBOT CHAMPIONSHIP · STEEL TITANS … repeated */
function stripTexture(dark: boolean) {
  const W = 2048;
  const Hh = 128;
  const { c, g } = canvas(W, Hh);
  g.fillStyle = dark ? '#0b0f1c' : '#05070d';
  g.fillRect(0, 0, W, Hh);
  // diagonal accent bars
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? 'rgba(28,86,255,0.55)' : 'rgba(208,24,34,0.6)';
    g.beginPath();
    g.moveTo(i * 340, 0);
    g.lineTo(i * 340 + 60, 0);
    g.lineTo(i * 340 + 20, Hh);
    g.lineTo(i * 340 - 40, Hh);
    g.closePath();
    g.fill();
  }
  const seg = W / 2;
  for (let s = 0; s < 2; s++) {
    const x0 = s * seg;
    wrcEmblem(g, x0 + 90, Hh / 2, 50);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = font(58);
    g.fillStyle = '#ffffff';
    g.fillText('WORLD ROBOT CHAMPIONSHIP', x0 + 170, Hh / 2 + 2);
    g.fillStyle = '#ffb030';
    g.fillText('· STEEL TITANS ·', x0 + 170 + 700, Hh / 2 + 2);
  }
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < Hh; y += 4) g.fillRect(0, y, W, 1);
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
  g.fillStyle = 'rgba(208,24,34,0.85)';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(260, 0);
  g.lineTo(120, Hh);
  g.lineTo(0, Hh);
  g.fill();
  g.fillStyle = 'rgba(28,86,255,0.85)';
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
  g.fillStyle = '#ffb030';
  g.fillText('CHAMPIONSHIP', 520, Hh / 2 + 30);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '700 34px Arial, sans-serif';
  g.fillText('STEEL TITANS · WORLD FINALS', 524, Hh / 2 + 120);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
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
    g.strokeStyle = `rgba(120,150,255,${0.05 + (r % 68 === 26 ? 0.05 : 0)})`;
    g.lineWidth = 2;
    g.stroke();
  }
  // bold ring with lettering
  g.beginPath();
  g.arc(S / 2, S / 2, 460, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(208,24,34,0.75)';
  g.lineWidth = 22;
  g.stroke();
  g.beginPath();
  g.arc(S / 2, S / 2, 430, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(28,86,255,0.75)';
  g.lineWidth = 14;
  g.stroke();
  g.font = font(34);
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.78)';
  arcText(g, 'WORLD ROBOT CHAMPIONSHIP  ·  WRC  ·  STEEL TITANS  ·  ', S / 2, S / 2, 392, -Math.PI * 0.5);
  arcText(g, 'WORLD ROBOT CHAMPIONSHIP  ·  WRC  ·  STEEL TITANS  ·  ', S / 2, S / 2, 392, Math.PI * 0.5 + 0.06);
  return toTex(c, 4);
}

export function buildArena(scene: THREE.Scene): Arena {
  scene.background = new THREE.Color(0x04050a);
  scene.fog = new THREE.FogExp2(0x05060c, 0.0062);

  // ---------- lights ----------
  scene.add(new THREE.AmbientLight(0x8fa2d8, 0.25));
  scene.add(new THREE.HemisphereLight(0x7f99ff, 0x30182a, 0.35));
  const key = new THREE.DirectionalLight(0xfff2e0, 1.5);
  key.position.set(10, 38, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -26;
  sc.right = 26;
  sc.top = 26;
  sc.bottom = -26;
  sc.near = 10;
  sc.far = 100;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  scene.add(key.target);

  const mkRim = (color: number, x: number, z: number) => {
    const s = new THREE.SpotLight(color, 5, 0, 1.05, 0.7, 0);
    s.position.set(x, 22, z);
    s.target.position.set(0, 2, 0);
    scene.add(s, s.target);
    return s;
  };
  const rimRed = mkRim(0xff3322, -20, -28);
  const rimBlue = mkRim(0x2f7cff, 20, 28);
  const rimSide = mkRim(0xb040ff, 30, -12);
  rimSide.intensity = 2;

  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.CircleGeometry(150, 64), new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 0.55, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  floor.receiveShadow = true;
  scene.add(floor);
  const decal = new THREE.Mesh(new THREE.CircleGeometry(31, 96), new THREE.MeshStandardMaterial({ map: floorDecalTexture(), roughness: 0.55, metalness: 0.35 }));
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = -1.39;
  decal.receiveShadow = true;
  scene.add(decal);

  // ---------- ring ----------
  const ringTex = ringTexture();
  const topMat = new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.55, metalness: 0.35 });
  const apronTex = stripTexture(true);
  apronTex.repeat.set(1, 1);
  const apronMat = new THREE.MeshStandardMaterial({ map: apronTex, emissiveMap: apronTex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.3 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.6, metalness: 0.6 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(31, 1.4, 31), [apronMat, apronMat, topMat, baseMat, apronMat, apronMat]);
  platform.position.y = -0.7;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);

  const neonRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(0.95) });
  const neonBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a6aff).multiplyScalar(0.95) });
  const mkStrip = (w: number, d: number, x: number, z: number, m: THREE.Material, y = -0.05) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), m);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };
  mkStrip(31.1, 0.14, 0, 15.5, neonBlue);
  mkStrip(31.1, 0.14, 0, -15.5, neonRed);
  mkStrip(0.14, 31.1, 15.5, 0, neonBlue);
  mkStrip(0.14, 31.1, -15.5, 0, neonRed);

  // posts + ropes
  const post = new THREE.MeshStandardMaterial({ color: 0x20232b, metalness: 0.9, roughness: 0.35 });
  const H = 13.6;
  const ropeYs = [1.5, 2.7, 3.9];
  const padMats = [0xd01822, 0x1c56ff];
  const corners: [number, number][] = [
    [H, H],
    [-H, H],
    [H, -H],
    [-H, -H],
  ];
  corners.forEach(([x, z], i) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 5.4, 12), post);
    p.position.set(x, 2.7, z);
    p.castShadow = true;
    scene.add(p);
    const padM = new THREE.MeshStandardMaterial({ color: padMats[i % 2], roughness: 0.6, metalness: 0.1 });
    for (const y of ropeYs) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.95), padM);
      pad.position.set(x, y, z);
      pad.castShadow = true;
      scene.add(pad);
    }
  });
  const ropeColors = [0xe5242c, 0xf2f2f2, 0x2a64ff];
  // sides: 0:+z 1:-z 2:+x 3:-x. Each rope is a finely segmented tube that bends around the contact point.
  const ROPE_SEG = 56;
  const ropeLen = H * 2;
  const nSign = [1, -1, 1, -1]; // outward direction in the rope group's local z
  const ropeW = [0.8, 1, 0.78]; // lower / middle / upper rope follow the contact by different amounts
  interface RopeMesh {
    geo: THREE.BufferGeometry;
    base: Float32Array;
    w: number;
  }
  const ropeSides: RopeMesh[][] = [[], [], [], []];
  const ropeS = [0, 1, 2, 3].map(() => ({ x: 0, v: 0, u: 0, press: 0, active: false }));
  ropeYs.forEach((y, k) => {
    const mat = new THREE.MeshStandardMaterial({ color: ropeColors[k], roughness: 0.5, metalness: 0.2, emissive: ropeColors[k], emissiveIntensity: 0.06 });
    const mk = (side: number, rx: number, rz: number, rotY: number) => {
      const geo = new THREE.CylinderGeometry(0.12, 0.12, ropeLen, 10, ROPE_SEG, false);
      geo.rotateZ(Math.PI / 2); // length along local X
      const r = new THREE.Mesh(geo, mat);
      r.castShadow = true;
      r.frustumCulled = false;
      const g = new THREE.Group();
      g.add(r);
      g.position.set(rx, y, rz);
      g.rotation.y = rotY;
      scene.add(g);
      ropeSides[side].push({ geo, base: (geo.attributes.position.array as Float32Array).slice(), w: ropeW[k] });
    };
    mk(0, 0, H, 0);
    mk(1, 0, -H, 0);
    mk(2, H, 0, Math.PI / 2);
    mk(3, -H, 0, Math.PI / 2);
  });
  const sideOf = (x: number, z: number) => (Math.abs(x) > Math.abs(z) ? (x > 0 ? 2 : 3) : z > 0 ? 0 : 1);
  const alongOf = (side: number, x: number, z: number) => (side < 2 ? x : -z); // local X of that rope group
  const ropeHit = (x: number, z: number, strength: number) => {
    const sd = sideOf(x, z);
    const st = ropeS[sd];
    st.u = alongOf(sd, x, z);
    st.v += Math.min(5, strength) * 5.5;
    st.active = true;
  };
  const ropePress = (x: number, z: number, depth: number) => {
    const sd = sideOf(x, z);
    const st = ropeS[sd];
    st.u += (alongOf(sd, x, z) - st.u) * 0.5;
    st.press = Math.max(st.press, depth);
    st.active = true;
  };
  const updateRopes = (dt: number) => {
    for (let sd = 0; sd < 4; sd++) {
      const st = ropeS[sd];
      if (!st.active) continue;
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
      const amp = st.x;
      const still = Math.abs(amp) < 0.002 && Math.abs(st.v) < 0.02;
      for (const rm of ropeSides[sd]) {
        const pos = rm.geo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const px = rm.base[i];
          let d = 0;
          if (!still) {
            const du = (px - st.u) / 4.8;
            const taper = Math.max(0, 1 - (px / H) * (px / H)); // anchored at the corner posts
            d = amp * rm.w * Math.exp(-du * du) * taper;
          }
          arr[i + 1] = rm.base[i + 1] - Math.abs(d) * 0.12;
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
  const ledTex = stripTexture(false);
  ledTex.repeat.set(-6, 1); // negative: the strip is seen from inside the cylinder
  const led = new THREE.Mesh(new THREE.CylinderGeometry(26.5, 26.5, 1.8, 96, 1, true), new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.BackSide, color: new THREE.Color(0.85, 0.85, 0.85) }));
  led.position.y = -0.5;
  scene.add(led);
  const ledRim = new THREE.Mesh(new THREE.TorusGeometry(26.55, 0.08, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6f9bff).multiplyScalar(0.8) }));
  ledRim.rotation.x = Math.PI / 2;
  ledRim.position.y = 0.42;
  scene.add(ledRim);

  // ---------- stands: stepped rows of seats with aisles ----------
  const tiers = 4;
  const rowsPer = 3;
  const rowW = 2.0;
  const rIn = (k: number) => 32 + k * 6.5;
  const rowInner = (k: number, r: number) => rIn(k) + r * rowW;
  const rowH = (k: number, r: number) => 0.4 + (k * rowsPer + r + 1) * 0.85;
  const prof: THREE.Vector2[] = [new THREE.Vector2(rIn(0), -1.4)];
  for (let k = 0; k < tiers; k++) {
    for (let r = 0; r < rowsPer; r++) {
      prof.push(new THREE.Vector2(rowInner(k, r), rowH(k, r)), new THREE.Vector2(rowInner(k, r) + rowW, rowH(k, r)));
    }
  }
  prof.push(new THREE.Vector2(rowInner(tiers - 1, rowsPer - 1) + rowW, -1.4));
  const stands = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.MeshStandardMaterial({ color: 0x151822, roughness: 0.9, metalness: 0.2, side: THREE.DoubleSide }));
  stands.receiveShadow = true;
  scene.add(stands);

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
        const x = Math.cos(a) * rs;
        const z = Math.sin(a) * rs;
        spots.push({ x, y: rowH(k, r), z, yaw: Math.atan2(-x, -z), empty: Math.random() < 0.15 });
      }
    }
  }
  const crowd = buildCrowd(scene, spots, 120);
  // corner pyro towers, TV cameras, stand lights, wall fins, flags and the OFFICIAL JUDGES' desks
  const props = buildProps(scene);
  const ORIGIN = new THREE.Vector3(0, 3.4, 0);

  // ---------- the hall: walls, roof, WRC banners ----------
  const wallTex = wallTexture();
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(-1, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(64, 64, 44, 96, 1, true), new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, color: new THREE.Color(0.85, 0.85, 0.9) }));
  wall.position.y = 20.6;
  scene.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(64, 14, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x090b12, side: THREE.BackSide }));
  roof.position.y = 49.6;
  scene.add(roof);
  const roofRim = new THREE.Mesh(new THREE.TorusGeometry(62.5, 0.5, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9db6ff).multiplyScalar(0.7) }));
  roofRim.rotation.x = Math.PI / 2;
  roofRim.position.y = 42;
  scene.add(roofRim);

  const bannerMat = new THREE.MeshBasicMaterial({ map: bannerTexture(), color: new THREE.Color(0.9, 0.9, 0.9) });
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
  const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdbe6ff).multiplyScalar(1.1) }), 40);
  const dm = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    dm.position.set(Math.cos(a) * 40, 33.2, Math.sin(a) * 40);
    dm.updateMatrix();
    lamps.setMatrixAt(i, dm.matrix);
  }
  scene.add(lamps);

  const beamColors = [0xffffff, 0xff2a3a, 0x2f7cff, 0xc040ff, 0xffffff, 0xffa020, 0x2f7cff, 0xff2a3a];
  const beams: { g: THREE.Group; mat: THREE.MeshBasicMaterial; ph: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * 18, 26.6, Math.sin(a) * 18);
    const len = 36;
    const geo = new THREE.ConeGeometry(3.4, len, 24, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(beamColors[i]),
      transparent: true,
      opacity: 0.012,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    g.add(new THREE.Mesh(geo, mat));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(beamColors[i]).multiplyScalar(3) }));
    g.add(lamp);
    scene.add(g);
    beams.push({ g, mat, ph: i * 0.9 });
  }

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
  const scrMat = new THREE.MeshBasicMaterial({ map: sTex, color: new THREE.Color(1.0, 1.0, 1.0) });
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

  // ---------- arena pillars with neon ----------
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    if (i % 3 === 1) continue; // the corner pyro towers (arenaProps.ts) stand where these four pillars used to be
    const pm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 24, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0x2f7cff : 0xff2a3a).multiplyScalar(1.1) }));
    pm.position.set(Math.cos(a) * 29, 11, Math.sin(a) * 29);
    scene.add(pm);
  }

  let smoothHype = 0;
  let frame = 0;
  const update = (t: number, dt: number, hype: number, focus?: THREE.Vector3) => {
    smoothHype += (hype - smoothHype) * (1 - Math.exp(-3 * dt));
    updateRopes(dt);
    frame++;
    if (frame % 2 === 1) crowd.update(t, smoothHype);
    props.update(t, dt, smoothHype, focus ?? ORIGIN);
    ledTex.offset.x = (ledTex.offset.x + dt * 0.012) % 1;
    beams.forEach((b, i) => {
      const a = t * 0.35 + b.ph;
      const r = 9 + Math.sin(t * 0.6 + i) * 6 + smoothHype * 4;
      b.g.lookAt(Math.cos(a) * r, 0, Math.sin(a * 1.3) * r);
      b.mat.opacity = 0.009 + smoothHype * 0.014 + (Math.sin(t * 2 + i) * 0.5 + 0.5) * 0.006;
    });
    jumbo.rotation.y = t * 0.12;
  };

  return { update, setScreen, ropeHit, ropePress, keyLight: key, rimRed, rimBlue, towers: props.towers };
}
