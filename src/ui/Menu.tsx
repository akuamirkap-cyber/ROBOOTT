import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { OPPONENTS, PLAYER_NAME, ULTRA_COLOR, smartDef, ultraDef, type Game, type HudState, type OpponentDef } from '../game/Game';
import type { SfxProfile } from '../game/audio';
import { Emblem, Key, cssVar } from './Emblem';
import { DifficultyPicker, FootworkPicker, IqPicker, SfxPicker } from './Pickers';

export type MenuTab = 'arena' | 'titan' | 'controls' | 'settings';

export interface MenuProps {
  unlocked: number;
  sel: number;
  onSel: (i: number) => void;
  onStart: () => void;
  sfx: SfxProfile;
  onSfx: (id: SfxProfile) => void;
  ultra: boolean;
  onUltra: (ultra: boolean) => void;
  fw: number;
  onFw: (m: number) => void;
  iq: number;
  onIq: (n: number) => void;
  game?: Game | null;
  hud?: HudState | null;
}

const act = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur();
  fn();
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function statsOf(d: OpponentDef) {
  const bars = [
    { k: 'VITALITAS', v: clamp01(d.hp / 210) },
    { k: 'KEKUATAN', v: clamp01(d.dmg / 1.4) },
    { k: 'KECEPATAN', v: clamp01(d.speed / 4.8) },
    { k: 'KECERDASAN', v: clamp01((d.react * 0.6 + d.punish * 0.4) / 0.8) },
    { k: 'AGRESI', v: clamp01(d.aggro / 0.9) },
  ];
  const threat = bars.reduce((a, b) => a + b.v, 0) / bars.length;
  return { bars, threat };
}

const THREAT = ['', 'RENDAH', 'SEDANG', 'TINGGI', 'EKSTREM', 'MAUT'];
const STYLE_DESC = [
  'Lambat dan kasar. Serangannya mudah dibaca — sparring ideal untuk menguasai kombo dasar dan timed dodge.',
  'Agresif dan lincah. Sering memotong jarak dan menghindar ke samping. Balas dengan hook lebar saat ia sidestep.',
  'Raksasa bertenaga petir. Memiliki armor tebal dan Overdrive banting penghancur. Jaga jarak dan manfaatkan counter.',
  'Sang juara dunia tak terkalahkan. Membaca pola serangan spammed, menghindar refleks sempurna, dan membalas tanpa ampun.',
];

const CONTROLS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'GERAK & FOOTWORK',
    rows: [
      [['W', 'A', 'S', 'D'], 'Maju · mundur · mengitari lawan'],
      [['SHIFT', '+', 'WASD'], 'Sprint lari kencang'],
      [['WASD', '×2'], 'Sidestep / dash cepat menghindari pukulan lurus'],
    ],
  },
  {
    title: 'SERANGAN DASAR',
    rows: [
      [['J'], 'Jab cepat pembuka serangan'],
      [['K'], 'Cross lurus bertenaga'],
      [['U'], 'Hook samping melengkung'],
      [['I'], 'Uppercut (melempar lawan ke udara)'],
      [['L'], 'Grab bantingan — menembus blok turtle lawan'],
      [['LARI', '+', 'J K U I'], 'Running strike berdaya dorong dahsyat'],
    ],
  },
  {
    title: 'BERTAHAN & COUNTER',
    rows: [
      [['SPACE'], 'Tahan blok peredam benturan'],
      [['Q'], 'TIMED DODGE — tekan saat indikator ◎ muncul di musuh untuk menghindar sempurna & dapat counter!'],
    ],
  },
  {
    title: 'GAYA IPPO — DEMPSEY ROLL',
    rows: [
      [['E'], 'PEEK-A-BOO (tahan): goyang kepala angka 8, slip otomatis dari jab & cross sambil mendekat'],
      [['E', '+', 'J K U I'], 'DEMPSEY SMASH: makin lama menenun goyangan, pukulan makin mematikan!'],
    ],
  },
  {
    title: 'TEKNIK JUARA',
    rows: [
      [['M'], 'Taunt tepuk dada (isi Overdrive, tapi terbuka diserang)'],
      [['N'], 'Taunt Zeus sang juara (angkat kedua lengan sombong)'],
      [['R'], 'OVERDRIVE FINISHER saat meter 100% penuh'],
      [['[', ']'], 'Ubah kecepatan footwork secara instan'],
      [['ESC'], 'Jeda pertandingan / Pause'],
    ],
  },
];

export function Menu({
  unlocked,
  sel,
  onSel,
  onStart,
  sfx,
  onSfx,
  ultra,
  onUltra,
  fw,
  onFw,
  iq,
  onIq,
  game,
  hud,
}: MenuProps) {
  const [tab, setTab] = useState<MenuTab>('arena');
  const [heroPose, setHeroPoseState] = useState<'stand' | 'guard' | 'victory' | 'taunt'>('stand');
  const [camMode, setCamModeState] = useState<'hero' | 'arena'>('hero');
  const dragRef = useRef({ dragging: false, startX: 0, moved: false });

  const def = smartDef(ultra ? ultraDef(OPPONENTS[sel]) : OPPONENTS[sel], iq);
  const col = ultra ? ULTRA_COLOR : def.color;
  const { bars, threat } = statsOf(def);
  const skulls = Math.max(1, Math.round(threat * 5));

  // Sync state from HUD if available
  useEffect(() => {
    if (hud?.heroPose) setHeroPoseState(hud.heroPose);
    if (hud?.menuCamMode) setCamModeState(hud.menuCamMode);
  }, [hud?.heroPose, hud?.menuCamMode]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
      if (e.code === 'Escape') {
        if (tab !== 'arena') setTab('arena');
        return;
      }
      if (e.code === 'Enter') {
        onStart();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= OPPONENTS.length && n - 1 <= unlocked) {
        if (n - 1 !== sel) onSel(n - 1);
        return;
      }
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        const next = Math.max(0, Math.min(unlocked, sel + (e.code === 'ArrowRight' ? 1 : -1)));
        if (next !== sel) onSel(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, sel, unlocked, onSel, onStart]);

  const setPose = (p: 'stand' | 'guard' | 'victory' | 'taunt') => {
    setHeroPoseState(p);
    game?.setHeroPose(p);
  };

  const toggleCam = () => {
    const next = camMode === 'hero' ? 'arena' : 'hero';
    setCamModeState(next);
    game?.setMenuCamMode(next);
  };

  // Pointer drag for 360 robot inspection
  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a')) return;
    dragRef.current = { dragging: true, startX: e.clientX, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    game?.setHeroMouse(nx, ny);

    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 2) dragRef.current.moved = true;
    game?.rotateHero(dx * 0.008);
    dragRef.current.startX = e.clientX;
  };

  const onPointerUp = () => {
    dragRef.current.dragging = false;
  };

  return (
    <div
      className="absolute inset-0 select-none overflow-hidden text-white"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* ---------- cinematic atmosphere ---------- */}
      <div className="menu-shade" />
      <div className="menu-streaks" />
      <div className="menu-scan" />

      {/* corner cyber markers */}
      <span className="corner left-3 top-3 border-l-2 border-t-2" />
      <span className="corner right-3 top-3 border-r-2 border-t-2" />
      <span className="corner bottom-3 left-3 border-b-2 border-l-2" />
      <span className="corner bottom-3 right-3 border-b-2 border-r-2" />

      {/* =================================================================== TOP NAVIGATION BAR (Top Bar Contract: 3 zones) */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between border-b border-white/10 bg-slate-950/40 px-4 py-3 backdrop-blur-md sm:px-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="pointer-events-auto flex items-center gap-3">
          <Emblem size={34} />
          <div>
            <div className="font-display text-[22px] leading-tight tracking-[0.14em]">
              <span className="chrome-text">STEEL</span>{' '}
              <span className={ultra ? 'red-text' : 'blue-text'}>TITANS</span>
            </div>
            <div className="font-tech text-[8px] tracking-[0.35em] text-white/55">
              WORLD ROBOT CHAMPIONSHIP · 2026
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Tabs (Segmented Control) */}
        <nav className="pointer-events-auto hidden md:flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 p-1">
          <button
            onClick={act(() => setTab('arena'))}
            className={`cut-sm flex items-center gap-1.5 px-3 py-1.5 font-tech text-[10px] font-bold tracking-[0.18em] transition-all ${
              tab === 'arena'
                ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>⚔</span> ARENA MATCH
          </button>
          <button
            onClick={act(() => setTab('titan'))}
            className={`cut-sm flex items-center gap-1.5 px-3 py-1.5 font-tech text-[10px] font-bold tracking-[0.18em] transition-all ${
              tab === 'titan'
                ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🤖</span> TITAN SAYA
          </button>
          <button
            onClick={act(() => setTab('controls'))}
            className={`cut-sm flex items-center gap-1.5 px-3 py-1.5 font-tech text-[10px] font-bold tracking-[0.18em] transition-all ${
              tab === 'controls'
                ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>⌨</span> KONTROL
          </button>
          <button
            onClick={act(() => setTab('settings'))}
            className={`cut-sm flex items-center gap-1.5 px-3 py-1.5 font-tech text-[10px] font-bold tracking-[0.18em] transition-all ${
              tab === 'settings'
                ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50 shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>⚙</span> PENGATURAN
          </button>
        </nav>

        {/* Zone 3: Actions & Quick Status */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Camera View Mode Switcher */}
          <button
            onClick={act(toggleCam)}
            className="cut-sm flex items-center gap-1.5 border border-sky-400/40 bg-sky-950/40 px-3 py-1.5 font-tech text-[9px] font-bold tracking-[0.18em] text-sky-200 transition hover:bg-sky-900/60"
            title="Ganti sudut pandang kamera"
          >
            <span>🎥</span>
            <span className="hidden sm:inline">KAMERA:</span>
            <span>{camMode === 'hero' ? 'HERO VIEW' : 'ARENA CAM'}</span>
          </button>

          {/* Difficulty Badge */}
          <button
            onClick={act(() => onUltra(!ultra))}
            className={`cut-sm hidden sm:flex items-center gap-1 border px-2.5 py-1.5 font-tech text-[9px] font-bold tracking-[0.18em] transition ${
              ultra
                ? 'border-red-500/60 bg-red-950/50 text-red-300'
                : 'border-white/20 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            <span>{ultra ? '☠ ULTRA' : 'NORMAL'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Subnav Tabs */}
      <div className="pointer-events-auto absolute inset-x-3 top-16 z-20 flex gap-1 md:hidden">
        {(['arena', 'titan', 'controls', 'settings'] as MenuTab[]).map((t) => (
          <button
            key={t}
            onClick={act(() => setTab(t))}
            className={`cut-sm flex-1 py-1.5 text-center font-tech text-[9px] font-bold tracking-wider transition ${
              tab === t
                ? 'bg-sky-500/30 text-sky-200 border border-sky-400/60'
                : 'bg-black/60 text-white/60 border border-white/10'
            }`}
          >
            {t === 'arena' ? 'ARENA' : t === 'titan' ? 'TITAN' : t === 'controls' ? 'KONTROL' : 'OPSI'}
          </button>
        ))}
      </div>

      {/* =================================================================== MAIN CONTENT CONTAINER */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-between p-4 pt-20 sm:p-8 sm:pt-20">
        {/* ========================================================= LEFT COLUMN: MATCHMAKING DECK */}
        {tab === 'arena' && (
          <div className="no-scrollbar pointer-events-auto flex max-h-[calc(100vh-140px)] w-full flex-col gap-3.5 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/75 p-5 shadow-2xl backdrop-blur-xl sm:w-[420px] lg:w-[450px]">
            {/* Stage Kick */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-1 rounded-full" style={{ background: ultra ? ULTRA_COLOR : '#38bdf8' }} />
                <span className="font-tech text-[9px] font-bold tracking-[0.3em] text-white/70">
                  {ultra ? '☠ ULTRA HARD DIVISION' : 'WORLD FINALS CHAMPIONSHIP'}
                </span>
              </div>
              <span className="font-tech text-[9px] tracking-[0.2em] text-white/40">
                {unlocked + 1}/{OPPONENTS.length} TERBUKA
              </span>
            </div>

            {/* Selected Opponent Banner */}
            <div className="border-l-2 pl-3" style={{ borderColor: col }}>
              <div className="font-tech text-[9px] tracking-[0.25em] text-white/50">
                LAWAN TERPILIH · TIER {sel + 1}
              </div>
              <div className="font-display text-3xl tracking-wide sm:text-4xl" style={{ color: col, textShadow: `0 0 20px ${col}66` }}>
                {def.name}
              </div>
              <div className="text-[11px] italic text-white/70">{def.title}</div>
            </div>

            {/* Opponent Selection Grid */}
            <div>
              <div className="mb-1.5 flex justify-between font-tech text-[9px] font-bold tracking-[0.2em] text-white/60">
                <span>PILIH LAWAN TANDING</span>
                <span className="text-white/40">TEKAN 1–4</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {OPPONENTS.map((o, i) => {
                  const locked = i > unlocked;
                  const on = sel === i;
                  const oppCol = ultra ? ULTRA_COLOR : o.color;
                  return (
                    <button
                      key={o.name}
                      disabled={locked}
                      onClick={act(() => onSel(i))}
                      className={`tile cut-sm relative p-2 text-left transition-all ${
                        on ? 'tile-on scale-[1.02] border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : ''
                      } ${locked ? 'cursor-not-allowed opacity-35' : ''}`}
                      style={cssVar('--c', oppCol)}
                    >
                      <div className="flex items-center justify-between font-tech text-[8px] text-white/50">
                        <span>0{i + 1}</span>
                        {locked && <span>🔒</span>}
                      </div>
                      <div
                        className="font-display text-[13px] leading-tight sm:text-[15px]"
                        style={{ color: locked ? '#9aa3b8' : oppCol }}
                      >
                        {o.name.split(' ')[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty & AI Tuning */}
            <div className="space-y-3 rounded-lg border border-white/5 bg-black/40 p-3">
              <DifficultyPicker ultra={ultra} onPick={onUltra} />
              <IqPicker value={iq} onPick={onIq} />
            </div>

            {/* GRAND CTA: ENTER ARENA */}
            <button
              onClick={act(onStart)}
              className={`play-btn cut group relative w-full overflow-hidden px-5 py-4 text-left shadow-lg ${
                ultra ? 'play-ultra' : ''
              }`}
            >
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <span className="block font-display text-[30px] leading-none tracking-[0.14em] sm:text-[36px]">
                    {ultra ? '☠ MASUK RING' : 'MASUK KE RING'}
                  </span>
                  <span className="mt-1 block font-tech text-[9px] font-bold tracking-[0.25em] opacity-85">
                    {PLAYER_NAME} VS {def.name} · TEKAN [ENTER]
                  </span>
                </div>
                <span className="font-display text-4xl leading-none transition-transform group-hover:translate-x-1.5">
                  ▶▶
                </span>
              </div>
              <span className="play-sheen" />
            </button>
          </div>
        )}

        {/* ========================================================= TAB 2: TITAN SAYA (HANGAR & BLUEPRINT) */}
        {tab === 'titan' && (
          <div className="no-scrollbar pointer-events-auto flex max-h-[calc(100vh-140px)] w-full flex-col gap-4 overflow-y-auto rounded-xl border border-sky-400/20 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl sm:w-[460px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="font-tech text-[9px] tracking-[0.3em] text-sky-400">BLUEPRINT TITAN PRIBADI</span>
                <h2 className="font-display text-3xl tracking-wide text-white sm:text-4xl">
                  {PLAYER_NAME}-9 <span className="text-sky-300">· APEX</span>
                </h2>
              </div>
              <button
                onClick={act(() => setTab('arena'))}
                className="cut-sm border border-white/20 bg-white/5 px-3 py-1 font-tech text-[10px] text-white/70 hover:bg-white/10"
              >
                ◀ KEMBALI
              </button>
            </div>

            <div className="space-y-2.5 text-[12px] leading-relaxed text-white/75">
              <p>
                <b className="text-sky-300">{PLAYER_NAME}</b> adalah robot petarung generasi mutakhir dengan sasis titanium berlapis serat karbon ringan. Dirancang untuk tinju jarak menengah dan pertarungan agresif berdaya pukul tinggi.
              </p>
            </div>

            {/* Spec Meters */}
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/40 p-3.5">
              <div className="font-tech text-[9px] tracking-[0.25em] text-white/50">SPESIFIKASI SASIS &amp; SISTEM</div>
              <div className="space-y-1.5">
                {[
                  { name: 'KAPASITAS DAYA TAHAN', val: '100 HP (Stabilizer Ringan)' },
                  { name: 'TEKNOLOGI INTI', val: 'Dual Arc-Plasma Reactor (0x3fd8ff)' },
                  { name: 'GAYA TARUNG', val: 'Pure Boxing + Dempsey Weave' },
                  { name: 'SISTEM KINETIK', val: 'Hydro-Piston Punch Drive' },
                ].map((s) => (
                  <div key={s.name} className="flex justify-between border-b border-white/5 pb-1 text-[11px]">
                    <span className="font-tech text-white/60">{s.name}</span>
                    <span className="font-tech font-bold text-sky-300">{s.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pose Tester */}
            <div className="rounded-lg border border-white/10 bg-black/40 p-3.5">
              <div className="mb-2 font-tech text-[9px] tracking-[0.25em] text-white/60">
                UJI POSE DEPAN ROBOT
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'stand', label: 'BERDIRI' },
                  { id: 'guard', label: 'GUARD' },
                  { id: 'victory', label: 'JUARA' },
                  { id: 'taunt', label: 'TAUNT' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={act(() => setPose(p.id as any))}
                    className={`cut-sm py-2 font-tech text-[9px] font-bold tracking-wider transition ${
                      heroPose === p.id
                        ? 'border border-sky-400 bg-sky-500/30 text-sky-200'
                        : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-center font-tech text-[9px] text-white/40">
                Geser kursor / drag layar untuk memutar robot 360°
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= TAB 3: CONTROLS DECK */}
        {tab === 'controls' && (
          <div className="no-scrollbar pointer-events-auto flex max-h-[calc(100vh-140px)] w-full flex-col gap-3.5 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl sm:w-[500px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h2 className="font-display text-3xl tracking-wide text-white">PANDUAN KONTROL &amp; TEKNIK</h2>
              <button
                onClick={act(() => setTab('arena'))}
                className="cut-sm border border-white/20 bg-white/5 px-3 py-1 font-tech text-[10px] text-white/70 hover:bg-white/10"
              >
                ◀ KEMBALI
              </button>
            </div>
            <div className="space-y-3">
              {CONTROLS.map((g) => (
                <div key={g.title} className="rounded-lg border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 font-tech text-[9px] font-bold tracking-[0.25em] text-amber-300">
                    {g.title}
                  </div>
                  <div className="space-y-1.5">
                    {g.rows.map(([keys, label]) => (
                      <div key={label} className="flex items-center gap-2 text-[11px] text-white/80">
                        <span className="flex shrink-0 items-center gap-1">
                          {keys.map((k, i) =>
                            k === '+' ? (
                              <span key={i} className="text-white/40">
                                +
                              </span>
                            ) : (
                              <Key key={i}>{k}</Key>
                            ),
                          )}
                        </span>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= TAB 4: SETTINGS DECK */}
        {tab === 'settings' && (
          <div className="no-scrollbar pointer-events-auto flex max-h-[calc(100vh-140px)] w-full flex-col gap-4 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl sm:w-[460px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h2 className="font-display text-3xl tracking-wide text-white">PENGATURAN</h2>
              <button
                onClick={act(() => setTab('arena'))}
                className="cut-sm border border-white/20 bg-white/5 px-3 py-1 font-tech text-[10px] text-white/70 hover:bg-white/10"
              >
                ◀ KEMBALI
              </button>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                <SfxPicker value={sfx} onPick={onSfx} />
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                <FootworkPicker value={fw} onPick={onFw} />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= RIGHT COLUMN: TACTICAL SCOUTING DOSSIER (Large Screens) */}
        {tab === 'arena' && (
          <aside className="no-scrollbar slide-r pointer-events-auto hidden max-h-[calc(100vh-140px)] w-[320px] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/75 p-5 shadow-2xl backdrop-blur-xl lg:block">
            <div className="flex items-center justify-between">
              <span className="font-tech text-[9px] tracking-[0.3em] text-white/50">INTEL LAWAN</span>
              {ultra && (
                <span className="font-tech text-[9px] font-bold tracking-[0.2em] text-red-400">
                  ☠ ULTRA
                </span>
              )}
            </div>

            <div className="mt-1 font-display text-3xl leading-tight" style={{ color: col, textShadow: `0 0 20px ${col}66` }}>
              {def.name}
            </div>
            <div className="text-[11px] italic text-white/60">{def.title}</div>

            {/* Threat Rating */}
            <div className="mt-3 flex items-center justify-between border-y border-white/10 py-2">
              <span className="font-tech text-[9px] tracking-[0.25em] text-white/50">TINGKAT ANCAMAN</span>
              <div className="flex items-center gap-1.5">
                <span className="flex text-xs">
                  {[0, 1, 2, 3, 4].map((s) => (
                    <span key={s} style={{ opacity: s < skulls ? 1 : 0.2, color: col }}>
                      ☠
                    </span>
                  ))}
                </span>
                <span className="font-tech text-[9px] font-bold" style={{ color: col }}>
                  {THREAT[skulls]}
                </span>
              </div>
            </div>

            {/* Attribute Meters */}
            <div className="mt-3.5 space-y-2">
              {bars.map((b) => (
                <div key={b.k}>
                  <div className="mb-0.5 flex justify-between font-tech text-[8px] tracking-[0.2em] text-white/60">
                    <span>{b.k}</span>
                    <span>{Math.round(b.v * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${b.v * 100}%`, background: `linear-gradient(90deg, ${col}44, ${col})` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Badges */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="cut-sm border border-white/15 bg-white/5 px-2 py-1 font-tech text-[9px] tracking-[0.15em] text-white/80">
                HP {def.hp}
              </span>
              <span className="cut-sm border border-white/15 bg-white/5 px-2 py-1 font-tech text-[9px] tracking-[0.15em] text-white/80">
                COMBO ×{def.combo}
              </span>
              {def.slam && (
                <span
                  className="cut-sm border px-2 py-1 font-tech text-[9px] tracking-[0.15em]"
                  style={{ borderColor: col, color: col, background: `${col}15` }}
                >
                  OVERDRIVE
                </span>
              )}
            </div>

            {/* Tactical Advice */}
            <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-white/70">
              <div className="mb-1 font-tech text-[9px] font-bold tracking-[0.2em] text-amber-300">
                CATATAN TAKTIS PELATIH
              </div>
              {STYLE_DESC[sel]}
            </div>
          </aside>
        )}
      </div>

      {/* =================================================================== CENTER-BOTTOM HERO HUD & POSE SWITCHER */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center justify-center gap-1.5 px-4 sm:bottom-5">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-950/75 px-3 py-2 shadow-2xl backdrop-blur-xl">
          <span className="hidden font-tech text-[9px] font-bold tracking-[0.25em] text-sky-300 sm:inline">
            POSE {PLAYER_NAME}:
          </span>
          <button
            onClick={act(() => setPose('stand'))}
            className={`cut-sm px-2.5 py-1 font-tech text-[9px] font-bold tracking-wider transition ${
              heroPose === 'stand'
                ? 'border border-sky-400 bg-sky-500/30 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            STAND
          </button>
          <button
            onClick={act(() => setPose('guard'))}
            className={`cut-sm px-2.5 py-1 font-tech text-[9px] font-bold tracking-wider transition ${
              heroPose === 'guard'
                ? 'border border-sky-400 bg-sky-500/30 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            GUARD
          </button>
          <button
            onClick={act(() => setPose('victory'))}
            className={`cut-sm px-2.5 py-1 font-tech text-[9px] font-bold tracking-wider transition ${
              heroPose === 'victory'
                ? 'border border-sky-400 bg-sky-500/30 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            JUARA
          </button>
          <button
            onClick={act(() => setPose('taunt'))}
            className={`cut-sm px-2.5 py-1 font-tech text-[9px] font-bold tracking-wider transition ${
              heroPose === 'taunt'
                ? 'border border-sky-400 bg-sky-500/30 text-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.3)]'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            TAUNT
          </button>

          <span className="hidden h-3 w-px bg-white/20 sm:inline" />

          {/* Quick Camera Mode Switch */}
          <button
            onClick={act(toggleCam)}
            className="cut-sm flex items-center gap-1 border border-white/20 bg-white/5 px-2.5 py-1 font-tech text-[9px] font-bold tracking-wider text-white/80 transition hover:bg-white/15"
          >
            <span>🎥</span>
            <span>{camMode === 'hero' ? 'HERO VIEW' : 'ARENA CAM'}</span>
          </button>

          {/* 360 Reset */}
          <button
            onClick={act(() => game?.resetHeroRotation())}
            className="cut-sm px-2 py-1 font-tech text-[9px] text-white/50 hover:text-white"
            title="Kembalikan hadap depan"
          >
            ↺ RESET HADAP
          </button>
        </div>

        <div className="font-tech text-[8px] tracking-[0.25em] text-white/40 drop-shadow">
          DRAG LAYAR UNTUK INSPEKSI 360° · ROBOT BERDIRI DI DEPAN DENGAN BACKGROUND SPARRING ARENA
        </div>
      </div>
    </div>
  );
}
