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
import { MOVES, MOVE_EXTRA, UNBLOCKABLE, TELL, sampleKeys, defenceAgainst } from './.__game.mjs';

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

console.log(fails === 0 ? '\nCOUNTER STRAIGHT: ALL PASS\n' : `\n${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
