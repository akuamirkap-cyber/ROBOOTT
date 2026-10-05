import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * THE GRADE — one cheap full-screen pass between the scene and the tone mapper.
 *
 * It is what turns a flat real-time render into a broadcast picture: a filmic contrast curve that keeps the
 * highlights rolling off instead of clipping, a proper VIBRANCE stage (the saturation boost works hardest on the
 * muted colours and eases off on the ones that are already rich, so reds and blues get deep instead of neon),
 * highlight desaturation so blown-out lamps never turn into flat patches of colour, a warm/cool split-tone, a
 * soft lens vignette, the faintest film grain — and, because MSAA is expensive on a half-float HDR target, a
 * compact FXAA at the very top of the chain (the cheapest anti-aliasing that still kills the stair-steps on the
 * truss, the ropes and the neon edges).
 *
 * Everything stays in LINEAR HDR — the ACES/Neutral tone map in the OutputPass does the rest.
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    res: { value: new THREE.Vector2(1920, 1080) },
    vignette: { value: 0.5 },
    sat: { value: 1.3 },
    grain: { value: 0.013 },
    contrast: { value: 0.36 },
    exposure: { value: 1.06 },
    tones: { value: 1.0 },
    ca: { value: 0.0022 },
    aa: { value: 1.0 },
    warmth: { value: 0.5 },
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
    uniform float contrast;
    uniform float exposure;
    uniform float tones;
    uniform float ca;
    uniform float aa;
    uniform float warmth;
    varying vec2 vUv;

    const vec3 LUMA = vec3( 0.2126, 0.7152, 0.0722 );

    float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }

    // --- compact FXAA (luma edge detection + directional blur): the whole frame is HDR-linear here, so it runs
    // on the log-ish luma of the colour and blends along the detected edge only
    vec3 fxaa( vec2 uv, vec2 rcp ) {
      vec3 m  = texture2D( tDiffuse, uv ).rgb;
      vec3 nw = texture2D( tDiffuse, uv + vec2( -1.0, -1.0 ) * rcp ).rgb;
      vec3 ne = texture2D( tDiffuse, uv + vec2(  1.0, -1.0 ) * rcp ).rgb;
      vec3 sw = texture2D( tDiffuse, uv + vec2( -1.0,  1.0 ) * rcp ).rgb;
      vec3 se = texture2D( tDiffuse, uv + vec2(  1.0,  1.0 ) * rcp ).rgb;
      float lm  = dot( m,  LUMA );
      float lnw = dot( nw, LUMA );
      float lne = dot( ne, LUMA );
      float lsw = dot( sw, LUMA );
      float lse = dot( se, LUMA );
      float lMin = min( lm, min( min( lnw, lne ), min( lsw, lse ) ) );
      float lMax = max( lm, max( max( lnw, lne ), max( lsw, lse ) ) );
      // a soft threshold: no work at all on flat areas (the neon streaks and the crowd are full of them)
      if ( lMax - lMin < 0.055 * ( 0.25 + lMax ) ) return m;
      vec2 dir = vec2( -( ( lnw + lne ) - ( lsw + lse ) ), ( ( lnw + lsw ) - ( lne + lse ) ) );
      float reduce = max( ( lnw + lne + lsw + lse ) * 0.25 * 0.03125, 0.0078125 );
      float rcpMin = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + reduce );
      dir = clamp( dir * rcpMin, -8.0, 8.0 ) * rcp;
      vec3 a = 0.5 * ( texture2D( tDiffuse, uv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb + texture2D( tDiffuse, uv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
      vec3 b = a * 0.5 + 0.25 * ( texture2D( tDiffuse, uv - dir * 0.5 ).rgb + texture2D( tDiffuse, uv + dir * 0.5 ).rgb );
      float lb = dot( b, LUMA );
      return ( lb < lMin || lb > lMax ) ? a : b;
    }

    void main() {
      vec2 rcp = 1.0 / res;

      // ---------- 1 · anti-aliasing + a whisper of chromatic aberration ----------
      vec3 c0 = texture2D( tDiffuse, vUv ).rgb;
      vec3 col = aa > 0.001 ? mix( c0, fxaa( vUv, rcp ), 0.85 * aa ) : c0;
      vec2 q = ( vUv - 0.5 ) * vec2( 1.0, res.y / res.x * 1.3 );
      float q2 = dot( q, q );
      if ( ca > 0.0 ) {
        // the fringe lives in the corners: R is pulled out, B pulled in, both riding on top of the AA'd base
        vec2 off = ( vUv - 0.5 ) * ca * ( 0.3 + q2 * 2.4 );
        col.r += texture2D( tDiffuse, vUv + off ).r - c0.r;
        col.b += texture2D( tDiffuse, vUv - off ).b - c0.b;
      }
      col = max( col, 0.0 );

      // ---------- 2 · exposure ----------
      col *= exposure;

      // ---------- 3 · filmic contrast on the LUMA only (hue and saturation never shift with contrast) ----------
      // The S-curve reshapes the 0..1 range — crushed blacks, crisp mids, a clean shoulder — while everything
      // ABOVE 1 passes straight through: the lamps, the screens and the sparks keep their full HDR range, which is
      // exactly what the tone mapper and the bloom pass are there to spend.
      float l = dot( col, LUMA );
      float ln = clamp( l, 0.0, 1.0 );
      float sc = ln * ln * ( 3.0 - 2.0 * ln );
      float lc = mix( ln, sc, contrast ) + max( l - 1.0, 0.0 );
      col *= lc / max( l, 1e-4 );

      // ---------- 4 · vibrance + saturation ----------
      l = dot( col, LUMA );
      vec3 d = col - vec3( l );
      float chroma = length( d ) / max( l, 1e-3 );
      col = vec3( l ) + d * mix( sat, 1.0, smoothstep( 0.22, 1.5, chroma ) );
      // a whisper of extra punch in the darks so the black chassis keeps its colour in the shadow side
      col = vec3( l ) + ( col - vec3( l ) ) * mix( 1.16, 1.0, smoothstep( 0.05, 0.5, l ) );

      // ---------- 5 · highlight desaturation (blown lamps stay white-hot instead of pink) ----------
      l = dot( col, LUMA );
      col = mix( col, vec3( l ), smoothstep( 1.15, 3.4, l ) * 0.6 );

      // ---------- 6 · the broadcast split-tone: cooler toe, warmer top ----------
      l = dot( col, LUMA );
      col = mix( col, col * vec3( 0.94, 0.98, 1.09 ), smoothstep( 0.35, 0.0, l ) * 0.5 );
      col = mix( col, col * vec3( 1.06, 1.015, 0.95 ), smoothstep( 0.5, 1.7, l ) * 0.55 * tones );
      col *= vec3( 1.0 + 0.03 * warmth, 1.0 + 0.008 * warmth, 1.0 - 0.028 * warmth );

      // ---------- 7 · a touch of cinematic roll-off in the mids (the "film" curve) ----------
      col = pow( col, vec3( 1.0 / 1.035 ) );

      // ---------- 8 · soft lens vignette ----------
      float v = 1.0 - smoothstep( 0.3, 1.06, length( q ) * 1.32 );
      col *= mix( 1.0 - vignette, 1.0, v );

      // ---------- 9 · film grain ----------
      float n = hash( vUv * res + fract( time * 7.31 ) ) - 0.5;
      col += n * grain * ( 0.22 + min( l, 1.2 ) );

      gl_FragColor = vec4( col, 1.0 );
    }`,
};

export function makeGradePass() {
  return new ShaderPass(GradeShader);
}
