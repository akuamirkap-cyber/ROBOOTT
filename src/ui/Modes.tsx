import type { MouseEvent } from 'react';
import { OPPONENTS, PLAYER_NAME, type OpponentDef } from '../game/Game';
import {
  ACCOUNT_NAME,
  MODES,
  TOURNEY_STAGES,
  levelOf,
  modeOf,
  rankOpponent,
  tierOf,
  weekResetIn,
  weeklyBoard,
  type ModeId,
  type Profile,
} from '../game/progress';

const act = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur();
  fn();
};

export type LobbyView = ModeId | 'profile';

/** LEFT PANEL of the lobby: the five game-mode cards */
export function ModeHub({
  mode,
  onPick,
  onStart,
  profile,
  def,
  ultra,
}: {
  mode: LobbyView;
  onPick: (m: ModeId) => void;
  onStart: (m: ModeId) => void;
  profile: Profile;
  def: OpponentDef;
  ultra: boolean;
}) {
  const { tier } = tierOf(profile.rp);
  const myRank = weeklyBoard(profile).find((r) => r.me)?.rank ?? '-';
  const rankOpp = OPPONENTS[rankOpponent(profile.rp, OPPONENTS.length)];
  const hint: Record<ModeId, string> = {
    play: `VS ${def.name} · ${ultra ? 'ULTRA HARD' : 'STANDAR'}`,
    rank: `${tier.icon} ${tier.name} · ${profile.rp} RP · LAWAN: ${rankOpp.name}`,
    tournament: `${profile.titles} GELAR · 16 TITAN · 4 BABAK GUGUR`,
    team: `${profile.teamWins} TEAM WINS · 2v2 TAG · RING LEBAR`,
    leaderboard: `PERINGKATMU #${myRank} · ${profile.weekPts} PTS · RESET ${weekResetIn()}`,
  };
  return (
    <div className="aaa-menu">
      {MODES.map((m, idx) => {
        const on = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={act(() => (on && m.id !== 'leaderboard' ? onStart(m.id) : onPick(m.id)))}
            onDoubleClick={() => m.id !== 'leaderboard' && onStart(m.id)}
            className={`aaa-item ${on ? 'aaa-on' : ''}`}
            style={{ ['--mc' as string]: m.color }}
            title={m.id === 'leaderboard' ? 'Lihat papan peringkat mingguan' : on ? `Klik lagi untuk mulai ${m.name}` : m.desc}
          >
            <span className="aaa-idx">{String(idx + 1).padStart(2, '0')}</span>
            <span className="aaa-body">
              <span className="aaa-title">{m.name}</span>
              <span className="aaa-sub">{on ? hint[m.id] : m.sub}</span>
            </span>
            <span className="aaa-go">{m.id === 'leaderboard' ? '›' : on ? 'MULAI' : '›'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** RIGHT DOSSIER for a selected mode (rank / tournament / team) with the start CTA */
export function ModeDossier({ mode, profile, onStart, ultra }: { mode: ModeId; profile: Profile; onStart: () => void; ultra: boolean }) {
  const m = modeOf(mode);
  const { tier, next, frac } = tierOf(profile.rp);
  const rankOpp = OPPONENTS[rankOpponent(profile.rp, OPPONENTS.length)];
  return (
    <>
      <div className="aaa-head">
        <span className="aaa-head-k">MODE</span>
        <span className="aaa-head-t" style={{ color: m.color }}>
          {m.name}
        </span>
        <span className="aaa-head-r" style={{ color: ultra ? '#ff8a9a' : 'rgba(255,255,255,0.6)' }}>
          {ultra ? 'ULTRA' : 'IQ MAX'}
        </span>
      </div>

      <div className="aaa-id">
        <div className="min-w-0">
          <div className="aaa-id-tier">{m.sub}</div>
          <div className="aaa-id-name" style={{ color: m.color }}>
            {m.name}
          </div>
          <div className="aaa-id-title">{m.desc}</div>
        </div>
      </div>

      <div className="aaa-row" style={{ borderLeftColor: '#ffb000' }}>
        <span className="aaa-row-k">HADIAH</span>
        <span className="aaa-row-v" style={{ color: '#ffd34a' }}>
          {m.reward}
        </span>
      </div>

      {mode === 'rank' && (
        <>
          <div className="aaa-stats">
            <div className="aaa-stat">
              <span className="aaa-stat-k">TIER</span>
              <span className="aaa-stat-track">
                <span className="aaa-stat-fill" style={{ width: `${Math.round(frac * 100)}%`, background: `linear-gradient(90deg, ${tier.color}, ${next?.color ?? tier.color})` }} />
              </span>
              <span className="aaa-stat-v" style={{ color: tier.color }}>
                {Math.round(frac * 100)}
              </span>
            </div>
            <div className="aaa-spec">
              <span style={{ color: tier.color }}>
                <b>TIER</b>
                {tier.name}
              </span>
              <i />
              <span>
                <b>RP</b>
                {profile.rp}
              </span>
              <i />
              <span>
                <b>REKOR</b>W{profile.rankWins}-L{profile.rankLosses}
              </span>
            </div>
            <div className="aaa-sub">{next ? `${next.min - profile.rp} RP LAGI KE ${next.name}` : 'PUNCAK LADDER'}</div>
          </div>
          <div className="aaa-row">
            <span className="aaa-row-k">MATCHMAKING</span>
            <span className="aaa-row-v" style={{ color: rankOpp.color }}>
              {rankOpp.name}
            </span>
          </div>
        </>
      )}

      {mode === 'tournament' && (
        <div className="aaa-stats">
          <div className="aaa-coach-k" style={{ color: m.color }}>
            JALUR BRACKET 16 TITAN
          </div>
          {OPPONENTS.slice(0, 4).map((o, i) => (
            <div key={o.name} className="aaa-stat" style={{ gridTemplateColumns: '112px minmax(0,1fr)' }}>
              <span className="aaa-stat-k">{TOURNEY_STAGES[i]}</span>
              <span className="aaa-stat-v" style={{ textAlign: 'left', color: o.color }}>
                {PLAYER_NAME} vs {o.name}
              </span>
            </div>
          ))}
          <div className="aaa-sub">GELAR DIMENANGKAN: {profile.titles}</div>
        </div>
      )}

      {mode === 'team' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="aaa-stats" style={{ borderLeftColor: '#45d6ff' }}>
              <div className="aaa-coach-k" style={{ color: '#9fe6ff' }}>
                TIM {ACCOUNT_NAME}
              </div>
              {[`${PLAYER_NAME} · KAPTEN`, `${PLAYER_NAME} MK-II · AI`].map((n) => (
                <div key={n} className="aaa-stat-v" style={{ textAlign: 'left' }}>
                  {n}
                </div>
              ))}
            </div>
            <div className="aaa-stats" style={{ borderLeftColor: '#ff2a4a' }}>
              <div className="aaa-coach-k" style={{ color: '#ff8a9a' }}>
                TIM LAWAN
              </div>
              {['???', '???'].map((n, i) => (
                <div key={i} className="aaa-stat-v" style={{ textAlign: 'left', color: 'rgba(255,255,255,0.6)' }}>
                  {n} · ACAK
                </div>
              ))}
            </div>
          </div>
          <div className="aaa-coach" style={{ borderLeftColor: m.color, background: `${m.color}12` }}>
            <div className="aaa-coach-k" style={{ color: m.color }}>
              FORMASI 2v2 · RING +18%
            </div>
            <p>Dua Titan lawan dicari lewat matchmaking. Satu robot tumbang → partnernya berbalik ke lawan yang tersisa. Team wins: {profile.teamWins}.</p>
          </div>
        </>
      )}

      <button onClick={act(onStart)} className={`play-btn cut group relative mt-auto w-full overflow-hidden px-6 py-4 text-left ${ultra ? 'play-ultra' : ''}`}>
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block truncate font-display text-[40px] leading-none tracking-[0.1em]">MULAI {m.name}</span>
            <span className="aaa-cta-sub font-tech">{m.sub} · TEKAN [ENTER]</span>
          </div>
          <div className="aaa-cta-arrow transition-transform group-hover:translate-x-1">›</div>
        </div>
        <span className="play-sheen" />
      </button>
    </>
  );
}

/** LEADERBOARD OF THE WEEK */
export function Leaderboard({ profile }: { profile: Profile }) {
  const rows = weeklyBoard(profile);
  const lv = levelOf(profile.xp);
  return (
    <>
      <div className="aaa-head">
        <span className="aaa-head-k">MINGGU {profile.weekId}</span>
        <span className="aaa-head-t" style={{ color: '#ff8a5a' }}>
          LEADERBOARD
        </span>
        <span className="aaa-head-r" style={{ color: 'rgba(255,255,255,0.55)' }}>
          RESET {weekResetIn()}
        </span>
      </div>
      <div className="aaa-lb">
        {rows.map((r) => (
          <div key={r.name} className={`aaa-lb-row ${r.me ? 'aaa-lb-me' : ''}`}>
            <span className={`aaa-lb-rank ${r.rank <= 3 ? 'aaa-lb-top' : ''}`}>{String(r.rank).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="aaa-lb-name">
                {r.name}
                {r.me && <span className="aaa-lb-tag">KAMU · LV.{lv.level}</span>}
              </div>
              <div className="aaa-lb-meta">
                {r.region} · {r.wins}W · <span style={{ color: r.tier.color }}>{r.tier.short}</span>
              </div>
            </div>
            <span className="aaa-lb-pts">{r.pts.toLocaleString('id-ID')}</span>
          </div>
        ))}
      </div>
      <div className="aaa-coach mt-auto" style={{ borderLeftColor: '#ff8a5a', background: 'rgba(255,138,90,0.07)' }}>
        <div className="aaa-coach-k" style={{ color: '#ff8a5a' }}>
          WEEKLY POINTS
        </div>
        <p>RANK +140 · TOURNAMENT +160 · TEAM +120 · PLAY +100. Peringkat 3 besar mendapat badge musiman.</p>
      </div>
    </>
  );
}
