import { OPPONENTS, PLAYER_NAME, ULTRA_COLOR, type HudState } from '../game/Game';
import type { SfxProfile } from '../game/audio';
import { Emblem } from './Emblem';
import { CamPicker, FootworkPicker, IqPicker, SfxPicker } from './Pickers';

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

export function MatchEnd({ h, onNext, onRetry, onMenu }: { h: HudState; onNext: (() => void) | null; onRetry: () => void; onMenu: () => void }) {
  const win = h.result === 'win';
  const champion = win && h.oppIndex === OPPONENTS.length - 1;
  const col = win ? '#ffd34a' : '#ff3b3b';
  const title = champion ? (h.ultra ? 'ULTRA CHAMPION' : 'JUARA DUNIA') : win ? 'MENANG' : 'KALAH';
  const enemyColor = h.ultra ? ULTRA_COLOR : h.eColor;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/90 via-black/35 to-transparent px-4 pb-8 sm:pb-12">
      <div className="stagger text-center">
        <div className="mb-2 flex items-center justify-center gap-3">
          <Emblem size={34} />
          <span className="font-tech text-[11px] font-bold tracking-[0.4em] text-white/70">HASIL PERTANDINGAN</span>
        </div>
        <div className="font-display leading-none" style={{ fontSize: 'clamp(54px, 12vw, 148px)', color: col, textShadow: '0 0 40px currentColor, 0 6px 0 rgba(0,0,0,0.7)' }}>
          {title}
        </div>
        {h.ultra && (
          <div className="mt-1 font-tech text-sm font-bold tracking-[0.35em] sm:text-xl" style={{ color: ULTRA_COLOR, textShadow: `0 0 16px ${ULTRA_COLOR}` }}>
            ☠ ULTRA HARD ☠
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-4">
          <div className="text-right">
            <div className="font-tech text-[10px] font-bold tracking-[0.3em] text-sky-300">{PLAYER_NAME}</div>
            <div className="font-display text-5xl leading-none text-white">{h.wins[0]}</div>
          </div>
          <div className="font-display text-3xl text-white/40">—</div>
          <div className="text-left">
            <div className="font-tech text-[10px] font-bold tracking-[0.3em]" style={{ color: enemyColor }}>
              {h.eName}
            </div>
            <div className="font-display text-5xl leading-none text-white">{h.wins[1]}</div>
          </div>
        </div>
        <div className="mt-1 font-tech text-[11px] tracking-[0.3em] text-white/60">{win ? `${h.eName} TUMBANG` : `${h.eName} MENANG`}</div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {win && onNext && (
            <button onClick={onNext} className="play-btn cut group relative overflow-hidden px-6 py-3 font-display text-2xl tracking-[0.15em]">
              <span className="relative z-10">LAWAN BERIKUTNYA ▶▶</span>
              <span className="play-sheen" />
            </button>
          )}
          <button onClick={onRetry} className="ghost cut px-6 py-3 font-display text-2xl tracking-[0.15em]">
            {win ? 'ULANGI' : 'COBA LAGI'}
          </button>
          <button onClick={onMenu} className="ghost cut px-6 py-3 font-display text-2xl tracking-[0.15em] text-white/80">
            MENU
          </button>
        </div>
      </div>
    </div>
  );
}
