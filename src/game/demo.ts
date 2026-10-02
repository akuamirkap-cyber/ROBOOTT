import * as THREE from 'three';

/**
 * ATTRACT MODE CAMERA — the main menu plays a looping gameplay reel.
 * A director cuts between hand-picked shots (hero low angle, orbit, crane, over-the-shoulder, tracking dolly,
 * head close-up). Each shot hard-cuts in and then moves slowly, and the action is framed on the RIGHT half of
 * the screen so it never sits behind the menu panel.
 */

export type ShotKind = 'heroLow' | 'orbit' | 'crane' | 'shoulder' | 'dolly' | 'face' | 'groundRush';

export interface Shot {
  kind: ShotKind;
  dur: number;
  side: number; // which fighter / which way round the shot is staged
  roll: number; // a slight dutch tilt
  fov: number;
}

const KINDS: ShotKind[] = ['heroLow', 'orbit', 'crane', 'shoulder', 'dolly', 'face', 'groundRush', 'orbit', 'heroLow', 'shoulder'];

export function nextShot(prev?: Shot): Shot {
  let kind = KINDS[Math.floor(Math.random() * KINDS.length)];
  if (prev && kind === prev.kind) kind = KINDS[Math.floor(Math.random() * KINDS.length)];
  const dur = kind === 'face' ? 2.2 + Math.random() * 1.0 : kind === 'groundRush' ? 2.0 + Math.random() * 0.8 : 2.8 + Math.random() * 1.8;
  return {
    kind,
    dur,
    side: Math.random() < 0.5 ? 1 : -1,
    roll: (Math.random() - 0.5) * (kind === 'face' || kind === 'groundRush' ? 0.1 : 0.05),
    fov: kind === 'face' ? 36 : kind === 'crane' ? 62 : kind === 'groundRush' ? 68 : 50,
  };
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * @param u   0..1 progress through the shot
 * @param a   the fighter the shot is built around
 * @param b   the other fighter
 * @param bias how far to push the subject to the right of frame (menu panel covers the left)
 */
export function shotCamera(shot: Shot, u: number, t: number, a: THREE.Vector3, b: THREE.Vector3, bias: number) {
  const mid = V().addVectors(a, b).multiplyScalar(0.5);
  // horizontal axis between the two fighters
  const dir = V().subVectors(b, a).setY(0);
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  const side = V(-0, 0, 0).set(dir.z, 0, -dir.x).multiplyScalar(shot.side); // perpendicular
  const pos = V();
  const look = V();

  switch (shot.kind) {
    case 'heroLow': {
      // low, close to the floor, looking up at the giants
      const d = 7.4 - u * 1.1;
      pos.copy(mid).addScaledVector(side, d * 0.75).addScaledVector(dir, -d * 0.5);
      pos.y = 1.0 + u * 0.5;
      look.copy(mid).setY(4.4);
      break;
    }
    case 'orbit': {
      // slow arc around the pair
      const ang = t * 0.42 * shot.side;
      const d = 10.5 - u * 1.6;
      pos.set(mid.x + Math.cos(ang) * d, 4.6 + Math.sin(t * 0.5) * 0.5, mid.z + Math.sin(ang) * d);
      look.copy(mid).setY(3.9);
      break;
    }
    case 'crane': {
      // high and wide, craning down into the ring
      const d = 15 - u * 3.5;
      const ang = t * 0.16 * shot.side + 0.7;
      pos.set(mid.x + Math.cos(ang) * d, 13.5 - u * 5.5, mid.z + Math.sin(ang) * d);
      look.copy(mid).setY(3.2);
      break;
    }
    case 'shoulder': {
      // behind one fighter, looking past his shoulder at the other
      const from = shot.side > 0 ? a : b;
      const to = shot.side > 0 ? b : a;
      const f = V().subVectors(to, from).setY(0).normalize();
      const s = V(0, 0, 0).set(f.z, 0, -f.x);
      pos.copy(from).addScaledVector(f, -2.6 - u * 0.5).addScaledVector(s, 1.9);
      pos.y = 5.4;
      look.copy(to).setY(4.3);
      break;
    }
    case 'dolly': {
      // tracking sideways past the fight
      const travel = (u - 0.5) * 9 * shot.side;
      pos.copy(mid).addScaledVector(side, 9.5).addScaledVector(dir, travel);
      pos.y = 3.4;
      look.copy(mid).setY(3.8);
      break;
    }
    case 'face': {
      // tight on one robot's head
      const who = shot.side > 0 ? a : b;
      const other = shot.side > 0 ? b : a;
      const f = V().subVectors(other, who).setY(0).normalize();
      const s = V(0, 0, 0).set(f.z, 0, -f.x);
      pos.copy(who).addScaledVector(f, 3.4 + u * 0.4).addScaledVector(s, 1.5);
      pos.y = 6.4;
      look.copy(who).setY(6.0);
      break;
    }
    default: {
      // camera almost on the canvas, rushing along the floor
      const d = 9 - u * 5.5;
      pos.copy(mid).addScaledVector(dir, -d).addScaledVector(side, 1.6);
      pos.y = 0.55;
      look.copy(mid).setY(3.0);
    }
  }

  // push the subject into the right half of the frame
  const fwd = V().subVectors(look, pos).setY(0).normalize();
  const right = V(0, 0, 0).set(fwd.z, 0, -fwd.x);
  look.addScaledVector(right, -bias);
  return { pos, look };
}
