import { useEffect, useMemo, useRef, useState } from 'react';
import { Game, OPPONENTS, loadDifficulty, loadFootwork, loadIq, type HudState } from './game/Game';
import { loadSfxProfile, type SfxProfile } from './game/audio';
import { Menu } from './ui/Menu';
import { Hud, TouchControls } from './ui/Hud';
import { MatchEnd, PauseMenu } from './ui/Overlays';

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

  const [iqLocal, setIqLocal] = useState<number>(loadIq);
  const iqNow = hud?.iq ?? iqLocal; // the game is the source of truth
  const pickIq = (n: number) => {
    setIqLocal(n);
    gameRef.current?.setIq(n);
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

  const result = hud?.result;
  const oppIndex = hud?.oppIndex ?? 0;
  useEffect(() => {
    if (result === 'win') {
      const next = Math.min(OPPONENTS.length - 1, oppIndex + 1);
      setUnlocked((u) => {
        const v = Math.max(u, next);
        localStorage.setItem(LS_KEY, String(v));
        return v;
      });
    }
  }, [result, oppIndex]);

  const phase = hud?.phase ?? 'menu';
  const inMatch = phase === 'intro' || phase === 'fight' || phase === 'ko';

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mount} className="absolute inset-0" />
      {inMatch && <div className="vignette" />}

      {hud && inMatch && <Hud h={hud} touch={touch} />}
      {inMatch && touch && phase === 'fight' && <TouchControls game={game} />}

      {phase === 'menu' && (
        <Menu
          unlocked={unlocked}
          sel={sel}
          onSel={(i) => {
            setSel(i);
            game?.selectOpponent(i);
          }}
          onStart={() => game?.startMatch(sel)}
          sfx={sfxId}
          onSfx={pickSfx}
          ultra={ultra}
          onUltra={pickUltra}
          fw={fwNow}
          onFw={pickFw}
          iq={iqNow}
          onIq={pickIq}
          game={game}
          hud={hud}
        />
      )}

      {hud && phase === 'matchEnd' && (
        <MatchEnd
          h={hud}
          onNext={
            hud.oppIndex < OPPONENTS.length - 1
              ? () => {
                  setSel(hud.oppIndex + 1);
                  game?.startMatch(hud.oppIndex + 1);
                }
              : null
          }
          onRetry={() => game?.startMatch(hud.oppIndex)}
          onMenu={() => {
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
          iq={iqNow}
          onIq={pickIq}
          onResume={() => game?.togglePause()}
          onMenu={() => {
            game?.togglePause();
            game?.toMenu();
            game?.selectOpponent(hud.oppIndex);
          }}
        />
      )}

      {/* ---------- utility buttons (pause / sound) ---------- */}
      <div className="absolute right-3 z-30 flex gap-2" style={inMatch ? (touch ? { top: 78 } : { bottom: 12 }) : { top: 12 }}>
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
    </div>
  );
}
