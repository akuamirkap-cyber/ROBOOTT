import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * THE GRADE — one cheap full-screen pass between the scene and the tone mapper: a soft lens vignette, a touch of
 * desaturation, a gentle filmic curve and the faintest film grain. It is what turns a flat real-time render into
 * a broadcast picture; everything stays in linear HDR, so the ACES tone map after it does the rest.
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    res: { value: new THREE.Vector2(1920, 1080) },
    vignette: { value: 0.52 },
    sat: { value: 1.18 },
    grain: { value: 0.014 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 res;
    uniform float vignette;
    uniform float sat;
    uniform float grain;
    varying vec2 vUv;
    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec4 c = texture2D( tDiffuse, vUv );
      vec3 col = max( c.rgb, 0.0 );
      float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
      // vibrance: the saturation boost works hardest on the muted colours and eases off on the ones that are
      // already rich, so the reds and blues get deep instead of clipping
      vec3 d = col - vec3( l );
      float chroma = length( d ) / max( l, 1e-3 );
      col = vec3( l ) + d * mix( sat, 1.0, smoothstep( 0.2, 1.4, chroma ) );
      // a gentle filmic lift of the mids; a cooler toe, a warmer top — the broadcast split-tone
      col = pow( col, vec3( 1.04 ) ) * 1.1;
      col = mix( col, col * vec3( 0.93, 0.97, 1.08 ), smoothstep( 0.35, 0.0, l ) * 0.5 );
      col = mix( col, col * vec3( 1.05, 1.01, 0.96 ), smoothstep( 0.5, 1.6, l ) * 0.6 );
      // lens vignette
      vec2 q = ( vUv - 0.5 ) * vec2( 1.0, res.y / res.x * 1.3 );
      float v = 1.0 - smoothstep( 0.25, 1.05, length( q ) * 1.35 );
      col *= mix( 1.0 - vignette, 1.0, v );
      // film grain
      float n = hash( vUv * res + fract( time * 7.31 ) ) - 0.5;
      col += n * grain * ( 0.25 + l );
      gl_FragColor = vec4( col, c.a );
    }`,
};

export function makeGradePass() {
  return new ShaderPass(GradeShader);
}
