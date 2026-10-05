import { CAM_MODES, PLAYER_NAME, ULTRA_COLOR, type Game, type HudState } from '../game/Game';
import { Key } from './Emblem';

function Pips({ n, color }: { n: number; color: string }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1].map((i) => (
        <div key={i} className="h-3.5 w-3.5 rotate-45 border border-white/80" style={{ background: i < n ? color : 'rgba(0,0,0,0.6)', boxShadow: i < n ? `0 0 12px ${color}` : 'none' }} />
      ))}
    </div>
  );
}

function HpBar({ value, max, from, to, right, low }: { value: number; max: number; from: string; to: string; right?: boolean; low?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const side = right ? 'right' : 'left';
  return (
    <div className={`${right ? 'plate-r' : 'plate-l'} hp-frame relative h-8 w-full sm:h-9`}>
      <div className="absolute inset-[3px] overflow-hidden bg-black/75">
        {/* white "damage trail" that drains slowly behind the real bar */}
        <div className="absolute inset-y-0 transition-[width] delay-300 duration-700 ease-out" style={{ width: `${pct}%`, background: '#ffffff', opacity: 0.85, [side]: 0 }} />
        <div
          className={`absolute inset-y-0 transition-[width] duration-100 ${low ? 'hp-low' : ''}`}
          style={{ width: `${pct}%`, background: `linear-gradient(${right ? 270 : 90}deg, ${from}, ${to})`, boxShadow: `0 0 16px ${to}`, [side]: 0 }}
        />
        <div className="hp-ticks absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-1/2 bg-white/15" />
      </div>
    </div>
  );
}

function FighterPlate({
  right,
  name,
  nameColor,
  from,
  to,
  hp,
  max,
  wins,
  stam,
}: {
  right?: boolean;
  name: string;
  nameColor: string;
  from: string;
  to: string;
  hp: number;
  max: number;
  wins: number;
  stam?: number;
}) {
  const low = hp > 0 && hp / max < 0.25;
  return (
    <div className="min-w-0 flex-1">
      <div className={`mb-1 flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        <div className="hex-badge shrink-0" style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}>
          {name.charAt(0)}
        </div>
        <div className="truncate font-tech text-[13px] font-black tracking-[0.1em] sm:text-lg" style={{ color: nameColor, textShadow: `0 0 14px ${to}88` }}>
          {name}
        </div>
        <div className={right ? 'mr-auto' : 'ml-auto'}>
          <Pips n={wins} color={to} />
        </div>
      </div>
      <HpBar value={hp} max={max} from={from} to={to} right={right} low={low} />
      <div className={`mt-1.5 flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
        {stam !== undefined && (
          <div className="stam-track w-3/5">
            <div className="h-full transition-[width] duration-100" style={{ width: `${stam}%`, background: stam < 20 ? '#ff4a4a' : 'linear-gradient(90deg,#3dff8a,#b6ff6a)' }} />
          </div>
        )}
        <span className="font-tech text-[10px] tracking-widest text-white/60">{Math.ceil(hp)}</span>
      </div>
    </div>
  );
}

/** TEAM MATCH: the tag partner's slim plate under the main one */
function PartnerPlate({ right, name, color, hp, max, ko }: { right?: boolean; name: string; color: string; hp: number; max: number; ko: boolean }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className={`mt-1.5 flex items-center gap-2 ${right ? 'flex-row-reverse' : ''} ${ko ? 'opacity-55' : ''}`}>
      <span className="rounded-sm px-1 font-tech text-[7.5px] font-bold tracking-[0.16em] text-black" style={{ background: color }}>
        {ko ? 'K.O.' : 'TAG'}
      </span>
      <span className="truncate font-tech text-[10px] font-black tracking-[0.1em]" style={{ color, textDecoration: ko ? 'line-through' : 'none' }}>
        {name}
      </span>
      <div className={`h-[7px] w-2/5 overflow-hidden rounded-sm border border-white/15 bg-black/60 ${right ? 'mr-auto' : 'ml-auto'}`}>
        <div className="h-full transition-[width] duration-150" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, #ffffff)`, marginLeft: right ? 'auto' : 0 }} />
      </div>
      <span className="font-tech text-[9px] tracking-widest text-white/55">{Math.ceil(hp)}</span>
    </div>
  );
}

function Hint({ k, children }: { k: string; children: string }) {
  return (
    <span className="mr-3 inline-flex items-center gap-1">
      <Key>{k}</Key>
      <span>{children}</span>
    </span>
  );
}

export function Hud({ h, touch }: { h: HudState; touch: boolean }) {
  const enemyColor = h.ultra ? ULTRA_COLOR : h.eColor;
  const meterReady = h.meter >= 100;
  const timeLow = h.phase === 'fight' && h.timeLeft <= 10;
  const pLow = h.phase === 'fight' && h.pHp > 0 && h.pHp / h.pMax < 0.25;
  const bannerColor = h.banner
    ? h.banner.kind === 'ko'
      ? '#ff3b3b'
      : h.banner.kind === 'fight'
        ? '#ffd34a'
        : h.banner.kind === 'count'
          ? '#7fe3ff'
          : '#ffffff'
    : '#ffffff';
  const bannerShort = h.banner?.kind === 'fight' || h.banner?.kind === 'count';
  return (
    <div className="pointer-events-none absolute inset-0 text-white">
      {pLow && <div className="lowhp-vignette" />}

      {/* ---------- top plates + timer ---------- */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-center gap-2 px-3 pt-3 sm:gap-4 sm:px-8 sm:pt-5">
        <div className="min-w-0 flex-1">
          <FighterPlate name={PLAYER_NAME} nameColor="#9fe3ff" from="#1b8fe0" to="#35d6ff" hp={h.pHp} max={h.pMax} wins={h.wins[0]} stam={h.stam} />
          {h.team && <PartnerPlate name={h.team.ally.name} color={h.team.ally.color} hp={h.team.ally.hp} max={h.team.ally.max} ko={h.team.ally.ko} />}
        </div>
        <div className="flex w-24 shrink-0 flex-col items-center sm:w-32">
          <div className={`timer-hex ${timeLow ? 'timer-low' : ''}`}>
            <span className="font-display text-4xl leading-none sm:text-5xl">{h.timeLeft}</span>
          </div>
          <div className="mt-1 font-tech text-[10px] font-bold tracking-[0.35em] text-amber-300 sm:text-xs">RONDE {h.round}</div>
          {h.iq > 1 && (
            <div className="mt-1 border border-fuchsia-400/70 bg-fuchsia-500/20 px-2 py-0.5 font-tech text-[10px] font-bold tracking-[0.25em] text-fuchsia-200 sm:text-xs">
              🧠 {h.iq >= 12 ? 'STRATEGIS' : `IQ ${h.iq}×`}
            </div>
          )}
          {/* what the strategist is actually trying to do to you right now */}
          {h.ePlan && (
            <div className="mt-1 animate-pulse border border-fuchsia-300/50 bg-black/60 px-2 py-0.5 font-tech text-[9px] font-bold tracking-[0.2em] text-fuchsia-100">{h.ePlan}</div>
          )}
          {h.ultra && (
            <div className="ultra-badge mt-1 border px-2 py-0.5 font-tech text-[10px] font-bold tracking-[0.25em] text-white sm:text-xs" style={{ borderColor: ULTRA_COLOR, background: 'rgba(255,42,74,0.25)', textShadow: `0 0 10px ${ULTRA_COLOR}` }}>
              ☠ ULTRA HARD
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <FighterPlate right name={h.eName} nameColor={enemyColor} from={h.ultra ? '#7a0c1f' : '#a31818'} to={enemyColor === '#ff3b3b' ? '#ff4a4a' : enemyColor} hp={h.eHp} max={h.eMax} wins={h.wins[1]} />
          {h.team && <PartnerPlate right name={h.team.enemy2.name} color={h.team.enemy2.color} hp={h.team.enemy2.hp} max={h.team.enemy2.max} ko={h.team.enemy2.ko} />}
        </div>
      </div>

      {/* ---------- peek-a-boo / dempsey roll ---------- */}
      {(h.ippo || h.roll > 0.02) && (
        <div className="absolute bottom-[70px] left-1/2 w-[min(420px,46%)] -translate-x-1/2 sm:bottom-[84px]">
          <div className="mb-1 flex items-end justify-between font-tech text-[10px] font-bold tracking-[0.3em]">
            <span className={h.roll > 0.85 ? 'text-cyan-200' : 'text-white/65'}>{h.ippo ? 'PEEK-A-BOO' : 'DEMPSEY ROLL'}</span>
            {h.roll > 0.85 ? <span className="animate-pulse text-cyan-200">DEMPSEY SIAP — SERANG!</span> : <span className="text-white/45">{Math.floor(h.roll * 100)}%</span>}
          </div>
          <div className={`od-frame ${h.roll > 0.85 ? 'meter-ready' : ''}`} style={{ height: 14 }}>
            <div className="od-in">
              <div className="h-full transition-[width] duration-100" style={{ width: `${Math.min(100, h.roll * 100)}%`, background: 'linear-gradient(90deg,#1b8fe0,#35d6ff,#c9f6ff)' }} />
              <div className="od-ticks" />
            </div>
          </div>
        </div>
      )}

      {/* ---------- overdrive meter ---------- */}
      <div className="absolute bottom-4 left-1/2 w-[min(520px,52%)] -translate-x-1/2 sm:bottom-6">
        <div className="mb-1 flex items-end justify-between font-tech text-[10px] font-bold tracking-[0.3em]">
          <span className={meterReady ? 'text-amber-300' : 'text-white/65'}>OVERDRIVE</span>
          {meterReady ? (
            <span className="animate-pulse text-amber-300">SIAP — {touch ? 'TEKAN OD' : 'TEKAN [R]'}</span>
          ) : (
            <span className="text-white/45">{Math.floor(h.meter)}%</span>
          )}
        </div>
        <div className={`od-frame ${meterReady ? 'meter-ready' : ''}`}>
          <div className="od-in">
            <div className={`h-full transition-[width] duration-150 ${meterReady ? 'od-fill-ready' : ''}`} style={{ width: `${Math.min(100, h.meter)}%`, background: 'linear-gradient(90deg,#ff5a1a,#ffb02e,#ffe27a)' }} />
            <div className="od-ticks" />
          </div>
        </div>
      </div>

      {/* ---------- combo ---------- */}
      {h.combo >= 2 && (
        <div key={h.combo} className="combo-pop absolute right-4 top-[34%] text-right sm:right-10">
          <div className="font-tech text-[10px] font-bold tracking-[0.4em] text-amber-300">COMBO</div>
          <div
            className="font-display text-7xl leading-none sm:text-9xl"
            style={{ background: 'linear-gradient(180deg,#ffffff,#ffd34a 55%,#ff7a1a)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 18px rgba(255,170,30,0.8))' }}
          >
            {h.combo}
          </div>
          <div className="ml-auto mt-1 h-1 w-24 bg-gradient-to-l from-amber-300 to-transparent" />
          <div className="font-display text-xl tracking-[0.25em] text-white sm:text-2xl">HITS</div>
        </div>
      )}

      {/* ---------- stance hand ---------- */}
      {h.phase === 'fight' && (
        <div className="absolute left-3 top-[86px] sm:left-6 sm:top-[104px]">
          <div
            className={`flex items-center gap-2 border px-2 py-1 font-tech text-[10px] font-bold tracking-[0.22em] backdrop-blur-sm transition-colors ${
              h.handFlash > 0 ? 'border-amber-300 bg-amber-400/25 text-amber-100' : 'border-white/25 bg-black/45 text-white/70'
            }`}
          >
            <span className={h.hand === 1 ? 'text-orange-300' : 'text-sky-300'}>{h.hand === 1 ? '▶' : '◀'}</span>
            <span>TANGAN {h.hand === 1 ? 'KANAN' : 'KIRI'}</span>
          </div>
          {/* the target every punch is aimed at — tap SPACE / T to switch */}
          <div
            className={`mt-1 flex items-center gap-2 border px-2 py-1 font-tech text-[10px] font-bold tracking-[0.22em] backdrop-blur-sm transition-colors ${
              h.aimFlash > 0 ? 'border-rose-300 bg-rose-400/25 text-rose-100' : 'border-white/25 bg-black/45 text-white/70'
            }`}
          >
            <span className={h.aimMode === 2 ? 'text-fuchsia-300' : h.aim === 1 ? 'text-orange-300' : 'text-sky-300'}>{h.aimMode === 2 ? '◎◎' : '◎'}</span>
            <span>TARGET {h.aimMode === 2 ? 'REMIX' : h.aim === 1 ? 'DADA' : 'KEPALA'}</span>
            {h.aimMode === 2 && <span className={`ml-1 text-[9px] ${h.aim === 1 ? 'text-orange-300' : 'text-sky-300'}`}>▸{h.aim === 1 ? 'DADA' : 'KEPALA'}</span>}
          </div>
          {h.parry ? (
            <div className="mt-1 animate-pulse border border-amber-300/70 bg-amber-400/20 px-2 py-0.5 text-center font-tech text-[10px] font-bold tracking-[0.22em] text-amber-100">PARRY [L]!</div>
          ) : (
            <div className={`mt-1 border px-2 py-0.5 text-center font-tech text-[10px] font-bold tracking-[0.22em] ${h.parryCd > 0 ? 'border-white/15 bg-black/40 text-white/35' : 'border-amber-300/50 bg-black/40 text-amber-200/90'}`}>
              CTR [L] {h.parryCd > 0 ? `${h.parryCd.toFixed(1)}s` : 'SIAP'}
            </div>
          )}
          {/* RAGE MODE [G] status badge */}
          <div
            className={`mt-1 flex items-center justify-center gap-1.5 border px-2 py-1 font-tech text-[10px] font-bold tracking-[0.22em] backdrop-blur-sm transition-all ${
              h.rage
                ? 'animate-pulse border-orange-400 bg-gradient-to-r from-red-600/50 to-amber-500/40 text-amber-100 shadow-[0_0_16px_rgba(255,80,30,0.65)]'
                : (h.rageFlash ?? 0) > 0
                  ? 'border-orange-300 bg-orange-500/25 text-orange-100'
                  : 'border-white/25 bg-black/45 text-white/65'
            }`}
          >
            <span>🔥</span>
            <span>{h.rage ? 'RAGE AKTIF [G]' : 'RAGE [G]'}</span>
          </div>
        </div>
      )}

      {/* ---------- controls legend ---------- */}
      {!touch && (
        <div className="glass cut-sm absolute bottom-4 left-4 hidden max-w-[330px] px-3 py-2 text-[11px] leading-6 text-white/75 lg:block">
          <div>
            <Hint k="WASD">gerak</Hint>
            <Hint k="SHIFT">lari</Hint>
            <Hint k="×2">dash</Hint>
          </div>
          <div>
            <Hint k="A / D">ganti tangan ◀ ▶</Hint>
            <Hint k="Q">target kepala/dada</Hint>
          </div>
          <div>
            <Hint k="H J K">jab · hook · uppercut</Hint>
            <Hint k="L">counter lurus (½&#160;overdrive)</Hint>
            <Hint k="P">grab</Hint>
          </div>
          <div>
            <Hint k="SPACE">dodge ◎ (tahan = blok)</Hint>
            <Hint k="R">overdrive</Hint>
            <Hint k="G">rage 🔥</Hint>
            <Hint k="E">ippo</Hint>
          </div>
          <div>
            <Hint k="M N B">pound · sabuk · gulir</Hint>
            <Hint k="U I Y O">lambai · kabel · kincir · piston</Hint>
            <Hint k="1 2 3">servo · inti · bor</Hint>
          </div>
          <div>
            <Hint k="[ ]">footwork</Hint>
            <b className="font-tech text-emerald-300">{h.fw}×</b>
          </div>
          <div>
            <Hint k="/ .">mode kamera</Hint>
            <b className="font-tech text-sky-300">{CAM_MODES[h.cam]?.name ?? 'SIARAN'}</b>
          </div>
        </div>
      )}

      {/* ---------- centre banner ---------- */}
      {h.banner && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={h.banner.id} className="relative flex w-full items-center justify-center">
            <div
              className={`banner-band ${bannerShort ? '' : 'banner-band-long'}`}
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(6,10,26,0.88) 16%, rgba(6,10,26,0.88) 84%, transparent)',
                borderTop: `3px solid ${bannerColor}`,
                borderBottom: `3px solid ${bannerColor}`,
              }}
            />
            <div className={`relative text-center ${bannerShort ? 'banner-anim' : 'banner-anim-long'}`}>
              <div
                className={`font-display leading-none ${h.banner.kind === 'ko' ? 'text-[22vw] sm:text-[16vw]' : h.banner.kind === 'count' ? 'text-[30vw] sm:text-[20vw]' : 'text-[16vw] sm:text-[11vw]'}`}
                style={{ color: bannerColor, textShadow: '0 0 40px currentColor, 0 6px 0 rgba(0,0,0,0.7)' }}
              >
                {h.banner.text}
              </div>
              {h.banner.sub && <div className="mt-2 font-tech text-sm font-bold tracking-[0.3em] text-white/90 sm:text-xl">{h.banner.sub}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================== touch controls
function TouchBtn({ game, code, label, className = '', size = 'h-16 w-16' }: { game: Game | null; code: string; label: string; className?: string; size?: string }) {
  return (
    <button
      className={`touch-btn pointer-events-auto flex ${size} items-center justify-center rounded-full border-2 border-white/40 font-display text-lg text-white backdrop-blur-sm ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        game?.press(code);
      }}
      onPointerUp={() => game?.release(code)}
      onPointerCancel={() => game?.release(code)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export function TouchControls({ game }: { game: Game | null }) {
  const dp = 'bg-white/15';
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 pb-5">
      <div className="relative h-44 w-44">
        <div className="absolute left-14 top-0"><TouchBtn game={game} code="KeyW" label="▲" className={dp} /></div>
        <div className="absolute left-0 top-14"><TouchBtn game={game} code="KeyA" label="◀" className={dp} /></div>
        <div className="absolute right-0 top-14"><TouchBtn game={game} code="KeyD" label="▶" className={dp} /></div>
        <div className="absolute bottom-0 left-14"><TouchBtn game={game} code="KeyS" label="▼" className={dp} /></div>
        <div className="absolute left-14 top-14"><TouchBtn game={game} code="KeyF" label="RUN" className="bg-emerald-500/40 text-sm" /></div>
      </div>
      {/* 3×3 pad: strikes bottom row, then grab / counter / block, then the specials stacked above */}
      <div className="relative h-48 w-56">
        <div className="absolute left-0 top-0"><TouchBtn game={game} code="KeyH" label="JAB" className="bg-sky-500/50 text-sm" size="h-14 w-14" /></div>
        <div className="absolute left-[76px] top-0"><TouchBtn game={game} code="KeyJ" label="HOOK" className="bg-orange-500/50 text-xs" size="h-14 w-14" /></div>
        <div className="absolute left-[152px] top-0"><TouchBtn game={game} code="KeyK" label="UPPER" className="bg-purple-500/50 text-[10px]" size="h-14 w-14" /></div>
        <div className="absolute left-0 top-[72px]"><TouchBtn game={game} code="KeyP" label="GRAB" className="bg-pink-500/60 text-xs" size="h-14 w-14" /></div>
        <div className="absolute left-[76px] top-[72px]"><TouchBtn game={game} code="KeyL" label="CTR" className="bg-amber-500/60 text-sm" size="h-14 w-14" /></div>
        <div className="absolute left-[152px] top-[72px]"><TouchBtn game={game} code="KeyQ" label="TARGET" className="bg-rose-500/60 text-[9px]" size="h-14 w-14" /></div>
        <div className="absolute left-0 -top-[68px]"><TouchBtn game={game} code="Space" label="DODGE / BLOK" className="bg-emerald-500/50 text-[9px]" size="h-14 w-14" /></div>
        <div className="absolute left-[76px] -top-[68px]"><TouchBtn game={game} code="KeyR" label="OD" className="bg-amber-400/60" size="h-14 w-14" /></div>
        <div className="absolute left-[152px] -top-[68px]"><TouchBtn game={game} code="KeyE" label="IPPO" className="bg-cyan-400/50 text-[10px]" size="h-14 w-14" /></div>
        <div className="absolute left-[20px] -top-[136px]"><TouchBtn game={game} code="KeyG" label="RAGE" className="bg-red-500/65 text-[10px]" size="h-12 w-12" /></div>
        <div className="absolute left-[96px] -top-[136px]"><TouchBtn game={game} code="Freestyle" label="GAYA" className="bg-yellow-400/50 text-[10px]" size="h-12 w-12" /></div>
      </div>
    </div>
  );
}
