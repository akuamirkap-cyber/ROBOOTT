// Strike validation harness — run it with:
//     npx esbuild src/game/Game.ts --bundle --format=esm --platform=node --outfile=.__game.mjs --external:three
//     node striketest.mjs
// (or just `npm run test:strike`, which does both)
//
// It reads the REAL move table out of src/game/Game.ts — the same numbers the game runs — and checks the rules the
// counter straight (L) is supposed to obey:
//   §1  it is EXACTLY half an Overdrive: damage, power, knockback, stun and the chip it does through a guard
//   §2  it is the Overdrive's punch: the fist crosses on the Overdrive's own line (sampled with the game's sampler)
//   §3  it is still dodgeable: not unblockable, and the AI's answer to it is always to step off the line
//   §4  it chains out of your own punches: a landed jab / hook / uppercut opens the cancel that throws it
//   §5  THE JAB pulls its weight: fastest + longest + cheapest punch, real chip on a guard, and the meter engine
//   §6  THE ROPES PUSH, THEY DO NOT TELEPORT: every correction is capped per frame, and a rebound can only die out
//   §7  EVERYONE'S CHASSIS IS 1.8× THICKER: vitality only — the match-up ratios and the damage numbers are untouched
import { MOVES, MOVE_EXTRA, UNBLOCKABLE, TELL, sampleKeys, defenceAgainst, jabChainSpeed, meterGainFor, ropeInwardStep, ropeHardStep, ropeSlingSpeed, ropeEnergyDamp, HP_SCALE, hpThick, OPPONENTS, ultraDef } from './.__game.mjs';

let fails = 0;
const ok = (label, cond, info = '') => {
  if (!cond) fails++;
  console.log(`   ${cond ? 'PASS' : 'FAIL'}  ${label}${info ? '   ' + info : ''}`);
};
const f = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

const C = MOVES.counter;
const OD = MOVES.bolt;

// ============================================================================================== §1 half an Overdrive
console.log('\n§1  the counter straight is EXACTLY half an Overdrive');
{
  const pairs = [
    ['damage', C.dmg, OD.dmg],
    ['power', C.power, OD.power],
    ['knockback', C.knock, OD.knock],
    ['stun', C.stun, OD.stun],
    ['guard chip', C.blockMul, OD.blockMul],
  ];
  for (const [name, mine, his] of pairs) {
    ok(`${name}: ${f(mine)} = half of ${f(his)}`, Math.abs(mine - his * 0.5) < 1e-9, `${f(mine)} vs ${f(his / 2)}`);
  }
  // the travel is NOT halved: it is the same punch thrown over a shorter stride, which is what makes it read as an
  // Overdrive. It has to carry less than the Overdrive, but stay clearly a lunging straight.
  ok(
    'it keeps the Overdrive stride, a little shorter',
    C.step < OD.step && C.step > OD.step * 0.5,
    `step ${f(C.step)} vs Overdrive ${f(OD.step)}`,
  );
  ok('it reaches less far than the Overdrive', C.reach < OD.reach, `reach ${f(C.reach)} vs ${f(OD.reach)}`);
}

// ============================================================================================== §2 the same punch line
console.log('\n§2  the fist crosses on the Overdrive’s own line');
{
  // sample each move at its own impact with the GAME's sampler — the pose the fist actually lands on
  const a = sampleKeys(C.keys, C.impact);
  const b = sampleKeys(OD.keys, OD.impact);
  ok('shoulder pitch matches', Math.abs(a.p.sx - b.p.sx) < 0.08, `${f(a.p.sx)} vs ${f(b.p.sx)}`);
  ok('shoulder yaw matches (the crossing line)', Math.abs(a.p.sy - b.p.sy) < 0.08, `${f(a.p.sy)} vs ${f(b.p.sy)}`);
  ok('the arm stays on the centre line', Math.abs(a.p.sz) < 0.06 && Math.abs(b.p.sz) < 0.06, `sz ${f(a.p.sz)} vs ${f(b.p.sz)}`);
  ok('the elbow is locked out like the Overdrive’s', Math.abs(a.p.ex - b.p.ex) < 0.1, `${f(a.p.ex)} vs ${f(b.p.ex)}`);
  // ...but it must NOT be an Overdrive: less body behind it (less lunge, less twist) = less power going out
  ok('it puts less body into it', a.lunge < b.lunge && Math.abs(a.twist) < Math.abs(b.twist), `lunge ${f(a.lunge)} vs ${f(b.lunge)}, twist ${f(a.twist)} vs ${f(b.twist)}`);
  // and the whole move is over sooner, so it can be chained
  ok('it comes out faster than the Overdrive', C.dur < OD.dur && C.strikeAt < OD.strikeAt, `dur ${f(C.dur)} vs ${f(OD.dur)}, strikeAt ${f(C.strikeAt)} vs ${f(OD.strikeAt)}`);
}

// ============================================================================================== §3 dodgeable
console.log('\n§3  it can still be dodged (and blocked, and sidestepped)');
{
  ok('it is NOT unblockable', MOVE_EXTRA.counter.unblock === false);
  ok('it is not on the unblockable list', !UNBLOCKABLE.includes('counter'), `UNBLOCKABLE = ${UNBLOCKABLE.join(', ')}`);
  ok('it does not launch (a dodge always gets you out)', MOVE_EXTRA.counter.launch === false);
  ok('it is a thin line, so a sidestep clears it', MOVE_EXTRA.counter.width < 2.5, `width ${f(MOVE_EXTRA.counter.width)} vs hook ${f(MOVE_EXTRA.hook.width)}`);
  ok('the enemy gets a warning window to read it', TELL.counter > 0, `tell ${f(TELL.counter)} s`);
  // the AI's answer: never "just block it" — it always dodges (side/back), like it does against the Overdrive
  let blocks = 0;
  let steps = 0;
  for (let i = 0; i < 400; i++) {
    const act = defenceAgainst('counter', 0.5);
    if (act === 'block') blocks++;
    else steps++;
  }
  ok('the AI always steps off it, never eats it on the guard', blocks === 0 && steps === 400, `${steps}/400 sidesteps or backsteps`);
  let odBlocks = 0;
  for (let i = 0; i < 400; i++) if (defenceAgainst('bolt', 0.5) === 'block') odBlocks++;
  ok('...the same way it answers the Overdrive', odBlocks === 0);
  // and the player can dodge it: the timed-dodge window is the wind-up, which this move really has
  ok('it has a wind-up long enough to time a dodge', C.strikeAt >= 0.25, `strikeAt ${f(C.strikeAt)} s`);
}

// ============================================================================================== §4 the H/J/K -> L chain
console.log('\n§4  it chains straight out of your own punches (H/J/K → L)');
{
  // canCancel() shortens a move that has CONFIRMED a hit to min(cancel, impact + 0.05) — that is the window the
  // counter comes out of. Every punch has to open it well before the move is over.
  for (const id of ['jab', 'cross', 'hook', 'upper']) {
    const m = MOVES[id];
    const open = Math.min(m.cancel, m.impact + 0.05);
    ok(`${id}: a landed hit opens the cancel`, open < m.dur - 0.05, `opens at ${f(open)} s of ${f(m.dur)} s`);
  }
  // end to end: land a jab, throw the counter straight on the earliest legal frame, and see when it arrives
  const jab = MOVES.jab;
  const chain = Math.min(jab.cancel, jab.impact + 0.05) + MOVES.counter.impact;
  ok('jab → counter straight lands in under a second', chain < 1.0, `${f(chain)} s from the jab landing`);
  // the anti-spam cooldown is short enough to use it as a combo ender, long enough that it is not a jab
  ok('it is not spammable, but it is usable', MOVES.counter.cost > MOVES.jab.cost, `cost ${f(MOVES.counter.cost)} vs jab ${f(MOVES.jab.cost)}`);
}

// ============================================================================================== §5 the jab's job
console.log('\n§5  the jab pulls its weight (the punch the whole style is built on)');
{
  const J = MOVES.jab;
  const basics = ['cross', 'hook', 'upper'];
  // the measuring stick: it out-reaches every other basic punch, and it is the fastest and the cheapest
  ok('longest reach of the basic punches', basics.every((id) => J.reach > MOVES[id].reach), `${f(J.reach)} m vs ${basics.map((id) => f(MOVES[id].reach)).join(' / ')}`);
  ok('fastest punch in the book', basics.every((id) => J.dur < MOVES[id].dur) && J.dur < C.dur, `${f(J.dur)} s`);
  ok('cheapest punch in the book', basics.every((id) => J.cost < MOVES[id].cost) && J.cost < C.cost, `${f(J.cost)} stamina`);
  // ...but it is still a jab: it chips a guard instead of breaking it, and it never lands like a cross
  ok('it chips a guard harder than the cross does', J.blockMul > MOVES.cross.blockMul, `${f(J.blockMul)} vs ${f(MOVES.cross.blockMul)}`);
  ok('it is still a jab, not a knockdown', J.dmg < MOVES.cross.dmg && J.knock < MOVES.cross.knock, `dmg ${f(J.dmg)} / knock ${f(J.knock)}`);
  // the rhythm: a chain link makes the next jab faster, monotonically, and it tops out at +30 %
  const speeds = [0, 1, 2, 3, 4].map((n) => jabChainSpeed(n));
  ok('each link of a jab chain tightens the next', speeds.every((v, i) => i === 0 || v > speeds[i - 1]), speeds.map((v) => v.toFixed(2)).join(' → '));
  ok('the chain is capped (no infinite machine gun)', jabChainSpeed(4) === jabChainSpeed(60) && jabChainSpeed(60) <= 1.3 + 1e-9, `cap ×${f(jabChainSpeed(60))}`);
  // the economy: throwing jabs banks Overdrive meter faster than any other punch — that is why it matters
  const rate = (id) => meterGainFor(id, MOVES[id].dmg) / MOVES[id].dur;
  ok('the jab is the best Overdrive charger', rate('jab') > rate('cross') * 1.6 && rate('jab') > rate('hook') && rate('jab') > rate('upper'), `${f(rate('jab'))} vs cross ${f(rate('cross'))} meter/s`);
  ok('...and a chained jab charges even faster', meterGainFor('jab', J.dmg) / (J.dur / jabChainSpeed(4)) > rate('jab') * 1.25, `${f(meterGainFor('jab', J.dmg) / (J.dur / jabChainSpeed(4)))} meter/s at full chain`);
}

// =========================================================================================== §6 the arena ropes
console.log('\n§6  the ropes push a body, they never teleport it');
{
  const step60 = ropeInwardStep(1 / 60);
  const hard60 = ropeHardStep(1 / 60);
  const hitch = ropeInwardStep(0.35);
  ok('one frame of rope push is a lean, not a jump', step60 < 0.2, `${f(step60)} m in the worst 60 fps frame`);
  ok('a frame hitch cannot buy extra travel', Math.abs(hitch - ropeInwardStep(1 / 30)) < 1e-9 && hitch < 0.35, `hitch frame capped at ${f(hitch)} m`);
  ok('the fully stretched rope also gives back in frames', hard60 < 0.35 && ropeHardStep(0.35) === ropeHardStep(1 / 30), `${f(hard60)} m in the worst 60 fps frame`);
  // a body 3 m through the rope line is eased back over several frames — the old code did it in one
  const framesToClear = Math.ceil(3 / step60);
  ok('being metres through the ropes resolves as a slide', framesToClear >= 15 && framesToClear <= 30, `${framesToClear} frames to slide 3 m back in`);
  // the sling: the rope may never throw a body back in faster than it arrived — no escalating rally
  const vIns = [3, 4, 6.2, 9, 13, 20];
  const out = vIns.map((v) => ropeSlingSpeed(1, v) * ropeEnergyDamp(ropeSlingSpeed(1, v) + v * 0.4, v));
  ok('a rebound never leaves faster than it arrived', out.every((w, i) => w <= vIns[i] + 1e-9), out.map((w, i) => `${f(vIns[i])}→${f(w)}`).join(' '));
  // ...so a rally between two ropes loses energy every bounce instead of turning into a pinball
  let v = 6.2;
  const rally = [v];
  for (let i = 0; i < 5; i++) {
    v = ropeSlingSpeed(1, v) * ropeEnergyDamp(ropeSlingSpeed(1, v) + v * 0.4, v);
    rally.push(v);
  }
  ok('a rope rally dies out, it does not wind up', rally.every((w, i) => i === 0 || w <= rally[i - 1] + 1e-9), rally.map((w) => f(w)).join(' → ') + ' m/s');
}

// ========================================================================================= §7 the thicker chassis
console.log('\n§7  nyawa lebih tebal 1.8x — vitality only, the match-ups are untouched');
{
  ok('the scale is exactly 1.8x', HP_SCALE === 1.8, `HP_SCALE ${f(HP_SCALE)}`);
  ok('the player is built 180 deep', hpThick(100) === 180, `${hpThick(100)} HP (was 100)`);
  // every Titan is scaled by the same factor, so the roster's pecking order (and the Ultra Hard upgrade, which is
  // a base x1.4 applied BEFORE the scale) is exactly the balance it was — fights are longer, not different
  const roster = OPPONENTS.map((o) => o.hp);
  const thick = roster.map((h) => hpThick(h));
  const ultra = OPPONENTS.map((o) => hpThick(ultraDef(o).hp));
  const factor = (b, t) => t / b;
  ok('every Titan got the same 1.8x', roster.every((b, i) => Math.abs(factor(b, thick[i]) - 1.8) < 0.011), roster.map((b, i) => `${b}→${thick[i]}`).join(' '));
  ok('Ultra Hard stays proportionally ahead', ultra.every((u, i) => Math.abs(factor(thick[i], u) - 1.4) < 0.011), ultra.map((u, i) => `${thick[i]}→${u}`).join(' '));
  ok('the roster order is unchanged', thick.every((t, i) => i === 0 || t > thick[i - 1]), thick.join(' < '));
  // the damage table is NOT touched: thicker vitality means more clean hits land before a KO, which is the point
  const cross = MOVES.cross.dmg;
  const hitsOld = Math.ceil(OPPONENTS[OPPONENTS.length - 1].hp / cross);
  const hitsNew = Math.ceil(hpThick(OPPONENTS[OPPONENTS.length - 1].hp) / cross);
  ok('a KO takes ~1.8x as many clean strikes', hitsNew >= Math.round(hitsOld * 1.7) && MOVES.jab.dmg === 7 && cross === 11, `${hitsOld} → ${hitsNew} crosses on ${OPPONENTS[OPPONENTS.length - 1].name}`);
}

console.log(fails === 0 ? '\nCOUNTER STRAIGHT: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
