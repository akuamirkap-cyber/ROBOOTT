import * as THREE from 'three';

/**
 * THE HANGAR — the lobby set. A dark industrial bay well away from the arena: glossy concrete, a panelled back
 * wall with two tall light-wells, racks of crates, a red flood washing in from the left, a cool key from the
 * front-right, diagonal light bars overhead and a slow red haze. The hero robot stands in the middle of it.
 * Everything is cheap: a couple of dozen meshes, two lights, no shadows.
 */
export interface Hangar {
  g: THREE.Group;
  update(t: number): void;
  /** the live colour of the red flood (ULTRA pushes it crimson) */
  setMood(ultra: boolean): void;
  /** the VS-screen backdrop: a wall of red ink strokes behind the two fighters */
  setVsBackdrop(on: boolean): void;
}

export const HANGAR_POS = new THREE.Vector3(260, 0, 260);

function panelTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0f14';
  g.fillRect(0, 0, 1024, 512);
  // big steel panels with dark seams and a few rivets
  for (let y = 0; y < 512; y += 128) {
    for (let x = 0; x < 1024; x += 256) {
      const sh = 10 + Math.random() * 8;
      g.fillStyle = `rgb(${sh + 4},${sh + 5},${sh + 9})`;
      g.fillRect(x + 3, y + 3, 250, 122);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 3, y + 3, 250, 2);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x + 3, y + 122, 250, 3);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (const [rx, ry] of [
        [x + 12, y + 12],
        [x + 244, y + 12],
        [x + 12, y + 116],
        [x + 244, y + 116],
      ])
        g.fillRect(rx, ry, 3, 3);
    }
  }
  // grime streaks
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`;
    const x = Math.random() * 1024;
    g.fillRect(x, 0, 2 + Math.random() * 10, 512);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#111318';
  g.fillRect(0, 0, 1024, 1024);
  // concrete slabs
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 256, 0);
    g.lineTo(i * 256, 1024);
    g.moveTo(0, i * 256);
    g.lineTo(1024, i * 256);
    g.stroke();
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.045})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // hazard stripe lane
  g.save();
  g.translate(512, 940);
  for (let x = -520; x < 520; x += 48) {
    g.fillStyle = x % 96 === 0 ? 'rgba(255,190,40,0.55)' : 'rgba(10,10,12,0.9)';
    g.beginPath();
    g.moveTo(x, -10);
    g.lineTo(x + 24, -10);
    g.lineTo(x + 44, 10);
    g.lineTo(x + 20, 10);
    g.closePath();
    g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function hazeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** red ink brush strokes on a transparent canvas — the fighting-game VS backdrop */
function inkTexture() {
  const W = 1024;
  const H = 576;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const stroke = (x0: number, y0: number, x1: number, y1: number, w: number, a: number) => {
    const n = 26;
    let px = x0;
    let py = y0;
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const taper = Math.sin(u * Math.PI) ** 0.35;
      const x = x0 + (x1 - x0) * u + (rnd() - 0.5) * w * 0.5;
      const y = y0 + (y1 - y0) * u + (rnd() - 0.5) * w * 0.5;
      g.strokeStyle = `rgba(${200 + Math.floor(rnd() * 55)},${10 + Math.floor(rnd() * 30)},${30 + Math.floor(rnd() * 30)},${a * (0.55 + rnd() * 0.45)})`;
      g.lineWidth = w * taper * (0.7 + rnd() * 0.6);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(x, y);
      g.stroke();
      // dry-brush splits
      if (rnd() < 0.5) {
        g.lineWidth = w * 0.12;
        g.beginPath();
        g.moveTo(px + (rnd() - 0.5) * w, py + (rnd() - 0.5) * w);
        g.lineTo(x + (rnd() - 0.5) * w, y + (rnd() - 0.5) * w);
        g.stroke();
      }
      px = x;
      py = y;
    }
    // splatter off the end
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(220,20,40,${a * rnd() * 0.8})`;
      g.beginPath();
      g.arc(x1 + (rnd() - 0.5) * w * 2.5, y1 + (rnd() - 0.5) * w * 2.5, rnd() * w * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  };
  // two big crossing "kanji" clusters left and right of centre, a few long slashes
  stroke(60, 90, 420, 120, 70, 0.9);
  stroke(120, 40, 160, 520, 64, 0.85);
  stroke(40, 300, 440, 330, 58, 0.8);
  stroke(300, 60, 360, 540, 54, 0.75);
  stroke(600, 70, 980, 100, 72, 0.9);
  stroke(700, 30, 740, 520, 60, 0.85);
  stroke(580, 290, 1000, 320, 56, 0.8);
  stroke(880, 60, 930, 540, 50, 0.75);
  stroke(20, 470, 1000, 430, 46, 0.6);
  stroke(380, 20, 640, 560, 40, 0.55);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildHangar(scene: THREE.Scene): Hangar {
  const g = new THREE.Group();
  g.position.copy(HANGAR_POS);
  scene.add(g);

  const put = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };

  // ---- floor: glossy, dark, reflects the red flood and the light-wells
  const fTex = floorTexture();
  fTex.repeat.set(3, 3);
  const floor = put(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: fTex, color: 0xbfc3cc, roughness: 0.28, metalness: 0.55 }), 0, 0, 0, -Math.PI / 2);
  floor.receiveShadow = true;

  // ---- walls + ceiling: panelled steel
  const pTex = panelTexture();
  pTex.repeat.set(4, 2);
  const wallMat = new THREE.MeshStandardMaterial({ map: pTex, color: 0xcfd3dc, roughness: 0.6, metalness: 0.45 });
  put(new THREE.PlaneGeometry(90, 26), wallMat, 0, 13, -16); // back
  put(new THREE.PlaneGeometry(60, 26), wallMat, -30, 13, 8, 0, Math.PI / 2); // left
  put(new THREE.PlaneGeometry(60, 26), wallMat, 30, 13, 8, 0, -Math.PI / 2); // right
  put(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.9, metalness: 0.2 }), 0, 24, 8, Math.PI / 2); // ceiling

  // ---- two tall light-wells in the back wall (the bright windows of the reference) + their shafts
  const wellMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xeaf4ff).multiplyScalar(1.7) });
  const wellFrame = new THREE.MeshStandardMaterial({ color: 0x1a1d25, roughness: 0.5, metalness: 0.8 });
  for (const x of [-11.5, 13.5]) {
    put(new THREE.PlaneGeometry(5.2, 11), wellMat, x, 12.5, -15.9);
    put(new THREE.BoxGeometry(5.8, 11.6, 0.3), wellFrame, x, 12.5, -15.95);
    put(new THREE.BoxGeometry(5.8, 0.25, 0.3), wellFrame, x, 12.5, -15.7); // mullions
    put(new THREE.BoxGeometry(0.25, 11.6, 0.3), wellFrame, x, 12.5, -15.7);
    // the window light spilling in: a soft additive wedge angled down onto the floor
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 20), new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shaft.position.set(x, 8, -8);
    shaft.rotation.x = -0.62;
    g.add(shaft);
  }

  // ---- the red flood on the left: an emissive strip-light bank + the light itself
  const redBank = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1f36).multiplyScalar(1.02) });
  for (let i = 0; i < 4; i++) put(new THREE.BoxGeometry(0.25, 7.5, 0.9), redBank, -29.7, 6 + i * 0.0, -6 + i * 3.4);
  put(new THREE.BoxGeometry(0.3, 0.5, 18), redBank, -29.7, 15.5, -1);
  const red = new THREE.PointLight(0xff2232, 400, 60, 2);
  red.position.set(-12, 8, -2);
  g.add(red);

  // ---- key light for the hero: cool white from the front-right.
  // Dialled so the machine's lit side lands just under white: any hotter and the plating has no gradation left to
  // shade with, and the whole hero turns into a glare source (the lobby bloom threshold sits above this — Game.step)
  const key = new THREE.SpotLight(0xdfe9ff, 500, 60, 0.62, 0.65, 2);
  key.position.set(8, 14, 11);
  key.target.position.set(0, 5, 0);
  g.add(key, key.target);

  // ---- overhead diagonal light bars (the white streaks top-right of the reference)
  const barMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf4f8ff).multiplyScalar(1.12) });
  const barGlow = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const x = 9 + i * 4.2;
    const y = 15.5 - i * 1.3;
    put(new THREE.BoxGeometry(7, 0.22, 0.22), barMat, x, y, -9 + i * 1.5, 0, 0, -0.55);
    put(new THREE.PlaneGeometry(8.5, 1.6), barGlow, x, y, -9 + i * 1.5, 0, 0, -0.55);
  }
  // hanging work lamps along the ceiling
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe6c8).multiplyScalar(0.9) });
  const lampBody = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.5, metalness: 0.8 });
  for (const [x, z] of [
    [-16, -4],
    [-4, -11],
    [10, -3],
    [20, -10],
  ]) {
    put(new THREE.CylinderGeometry(0.9, 1.3, 0.8, 16, 1, true), lampBody, x, 20.4, z);
    put(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 16), lampMat, x, 20.0, z);
    put(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 6), lampBody, x, 22.5, z);
  }

  // ---- racks of crates (right side) and a few loose on the left
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x2b2a2f, roughness: 0.78, metalness: 0.25 });
  const crateDark = new THREE.MeshStandardMaterial({ color: 0x17181d, roughness: 0.7, metalness: 0.4 });
  const rackMat = new THREE.MeshStandardMaterial({ color: 0x3a1f22, roughness: 0.55, metalness: 0.7 });
  const crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), crateMat, 40);
  const dm = new THREE.Object3D();
  let n = 0;
  const seed = (i: number) => ((i * 9301 + 49297) % 233280) / 233280;
  for (let rack = 0; rack < 3; rack++) {
    const rx = 15 + rack * 5.5;
    // shelves
    for (let s = 0; s < 3; s++) put(new THREE.BoxGeometry(4.6, 0.14, 2.6), rackMat, rx, 0.08 + s * 3.2, -12);
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.2, 1.2]) put(new THREE.BoxGeometry(0.16, 9.8, 0.16), rackMat, rx + dx, 4.9, -12 + dz);
    for (let s = 0; s < 3; s++) {
      for (let k = 0; k < 3 && n < 40; k++) {
        const w = 0.9 + seed(n) * 0.8;
        const h = 0.8 + seed(n + 7) * 0.9;
        dm.position.set(rx - 1.4 + k * 1.4, 0.15 + s * 3.2 + h / 2, -12 + (seed(n + 3) - 0.5) * 0.8);
        dm.rotation.set(0, (seed(n + 11) - 0.5) * 0.3, 0);
        dm.scale.set(w, h, 0.9 + seed(n + 5) * 0.8);
        dm.updateMatrix();
        crates.setMatrixAt(n++, dm.matrix);
      }
    }
  }
  // loose stacks on the floor left/right
  for (const [x, z, s] of [
    [-19, -8, 1.6],
    [-20.4, -8.2, 1.2],
    [-17.6, -9.6, 1.1],
    [22, 2, 1.5],
    [23.6, 2.4, 1.1],
  ]) {
    if (n >= 40) break;
    dm.position.set(x, s / 2, z);
    dm.rotation.set(0, seed(n) * 0.8, 0);
    dm.scale.set(s, s, s);
    dm.updateMatrix();
    crates.setMatrixAt(n++, dm.matrix);
  }
  crates.count = n;
  crates.castShadow = false;
  g.add(crates);
  // a service bollard and a toolbox cart near the hero for scale
  put(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 10), crateDark, -6, 0.55, 3.5);
  put(new THREE.BoxGeometry(1.6, 1.1, 0.9), crateDark, 7.5, 0.55, 2.5, 0, 0.4);
  put(new THREE.BoxGeometry(1.5, 0.08, 0.8), new THREE.MeshBasicMaterial({ color: 0xff3b3b }), 7.5, 1.12, 2.5, 0, 0.4);

  // ---- the haze: a slow red/cool bloom behind the hero, additive, always facing the lobby camera
  const hzTex = hazeTexture();
  const hazeRed = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), new THREE.MeshBasicMaterial({ map: hzTex, color: new THREE.Color(0xff2a3a).multiplyScalar(0.33), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  hazeRed.position.set(-9, 9, -11);
  g.add(hazeRed);
  const hazeCool = new THREE.Mesh(new THREE.PlaneGeometry(26, 20), new THREE.MeshBasicMaterial({ map: hzTex, color: new THREE.Color(0x6fa8ff).multiplyScalar(0.16), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  hazeCool.position.set(12, 11, -12);
  g.add(hazeCool);
  // floor fog sheet
  const fogSheet = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: hzTex, color: new THREE.Color(0xff3040).multiplyScalar(0.12), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  fogSheet.rotation.x = -Math.PI / 2;
  fogSheet.position.set(-6, 0.25, -2);
  g.add(fogSheet);

  // ---- the VS backdrop: ink strokes on a dark wall just behind the two fighters, hidden until the VS screen
  const vsWall = new THREE.Mesh(new THREE.PlaneGeometry(44, 24.75), new THREE.MeshBasicMaterial({ color: 0x0a0b10 }));
  vsWall.position.set(0, 10, -9.2);
  vsWall.visible = false;
  g.add(vsWall);
  const vsInk = new THREE.Mesh(new THREE.PlaneGeometry(44, 24.75), new THREE.MeshBasicMaterial({ map: inkTexture(), transparent: true, depthWrite: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
  vsInk.position.set(0, 10, -9.1);
  vsInk.visible = false;
  g.add(vsInk);
  const vsGlow = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.MeshBasicMaterial({ map: hzTex, color: new THREE.Color(0xff1a3a).multiplyScalar(0.45), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  vsGlow.position.set(0, 7, -8.6);
  vsGlow.visible = false;
  g.add(vsGlow);

  const redBase = new THREE.Color(0xff2232);
  const redUltra = new THREE.Color(0xff0a22);
  let ultraMood = false;

  const update = (t: number) => {
    // the flood breathes, the haze drifts
    const b = 0.86 + Math.sin(t * 1.3) * 0.08 + Math.sin(t * 4.7) * 0.03;
    red.intensity = (ultraMood ? 520 : 400) * b;
    (hazeRed.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 0.7) * 0.1;
    hazeRed.position.x = -9 + Math.sin(t * 0.21) * 1.5;
    hazeCool.position.x = 12 + Math.cos(t * 0.17) * 1.2;
    (fogSheet.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 0.45) * 0.15;
    key.intensity = 500 + Math.sin(t * 7.3) * 7;
  };
  const setVsBackdrop = (on: boolean) => {
    vsWall.visible = on;
    vsInk.visible = on;
    vsGlow.visible = on;
  };
  const setMood = (ultra: boolean) => {
    ultraMood = ultra;
    red.color.copy(ultra ? redUltra : redBase);
    redBank.color.copy(ultra ? redUltra : redBase).multiplyScalar(1.4);
  };
  return { g, update, setMood, setVsBackdrop };
}
