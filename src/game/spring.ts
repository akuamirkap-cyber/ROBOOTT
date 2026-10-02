/** Damped spring (semi-implicit, sub-stepped so it stays stable at any frame rate). */
export class Spring {
  x: number;
  v = 0;
  constructor(x = 0) {
    this.x = x;
  }
  set(x: number) {
    this.x = x;
    this.v = 0;
  }
  /** freq = oscillations per second, damp = damping ratio (1 = critical, <1 = overshoot). */
  update(target: number, freq: number, damp: number, dt: number) {
    if (dt <= 0) return this.x;
    const w = freq * Math.PI * 2;
    const n = Math.max(1, Math.ceil(dt / 0.006));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (w * w * (target - this.x) - 2 * damp * w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}
