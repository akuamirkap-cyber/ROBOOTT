import type * as THREE from 'three';

/** render layer of everything the glossy CANVAS mirrors (the Titans, the ropes, the neon, the screens) — layer 0 is the normal scene */
export const REFLECT_LAYER = 2;
/** the lights-only layer the HALL FLOOR mirrors (columns, pylons, screens, LED lines — not the fighters) */
export const REFLECT_LIGHTS_LAYER = 3;

/** put an object (and everything under it) on the mirror layer(s) as well as the normal one */
export function markReflect(o: THREE.Object3D, lights = false) {
  o.traverse((c) => {
    c.layers.enable(REFLECT_LAYER);
    if (lights) c.layers.enable(REFLECT_LIGHTS_LAYER);
  });
}
