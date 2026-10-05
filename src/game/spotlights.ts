import * as THREE from 'three';

/**
 * THE BROADCAST LIGHT RIG — proper stadium spotlights, the way a televised title fight is lit: eight warm-white
 * followspots on the inner truss pouring soft volumetric cones down onto the canvas (haze in the air, a pool of
 * light where each one lands, a glaring lens at the lamp), and four coloured moving heads on the outer rig that
 * sweep slowly and surge with the crowd. The cones are a view-dependent volumetric shader (soft silhouette,
 * fading along the throw) — not flat lines.
 */
export interface SpotRig {
  update(t: number, dt: number, hype: number, focus: THREE.Vector3): void;
  /** the two HERO FOLLOWSPOTS: feed them the fighters' feet every frame and they track them (ring walk included) */
  track(a: THREE.Vector3 | null, b: THREE.Vector3 | null): void;
  /** IMPACT STROBE: every lamp on the rig kicks for a beat on a heavy blow (0..1) */
  strobe(k: number): void;
}

const CONE_SHADER = {
  uniforms: {
    color: { value: new THREE.Color(0xffffff) },
    intensity: { value: 0.3 },
    anglePower: { value: 2.6 },
    apex: { value: new THREE.Vector3() },
    len: { value: 36 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      vN = normalize( mat3( modelMatrix ) * normal );
      vec4 wp = modelMatrix * vec4( position, 1.0 );
      vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float intensity;
    uniform float anglePower;
    uniform vec3 apex;
    uniform float len;
    varying vec3 vN;
    varying vec3 vW;
    void main() {
      float d = clamp( distance( vW, apex ) / len, 0.0, 1.0 );
      // bright and tight at the lamp, thinning out through the haze towards the canvas
      float fall = ( 1.0 - smoothstep( 0.0, 1.0, d ) ) * ( 0.3 + 0.7 * ( 1.0 - d ) ) + 0.06 * ( 1.0 - d );
      vec3 v = normalize( cameraPosition - vW );
      float edge = pow( abs( dot( normalize( vN ), v ) ), anglePower );
      float a = intensity * fall * edge;
      gl_FragColor = vec4( color * a, a );
    }`,
};

const WHITE = new THREE.Color(0xffffff);

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 4, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.62, 'rgba(255,255,255,0.22)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glareTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.14, 'rgba(255,255,255,0.92)');
  r.addColorStop(0.36, 'rgba(255,255,255,0.3)');
  r.addColorStop(0.7, 'rgba(255,255,255,0.07)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  // the horizontal streak of a lens
  const h = g.createLinearGradient(0, 64, 128, 64);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h;
  g.fillRect(0, 60, 128, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildSpotRig(scene: THREE.Scene): SpotRig {
  const pool = poolTexture();
  const glare = glareTexture();
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x15171d, metalness: 0.85, roughness: 0.4 });
  const yokeMat = new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.8, roughness: 0.5 });

  interface Lamp {
    g: THREE.Group; // the head (aimed with lookAt)
    cone: THREE.ShaderMaterial;
    lens: THREE.MeshBasicMaterial;
    glare: THREE.Sprite;
    pool: THREE.Mesh | null;
    base: number; // resting cone intensity
    col: THREE.Color;
    target: THREE.Vector3;
    ph: number;
    moving: boolean;
    track?: number; // index of the fighter this hero followspot is locked onto
    light?: THREE.SpotLight; // the real light of a hero followspot (the pool on the canvas, the highlight on the steel)
  }
  const lamps: Lamp[] = [];
  const trackTo: (THREE.Vector3 | null)[] = [null, null];
  const trackCur = [new THREE.Vector3(), new THREE.Vector3()];
  const trackOn = [false, false];
  let strobeK = 0;

  const mkLamp = (pos: THREE.Vector3, target: THREE.Vector3, color: number, len: number, spread: number, base: number, moving: boolean, ph: number) => {
    const col = new THREE.Color(color);
    const g = new THREE.Group();
    g.position.copy(pos);
    // the yoke hangs off the truss, the head swings in it
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.22), yokeMat);
    yoke.position.set(0, 0.9, 0);
    scene.add(yoke);
    yoke.position.add(pos);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.5, 16), housingMat);
    housing.rotation.x = Math.PI / 2;
    housing.position.z = -0.4;
    g.add(housing);
    const barn = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.58, 0.25, 16), housingMat);
    barn.rotation.x = Math.PI / 2;
    barn.position.z = 0.42;
    g.add(barn);
    const lens = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.1) });
    const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), lens);
    lensMesh.position.z = 0.56;
    g.add(lensMesh);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glare, color: col, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false }));
    gl.scale.setScalar(5.6);
    gl.position.z = 0.7;
    g.add(gl);
    // the volumetric cone: apex at the lens, opening to `spread` at the far end
    const geo = new THREE.CylinderGeometry(0.42, spread, len, 36, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(-Math.PI / 2);
    const cone = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CONE_SHADER.uniforms),
      vertexShader: CONE_SHADER.vertexShader,
      fragmentShader: CONE_SHADER.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    cone.uniforms.color.value = col;
    cone.uniforms.apex.value = pos.clone();
    cone.uniforms.len.value = len;
    cone.uniforms.intensity.value = base;
    const cm = new THREE.Mesh(geo, cone);
    cm.position.z = 0.6;
    cm.renderOrder = 2;
    g.add(cm);
    g.lookAt(target);
    scene.add(g);
    let poolMesh: THREE.Mesh | null = null;
    if (!moving) {
      // the pool of light where the cone lands on the canvas
      poolMesh = new THREE.Mesh(new THREE.CircleGeometry(spread * 1.35, 32), new THREE.MeshBasicMaterial({ map: pool, color: col, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      poolMesh.rotation.x = -Math.PI / 2;
      poolMesh.position.set(target.x, target.y + 0.035, target.z);
      poolMesh.renderOrder = 1;
      scene.add(poolMesh);
    }
    const lamp: Lamp = { g, cone, lens, glare: gl, pool: poolMesh, base, col, target: target.clone(), ph, moving };
    lamps.push(lamp);
    return lamp;
  };

  // eight warm followspots on the inner truss, each covering its own patch of the canvas
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const pos = new THREE.Vector3(Math.cos(a) * 18, 26.4, Math.sin(a) * 18);
    const tr = 4.6;
    const target = new THREE.Vector3(Math.cos(a) * tr, 0, Math.sin(a) * tr);
    const warm = i % 2 === 0 ? 0xfff1dc : 0xf4f6ff; // alternating warm / daylight heads, like a real rig
    mkLamp(pos, target, warm, 34, 5.0, 0.55, false, i * 0.7);
  }
  // six coloured moving heads on the outer rig: slow sweeps through the haze in the classic rig palette
  // (blue, red, magenta, cyan, amber, violet) — the colour that makes a stadium light show read as a show
  const HEAD_COLORS = [0x3f86ff, 0xff3a46, 0xff4dd2, 0x2fe6ff, 0xffb03a, 0x9a5bff];
  for (let i = 0; i < HEAD_COLORS.length; i++) {
    const a = (i / HEAD_COLORS.length) * Math.PI * 2 + Math.PI / 4 + 0.2;
    const pos = new THREE.Vector3(Math.cos(a) * 40, 33.0, Math.sin(a) * 40);
    mkLamp(pos, new THREE.Vector3(0, 0, 0), HEAD_COLORS[i], 58, 4.0, 0.34, true, i * 1.3);
  }

  // THE HERO FOLLOWSPOTS: two big warm-white followspots on the inner truss, one locked on each fighter, the way the
  // spot operators follow the boxers from the walk-in to the final bell. They are REAL lights (a hard pool of light
  // travelling with the fighter, a hot highlight on the steel) with a volumetric cone and a glaring lens above.
  for (let i = 0; i < 2; i++) {
    const pos = i === 0 ? new THREE.Vector3(-15.5, 26.8, -9.5) : new THREE.Vector3(15.5, 26.8, 9.5);
    const foot = i === 0 ? new THREE.Vector3(-3, 0, 0) : new THREE.Vector3(3, 0, 0);
    const lamp = mkLamp(pos, foot.clone().setY(3.2), 0xfff4e6, 40, 4.0, 0.62, false, 2.1 + i);
    lamp.track = i;
    const light = new THREE.SpotLight(0xfff4e6, 72, 100, 0.32, 0.5, 0.95);
    light.position.copy(pos);
    light.target.position.copy(foot).setY(3.2);
    scene.add(light, light.target);
    lamp.light = light;
    trackCur[i].copy(foot);
  }

  const tmp = new THREE.Vector3();
  const update = (t: number, dt: number, hype: number, focus: THREE.Vector3) => {
    strobeK = Math.max(0, strobeK - dt * 4.5);
    const st = strobeK * strobeK;
    for (const l of lamps) {
      if (l.track !== undefined) {
        // the operator follows with a little lag and a little overshoot — never a hard lock
        const i = l.track;
        const to = trackTo[i];
        if (to) {
          trackOn[i] = true;
          trackCur[i].lerp(to, 1 - Math.exp(-6 * dt));
        }
        const c = trackCur[i];
        tmp.set(c.x, c.y + 3.2, c.z);
        l.g.lookAt(tmp);
        l.cone.uniforms.intensity.value = l.base * (0.9 + hype * 0.25 + st * 0.9) * (trackOn[i] ? 1 : 0.35);
        if (l.pool) l.pool.position.set(c.x, c.y + 0.04, c.z);
        if (l.light) {
          l.light.target.position.copy(tmp);
          l.light.intensity = (trackOn[i] ? 72 : 0) + hype * 14 + st * 60;
        }
      } else if (l.moving) {
        // a slow figure-of-eight sweep round the action, tighter and brighter with the hype
        const sw = t * 0.28 + l.ph;
        const r = 7 + Math.sin(t * 0.37 + l.ph) * 4 + hype * 3;
        tmp.set(focus.x * 0.5 + Math.cos(sw) * r, 0, focus.z * 0.5 + Math.sin(sw * 1.3) * r);
        l.g.lookAt(tmp);
        l.cone.uniforms.intensity.value = l.base * (0.75 + hype * 0.7 + st * 1.4) + (Math.sin(t * 2.3 + l.ph) * 0.5 + 0.5) * 0.04;
        // on an impact the colour heads flick to white for a beat
        l.cone.uniforms.color.value.copy(l.col).lerp(WHITE, st * 0.8);
      } else {
        // the followspots hold their marks; only a faint breath of the haze moves
        l.cone.uniforms.intensity.value = l.base * (0.92 + Math.sin(t * 0.9 + l.ph) * 0.06 + hype * 0.18 + st * 0.7);
      }
      const k = 1.75 + hype * 0.6 + Math.sin(t * 3.7 + l.ph) * 0.1 + st * 1.8;
      l.lens.color.copy(l.col).multiplyScalar(k);
      (l.glare.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.72 + hype * 0.22 + st * 0.45);
    }
  };

  const track = (a: THREE.Vector3 | null, b: THREE.Vector3 | null) => {
    trackTo[0] = a;
    trackTo[1] = b;
  };
  const strobe = (k: number) => {
    strobeK = Math.max(strobeK, Math.min(1, k));
  };

  return { update, track, strobe };
}
