import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { OPPONENTS, PLAYER_NAME, ULTRA_COLOR, smartDef, ultraDef, type OpponentDef } from '../game/Game';
import type { SfxProfile } from '../game/audio';
import { Emblem, Key, cssVar } from './Emblem';
import { DifficultyPicker, FootworkPicker, IqPicker, SectionTitle, SfxPicker } from './Pickers';

type Panel = 'main' | 'settings' | 'controls';

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
}

/** buttons drop their focus after a click, so Enter / Space never re-triggers them by accident */
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
  'Lambat dan kasar. Mudah dibaca — sparring ideal untuk menguasai dasar.',
  'Agresif dan lincah. Sering memotong jarak dan menghindar dengan sidestep.',
  'Berat dan bertenaga. Waspadai Overdrive banting yang menghancurkan jarak dekat.',
  'Sang juara dunia. Membaca pola seranganmu, menghindar, lalu membalas tanpa ampun.',
];

const CONTROLS: { title: string; rows: [string[], string][] }[] = [
  {
    title: 'GERAK',
    rows: [
      [['W', 'A', 'S', 'D'], 'Maju · mundur · mengitari lawan'],
      [['SHIFT', '+', 'WASD'], 'Lari / sprint'],
      [['WASD', '×2'], 'Dash / sidestep'],
    ],
  },
  {
    title: 'SERANG',
    rows: [
      [['J'], 'Jab cepat'],
      [['K'], 'Cross keras'],
      [['U'], 'Hook samping'],
      [['I'], 'Uppercut (melempar ke udara)'],
      [['L'], 'Grab — menembus blok'],
      [['LARI', '+', 'J K U I'], 'Running punch'],
    ],
  },
  {
    title: 'BERTAHAN',
    rows: [
      [['SPACE'], 'Tahan untuk blok'],
      [['Q'], 'DODGE — tekan saat ◎ indikator muncul di musuh = serangannya meleset'],
    ],
  },
  {
    title: 'GAYA IPPO — MENDEKAT',
    rows: [
      [['E'], 'PEEK-A-BOO (tahan): mendekat sendiri sambil goyang badan'],
      [['E', '+', 'J K U I'], 'DEMPSEY ROLL: makin lama goyang, makin dahsyat'],
    ],
  },
  {
    title: 'SPESIAL',
    rows: [
      [['M'], 'TAUNT — tepuk dada, pamer ke lawan (isi Overdrive, tapi kamu terbuka)'],
      [['N'], 'TAUNT JUARA — angkat kedua tangan & menengadah sombong ala Zeus'],
      [['R'], 'Overdrive (meter penuh)'],
      [['[', ']'], 'Kecepatan footwork'],
      [['ESC'], 'Pause'],
    ],
  },
];

function OpponentCard({ def, index, ultra }: { def: OpponentDef; index: number; ultra: boolean }) {
  const col = ultra ? ULTRA_COLOR : def.color;
  const { bars, threat } = statsOf(def);
  const skulls = Math.max(1, Math.round(threat * 5));
  return (
    <div className="card-cut glass relative overflow-hidden p-5" style={cssVar('--c', col)}>
      <div className="pointer-events-none absolute -right-2 -top-6 font-display text-[130px] leading-none opacity-[0.07]" style={{ color: col }}>
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="relative flex items-center justify-between">
        <span className="font-tech text-[10px] tracking-[0.35em] text-white/55">LAWAN {String(index + 1).padStart(2, '0')}</span>
        {ultra && (
          <span className="ultra-badge border px-2 py-0.5 font-tech text-[10px] tracking-[0.25em]" style={{ borderColor: ULTRA_COLOR, color: ULTRA_COLOR }}>
            ☠ ULTRA
          </span>
        )}
      </div>
      <div className="relative mt-1 font-display text-[44px] leading-[0.95]" style={{ color: col, textShadow: `0 0 28px ${col}88` }}>
        {def.name}
      </div>
      <div className="relative mt-1 text-[12px] italic text-white/65">{def.title}</div>

      <div className="relative mt-4 flex items-center gap-2">
        <span className="font-tech text-[10px] tracking-[0.3em] text-white/50">ANCAMAN</span>
        <span className="flex gap-1 text-sm">
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} style={{ opacity: s < skulls ? 1 : 0.18, color: col }}>
              ☠
            </span>
          ))}
        </span>
        <span className="font-tech text-[10px] font-bold tracking-[0.2em]" style={{ color: col }}>
          {THREAT[skulls]}
        </span>
      </div>

      <div className="relative mt-4 space-y-2.5">
        {bars.map((b) => (
          <div key={b.k}>
            <div className="mb-0.5 flex justify-between font-tech text-[9px] tracking-[0.25em] text-white/60">
              <span>{b.k}</span>
              <span>{Math.round(b.v * 100)}</span>
            </div>
            <div className="stat-track">
              <div className="stat-fill" style={{ width: `${b.v * 100}%`, background: `linear-gradient(90deg, ${col}55, ${col})` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-4 flex flex-wrap gap-1.5">
        <span className="cut-sm border border-white/20 bg-white/5 px-2 py-1 font-tech text-[9px] tracking-[0.2em] text-white/80">HP {def.hp}</span>
        <span className="cut-sm border border-white/20 bg-white/5 px-2 py-1 font-tech text-[9px] tracking-[0.2em] text-white/80">COMBO ×{def.combo}</span>
        {!!def.iq && def.iq > 1 && (
          <span className="cut-sm border border-fuchsia-400/60 bg-fuchsia-500/15 px-2 py-1 font-tech text-[9px] tracking-[0.2em] text-fuchsia-200">{def.iq >= 12 ? 'STRATEGIS' : `IQ ${def.iq}×`}</span>
        )}
        {def.slam && (
          <span className="cut-sm border px-2 py-1 font-tech text-[9px] tracking-[0.2em]" style={{ borderColor: col, color: col, background: `${col}18` }}>
            OVERDRIVE
          </span>
        )}
      </div>

      <p className="relative mt-4 text-[12px] leading-relaxed text-white/65">{STYLE_DESC[index]}</p>
    </div>
  );
}

function SubPanel({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col justify-center gap-4 px-6 pb-8 pt-24 sm:px-12">
      <button onClick={act(onBack)} className="ghost cut-sm stagger w-fit px-4 py-2 font-tech text-[11px] font-bold tracking-[0.25em]">
        ◀ KEMBALI
      </button>
      <h2 className="stagger font-display text-5xl tracking-[0.12em] sm:text-6xl" style={{ animationDelay: '0.05s' }}>
        {title}
      </h2>
      <div className="stagger space-y-4" style={{ animationDelay: '0.1s' }}>
        {children}
      </div>
    </div>
  );
}

export function Menu({ unlocked, sel, onSel, onStart, sfx, onSfx, ultra, onUltra, fw, onFw, iq, onIq }: MenuProps) {
  const [panel, setPanel] = useState<Panel>('main');
  const def = smartDef(ultra ? ultraDef(OPPONENTS[sel]) : OPPONENTS[sel], iq);

  // keyboard: Enter = start · 1-4 / ← → = choose opponent · Esc = back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
      if (e.code === 'Escape') {
        if (panel !== 'main') setPanel('main');
        return;
      }
      if (panel !== 'main') return;
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
  }, [panel, sel, unlocked, onSel, onStart]);

  return (
    <div className="absolute inset-0 overflow-hidden text-white">
      {/* ---------- atmosphere ---------- */}
      <div className="menu-shade" />
      <div className="menu-streaks" />
      <div className="menu-scan" />
      <div className="menu-edge hidden lg:block" />
      <span className="corner left-3 top-3 border-l-2 border-t-2" />
      <span className="corner right-3 top-3 border-r-2 border-t-2" />
      <span className="corner bottom-3 left-3 border-b-2 border-l-2" />
      <span className="corner bottom-3 right-3 border-b-2 border-r-2" />

      {/* ---------- top bar ---------- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-6 py-4 sm:px-12">
        <Emblem size={42} />
        <div className="leading-none">
          <div className="font-display text-[26px] tracking-[0.2em]">WRC</div>
          <div className="mt-0.5 font-tech text-[8px] tracking-[0.4em] text-white/55 sm:text-[9px]">WORLD ROBOT CHAMPIONSHIP</div>
        </div>
        <div className="ml-auto mr-28 hidden items-center gap-2 sm:flex">
          <span className="font-tech text-[10px] tracking-[0.3em] text-white/50">WORLD FINALS · 2026</span>
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="font-tech text-[10px] font-bold tracking-[0.3em] text-red-400">LIVE</span>
        </div>
      </header>

      {/* ---------- left column ---------- */}
      <div className="no-scrollbar absolute inset-y-0 left-0 w-full overflow-y-auto lg:w-[560px]">
        {panel === 'main' && (
          <div key="main" className="flex min-h-full flex-col justify-center gap-5 px-6 pb-8 pt-24 sm:px-12">
            {/* title */}
            <div className="stagger">
              <div className="mb-2 flex items-center gap-3">
                <span className="h-[3px] w-10" style={{ background: ultra ? ULTRA_COLOR : '#ffb030' }} />
                <span className="font-tech text-[10px] font-bold tracking-[0.4em] text-white/70">WORLD FINALS · 2026</span>
              </div>
              <h1 className="title-skew font-display leading-[0.82]" style={{ fontSize: 'clamp(54px, 13vh, 112px)' }}>
                <span className="chrome-text block">STEEL</span>
                <span className={`block ${ultra ? 'red-text' : 'blue-text'}`}>TITANS</span>
              </h1>
              <div className="mt-3 h-[3px] w-40" style={{ background: 'linear-gradient(90deg,#ff3b3b,#2f7cff)', transform: 'skewX(-30deg)' }} />
            </div>

            <p className="stagger max-w-md text-[13px] leading-relaxed text-white/70" style={{ animationDelay: '0.1s' }}>
              Kendalikan <b className="text-sky-300">{PLAYER_NAME}</b> — robot tinju raksasa. Jab, hook, uppercut, lalu lepaskan <b className="text-amber-300">Overdrive</b>. Menangkan <b className="text-white">2 ronde</b> untuk jadi juara dunia.
            </p>

            {/* opponent select */}
            <div className="stagger" style={{ animationDelay: '0.15s' }}>
              <SectionTitle right={<span className="font-tech text-[9px] tracking-[0.2em] text-white/45">{unlocked + 1}/{OPPONENTS.length} TERBUKA</span>}>PILIH LAWAN</SectionTitle>
              <div className="grid grid-cols-4 gap-2">
                {OPPONENTS.map((o, i) => {
                  const locked = i > unlocked;
                  const on = sel === i;
                  const col = ultra ? ULTRA_COLOR : o.color;
                  return (
                    <button
                      key={o.name}
                      disabled={locked}
                      onClick={act(() => onSel(i))}
                      className={`tile cut-sm relative overflow-hidden px-2 pb-2.5 pt-1.5 text-left ${on ? 'tile-on' : ''} ${locked ? 'opacity-40' : ''}`}
                      style={cssVar('--c', col)}
                    >
                      <div className="font-tech text-[9px] tracking-[0.2em] text-white/50">{String(i + 1).padStart(2, '0')}</div>
                      <div className="font-display text-[15px] leading-tight sm:text-[18px]" style={{ color: locked ? '#9aa3b8' : col }}>
                        {locked ? '🔒' : o.name.split(' ')[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* the opponent card (small screens: inline; large screens: right-hand side) */}
            <div className="lg:hidden">
              <div key={sel} className="pop-in">
                <OpponentCard def={def} index={sel} ultra={ultra} />
              </div>
            </div>

            <div className="stagger" style={{ animationDelay: '0.2s' }}>
              <DifficultyPicker ultra={ultra} onPick={onUltra} />
            </div>

            <div className="stagger" style={{ animationDelay: '0.22s' }}>
              <IqPicker value={iq} onPick={onIq} />
            </div>

            {/* play */}
            <button onClick={act(onStart)} className={`play-btn cut stagger group relative w-full overflow-hidden px-6 py-4 text-left ${ultra ? 'play-ultra' : ''}`} style={{ animationDelay: '0.25s' }}>
              <span className="relative z-10 flex items-center justify-between">
                <span>
                  <span className="block font-display text-[34px] leading-none tracking-[0.12em] sm:text-[42px]">{ultra ? '☠ MASUK RING' : 'MASUK RING'}</span>
                  <span className="mt-1 block font-tech text-[10px] font-bold tracking-[0.3em] opacity-80">
                    VS {def.name}
                    {ultra ? ' · ULTRA HARD' : ''}
                  </span>
                </span>
                <span className="font-display text-5xl leading-none opacity-90 transition group-hover:translate-x-1">▶▶</span>
              </span>
              <span className="play-sheen" />
            </button>

            <div className="stagger grid grid-cols-2 gap-2" style={{ animationDelay: '0.3s' }}>
              <button onClick={act(() => setPanel('settings'))} className="ghost cut-sm px-4 py-3 font-tech text-[11px] font-bold tracking-[0.25em]">
                ⚙ PENGATURAN
              </button>
              <button onClick={act(() => setPanel('controls'))} className="ghost cut-sm px-4 py-3 font-tech text-[11px] font-bold tracking-[0.25em]">
                ⌨ KONTROL
              </button>
            </div>

            <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/50 sm:flex">
              <span className="flex items-center gap-1.5"><Key>ENTER</Key> mulai</span>
              <span className="flex items-center gap-1.5"><Key>←</Key><Key>→</Key> lawan</span>
              <span className="flex items-center gap-1.5"><Key>1</Key>–<Key>{OPPONENTS.length}</Key> pilih cepat</span>
            </div>
          </div>
        )}

        {panel === 'settings' && (
          <SubPanel key="settings" title="PENGATURAN" onBack={() => setPanel('main')}>
            <div className="glass cut p-4">
              <SfxPicker value={sfx} onPick={onSfx} />
            </div>
            <div className="glass cut p-4">
              <FootworkPicker value={fw} onPick={onFw} />
            </div>
          </SubPanel>
        )}

        {panel === 'controls' && (
          <SubPanel key="controls" title="KONTROL" onBack={() => setPanel('main')}>
            <div className="grid gap-3 sm:grid-cols-2">
              {CONTROLS.map((g) => (
                <div key={g.title} className="glass cut-sm p-3">
                  <div className="mb-2 font-tech text-[10px] font-bold tracking-[0.3em] text-amber-300">{g.title}</div>
                  <div className="space-y-1.5">
                    {g.rows.map(([keys, label]) => (
                      <div key={label} className="flex items-center gap-2 text-[12px] text-white/80">
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
            <div className="glass cut-sm p-3 text-[11px] leading-5 text-white/60">
              <b className="text-emerald-300">Sidestep</b> (tap 2× A/D) menghindari jab &amp; cross, tapi hook menyapu lebar. <b className="text-sky-300">Grab (L)</b> menembus blok. <b className="text-purple-300">Uppercut</b> melempar lawan ke udara — sambung{' '}
              <b className="text-amber-300">juggle</b> sebelum jatuh. Dorong lawan ke tali ring untuk <b className="text-rose-300">ROPE BOUNCE</b> dan combo gratis! Tahan <b className="text-cyan-300">E</b> untuk gaya <b className="text-cyan-300">Peek-a-Boo</b> ala Ippo: badan menggoyang, menyelip dari jab &amp; cross, dan maju sendiri — makin lama menggoyang, makin dahsyat <b className="text-cyan-300">Dempsey Roll</b>-mu (tapi lemah terhadap grab!).
            </div>
          </SubPanel>
        )}
      </div>

      {/* ---------- right column: opponent card (large screens) ---------- */}
      {panel === 'main' && (
        <aside className="no-scrollbar slide-r absolute bottom-6 right-6 top-24 hidden w-[310px] overflow-y-auto lg:block">
          <div key={sel} className="pop-in">
            <OpponentCard def={def} index={sel} ultra={ultra} />
          </div>
        </aside>
      )}
    </div>
  );
}
