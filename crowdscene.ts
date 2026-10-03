import * as THREE from 'three';
import { buildCrowd, type Spot } from './src/game/crowd';

/** a small stand of seats, so the crowd can be rendered offline and inspected */
export function makeCrowd(): THREE.Scene {
  const scene = new THREE.Scene();
  const spots: Spot[] = [];
  const R0 = 30;
  for (let row = 0; row < 6; row++) {
    const r = R0 + row * 2.2;
    const y = row * 1.05;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (-0.42 + (i / (n - 1)) * 0.84) * Math.PI * 0.5;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      spots.push({ x, y, z, yaw: a, empty: Math.random() < 0.06 });
    }
  }
  const crowd = buildCrowd(scene, spots, 30);
  crowd.update(4.2, 0.55);
  return scene;
}
