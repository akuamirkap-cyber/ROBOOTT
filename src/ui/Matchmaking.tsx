import { useEffect, useMemo, useRef, useState } from 'react';
import { OPPONENTS, PLAYER_NAME, ULTRA_COLOR, VS_LOCK_BEAT, VS_LOCK_BEATS, VS_LOCK_DUR, smartDef, ultraDef, type Game, type OpponentDef } from '../game/Game';
import { ACCOUNT_NAME, ACCOUNT_REGION, TOURNEY_STAGES, levelOf, modeOf, tierOf, type Profile, type Series } from '../game/progress';
import { Emblem } from './Emblem';

const SCAN_NAMES = ['ZEUS_SOVEREIGN', 'NOISYBOY_KENTA', 'MIDAS_KINGPIN', 'TAK_MASHIDO', 'CHARLIE_KENTON', 'FINN_SPARKS', 'RICKY_CRASH', 'BAILEY_TALLET', 'FARRA_LEMKOVA', 'BUDI_IRONFIST', 'RAKA_STEELJAW', 'SITI_VOLTAGE', 'AXELROD_77', 'TWIN_CITIES', 'BLACKTOP_X'];
const TIPS = [
  'Tekan SPASI saat lawan mengayun — dodge sempurna membuka OVERDRIVE (R).',
  'COUNTER (L) hanya menangkap pukulan yang sudah terbaca. Sabar, lalu hukum.',
  'Pukulan saat sprint jauh lebih berat — tapi mudah dibaca lawan cerdas.',
  'TIM: kalau partnermu tumbang, lawannya berbalik ke arahmu. Jaga stamina.',
  'Tahan E untuk peek-a-boo: Dempsey Roll penuh menghancurkan guard apa pun.',
  'RANK: lawan dipilih dari tier-mu. Naik tier = lawan lebih cerdas & kuat.',
  'Taunt (M / N / 4) mengisi Overdrive — jangan pamer saat lawan dekat.',
];

type Phase = 'search' | 'found' | 'lock';

interface Stats {
  power: number;
  speed: number;
  armor: number;
  iq: number;
}
const statsOf = (d: OpponentDef, iq: number): Stats => ({
  power: Math.min(1, (d.dmg - 0.7) / 0.5),
  speed: Math.min(1, (d.speed - 2.9) / 1.3),
  armor: Math.min(1, (d.hp - 70) / 95),
  iq: Math.min(1, (d.react * 0.6 + d.adapt * 0.2) * 0.75 + Math.min(0.3, iq / 60)),
});
const PWR = (s: Stats) => Math.round(1800 + (s.power * 0.4 + s.speed * 0.2 + s.armor * 0.25 + s.iq * 0.15) * 2400);
const grade = (v: number) => (v >= 0.86 ? 'S' : v >= 0.7 ? 'A' : v >= 0.52 ? 'B' : v >= 0.34 ? 'C' : 'D');
/** the three "top stats" of a fighter: the traits that stand out, named like a scouting report */
const topStats = (s: Stats): [string, string][] => {
  const all: [number, string][] = [
    [s.power, 'Overwhelming'],
    [s.speed, 'Full of Fight'],
    [s.armor, 'Iron Chin'],
    [s.iq, 'Ring General'],
  ];
  return all
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .map(([v, n]) => [grade(v), n]);
};

/**
 * THE VS SCREEN — TEKKEN 8 style, LIVE IN 3D: both Titans stand in the hangar in front of a wall of red ink
 * strokes (the engine's VS stage), the lens frames them chest-up facing each other; this overlay adds the big
 * italic names beside each fighter, the chrome VS, the scouting panels along the foot of the screen (Top Stats ·
 * Titan Power · Area · rank badge) and the stage card in the middle. Search runs with the right side unknown;
 * found reveals the opponent with a flash; lock counts down into the ring.
 */
export function Matchmaking({
  series,
  profile,
  ultra,
  iq,
  game,
  onReady,
  onTransition,
  onCancel,
}: {
  series: Series;
  profile: Profile;
  portrait: string | null;
  ultra: boolean;
  iq: number;
  game: Game | null;
  onReady: () => void;
  /** begins the selected ring transition as the final countdown number appears */
  onTransition?: () => void;
  onCancel: () => void;
}) {
  const meta = modeOf(series.mode);
  const isTeam = series.mode === 'team';
  const isTourney = series.mode === 'tournament';
  const isPlay = series.mode === 'play';
  const oppIdx = series.queue[series.step] ?? series.queue[0];
  const opp2Idx = isTeam ? (series.queue[1] ?? -1) : -1;
  const defOf = (i: number) => smartDef(ultra ? ultraDef(OPPONENTS[i]) : OPPONENTS[i], iq);
  const opp = defOf(oppIdx);
  const opp2 = opp2Idx >= 0 ? defOf(opp2Idx) : null;
  const { tier, division } = tierOf(profile.rp);
  const lv = levelOf(profile.xp);
  const me: Stats = useMemo(() => ({ power: 0.62 + lv.level * 0.006, speed: 0.72 + lv.level * 0.004, armor: 0.58 + lv.level * 0.006, iq: 0.55 + Math.min(0.4, profile.wins * 0.01) }), [lv.level, profile.wins]);
  const foe = statsOf(opp, iq);

  const searchFor = useMemo(() => (isTourney || isPlay ? 1.2 : 1.8 + Math.random() * 0.8), [isTourney, isPlay]);
  const [phase, setPhase] = useState<Phase>('search');
  const phaseAt = useRef(performance.now());
  const enterPhase = (next: Phase) => {
    phaseAt.current = performance.now();
    if (next === 'lock') setCount(VS_LOCK_BEATS);
    setPhase(next);
  };
  const [t, setT] = useState(0);
  const [pt, setPt] = useState(0);
  const [count, setCount] = useState(3);
  const [scan, setScan] = useState(0);
  const [tip] = useState(() => Math.floor(Math.random() * TIPS.length));
  const ping = useMemo(() => 18 + Math.floor(Math.random() * 20), []);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const transitionRef = useRef(onTransition);
  transitionRef.current = onTransition;
  const found = phase !== 'search';

  // ---- the 3D stage: both Titans in the hangar, the opponent revealed on 'found'
  useEffect(() => {
    if (!game) return;
    game.setVsMode(oppIdx, opp2Idx, phase);
  }, [game, oppIdx, opp2Idx, phase]);
  useEffect(() => () => game?.setVsMode(null), [game]);

  // ---- the stage card thumbnail (one wide shot of the empty ring)
  const [stageImg, setStageImg] = useState<string | null>(null);
  useEffect(() => {
    if (!game) return;
    const id = window.setTimeout(() => setStageImg(game.captureArena(320, 180)), 120);
    return () => window.clearTimeout(id);
  }, [game]);

  const t0 = useRef(performance.now());
  useEffect(() => {
    let last = -1;
    let transitionSent = false;
    let readySent = false;
    const id = window.setInterval(() => {
      const now = performance.now();
      if (phase === 'search') {
        setT((now - t0.current) / 1000);
        setScan((v) => v + 1);
      }
      const ph = Math.max(0, (now - phaseAt.current) / 1000);
      setPt(ph);
      if (phase === 'search' && ph >= searchFor) {
        enterPhase('found');
        game?.uiCue('found');
      } else if (phase === 'found' && ph >= 2.4) {
        enterPhase('lock');
      } else if (phase === 'lock') {
        // A brisk 3–2–1 plays over one clock; the final number starts the ring transition, not a fist clash.
        const c = Math.max(0, VS_LOCK_BEATS - Math.floor(ph / VS_LOCK_BEAT));
        if (c !== last) {
          last = c;
          if (c > 0) {
            setCount(c);
            game?.uiCue('lock');
            if (c === 1 && !transitionSent) {
              transitionSent = true;
              transitionRef.current?.();
            }
          } else if (!readySent) {
            readySent = true;
            game?.uiCue('go');
            window.clearInterval(id);
            readyRef.current();
          }
        }
        if (ph >= VS_LOCK_DUR && !readySent) {
          readySent = true;
          game?.uiCue('go');
          window.clearInterval(id);
          readyRef.current();
        }
      }
    }, phase === 'lock' ? 16 : 60);
    return () => window.clearInterval(id);
  }, [phase, searchFor, game]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (phase === 'search') {
          enterPhase('found');
          game?.uiCue('found');
        } else if (phase === 'found') enterPhase('lock');
      } else if (e.code === 'Escape' && phase === 'search') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, game, onCancel]);

  const stage = isTourney ? TOURNEY_STAGES[Math.min(series.step, TOURNEY_STAGES.length - 1)] : isTeam ? '2V2 TAG TEAM' : isPlay ? 'BEST OF 3' : `${tier.name} ${['', 'I', 'II', 'III'][division]}`;
  const foeName = found ? opp.name : SCAN_NAMES[scan % SCAN_NAMES.length];
  const prog = Math.min(1, t / searchFor);
  const lockFrac = phase === 'lock' ? 1 - ((pt % VS_LOCK_BEAT) / VS_LOCK_BEAT) : 0;
  const oppCol = ultra ? ULTRA_COLOR : opp.color;
  const myTop = topStats(me);
  const foeTop = topStats(foe);

  return (
    <div className={`tk-root pointer-events-auto absolute inset-0 z-40 overflow-hidden text-white tk-${phase}`}>
      <div className="tk-speed" />
      <div className="tk-grid" />
      {found && <div className="tk-flash" key={`fl-${phase}`} />}
      {phase === 'found' && (
        <>
          <div className="tk-split tk-split-l" />
          <div className="tk-split tk-split-r" />
          <div className="tk-shock" />
          <div className="tk-shock tk-shock-2" />
        </>
      )}
      {phase === 'lock' && <div className="tk-lockwash" />}

      {/* top: mode readout + net */}
      <div className="tk-top">
        <span className="tk-top-mode">{meta.name}</span>
        <span className="tk-top-sub">{stage}{ultra ? ' · ULTRA' : ''}</span>
      </div>
      <div className="tk-net">
        <span className="tk-net-dot" />
        {ACCOUNT_REGION} · PING {ping}MS
      </div>

      <div className="tk-stage">
        {/* the names beside the fighters */}
        <div className="tk-name tk-name-l">
          <span className="tk-name-t" data-text={ACCOUNT_NAME}>
            {ACCOUNT_NAME}
          </span>
          {isTeam && <span className="tk-name-s">+ {PLAYER_NAME} MK-II</span>}
        </div>
        {!found && (
          <div className="tk-reticle">
            <span className="tk-reticle-ring" />
            <span className="tk-reticle-ring tk-reticle-ring-2" />
            <span className="tk-reticle-x" />
            <span className="tk-reticle-k">SCANNING · {Math.round(prog * 100)}%</span>
          </div>
        )}
        <div className={`tk-name tk-name-r ${found ? 'tk-name-in' : 'tk-name-scan'}`} key={found ? 'f' : 's'}>
          <span className="tk-name-t" data-text={foeName} style={found ? { color: '#fff' } : undefined}>
            {foeName}
          </span>
          {found && opp2 && <span className="tk-name-s">+ {opp2.name}</span>}
          {!found && <span className="tk-name-s">MENCOCOKKAN · {Math.round(prog * 100)}%</span>}
        </div>

        {/* the VS */}
        <div className={`tk-vs-wrap ${found ? 'tk-vs-on' : ''}`}>
          <span className="tk-vs-flare" />
          <span className="tk-vs">VS</span>
        </div>
        {phase === 'lock' && (
          <div className="tk-countdown" key={count}>
            <span className="tk-count-ring" />
            <span className="tk-count">{count}</span>
            <span className="tk-count-k">MASUK RING</span>
          </div>
        )}

        {/* the scouting panels along the foot */}
        <div className="tk-foot">
          <Panel side="l" title={isTeam ? 'TIM KAMU' : 'PILOT WRC'} top={myTop} power={PWR(me)} area={ACCOUNT_REGION} badge={`${tier.name} ${['', 'I', 'II', 'III'][division]}`} badgeColor={tier.color} sub={`LV.${lv.level} · ${PLAYER_NAME}`} ready />
          <div className="tk-stagecard">
            <div className="tk-stagecard-k">STAGE</div>
            <div className="tk-stagecard-t">STEEL TITANS ARENA</div>
            <div className="tk-stagecard-img">{stageImg ? <img src={stageImg} alt="" draggable={false} /> : null}</div>
            <div className="tk-stagecard-act">
              {phase === 'search' && (
                <>
                  <button onClick={onCancel} className="tk-btn tk-btn-ghost">
                    BATAL
                  </button>
                  <button
                    onClick={() => {
                      enterPhase('found');
                      game?.uiCue('found');
                    }}
                    className="tk-btn"
                  >
                    PERCEPAT
                  </button>
                </>
              )}
              {phase === 'found' && (
                <button onClick={() => enterPhase('lock')} className="tk-btn tk-btn-go">
                  MASUK RING · ENTER
                </button>
              )}
              {phase === 'lock' && (
                <div className="tk-lock">
                  MASUK RING <span className="tk-lock-bar" style={{ width: `${lockFrac * 100}%` }} />
                </div>
              )}
            </div>
          </div>
          <Panel side="r" title={found ? (isTourney ? `LAWAN · ${stage}` : isTeam ? 'TIM LAWAN' : 'PENANTANG') : 'MENCARI LAWAN'} top={found ? foeTop : null} power={found ? PWR(foe) : 0} area={found ? 'WRC CIRCUIT' : '—'} badge={found ? (ultra ? 'ULTRA' : opp.title) : '—'} badgeColor={found ? oppCol : '#6b7280'} sub={found ? `${opp.title}${opp2 ? ` · + ${opp2.name}` : ''}` : 'MENCOCOKKAN TIER & PING'} ready={found} />
        </div>
      </div>

      <div className="tk-tip">{TIPS[tip]}</div>
      <div className="tk-emblem">
        <Emblem size={44} />
      </div>
    </div>
  );
}

function Panel({ side, title, top, power, area, badge, badgeColor, sub, ready }: { side: 'l' | 'r'; title: string; top: [string, string][] | null; power: number; area: string; badge: string; badgeColor: string; sub: string; ready: boolean }) {
  return (
    <div className={`tk-panel tk-panel-${side} ${ready ? 'tk-panel-on' : ''}`}>
      <div className="tk-panel-head">
        <span className="tk-panel-dot" style={{ background: ready ? '#fff' : '#555' }} />
        <span className="tk-panel-title">{title}</span>
        <span className="tk-panel-sub">{sub}</span>
      </div>
      <div className="tk-panel-body">
        <div className="tk-panel-col">
          <div className="tk-panel-k">Top Stats</div>
          {(top ?? [
            ['-', '—'],
            ['-', '—'],
            ['-', '—'],
          ]).map(([g, n], i) => (
            <div key={i} className="tk-stat">
              <span className={`tk-stat-g tk-g-${g}`}>{g}</span>
              <span className="tk-stat-n">{n}</span>
            </div>
          ))}
        </div>
        <div className="tk-panel-col tk-panel-col-r">
          <div className="tk-panel-k">Titan Power</div>
          <div className="tk-panel-pwr">{power > 0 ? power.toLocaleString('id-ID') : '—'}</div>
          <div className="tk-panel-k">Area</div>
          <div className="tk-panel-v">{area}</div>
        </div>
        <div className="tk-badge" style={{ borderColor: badgeColor, color: badgeColor }}>
          <span className="tk-badge-t">{badge}</span>
        </div>
      </div>
    </div>
  );
}
