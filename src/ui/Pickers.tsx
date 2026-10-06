import type { ReactNode } from 'react';
import { BRIGHTNESS_STEPS, CAM_MODES, FOOTWORK_STEPS, GFX_MODES, IQ_STEPS, QUALITY_TIERS, TRANSITIONS, ULTRA_COLOR, type GfxMode, type TransId } from '../game/Game';
import { SFX_PROFILES, type SfxProfile } from '../game/audio';
import { cssVar } from './Emblem';

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-3 w-[3px] bg-amber-300" style={{ transform: 'skewX(-20deg)' }} />
      <span className="font-tech text-[10px] font-bold tracking-[0.3em] text-white/70">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/25 to-transparent" />
      {right}
    </div>
  );
}

// the little "waveform" drawn on each sound card
const WAVE: Record<SfxProfile, number[]> = {
  heavy: [5, 11, 16, 9, 6],
  hydraulic: [14, 5, 16, 4, 12],
  glove: [6, 13, 8, 13, 6],
  cinema: [3, 7, 15, 16, 8],
};

export function SfxPicker({ value, onPick }: { value: SfxProfile; onPick: (id: SfxProfile) => void }) {
  return (
    <div>
      <SectionTitle>SUARA BENTURAN · KLIK UNTUK DENGAR</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {SFX_PROFILES.map((s, i) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className={`tile cut-sm pointer-events-auto relative px-3 py-2 text-left ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', '#ffd34a')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[17px] tracking-wider" style={{ color: on ? '#ffd34a' : '#ffffff' }}>
                  {i + 1}. {s.name}
                </span>
                <span className={`eq ${on ? 'eq-on' : ''}`} style={{ color: on ? '#ffd34a' : 'rgba(255,255,255,0.4)' }}>
                  {WAVE[s.id].map((h, k) => (
                    <i key={k} style={{ height: h }} />
                  ))}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-white/55">{s.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DifficultyPicker({ ultra, onPick }: { ultra: boolean; onPick: (ultra: boolean) => void }) {
  return (
    <div>
      <SectionTitle
        right={
          <span className={`font-tech text-[8px] font-bold tracking-[0.2em] ${ultra ? 'text-rose-400' : 'text-amber-300'}`}>
            {ultra ? 'MODE EKSTREM AKTIF' : 'MODE STANDAR'}
          </span>
        }
      >
        MODE KOMPETISI
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onPick(false)}
          className={`tile cut-sm pointer-events-auto relative px-3 py-2 text-left ${!ultra ? 'tile-on' : ''}`}
          style={cssVar('--c', '#38bdf8')}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-[19px] leading-none tracking-wider" style={{ color: !ultra ? '#7dd3fc' : '#ffffff' }}>
              NORMAL LEAGUE
            </span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-tech text-[8px] font-bold text-sky-300">★ 1.0×</span>
          </div>
          <div className="mt-1 font-tech text-[8px] tracking-wider text-white/55">STAT STANDAR · COCOK PEMULA</div>
        </button>
        <button
          onClick={() => onPick(true)}
          className={`tile ultra-btn cut-sm pointer-events-auto relative overflow-hidden px-3 py-2 text-left ${ultra ? 'tile-on' : ''}`}
          style={cssVar('--c', ULTRA_COLOR)}
        >
          <div className="relative z-10 flex items-center justify-between">
            <span className="font-display text-[19px] leading-none tracking-wider" style={{ color: ULTRA_COLOR }}>
              ULTRA HARD
            </span>
            <span className="rounded bg-rose-500/25 px-1.5 py-0.5 font-tech text-[8px] font-bold text-rose-300">
              {ultra ? '🔥 ON' : '☠ PRO'}
            </span>
          </div>
          <div className="relative z-10 mt-1 font-tech text-[8px] tracking-wider text-rose-200/75">
            HP +40% · DMG +30% · OVERDRIVE
          </div>
        </button>
      </div>
    </div>
  );
}

const FW_DESC: Record<number, string> = { 1: 'NORMAL', 1.5: 'LINCAH', 2: 'CEPAT', 3: 'EKSTREM' };

export function FootworkPicker({ value, onPick }: { value: number; onPick: (m: number) => void }) {
  return (
    <div>
      <SectionTitle right={<span className="font-tech text-[9px] tracking-[0.2em] text-emerald-300">[ ] SAAT BERTANDING</span>}>KECEPATAN FOOTWORK</SectionTitle>
      <div className="grid grid-cols-4 gap-2">
        {FOOTWORK_STEPS.map((m, idx) => {
          const on = m === value;
          return (
            <button
              key={m}
              onClick={() => onPick(m)}
              className={`tile cut-sm pointer-events-auto relative px-1 py-2 text-center ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', '#59ffb4')}
            >
              <div className="font-display text-[26px] leading-none" style={{ color: on ? '#7dffc4' : '#ffffff' }}>
                {m}×
              </div>
              <div className="mt-0.5 font-tech text-[8px] tracking-[0.15em] text-white/55">{FW_DESC[m]}</div>
              <div className="mx-auto mt-1.5 flex w-10 gap-0.5">
                {FOOTWORK_STEPS.map((_, k) => (
                  <i key={k} className="block h-[3px] flex-1" style={{ background: k <= idx ? (on ? '#7dffc4' : 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.14)' }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-white/45">Mengalikan kecepatan jalan, lari, dash, dan seberapa cepat robot merespons tombol.</div>
    </div>
  );
}

const IQ_NAME: Record<number, string> = { 1: 'NORMAL', 2: 'PINTAR', 3: 'JENIUS', 10: 'SUPER AI', 12: 'STRATEGIS' };
const IQ_LABEL: Record<number, string> = { 12: '★' }; // the strategist tier is not "12×", it is its own thing
const IQ_SUB: Record<number, string> = {
  1: 'Refleks AI standar — pola serangan dasar',
  2: 'Baca serangan & dodge lebih responsif',
  3: 'Dodge presisi, feint & counter cepat',
  10: 'Refleks nyaris sempurna & hukuman instan',
  12: 'Taktik adaptif: memancing, menyudutkan & simpan Overdrive',
};

/** how many times smarter the enemy is: reads you faster, dodges and blocks more, counters harder */
export function IqPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div>
      <SectionTitle
        right={
          <span className={`font-tech text-[8px] font-bold tracking-[0.2em] ${value >= 10 ? 'text-amber-300' : 'text-purple-300'}`}>
            TIER: {IQ_NAME[value]}
          </span>
        }
      >
        KECERDASAN AI LAWAN
      </SectionTitle>
      <div className="grid grid-cols-5 gap-1.5">
        {IQ_STEPS.map((m) => {
          const on = m === value;
          const col = m >= 12 ? '#ffb030' : m >= 10 ? '#ff4a64' : '#c58bff';
          return (
            <button
              key={m}
              onClick={() => onPick(m)}
              className={`tile cut-sm pointer-events-auto relative px-1 py-1.5 text-center ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', col)}
            >
              <div className="font-display text-[20px] leading-none" style={{ color: on ? col : '#ffffff' }}>
                {IQ_LABEL[m] ?? `${m}×`}
              </div>
              <div className="mt-0.5 font-tech text-[7px] font-bold tracking-[0.1em] text-white/65">{IQ_NAME[m]}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 rounded border border-white/5 bg-white/[0.03] px-2 py-1 font-tech text-[8.5px] tracking-wide text-white/65">
        <span className="text-amber-300">⚡</span>
        <span className="truncate">{IQ_SUB[value] ?? ''}</span>
      </div>
    </div>
  );
}

const GFX_COLOR = '#5ee7a0';
const GFX_DESC: Record<GfxMode, string> = {
  auto: 'Governor 60 fps: kualitas naik-turun sendiri mengikuti beban GPU',
  max: 'Semua efek menyala — refleksi lantai, bloom, bayangan 2048, AA 4×',
  balanced: 'Refleksi kanvas saja, bloom lebih murah, bayangan 1536',
  performance: 'Tanpa refleksi, AA via FXAA, bayangan 1024 — paling ringan, tetap ber-bloom',
};

/** the graphics modes: the 60 fps governor, or a tier the player pins by hand */
export function GfxPicker({ value, onPick, fps, tier }: { value: GfxMode; onPick: (m: GfxMode) => void; fps?: number; tier?: string }) {
  return (
    <div>
      <SectionTitle
        right={
          <span className="font-tech text-[9px] tracking-[0.2em]" style={{ color: GFX_COLOR }}>
            {fps ? `${Math.round(fps)} FPS` : ''}
            {tier ? ` · ${tier}` : ''}
          </span>
        }
      >
        GRAFIS &amp; PERFORMA
      </SectionTitle>
      <div className="grid grid-cols-4 gap-1.5">
        {GFX_MODES.map((m, i) => {
          const on = m.id === value;
          return (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className={`tile cut-sm pointer-events-auto relative px-1 py-1.5 text-center ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', GFX_COLOR)}
            >
              <div className="font-display text-[12px] leading-none tracking-wider" style={{ color: on ? GFX_COLOR : '#ffffff' }}>
                {i + 1}. {m.name}
              </div>
              <div className="mx-auto mt-1 flex w-10 gap-0.5">
                {GFX_MODES.map((_, k) => (
                  <i key={k} className="block h-[3px] flex-1" style={{ background: k <= i ? (on ? GFX_COLOR : 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.14)' }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 rounded border border-white/5 bg-white/[0.03] px-2 py-1 font-tech text-[8.5px] tracking-wide text-white/65">
        <span style={{ color: GFX_COLOR }}>✦</span>
        <span className="truncate">{GFX_DESC[value]}</span>
      </div>
    </div>
  );
}

const BRIGHT_LABEL: Record<number, string> = { 0.85: 'GELAP', 0.95: 'LEMBUT', 1: 'NORMAL', 1.12: 'TERANG', 1.25: 'SILAU' };

/**
 * THE EXPOSURE. Everything else in this file trades detail for speed; this one is taste, so it stays in the
 * player's hands. The game's auto-exposure watches the frame underneath it, so pushing this up cannot blow the
 * picture out — it just moves the whole show up or down the curve.
 */
export function BrightnessPicker({ value, onPick }: { value: number; onPick: (b: number) => void }) {
  return (
    <div className="mt-3">
      <SectionTitle
        right={
          <span className="font-tech text-[9px] tracking-[0.2em]" style={{ color: GFX_COLOR }}>
            {Math.round(value * 100)}%
          </span>
        }
      >
        KECERAHAN GAMBAR
      </SectionTitle>
      <div className="grid grid-cols-5 gap-1.5">
        {BRIGHTNESS_STEPS.map((b) => {
          const on = b === value;
          return (
            <button
              key={b}
              onClick={() => onPick(b)}
              className={`tile cut-sm pointer-events-auto relative px-1 py-1.5 text-center ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', GFX_COLOR)}
            >
              <div className="font-display text-[16px] leading-none" style={{ color: on ? GFX_COLOR : '#ffffff' }}>
                {b === 1 ? '1.0' : b.toFixed(2).slice(1)}
              </div>
              <div className="mt-0.5 font-tech text-[7px] font-bold tracking-[0.1em] text-white/65">{BRIGHT_LABEL[b] ?? ''}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-white/45">
        Menyetel exposure seluruh gambar (arena dan lobby) tanpa mengubah pencahayaan panggung — lampu, bloom dan
        warna tetap sama, hanya terangnya yang bergeser.
      </div>
    </div>
  );
}

/**
 * HOW THE LOBBY HANDS OVER TO THE RING. Every kind is dressed over the same beat — the fist clash on the VS screen,
 * then the cover, then the bell under it — so this only changes the look, never when the fight starts. "COBA" plays
 * the picked one over the lobby right now, so you can choose one without having to start a match.
 */
export function TransitionPicker({ value, onPick, onTry }: { value: TransId; onPick: (id: TransId) => void; onTry?: () => void }) {
  const cur = TRANSITIONS.find((t) => t.id === value) ?? TRANSITIONS[0];
  return (
    <div>
      <SectionTitle
        right={
          onTry ? (
            <button onClick={onTry} className="pointer-events-auto border border-amber-300/60 bg-amber-400/15 px-2 py-0.5 font-tech text-[9px] font-bold tracking-[0.2em] text-amber-100 hover:bg-amber-400/30">
              ▶ COBA
            </button>
          ) : null
        }
      >
        TRANSISI MASUK RING
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {TRANSITIONS.map((t) => {
          const on = t.id === value;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className={`tile cut-sm pointer-events-auto relative px-3 py-2 text-left ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', '#ffd34a')}
            >
              <div className="font-display text-[15px] tracking-wider" style={{ color: on ? '#ffd34a' : '#ffffff' }}>
                {t.name}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-white/55">{t.hint}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-white/45">
        Terjadi tepat saat kedua robot mengadu tinju di layar VS: {cur.name.toLowerCase()} menutup potongan gambar ke
        ring walk. Tekan ▶ COBA untuk melihatnya sekarang, tanpa harus memulai pertandingan.
      </div>
    </div>
  );
}

/** the five rungs the picture can run on, top to bottom — purely informational, the game picks the rung itself */
export function TierLadder({ tier }: { tier?: string }) {
  return (
    <div className="mt-1 flex items-center gap-1.5 font-tech text-[8px] tracking-[0.16em] text-white/40">
      <span>LADDER</span>
      {QUALITY_TIERS.map((t) => (
        <span key={t.key} className={t.name === tier ? 'font-bold text-emerald-300' : ''}>
          {t.name}
          {t.key !== QUALITY_TIERS[QUALITY_TIERS.length - 1].key ? ' ▸' : ''}
        </span>
      ))}
    </div>
  );
}

const CAM_COLOR = '#7dd3fc';

/** the five camera presets. Same framing guarantee, five very different seats in the arena. */
export function CamPicker({ value, onPick }: { value: number; onPick: (i: number) => void }) {
  return (
    <div>
      <SectionTitle
        right={
          <span className="font-tech text-[9px] tracking-[0.2em]" style={{ color: CAM_COLOR }}>
            / . SAAT BERTANDING
          </span>
        }
      >
        MODE KAMERA
      </SectionTitle>
      <div className="flex flex-col gap-1.5">
        {CAM_MODES.map((m, i) => {
          const on = i === value;
          return (
            <button
              key={m.id}
              onClick={() => onPick(i)}
              className={`tile cut-sm pointer-events-auto relative px-3 py-2 text-left ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', CAM_COLOR)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[17px] tracking-wider" style={{ color: on ? CAM_COLOR : '#ffffff' }}>
                  {i + 1}. {m.name}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-tech text-[8px] tracking-[0.16em] text-white/40">{m.tag}</span>
                  {on && <span className="font-tech text-[9px] font-bold tracking-[0.16em]" style={{ color: CAM_COLOR }}>AKTIF</span>}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-white/55">{m.desc}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-white/45">
        Semua mode lewat pengaman framing yang sama: robot tidak akan pernah terpotong tepi layar. Ganti kapan saja —
        di menu, saat jeda, atau tengah ronde dengan tombol <b className="text-white/70">/</b> dan <b className="text-white/70">.</b>
      </div>
    </div>
  );
}
