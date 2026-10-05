import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { REFLECT_LAYER } from './layers';

/**
 * THE GLOSSY FLOOR — a real planar reflection (the Tekken arena look: the Titans and the neon mirrored in the
 * polished canvas and the hall floor). It is laid additively over the normal floor material, so the floor keeps
 * its texture and the reflection reads as a sheen: strong at grazing angles (Fresnel), soft when looked at from
 * above. The mirror camera renders ONLY the reflect layer (robots, pylons, screens, ropes) at a reduced
 * resolution, so the cost stays a fraction of the main pass.
 */
const SHEEN_SHADER = {
  name: 'FloorSheen',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    strength: { value: 0.6 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vViewDir;
    varying vec3 vNormalW;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4( position, 1.0 );
      vec4 wp = modelMatrix * vec4( position, 1.0 );
      vViewDir = normalize( cameraPosition - wp.xyz );
      vNormalW = normalize( mat3( modelMatrix ) * normal );
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec4 vUv;
    varying vec3 vViewDir;
    varying vec3 vNormalW;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec4 base = texture2DProj( tDiffuse, vUv );
      float cosT = clamp( dot( normalize( vViewDir ), normalize( vNormalW ) ), 0.0, 1.0 );
      float fres = pow( 1.0 - cosT, 1.6 );
      float k = strength * ( 0.28 + 0.72 * fres );
      gl_FragColor = vec4( base.rgb * color * k, 1.0 );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export interface Sheen {
  mesh: Reflector;
  setEnabled(on: boolean): void;
}

export function buildSheen(geometry: THREE.BufferGeometry, opts: { strength: number; tint?: number; res?: number; layer?: number }): Sheen {
  const layer = opts.layer ?? REFLECT_LAYER;
  const res = opts.res ?? 640;
  const mirror = new Reflector(geometry, {
    clipBias: 0.004,
    textureWidth: res,
    textureHeight: res,
    color: new THREE.Color(opts.tint ?? 0xffffff),
    shader: SHEEN_SHADER,
    multisample: 0,
  });
  const mat = mirror.material as THREE.ShaderMaterial;
  mat.uniforms.strength.value = opts.strength;
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  mat.fog = false;
  mirror.renderOrder = 1;
  // the mirror camera sees only the reflect layer — the Titans and the lights, not the crowd / hall / props
  const getCam = mirror.getReflectionCamera.bind(mirror);
  mirror.getReflectionCamera = (camera: THREE.Camera) => {
    const rc = getCam(camera);
    rc.layers.set(layer);
    return rc;
  };
  // no background in the reflection: the sheen is purely what the lights and the fighters put into the floor
  const before = mirror.onBeforeRender;
  mirror.onBeforeRender = function (this: Reflector, renderer, scene, camera, geo, material, group) {
    const bg = scene.background;
    scene.background = null;
    before.call(this, renderer, scene, camera, geo, material, group);
    scene.background = bg;
  };
  return {
    mesh: mirror,
    setEnabled(on: boolean) {
      mirror.visible = on;
    },
  };
}
