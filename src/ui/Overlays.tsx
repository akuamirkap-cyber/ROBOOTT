import { useEffect } from 'react';
import { OPPONENTS, PLAYER_NAME, ULTRA_COLOR, type GfxMode, type HudState } from '../game/Game';
import type { SfxProfile } from '../game/audio';
import { Emblem, Key } from './Emblem';
import { CamPicker, FootworkPicker, GfxPicker, IqPicker, SfxPicker, TierLadder } from './Pickers';
import { TOURNEY_STAGES, modeOf, type Series } from '../game/progress';

export function PauseMenu({
  onResume,
  onMenu,
  sfx,
  onSfx,
  fw,
  onFw,
  cam,
  onCam,
  iq,
  onIq,
  gfx,
  onGfx,
  fps,
  tier,
}: {
  onResume: () => void;
  onMenu: () => void;
  sfx: SfxProfile;
  onSfx: (id: SfxProfile) => void;
  fw: number;
  onFw: (m: number) => void;
  cam: number;
  onCam: (i: number) => void;
  iq: number;
  onIq: (n: number) => void;
  gfx: GfxMode;
  onGfx: (m: GfxMode) => void;
  fps?: number;
  tier?: string;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="card-cut glass pop-in w-[min(94vw,460px)] p-6">
        <div className="flex items-center gap-3">
          <Emblem size={36} />
          <div className="font-display text-6xl leading-none tracking-[0.15em]">PAUSE</div>
        </div>
        <div className="my-4 h-px bg-gradient-to-r from-amber-300/70 to-transparent" />
        <CamPicker value={cam} onPick={onCam} />
        <div className="mt-4">
          <SfxPicker value={sfx} onPick={onSfx} />
        </div>
        <div className="mt-4">
          <FootworkPicker value={fw} onPick={onFw} />
        </div>
        <div className="mt-4">
          <IqPicker value={iq} onPick={onIq} />
        </div>
        <div className="mt-4">
          <GfxPicker value={gfx} onPick={onGfx} fps={fps} tier={tier} />
          <TierLadder tier={tier} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={onResume} className="play-btn cut group relative overflow-hidden px-4 py-3 font-display text-2xl tracking-[0.15em]">
            <span className="relative z-10">LANJUT ▶</span>
            <span className="play-sheen" />
          </button>
          <button onClick={onMenu} className="ghost cut px-4 py-3 font-display text-2xl tracking-[0.15em]">
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}

export function MatchEnd({
  h,
  onNext,
  onRetry,
  onMenu,
  series = null,
  label = '',
  onBracket = null,
}: {
  h: HudState;
  onNext: (() => void) | null;
  onRetry: () => void;
  onMenu: () => void;
  series?: Series | null;
  label?: string;
  onBracket?: (() => void) | null;
}) {
  const win = h.result === 'win';
  const sMode = series ? modeOf(series.mode) : null;
  const seriesDone = !!series && series.done && series.mode !== 'play' && series.mode !== 'rank';
  const tourneyWon = seriesDone && series!.mode === 'tournament' && series!.won;
  const teamWon = seriesDone && series!.mode === 'team' && series!.won;
  const champion = (win && h.oppIndex === OPPONENTS.length - 1 && (!series || series.mode === 'play')) || tourneyWon;
  const col = win ? '#ffd34a' : '#ff3b3b';
  const title = tourneyWon
    ? 'WRC CHAMPION'
    : teamWon
      ? 'TIM MENANG'
      : seriesDone && !series!.won
        ? series!.mode === 'tournament'
          ? 'TERSINGKIR'
          : 'TIM KALAH'
        : champion
          ? h.ultra
            ? 'ULTRA CHAMPION'
            : 'JUARA DUNIA'
          : win
            ? 'MENANG'
            : 'KALAH';
  const nextLabel =
    series && !series.done && series.mode === 'tournament'
      ? `LANJUT · ${TOURNEY_STAGES[Math.min(series.step + 1, TOURNEY_STAGES.length - 1)]}`
      : series && !series.done && series.mode === 'team'
        ? `BOUT ${series.step + 2} · ${series.wins}-${series.losses}`
        : 'LAWAN BERIKUTNYA';
  const retryLabel = series && series.mode === 'tournament' ? 'ULANG TURNAMEN' : series && series.mode === 'team' ? 'ULANG SERIES' : series && series.mode === 'rank' ? 'RANKED LAGI' : win ? 'ULANGI' : 'COBA LAGI';
  const enemyColor = h.ultra ? ULTRA_COLOR : h.eColor;
  const showNext = !!onNext && (win || (series?.mode === 'team' && !series.done));

  // ---- the fight sheet
  const st = h.stats;
  const acc = (i: 0 | 1) => (st && st.thrown[i] > 0 ? Math.round((st.landed[i] / st.thrown[i]) * 100) : 0);
  const byKO = win ? h.eHp <= 0 : h.pHp <= 0;
  const hpLeft = win ? Math.round((h.pHp / Math.max(1, h.pMax)) * 100) : 0;
  // grade: accuracy, health kept, combos, dodges — only a clean, dominant win earns the S
  const score = st ? acc(0) * 0.45 + hpLeft * 0.3 + Math.min(100, st.maxCombo * 12) * 0.1 + Math.min(100, (st.dodges + st.counters) * 14) * 0.15 : 0;
  const grade = !win ? 'D' : score >= 78 ? 'S' : score >= 62 ? 'A' : score >= 45 ? 'B' : 'C';
  const gradeCol: Record<string, string> = { S: '#ffd34a', A: '#5effb0', B: '#45d6ff', C: '#c8d2e0', D: '#ff6a6a' };
  const rows: { k: string; a: number; b: number; fmt?: (v: number) => string }[] = st
    ? [
        { k: 'MENDARAT', a: st.landed[0], b: st.landed[1] },
        { k: 'AKURASI', a: acc(0), b: acc(1), fmt: (v) => `${v}%` },
        { k: 'DAMAGE', a: Math.round(st.dmg[0]), b: Math.round(st.dmg[1]) },
        { k: 'KNOCKDOWN', a: st.knockdowns[0], b: st.knockdowns[1] },
      ]
    : [];
  const how = byKO ? 'K.O.' : 'ANGKA';
  const kicker = `${sMode && label ? `${sMode.name} · ${label}` : 'PLAY MATCH'} · RONDE ${h.round} · ${how}${h.ultra ? ' · ULTRA' : ''}`;
  const verdictLine = win ? (byKO ? `${h.eName} TUMBANG · RONDE ${h.round}` : `UNGGUL ANGKA ATAS ${h.eName}`) : byKO ? `KAMU TUMBANG · RONDE ${h.round}` : `${h.eName} UNGGUL ANGKA`;
  const rp = series?.mode === 'rank' ? (win ? '+28 RP' : '−16 RP') : null;
  const primary = showNext ? onNext! : onRetry;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        primary();
      } else if (e.code === 'KeyR') onRetry();
      else if (e.code === 'Escape') onMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [primary, onRetry, onMenu]);

  return (
    <div className={`cin-root absolute inset-0 overflow-hidden text-white ${win ? 'cin-win' : 'cin-lose'}`} style={{ ['--c' as string]: col, ['--e' as string]: enemyColor, ['--g' as string]: gradeCol[grade] }}>
      {/* the colour grade over the live arena, the film grain, the letterbox */}
      <div className="cin-grade-wash" />
      <div className="cin-grain" />
      <div className="cin-bar cin-bar-t" />
      <div className="cin-bar cin-bar-b" />
      {win && <div className="cin-flare" />}

      <div className="cin-kicker">
        <Emblem size={26} />
        <span>{kicker}</span>
      </div>
      <div className="cin-net">
        {PLAYER_NAME} VS {h.eName}
      </div>

      {/* THE VERDICT — one word, left of frame, the orbiting winner on the right of it */}
      <div className="cin-verdict">
        <div className="cin-word" data-text={title}>
          {title}
        </div>
        <div className="cin-line" />
        <div className="cin-sub">{verdictLine}</div>
        <div className="cin-score">
          <span className="cin-score-n" style={{ color: '#45d6ff' }}>
            {h.wins[0]}
          </span>
          <span className="cin-score-d">–</span>
          <span className="cin-score-n" style={{ color: enemyColor }}>
            {h.wins[1]}
          </span>
          <span className="cin-score-k">SKOR SERI</span>
          {rp && <span className={`cin-rp ${win ? 'cin-rp-up' : 'cin-rp-dn'}`}>{rp}</span>}
        </div>
      </div>

      {/* THE FIGHT REPORT — a slim column that slides in once the word has landed */}
      <aside className="cin-sheet">
        <div className="cin-sheet-head">
          <span>LAPORAN TARUNG</span>
          <span className="cin-sheet-off">WRC OFFICIAL</span>
        </div>
        <div className="cin-grade">
          <div className="cin-grade-l">{grade}</div>
          <div className="cin-grade-txt">
            <div className="cin-grade-k">RATING PERTARUNGAN</div>
            <div className="cin-grade-v">{grade === 'S' ? 'DOMINAN SEMPURNA' : grade === 'A' ? 'KEMENANGAN BERSIH' : grade === 'B' ? 'MENANG SOLID' : grade === 'C' ? 'MENANG SUSAH PAYAH' : 'DIKALAHKAN'}</div>
          </div>
        </div>
        {st && (
          <div className="cin-rows">
            <div className="cin-row cin-row-h">
              <span style={{ color: '#45d6ff' }}>{PLAYER_NAME}</span>
              <span />
              <span style={{ color: enemyColor }}>{h.eName}</span>
            </div>
            {rows.map((r, i) => {
              const tot = Math.max(1, r.a + r.b);
              const f = (v: number) => (r.fmt ? r.fmt(v) : v.toLocaleString('id-ID'));
              return (
                <div key={r.k} className="cin-row" style={{ animationDelay: `${1.15 + i * 0.09}s` }}>
                  <span className="cin-row-n">{f(r.a)}</span>
                  <span className="cin-row-mid">
                    <span className="cin-row-k">{r.k}</span>
                    <span className="cin-row-bar">
                      <i className="cin-row-bar-l" style={{ width: `${(r.a / tot) * 100}%`, animationDelay: `${1.3 + i * 0.09}s` }} />
                      <i className="cin-row-bar-r" style={{ width: `${(r.b / tot) * 100}%`, animationDelay: `${1.3 + i * 0.09}s` }} />
                    </span>
                  </span>
                  <span className="cin-row-n cin-row-n-r">{f(r.b)}</span>
                </div>
              );
            })}
          </div>
        )}
        {st && (
          <div className="cin-tiles">
            {[
              ['COMBO MAKS', `${st.maxCombo}×`],
              ['DODGE', `${st.dodges}`],
              ['COUNTER', `${st.counters}`],
              ['HP SISA', `${Math.round((h.pHp / Math.max(1, h.pMax)) * 100)}%`],
            ].map(([k, v], i) => (
              <div key={k} className="cin-tile" style={{ animationDelay: `${1.5 + i * 0.07}s` }}>
                <div className="cin-tile-v">{v}</div>
                <div className="cin-tile-k">{k}</div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* THE ACTIONS — in the lower bar, right-aligned, with the key legend */}
      <div className="cin-actions">
        <div className="cin-keys">
          <span>
            <Key>ENTER</Key> {showNext ? 'LANJUT' : 'ULANGI'}
          </span>
          <span>
            <Key>R</Key> ULANGI
          </span>
          <span>
            <Key>ESC</Key> MENU
          </span>
        </div>
        <div className="cin-btns">
          <button onClick={onMenu} className="cin-btn cin-btn-ghost">
            MENU
          </button>
          {onBracket && (
            <button onClick={onBracket} className="cin-btn cin-btn-ghost">
              BRACKET
            </button>
          )}
          {showNext ? (
            <>
              <button onClick={onRetry} className="cin-btn">
                {retryLabel}
              </button>
              <button onClick={onNext!} className="cin-btn cin-btn-go">
                {nextLabel} <i>▶▶</i>
              </button>
            </>
          ) : (
            <button onClick={onRetry} className="cin-btn cin-btn-go">
              {retryLabel} <i>▶▶</i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
