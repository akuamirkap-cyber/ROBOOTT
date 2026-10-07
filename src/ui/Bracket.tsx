import { useMemo } from 'react';
import { OPPONENTS, PLAYER_NAME, ULTRA_COLOR, type Game } from '../game/Game';
import { ACCOUNT_NAME, TOURNEY_STAGES, buildBracket, type BracketMatch, type BracketSlot, type Profile, type Series } from '../game/progress';

/**
 * THE PLAYOFFS — a 16-Titan single-elimination tree. Left half opens with you at the top, the four real Titans are
 * seeded one round deeper each; the right half decides who you meet in the Grand Final under the trophy.
 * Layout is in percent coordinates so the HTML slots and the SVG connectors share one grid.
 */

// column x (percent) of the LEFT edge of each slot box; the box is W wide
const W = 12.6;
const COLS_L = [0, 14.7, 29.4]; // R16, QF, SF (left)
const COLS_R = [100 - W, 100 - W - 14.7, 100 - W - 29.4]; // R16, QF, SF (right)
const FINAL_X = 50 - W / 2;
const yOf = (round: number, i: number) => ((i + 0.5) / (8 / Math.pow(2, round))) * 100; // 8,4,2 slots per half

interface Box {
  x: number;
  y: number;
  slot: BracketSlot | null;
  state: 'win' | 'lose' | 'live' | 'tbd' | '';
  me: boolean;
  seed: number;
  final?: boolean;
  champ?: boolean;
}
interface Path {
  d: string;
  cls: string;
}

export function Bracket({
  series,
  profile,
  ultra,
  game,
  onStart,
  onBack,
}: {
  series: Series;
  profile: Profile;
  ultra: boolean;
  game: Game | null;
  onStart: () => void;
  onBack: () => void;
}) {
  const roster = useMemo(() => OPPONENTS.map((o) => ({ name: o.name, color: ultra ? ULTRA_COLOR : o.color })), [ultra]);
  const rounds = useMemo(() => buildBracket(roster, series, ACCOUNT_NAME), [roster, series]);

  const boxes: Box[] = [];
  const paths: Path[] = [];
  const liveStage = TOURNEY_STAGES[Math.min(series.step, 3)];
  const champion = series.done && series.won;
  const out = series.done && !series.won;

  const stateOf = (m: BracketMatch, k: 0 | 1): Box['state'] => {
    const sl = k === 0 ? m.a : m.b;
    if (!sl) return 'tbd';
    if (m.winner !== null) return m.winner === k ? 'win' : 'lose';
    if (m.live) return 'live';
    return '';
  };

  // rounds 0..2 → left half = matches [0, n/2), right half = [n/2, n)
  for (let r = 0; r < 3; r++) {
    const ms = rounds[r];
    const half = ms.length / 2;
    ms.forEach((m, mi) => {
      const leftSide = mi < half;
      const li = leftSide ? mi : mi - half; // match index within the half
      const col = leftSide ? COLS_L[r] : COLS_R[r];
      for (const k of [0, 1] as const) {
        const si = li * 2 + k;
        const y = yOf(r, si);
        const sl = k === 0 ? m.a : m.b;
        boxes.push({ x: col, y, slot: sl, state: stateOf(m, k), me: !!sl?.me, seed: r === 0 ? (leftSide ? si + 1 : 16 - si) : 0 });
      }
      // connector: both slots → a vertical bar → the next column's slot
      const y0 = yOf(r, li * 2);
      const y1 = yOf(r, li * 2 + 1);
      const yn = r < 2 ? yOf(r + 1, li) : 50 + (leftSide ? -4.2 : 4.2);
      const xa = leftSide ? col + W : col; // the edge the line leaves from
      const xm = leftSide ? xa + 1.0 : xa - 1.0;
      const xn = r < 2 ? (leftSide ? COLS_L[r + 1] : COLS_R[r + 1] + W) : leftSide ? FINAL_X : FINAL_X + W;
      const bar = `M ${xa} ${y0} H ${xm} V ${y1} H ${xa}`;
      const ym = (y0 + y1) / 2;
      // the stem runs straight into the next slot; into the final it jogs up/down to the final's own slot height
      // the player's road through the tree glows blue, decided bouts gold, the bout coming up pulses
      const cls = m.mine && (m.winner !== null || m.live) ? (m.live ? 'mine flow' : 'mine') : m.winner !== null ? 'hot' : m.live ? 'flow' : '';
      paths.push({ d: r < 2 ? `${bar} M ${xm} ${ym} H ${xn}` : `${bar} M ${xm} ${ym} H ${(xm + xn) / 2} V ${yn} H ${xn}`, cls });
    });
  }
  // the final
  const fm = rounds[3][0];
  boxes.push({ x: FINAL_X, y: 50 - 4.6, slot: fm.a, state: stateOf(fm, 0), me: !!fm.a?.me, seed: 0, final: true, champ: fm.winner === 0 });
  boxes.push({ x: FINAL_X, y: 50 + 4.6, slot: fm.b, state: stateOf(fm, 1), me: !!fm.b?.me, seed: 0, final: true, champ: fm.winner === 1 });
  const champName = fm.winner !== null ? (fm.winner === 0 ? fm.a?.name : fm.b?.name) : null;
  const roundOn = (r: number) => !series.done && series.step === r;

  const nextOpp = series.done ? null : rounds[series.step]?.find((m) => m.mine);
  const foe = nextOpp ? (nextOpp.a?.me ? nextOpp.b : nextOpp.a) : null;

  return (
    <div className="vs-root bk-root pointer-events-auto absolute inset-0 z-40 flex flex-col text-white">
      <div className="bk-bg" />
      <div className="vs-scan" />

      {/* title strip */}
      <div className="relative z-10 flex items-end justify-between px-8 pt-5">
        <div>
          <div className="font-tech text-[11px] font-bold tracking-[0.5em] text-fuchsia-200/80">🏆 WRC TOURNAMENT · 16 TITAN</div>
          <div className="bk-title font-display leading-none" style={{ fontSize: 'clamp(44px, 7vw, 96px)' }}>
            <span className="chrome-text">PLAY</span>
            <span style={{ color: '#c070ff', textShadow: '0 0 30px #c070ff99' }}>OFFS</span>
          </div>
        </div>
        <div className="flex items-center gap-3 pb-2">
          <span className="vs-tag font-tech" style={{ ['--c' as string]: champion ? '#ffd34a' : out ? '#ff5a5a' : '#ff9a3c' }}>
            {champion ? '👑 KAMU JUARA' : out ? '✖ TERSINGKIR · ' + liveStage : '● ' + liveStage}
          </span>
          {ultra && (
            <span className="vs-tag ultra-badge font-tech" style={{ ['--c' as string]: ULTRA_COLOR }}>
              ☠ ULTRA
            </span>
          )}
        </div>
      </div>

      {/* the tree */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-2 sm:px-6">
        <div className="relative w-full max-w-[1500px]" style={{ height: 'min(54vh, 560px)' }}>
          {/* round labels */}
          {(
            [
              ['16 BESAR', COLS_L[0], 0],
              ['PEREMPAT', COLS_L[1], 1],
              ['SEMIFINAL', COLS_L[2], 2],
              ['SEMIFINAL', COLS_R[2], 2],
              ['PEREMPAT', COLS_R[1], 1],
              ['16 BESAR', COLS_R[0], 0],
            ] as [string, number, number][]
          ).map(([l, x, r], i) => (
            <div key={i} className={`bk-round font-tech ${roundOn(r) ? 'on' : ''}`} style={{ left: `${x}%`, width: `${W}%` }}>
              {l}
            </div>
          ))}

          {/* connectors */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {paths.map((p, i) => (
              <path key={i} d={p.d} className={`bk-path ${p.cls}`} />
            ))}
          </svg>

          {/* trophy + FINAL */}
          <div className="absolute flex flex-col items-center" style={{ left: `${FINAL_X - 6}%`, width: `${W + 12}%`, top: '6%' }}>
            <div className="relative grid h-[84px] w-[84px] place-items-center sm:h-[104px] sm:w-[104px]">
              <div className="bk-rays" />
              <div className="bk-trophy text-[44px] leading-none sm:text-[56px]">🏆</div>
            </div>
            <div className={`bk-round on relative mt-0 w-full font-tech ${roundOn(3) ? '' : 'opacity-70'}`} style={{ top: 0 }}>
              GRAND FINAL
            </div>
            {champName && (
              <div className="mt-1 rounded border border-amber-300/70 bg-amber-400/15 px-2 py-0.5 font-tech text-[7.5px] font-bold tracking-[0.25em] text-amber-200">👑 {champName}</div>
            )}
          </div>
          <div className="absolute text-center font-tech text-[7.5px] font-bold tracking-[0.3em] text-white/40" style={{ left: `${FINAL_X}%`, width: `${W}%`, top: '70%' }}>
            WORLD
            <br />
            CHAMPIONSHIP
            <div className="mx-auto mt-1 h-px w-10 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
          </div>

          {/* slots */}
          {boxes.map((b, i) => (
            <div
              key={i}
              className={`bk-slot font-tech ${b.state} ${b.me ? 'me' : ''} ${b.final ? 'bk-final' : ''} ${b.champ ? 'bk-champ' : ''}`}
              style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${W}%` }}
              title={b.slot?.name ?? 'Menunggu pemenang'}
            >
              {b.seed > 0 && <span className="bk-seed">{b.seed}</span>}
              <span className="h-3 w-1 shrink-0 rounded-sm" style={{ background: b.slot?.color ?? '#334155', boxShadow: b.slot ? `0 0 8px ${b.slot.color}` : 'none' }} />
              <span className="truncate">{b.slot ? b.slot.name : '— TBD —'}</span>
              {b.me && <span className="ml-auto shrink-0 rounded-sm bg-sky-300 px-1 text-[6.5px] text-black">KAMU</span>}
              {b.state === 'live' && !b.me && <span className="ml-auto shrink-0 rounded-sm bg-orange-400 px-1 text-[6.5px] text-black">NEXT</span>}
              {b.champ && <span className="ml-auto shrink-0 text-amber-300">👑</span>}
              {b.state === 'win' && !b.me && !b.champ && <span className="ml-auto shrink-0 text-amber-300">✔</span>}
            </div>
          ))}
        </div>
      </div>

      {/* footer band */}
      <div className="relative z-10 h-[150px]" />
      <div className="vs-band vs-band-on bk-band">
        <div className="flex items-center gap-4">
          {foe ? (
            <>
              <span className="vs-band-text font-display text-sky-200" style={{ textShadow: '0 0 18px #45d6ff88, 0 4px 0 #000' }}>
                {PLAYER_NAME}
              </span>
              <span className="mm-vs font-display" style={{ fontSize: 'clamp(22px, 2.6vw, 40px)' }}>
                VS
              </span>
              <span className="vs-band-text font-display" style={{ color: foe.color, textShadow: `0 0 18px ${foe.color}88, 0 4px 0 #000` }}>
                {foe.name}
              </span>
              <span className="vs-mode-sub font-tech">
                {liveStage} · GELAR {profile.titles}
              </span>
            </>
          ) : (
            <span className="vs-band-text font-display">{champion ? '👑 JUARA DUNIA WRC' : 'TURNAMEN SELESAI'}</span>
          )}
        </div>
        <div className="vs-band-actions">
          <button
            onClick={() => {
              game?.uiCue('click');
              onBack();
            }}
            className="vs-btn vs-btn-ghost font-display"
          >
            {series.done ? 'KE LOBBY' : 'KELUAR'}
          </button>
          {!series.done && (
            <button
              onClick={() => {
                game?.uiCue('click');
                onStart();
              }}
              className="vs-btn vs-btn-go font-display"
            >
              {series.step === 0 ? 'MULAI TURNAMEN' : `LANJUT · ${liveStage}`} ▶▶
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
