import * as THREE from 'three';
import { markReflect } from './layers';

/**
 * THE SHOW — the broadcast-arena dressing around the ring: a wrap-around LED ribbon high on the hall wall, two
 * giant face screens (the fighters' live portraits, like the big boards of a title fight), eight light columns
 * in the two corner colours around the apron, chasing LED edges. All of it
 * is emissive (no extra lights): the bloom pass does the glow, so intensities stay modest and balanced.
 */
export interface Show {
  update(t: number, dt: number, hype: number): void;
  setFaces(left: { name: string; color: string; img: string | null }, right: { name: string; color: string; img: string | null }): void;
}

export function buildShow(scene: THREE.Scene, entryAngles: number[]): Show {
  // ---------- the LED ribbon ----------
  const rc = document.createElement('canvas');
  rc.width = 2048;
  rc.height = 192;
  const rg = rc.getContext('2d')!;
  const drawRibbon = () => {
    const grd = rg.createLinearGradient(0, 0, 2048, 0);
    grd.addColorStop(0, '#071029');
    grd.addColorStop(0.5, '#2a0810');
    grd.addColorStop(1, '#071029');
    rg.fillStyle = grd;
    rg.fillRect(0, 0, 2048, 192);
    rg.fillStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < 2048; x += 14) rg.fillRect(x, 0, 6, 192);
    rg.textAlign = 'left';
    rg.textBaseline = 'middle';
    rg.font = '800 112px "Barlow Condensed", Impact, sans-serif';
    const txt = 'STEEL TITANS   ◆   WRC WORLD ROBOT CHAMPIONSHIP   ◆   ';
    rg.fillStyle = '#ffffff';
    rg.fillText(txt, 20, 96);
    rg.fillStyle = '#c9a24a';
    rg.fillText('◆', 20 + rg.measureText('STEEL TITANS   ').width, 96);
    rg.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 192; y += 4) rg.fillRect(0, y, 2048, 1);
  };
  drawRibbon();
  const rTex = new THREE.CanvasTexture(rc);
  rTex.colorSpace = THREE.SRGBColorSpace;
  rTex.wrapS = THREE.RepeatWrapping;
  rTex.repeat.set(-5, 1);
  rTex.anisotropy = 8;
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(62.2, 62.2, 5.2, 96, 1, true), new THREE.MeshBasicMaterial({ map: rTex, side: THREE.BackSide, color: new THREE.Color(1.05, 1.05, 1.05) }));
  ribbon.position.y = 36.2;
  markReflect(ribbon, true);
  scene.add(ribbon);
  for (const y of [33.4, 39.0]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(62.1, 0.12, 6, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fd8ff).multiplyScalar(0.85) }));
    edge.rotation.x = Math.PI / 2;
    edge.position.y = y;
    scene.add(edge);
  }

  // ---------- the face screens ----------
  const fc = document.createElement('canvas');
  fc.width = 1536;
  fc.height = 864;
  const fg = fc.getContext('2d')!;
  const fTex = new THREE.CanvasTexture(fc);
  fTex.colorSpace = THREE.SRGBColorSpace;
  fTex.anisotropy = 8;
  const faces = { left: { name: 'ATOM', color: '#4da3ff', img: null as HTMLImageElement | null }, right: { name: 'SCRAP-9', color: '#ff6a4d', img: null as HTMLImageElement | null } };
  const drawFaces = () => {
    const W = 1536;
    const H = 864;
    const half = W / 2;
    const paint = (x0: number, side: typeof faces.left, flip: boolean) => {
      const g = fg;
      const grd = g.createLinearGradient(x0, 0, x0 + half, H);
      grd.addColorStop(0, '#05070e');
      grd.addColorStop(1, side.color + '55');
      g.fillStyle = grd;
      g.fillRect(x0, 0, half, H);
      // the glow behind the head
      const rad = g.createRadialGradient(x0 + half / 2, H * 0.42, 20, x0 + half / 2, H * 0.42, 420);
      rad.addColorStop(0, side.color + 'aa');
      rad.addColorStop(1, side.color + '00');
      g.fillStyle = rad;
      g.fillRect(x0, 0, half, H);
      if (side.img) {
        // the 3×4 bust fills the panel from the top, mirrored on the right so both machines look to centre
        const ih = H * 0.86;
        const iw = (ih * side.img.width) / side.img.height;
        g.save();
        if (flip) {
          g.translate(x0 + half, 0);
          g.scale(-1, 1);
          g.drawImage(side.img, half / 2 - iw / 2, 0, iw, ih);
        } else g.drawImage(side.img, x0 + half / 2 - iw / 2, 0, iw, ih);
        g.restore();
      }
      // name bar
      g.fillStyle = 'rgba(0,0,0,0.72)';
      g.fillRect(x0, H - 150, half, 150);
      g.fillStyle = side.color;
      g.fillRect(x0, H - 150, half, 8);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 108px "Barlow Condensed", Impact, sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(side.name.toUpperCase(), x0 + half / 2, H - 72);
    };
    paint(0, faces.left, false);
    paint(half, faces.right, true);
    // the VS seam
    fg.fillStyle = '#ffffff';
    fg.fillRect(half - 5, 0, 10, H);
    fg.font = '900 150px "Barlow Condensed", Impact, sans-serif';
    fg.textAlign = 'center';
    fg.textBaseline = 'middle';
    fg.lineWidth = 14;
    fg.strokeStyle = '#05070e';
    fg.strokeText('VS', half, H * 0.42);
    fg.fillStyle = '#e8ecf2';
    fg.fillText('VS', half, H * 0.42);
    // scan lines
    fg.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < H; y += 4) fg.fillRect(0, y, W, 1);
    fTex.needsUpdate = true;
  };
  drawFaces();
  const scrMat = new THREE.MeshBasicMaterial({ map: fTex, color: new THREE.Color(1.05, 1.05, 1.05) });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0b0d14, metalness: 0.8, roughness: 0.5 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fd8ff).multiplyScalar(1.45) });
  const SCR_R = 59.4;
  const SCR_Y = 22.4;
  const SCR_W = 40;
  const SCR_H = 22.5;
  for (let i = 0; i < 2; i++) {
    const a = 0.52 + Math.PI / 6 + i * Math.PI;
    const x = Math.cos(a) * SCR_R;
    const z = Math.sin(a) * SCR_R;
    const ry = Math.atan2(-x, -z);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), scrMat);
    scr.position.set(x, SCR_Y, z);
    scr.rotation.y = ry;
    markReflect(scr, true);
    scene.add(scr);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 1.4, SCR_H + 1.4, 0.8), frameMat);
    fr.position.set(x * 1.006, SCR_Y, z * 1.006);
    fr.rotation.y = ry;
    scene.add(fr);
    // the lit edge strips above and below the board, the truss legs down to the bowl
    for (const dy of [SCR_H / 2 + 0.9, -SCR_H / 2 - 0.9]) {
      const ed = new THREE.Mesh(new THREE.BoxGeometry(SCR_W + 1.6, 0.22, 0.3), edgeMat);
      ed.position.set(x * 0.998, SCR_Y + dy, z * 0.998);
      ed.rotation.y = ry;
      scene.add(ed);
    }
    const legGeo = new THREE.BoxGeometry(0.6, 12, 0.6);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      const lx = x + Math.cos(ry) * sx * (SCR_W / 2 - 1.5);
      const lz = z - Math.sin(ry) * sx * (SCR_W / 2 - 1.5);
      leg.position.set(lx, SCR_Y - SCR_H / 2 - 6, lz);
      scene.add(leg);
    }
  }

  // ---------- the soft glow sheet shared by every neon element ----------
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(255,255,255,0)');
    h.addColorStop(0.5, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.12, 'rgba(0,0,0,0)');
    v.addColorStop(0.9, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // ---------- THE LIGHT COLUMNS — eight giant blue / red pillars of light round the bowl (the Tekken arena look):
  // a hot core, a wide additive glow sheet, a beam that keeps going up into the roof and a hot spot on the floor
  const columns: { core: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; beam: THREE.MeshBasicMaterial; spot: THREE.MeshBasicMaterial; base: THREE.Color; ph: number }[] = [];
  const COL_H = 27;
  const COL_R = 29.4;
  const coreGeo = new THREE.BoxGeometry(1.3, COL_H, 1.3);
  const colGlowGeo = new THREE.PlaneGeometry(4.2, COL_H + 3);
  const beamGeo = new THREE.CylinderGeometry(0.35, 1.4, 16, 10, 1, true);
  const spotGeo = new THREE.CircleGeometry(5.2, 24);
  const spotTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const colFrame = new THREE.MeshStandardMaterial({ color: 0x0c0e14, metalness: 0.9, roughness: 0.45 });
  // the LED tower face: a hot white centre line falling off to dark edges (so the box reads as a lit cylinder),
  // panel seams every 2.2 m — not a flat painted stick
  const ledTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 1024;
    const g = c.getContext('2d')!;
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, '#1a1a22');
    h.addColorStop(0.3, '#8a8a95');
    h.addColorStop(0.5, '#ffffff');
    h.addColorStop(0.7, '#8a8a95');
    h.addColorStop(1, '#1a1a22');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 1024);
    g.fillStyle = 'rgba(0,0,0,0.75)';
    for (let y = 0; y < 1024; y += 84) g.fillRect(0, y, 64, 5);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    if (i % 3 === 1) continue; // the four corner pyro towers stand here
    const dEntry = Math.min(...entryAngles.map((ea) => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea)))));
    if (dEntry < 0.2) continue; // the entrance aisles stay clear
    const x = Math.cos(a) * COL_R;
    const z = Math.sin(a) * COL_R;
    const base = new THREE.Color(i % 2 ? 0x4f86e8 : 0xe03a44);
    const core = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(1.25), map: ledTex });
    const glow = new THREE.MeshBasicMaterial({ color: base, map: glowTex, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const spot = new THREE.MeshBasicMaterial({ color: base, map: spotTex, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.Group();
    g.position.set(x, -1.4, z);
    g.rotation.y = Math.atan2(-x, -z);
    const c = new THREE.Mesh(coreGeo, core);
    c.position.y = COL_H / 2;
    markReflect(c, true);
    g.add(c);
    for (const ry of [0, Math.PI / 2]) {
      const gl = new THREE.Mesh(colGlowGeo, glow);
      gl.position.y = COL_H / 2 + 0.5;
      gl.rotation.y = ry;
      g.add(gl);
    }
    const bm = new THREE.Mesh(beamGeo, beam);
    bm.position.y = COL_H + 8;
    g.add(bm);
    const sp = new THREE.Mesh(spotGeo, spot);
    sp.rotation.x = -Math.PI / 2;
    sp.position.y = 0.06;
    g.add(sp);
    // the steel housing: a plinth at the foot and rails up the back of the core
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 2.4), colFrame);
    plinth.position.y = 0.45;
    g.add(plinth);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, COL_H, 0.16), colFrame);
      rail.position.set(sx * 0.78, COL_H / 2, -0.75);
      g.add(rail);
    }
    scene.add(g);
    columns.push({ core, glow, beam, spot, base, ph: i * 0.9 });
  }

  // ---------- the LED rings in the hall floor (two chasing light lines round the apron) ----------
  const floorRings: { mat: THREE.MeshBasicMaterial; base: THREE.Color; ph: number }[] = [];
  for (const [r, w] of [
    [19.6, 0.16],
    [26.4, 0.22],
  ]) {
    for (let h = 0; h < 2; h++) {
      const blue = h === 0;
      const base = new THREE.Color(blue ? 0x4f86e8 : 0xe03a44);
      const mat = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(0.7) });
      // x + z > 0 is the blue half of the hall: the arc runs from −45° round through +135°
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r + w, 96, 1, -Math.PI / 4 + (blue ? 0 : Math.PI), Math.PI), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -1.37;
      markReflect(ring, true);
      scene.add(ring);
      floorRings.push({ mat, base, ph: h * 1.6 + r * 0.1 });
    }
  }

  let smooth = 0;
  const update = (t: number, dt: number, hype: number) => {
    smooth += (hype - smooth) * (1 - Math.exp(-3 * dt));
    rTex.offset.x = (rTex.offset.x + dt * 0.03) % 1;
    // the light columns breathe in two groups, blue then red, and surge with the crowd
    columns.forEach((c, i) => {
      const pulse = 0.8 + Math.max(0, Math.sin(t * 1.6 + c.ph)) * (0.3 + smooth * 0.45) + Math.sin(t * 9 + i) * 0.03;
      c.core.color.copy(c.base).multiplyScalar(pulse * 1.25);
      c.glow.opacity = 0.06 + pulse * 0.05;
      c.beam.opacity = 0.02 + pulse * 0.02;
      c.spot.opacity = 0.05 + pulse * 0.05;
    });
    // the floor LED lines chase round the apron
    floorRings.forEach((r) => {
      const pulse = 0.75 + Math.max(0, Math.sin(t * 3 + r.ph)) * (0.4 + smooth * 0.5);
      r.mat.color.copy(r.base).multiplyScalar(pulse * 0.9);
    });
    edgeMat.color.setHex(0x8fd8ff).multiplyScalar(0.6 + Math.sin(t * 2.4) * 0.1);
  };

  const setFaces: Show['setFaces'] = (left, right) => {
    faces.left.name = left.name;
    faces.left.color = left.color;
    faces.right.name = right.name;
    faces.right.color = right.color;
    const load = (side: typeof faces.left, url: string | null) => {
      if (!url) {
        side.img = null;
        drawFaces();
        return;
      }
      const im = new Image();
      im.onload = () => {
        side.img = im;
        drawFaces();
      };
      im.src = url;
    };
    load(faces.left, left.img);
    load(faces.right, right.img);
    drawFaces();
  };

  return { update, setFaces };
}
