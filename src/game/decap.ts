import * as THREE from 'three';
import type { Robot } from './robot';
import type { Effects } from './fx';

/**
 * HEAD RIP — the Overdrive decapitation.
 *
 * When the player's Overdrive lands on a HEAD target the opponent's helmet is torn clean off: it is launched into
 * the air with its own momentum, and the neck is left as a stump with torn cables hanging out of it. Because these
 * are steel skeletons full of cabling, the cut does not just spark once — the exposed wires keep arcing and
 * shorting out, spitting electric sparks, for as long as the round lasts.
 *
 * Everything here is parented in the robot's own local units, so it scales and animates with the body it belongs to.
 */

const GRAVITY = 30;
const HEAD_FLOOR = 0.5; // head origin height (robot-local) once it has come to rest on the canvas

interface Wire {
  o: THREE.Object3D; // the pivot the cable hangs from
  tip: THREE.Object3D; // its free, sparking end
  ph: number; // sway phase
  sp: number; // sway speed
  amp: number; // sway amplitude
  bx: number; // rest pitch
  bz: number; // rest roll
}

interface Stump {
  owner: Robot;
  group: THREE.Group;
  wires: Wire[];
  mats: THREE.Material[];
  t: number;
}

interface FlyingHead {
  obj: THREE.Object3D;
  owner: Robot;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  wires: Wire[];
  t: number;
  rest: boolean;
  scale: number;
}

export class Decap {
  private heads: FlyingHead[] = [];
  private stumps: Stump[] = [];
  private tmp = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();

  constructor(private scene: THREE.Scene) {}

  /** has this robot already lost its head? */
  isOff(robot: Robot) {
    return this.stumps.some((s) => s.owner === robot);
  }

  /** the head currently sailing through the air for this robot, if any (the cinematic cameras track it) */
  headObj(robot: Robot): THREE.Object3D | null {
    const h = this.heads.find((x) => x.owner === robot);
    return h ? h.obj : null;
  }

  /** where the torn stump is, in world space ('' when the robot still has its head) */
  stumpPos(robot: Robot, out: THREE.Vector3) {
    const s = this.stumps.find((x) => x.owner === robot);
    if (!s) return null;
    return s.group.getWorldPosition(out);
  }

  /**
   * Tear the head off and throw it. `dir` is the direction the blow was travelling (the head follows it), and
   * `scale` is the fighter's size, so everything scales with the two robots.
   */
  pop(robot: Robot, dir: THREE.Vector2, scale: number, fx: Effects) {
    if (this.isOff(robot)) return;
    robot.root.updateMatrixWorld(true);

    const mats = this.makeMats();
    const flying = robot.head.matrixWorld.clone();
    const obj = robot.head.clone(true) as THREE.Object3D;
    obj.visible = true; // the clone copies the flag of the head it came from, which we are about to hide
    // never let the clone's lights double up on the scene lighting
    obj.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight) l.visible = false;
    });
    robot.head.visible = false;
    flying.decompose(obj.position, obj.quaternion, obj.scale);
    this.scene.add(obj);

    // cables torn out of the head, still attached to it
    const wires = this.makeWires(obj, mats, 5, 0.2, -0.06, 0.45, 0.95);

    const away = new THREE.Vector3(dir.x, 0, dir.y);
    if (away.lengthSq() < 0.001) away.set(0, 0, 1);
    away.normalize();
    const head: FlyingHead = {
      obj,
      owner: robot,
      vel: new THREE.Vector3(away.x * (9 + Math.random() * 4), 10.5 + Math.random() * 4, away.z * (9 + Math.random() * 4)),
      spin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 18),
      wires,
      t: 0,
      rest: false,
      scale,
    };
    this.heads.push(head);

    // ---- the wound: a capped stump with live cables hanging out of it
    const group = new THREE.Group();
    group.position.set(0, 0.42, 0);
    robot.neck.add(group);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.16, 18), mats[0]);
    group.add(cap);
    const cut = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), mats[1]);
    cut.rotation.x = -Math.PI / 2;
    cut.position.y = 0.085;
    group.add(cut);
    // a few shards of torn plating still sticking out of the collar
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random();
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.03), mats[0]);
      shard.position.set(Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24);
      shard.rotation.set((Math.random() - 0.5) * 0.8, a, (Math.random() - 0.5) * 0.9);
      group.add(shard);
    }
    const stumpWires = this.makeWires(group, mats, 7, 0.23, -0.02, 0.5, 1.15);
    this.stumps.push({ owner: robot, group, wires: stumpWires, mats, t: 0 });

    // the cut itself: a hot electric flash and a burst of sparks off the live ends
    const p = new THREE.Vector3();
    robot.neck.getWorldPosition(p);
    fx.flash(p, 3.4, 0xbfeaff, 0.2);
    fx.flash(p, 2.2, 0xffffff, 0.1);
    fx.ring(p.x, p.z, 0x9fe6ff, 5, 0.5, p.y);
    fx.spark(p, 60, 12, 0x9fe6ff, new THREE.Vector3(0, 1, 0), 1.3, 0.8, 9);
    fx.spark(p, 30, 9, 0xffffff, undefined, 1.5, 0.45, 7);
  }

  update(dt: number, fx: Effects) {
    // ---------------- the stump: live wires, arcing and shorting out ----------------
    for (const s of this.stumps) {
      s.t += dt;
      const t = s.t;
      // it sputters furiously at first, then settles into the odd electric twitch
      const rate = t < 0.9 ? 26 : t < 2.6 ? 9 : 1.6;
      if (Math.random() < rate * dt) {
        const w = s.wires[(Math.random() * s.wires.length) | 0];
        w.tip.getWorldPosition(this.tmp);
        const hot = Math.random() < 0.65;
        fx.spark(this.tmp, 2 + ((Math.random() * 5) | 0), 5 + Math.random() * 7, hot ? 0x9fe6ff : 0xffd9a0, new THREE.Vector3(0, 0.6, 0), 1.2, 0.35, 7);
        if (Math.random() < (t < 0.9 ? 0.4 : 0.12)) {
          fx.flash(this.tmp, 0.9 + Math.random() * 0.7, 0xbfeaff, 0.08);
          fx.ring(this.tmp.x, this.tmp.z, 0x9fe6ff, 1.5, 0.22, this.tmp.y);
        }
      }
      this.sway(s.wires, t);
    }

    // ---------------- the head itself ----------------
    for (const h of this.heads) {
      h.t += dt;
      if (!h.rest) {
        h.vel.y -= GRAVITY * dt;
        h.obj.position.addScaledVector(h.vel, dt);
        this.e.set(h.spin.x * dt, h.spin.y * dt, h.spin.z * dt);
        this.q.setFromEuler(this.e);
        h.obj.quaternion.multiply(this.q);
        const floor = HEAD_FLOOR * h.scale;
        if (h.obj.position.y <= floor) {
          h.obj.position.y = floor;
          if (Math.abs(h.vel.y) > 2.4) {
            h.vel.y = -h.vel.y * 0.34;
            h.vel.x *= 0.55;
            h.vel.z *= 0.55;
            h.spin.multiplyScalar(0.45);
            fx.spark(h.obj.position, 18, 8, 0x9fe6ff, undefined, 1.3, 0.5, 11);
            fx.ring(h.obj.position.x, h.obj.position.z, 0x9fe6ff, 2.4, 0.3, 0.1);
            fx.flash(h.obj.position, 1.2, 0xbfeaff, 0.1);
            fx.spark(h.obj.position, 10, 5, 0xffffff, undefined, 1.5, 0.3, 6); // dust off the canvas
          } else {
            h.rest = true;
            h.vel.set(0, 0, 0);
            h.spin.set(0, 0, 0);
          }
        }
        // sparks streaming off the torn cables while it tumbles
        if (h.t < 1.1 || Math.random() < dt * 2.5) {
          fx.spark(h.obj.position, 1 + ((Math.random() * 4) | 0), 4.5, Math.random() < 0.7 ? 0x9fe6ff : 0xffd9a0, undefined, 1.5, 0.4, 8);
        }
      } else if (Math.random() < dt * 1.3) {
        // lying there, still twitching with current
        fx.spark(h.obj.position, 2 + ((Math.random() * 3) | 0), 3.5, 0x9fe6ff, new THREE.Vector3(0, 1, 0), 1.1, 0.35, 6);
      }
      this.sway(h.wires, h.t);
    }
  }

  /** the cables swing from wherever they are hanging, damping down as they settle */
  private sway(wires: Wire[], t: number) {
    const calm = Math.min(1, t * 0.5);
    for (const w of wires) {
      w.o.rotation.x = w.bx + Math.sin(t * w.sp + w.ph) * w.amp * calm;
      w.o.rotation.z = w.bz + Math.cos(t * w.sp * 0.83 + w.ph) * w.amp * calm * 0.8;
    }
  }

  /** straight back to a healthy robot: called when a new round starts */
  clear() {
    for (const h of this.heads) {
      this.scene.remove(h.obj); // geometry & materials are shared with the original head — never dispose them
      h.owner.head.visible = true;
    }
    this.heads.length = 0;
    for (const s of this.stumps) {
      s.owner.neck.remove(s.group);
      disposeTree(s.group);
      for (const m of s.mats) m.dispose();
    }
    this.stumps.length = 0;
  }

  private makeMats() {
    return [
      new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.95, roughness: 0.35 }), // torn steel
      new THREE.MeshStandardMaterial({ color: 0x7a828c, metalness: 0.9, roughness: 0.2 }), // the shiny cut
      new THREE.MeshStandardMaterial({ color: 0x0d0e12, metalness: 0.2, roughness: 0.85 }), // cable jacket
      new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.95, roughness: 0.35 }), // copper core
      new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x8fe8ff, emissiveIntensity: 2.2, metalness: 0.5, roughness: 0.3 }), // live wire
    ];
  }

  /** a ring of torn cables hanging out of a hole, each with a tip that sparks */
  private makeWires(parent: THREE.Object3D, mats: THREE.Material[], count: number, rim: number, y: number, minLen: number, maxLen: number): Wire[] {
    const wires: Wire[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.7;
      const len = minLen + Math.random() * (maxLen - minLen);
      const bend = new THREE.Vector3((Math.random() - 0.5) * 0.3, -len * 0.55, (Math.random() - 0.5) * 0.3);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(bend.x * 0.6, -len * 0.3, bend.z * 0.6),
        bend,
        new THREE.Vector3(bend.x * 1.5 + (Math.random() - 0.5) * 0.2, -len, bend.z * 1.5 + (Math.random() - 0.5) * 0.2),
      ]);
      const geo = new THREE.TubeGeometry(curve, 8, 0.028 + Math.random() * 0.022, 5, false);
      const mat = mats[2 + ((Math.random() * 3) | 0)];
      const mesh = new THREE.Mesh(geo, mat);
      const pivot = new THREE.Object3D();
      pivot.position.set(Math.cos(a) * rim, y, Math.sin(a) * rim);
      pivot.add(mesh);
      parent.add(pivot);
      const tip = new THREE.Object3D();
      tip.position.set(bend.x * 1.5, -len, bend.z * 1.5);
      mesh.add(tip);
      wires.push({
        o: pivot,
        tip,
        ph: Math.random() * Math.PI * 2,
        sp: 3.5 + Math.random() * 4.5,
        amp: 0.12 + Math.random() * 0.26,
        bx: (Math.random() - 0.5) * 0.5,
        bz: (Math.random() - 0.5) * 0.5,
      });
    }
    return wires;
  }
}

/** only the geometry this module created itself is safe to dispose (the head clone shares the robot's meshes) */
function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
