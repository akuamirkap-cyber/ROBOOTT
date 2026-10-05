import { useEffect, useMemo, useRef, useState } from 'react';
import { CAM_MODES, Game, GFX_MODES, OPPONENTS, loadCamMode, loadDifficulty, loadFootwork, loadGfxMode, loadIq, type GfxMode, type HudState } from './game/Game';
import { loadSfxProfile, type SfxProfile } from './game/audio';
import { Menu } from './ui/Menu';
import { Hud, TouchControls } from './ui/Hud';
import { MatchEnd, PauseMenu } from './ui/Overlays';
import { applyOutcome, loadProfile, makeSeries, saveProfile, seriesAfterBout, seriesLabel, type ModeId, type Profile, type Series } from './game/progress';
import { Matchmaking } from './ui/Matchmaking';
import { Bracket } from './ui/Bracket';
import { usePortrait } from './ui/Profile';

const LS_KEY = 'steel-titans-unlocked';

const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
    <rect x="2" y="1" width="3.5" height="12" />
    <rect x="8.5" y="1" width="3.5" height="12" />
  </svg>
);

const IconSound = ({ off }: { off: boolean }) => (
  <svg width="18" height="16" viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M2 6h3l4-3.5v11L5 10H2z" fill="currentColor" />
    {off ? (
      <path d="M12 5l5 6M17 5l-5 6" />
    ) : (
      <>
        <path d="M12 5.5c1.3 1.3 1.3 3.7 0 5" />
        <path d="M14.5 3.5c2.4 2.4 2.4 6.6 0 9" />
      </>
    )}
  </svg>
);

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [sel, setSel] = useState(0);

  const [fwLocal, setFwLocal] = useState<number>(loadFootwork);
  const fwNow = hud?.fw ?? fwLocal; // the game is the source of truth ([ ] keys change it during a fight)
  const pickFw = (m: number) => {
    setFwLocal(m);
    gameRef.current?.setFootwork(m);
  };

  const [camLocal, setCamLocal] = useState<number>(loadCamMode);
  const camNow = hud?.cam ?? camLocal; // the game is the source of truth (/ . change it during a fight)
  const pickCam = (i: number) => {
    setCamLocal(i);
    gameRef.current?.setCamMode(i);
  };

  const [iqLocal, setIqLocal] = useState<number>(loadIq);
  const iqNow = hud?.iq ?? iqLocal; // the game is the source of truth
  const pickIq = (n: number) => {
    setIqLocal(n);
    gameRef.current?.setIq(n);
  };

  const [gfxLocal, setGfxLocal] = useState<GfxMode>(loadGfxMode);
  const gfxNow = hud?.gfxMode ?? gfxLocal; // the game is the source of truth
  const pickGfx = (m: GfxMode) => {
    setGfxLocal(m);
    gameRef.current?.setGfxMode(m);
  };

  const [ultra, setUltraState] = useState<boolean>(() => loadDifficulty() === 'ultra');
  const pickUltra = (on: boolean) => {
    setUltraState(on);
    gameRef.current?.setUltra(on);
  };

  const [sfxId, setSfxId] = useState<SfxProfile>(loadSfxProfile);
  const pickSfx = (id: SfxProfile) => {
    setSfxId(id);
    gameRef.current?.setSoundProfile(id);
  };

  const [unlocked, setUnlocked] = useState(() => {
    const v = Number(localStorage.getItem(LS_KEY));
    return Number.isFinite(v) ? Math.min(OPPONENTS.length - 1, Math.max(0, v)) : 0;
  });
  const touch = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches, []);

  useEffect(() => {
    if (!mount.current) return;
    const g = new Game(mount.current, setHud);
    gameRef.current = g;
    setGame(g);
    return () => {
      g.dispose();
      gameRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------- account profile · game modes · series
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [mode, setMode] = useState<ModeId>('play');
  const [series, setSeries] = useState<Series | null>(null);
  const seriesRef = useRef<Series | null>(null);
  seriesRef.current = series;
  // the pre-match flow: TOURNAMENT shows the bracket first, RANK / TEAM / TOURNAMENT all go through matchmaking
  const [stage, setStage] = useState<null | 'bracket' | 'matchmaking'>(null);
  const portrait = usePortrait(game, hud?.helmetSkin ?? 0, hud?.gloveSkin ?? 0, hud?.armorSkin ?? 0);

  /** drop the bell: the current bout of a series goes into the ring */
  const launch = (s: Series) => {
    const g = gameRef.current;
    if (!g) return;
    setStage(null);
    const idx = s.queue[Math.min(s.step, s.queue.length - 1)];
    if (s.mode !== 'play') setSel(idx);
    g.startMatch(idx, s.mode === 'team' ? { enemy2: s.queue[1] ?? (idx + 1) % OPPONENTS.length } : undefined);
  };

  const startMode = (m: ModeId) => {
    const s = makeSeries(m, OPPONENTS.length, profile.rp, sel);
    if (!s) return;
    setMode(m);
    setSeries(s);
    // every mode goes through the VS screen (PLAY MATCH: the picked challenger is locked in there)
    if (m === 'tournament') setStage('bracket');
    else setStage('matchmaking');
  };

  const result = hud?.result;
  const oppIndex = hud?.oppIndex ?? 0;
  const ultraNow = hud?.ultra ?? false;
  useEffect(() => {
    if (result !== 'win' && result !== 'lose') return;
    const win = result === 'win';
    if (win) {
      const next = Math.min(OPPONENTS.length - 1, oppIndex + 1);
      setUnlocked((u) => {
        const v = Math.max(u, next);
        localStorage.setItem(LS_KEY, String(v));
        return v;
      });
    }
    const cur = seriesRef.current ?? { mode: 'play' as ModeId, queue: [oppIndex], step: 0, wins: 0, losses: 0, done: false, won: false };
    const after = seriesAfterBout(cur, win);
    setSeries(after);
    setProfile((p) => {
      const n = applyOutcome(p, { win, mode: cur.mode, ultra: ultraNow, seriesWon: after.done && after.won && (cur.mode === 'tournament' || cur.mode === 'team') });
      saveProfile(n);
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, oppIndex]);

  const phase = hud?.phase ?? 'menu';
  const inMatch = phase === 'walk' || phase === 'intro' || phase === 'fight' || phase === 'ko';
  // the fps chip turns amber below 57 and red below 45, so a dip is visible at a glance
  const fpsNow = hud?.fps ?? 60;
  const fpsColor = fpsNow >= 57 ? '#7dffc4' : fpsNow >= 45 ? '#ffd34a' : '#ff7a7a';

  /** the live FPS readout — it doubles as the graphics-mode switch, so the player can always see and steer the cost */
  const gfxChip = () => (
    <button
      onClick={() => {
        const i = GFX_MODES.findIndex((m) => m.id === gfxNow);
        pickGfx(GFX_MODES[(i + 1) % GFX_MODES.length].id);
      }}
      className="ghost cut-sm pointer-events-auto flex h-9 items-center gap-1.5 px-2.5 font-tech text-[9px] font-bold tracking-[0.16em]"
      style={{ color: fpsColor }}
      title={`Grafis: ${GFX_MODES.find((m) => m.id === gfxNow)?.name ?? 'OTOMATIS'} · ${hud?.gfx ?? ''} — klik untuk ganti`}
    >
      <span className="font-display text-[13px] leading-none">{Math.round(hud?.fps ?? 60)}</span>
      <span className="opacity-75">FPS</span>
      <span className="hidden opacity-60 sm:inline">· {hud?.gfx ?? 'MAKSIMAL'}</span>
    </button>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mount} className="absolute inset-0" />
      {inMatch && <div className="vignette" />}

      {hud && inMatch && <Hud h={hud} touch={touch} />}
      {inMatch && touch && phase === 'fight' && <TouchControls game={game} />}

      {phase === 'menu' && !stage && (
        <Menu
          unlocked={unlocked}
          sel={sel}
          onSel={(i) => {
            setSel(i);
            game?.selectOpponent(i);
          }}
          onStart={() => startMode('play')}
          profile={profile}
          portrait={portrait}
          mode={mode}
          onMode={setMode}
          onStartMode={startMode}
          sfx={sfxId}
          onSfx={pickSfx}
          ultra={ultra}
          onUltra={pickUltra}
          fw={fwNow}
          onFw={pickFw}
          cam={camNow}
          onCam={pickCam}
          iq={iqNow}
          onIq={pickIq}
          muted={muted}
          onToggleMute={() => {
            const m = !muted;
            setMuted(m);
            gameRef.current?.setMuted(m);
          }}
          game={game}
          hud={hud}
        />
      )}

      {phase === 'menu' && stage === 'bracket' && series && (
        <Bracket
          series={series}
          profile={profile}
          ultra={ultra}
          game={game}
          onStart={() => setStage('matchmaking')}
          onBack={() => {
            setStage(null);
            setSeries(null);
          }}
        />
      )}
      {phase === 'menu' && stage === 'matchmaking' && series && (
        <Matchmaking
          series={series}
          profile={profile}
          portrait={portrait}
          ultra={ultra}
          iq={iqNow}
          game={game}
          onReady={() => launch(series)}
          onCancel={() => {
            if (series.mode === 'tournament') setStage('bracket');
            else {
              setStage(null);
              setSeries(null);
            }
          }}
        />
      )}

      {hud && phase === 'matchEnd' && (
        <MatchEnd
          h={hud}
          series={series}
          label={seriesLabel(series)}
          onNext={
            series && !series.done && series.step < series.queue.length - 1
              ? () => {
                  const nxt = { ...series, step: series.step + 1 };
                  setSeries(nxt);
                  // the tournament goes back to the bracket between rounds, then through the matchmaking lock-in
                  game?.toMenu();
                  setStage('bracket');
                }
              : (!series || series.mode === 'play') && hud.oppIndex < OPPONENTS.length - 1
                ? () => {
                    const idx = hud.oppIndex + 1;
                    setSeries({ mode: 'play', queue: [idx], step: 0, wins: 0, losses: 0, done: false, won: false });
                    setSel(idx);
                    game?.toMenu();
                    setStage('matchmaking');
                  }
                : null
          }
          onRetry={() => {
            if (series && series.mode !== 'play') startMode(series.mode);
            else {
              setSeries({ mode: 'play', queue: [hud.oppIndex], step: 0, wins: 0, losses: 0, done: false, won: false });
              game?.startMatch(hud.oppIndex);
            }
          }}
          onBracket={
            series && series.mode === 'tournament' && series.done
              ? () => {
                  game?.toMenu();
                  setStage('bracket');
                }
              : null
          }
          onMenu={() => {
            setSeries(null);
            setSel(hud.oppIndex);
            game?.toMenu();
            game?.selectOpponent(hud.oppIndex);
          }}
        />
      )}

      {hud?.paused && (
        <PauseMenu
          sfx={sfxId}
          onSfx={pickSfx}
          fw={fwNow}
          onFw={pickFw}
          cam={camNow}
          onCam={pickCam}
          iq={iqNow}
          onIq={pickIq}
          gfx={gfxNow}
          onGfx={pickGfx}
          fps={hud.fps}
          tier={hud.gfx}
          onResume={() => game?.togglePause()}
          onMenu={() => {
            game?.togglePause();
            game?.toMenu();
            game?.selectOpponent(hud.oppIndex);
          }}
        />
      )}

      {/* ---------- the live FPS / graphics chip on the lobby screen ---------- */}
      {phase === 'menu' && <div className="absolute bottom-3 left-3 z-40 flex gap-2">{gfxChip()}</div>}

      {/* ---------- utility buttons (fps / graphics / pause / sound during match) ---------- */}
      {phase !== 'menu' && (
        <div className="absolute right-3 z-30 flex gap-2" style={inMatch ? (touch ? { top: 78 } : { bottom: 12 }) : { top: 12 }}>
          {gfxChip()}
          {inMatch && (
            <button
              onClick={() => pickCam((camNow + 1) % CAM_MODES.length)}
              className="ghost cut-sm pointer-events-auto flex h-9 items-center gap-1.5 px-2.5 font-tech text-[9px] font-bold tracking-[0.16em] text-sky-200"
              title="Ganti mode kamera ( / dan . )"
            >
              <span>🎥</span>
              <span className="hidden sm:inline">{CAM_MODES[camNow]?.name ?? 'KAMERA'}</span>
            </button>
          )}
          {inMatch && (
            <button onClick={() => game?.togglePause()} className="ghost cut-sm pointer-events-auto grid h-9 w-9 place-items-center" title="Pause (Esc)">
              <IconPause />
            </button>
          )}
          <button
            onClick={() => {
              const m = !muted;
              setMuted(m);
              gameRef.current?.setMuted(m);
            }}
            className="ghost cut-sm pointer-events-auto grid h-9 w-11 place-items-center"
            title={muted ? 'Suara mati' : 'Suara menyala'}
          >
            <IconSound off={muted} />
          </button>
        </div>
      )}
    </div>
  );
}
