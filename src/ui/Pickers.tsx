import type { ReactNode } from 'react';
import { FOOTWORK_STEPS, IQ_STEPS, ULTRA_COLOR } from '../game/Game';
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
      <SectionTitle>TINGKAT KESULITAN</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onPick(false)}
          className={`tile cut pointer-events-auto relative px-3 py-2.5 text-left ${!ultra ? 'tile-on' : ''}`}
          style={cssVar('--c', '#ffd34a')}
        >
          <div className="flex items-center justify-between">
            <span className="font-display text-[22px] tracking-wider" style={{ color: !ultra ? '#ffd34a' : '#ffffff' }}>
              NORMAL
            </span>
            <span className="font-tech text-[10px] text-white/50">★☆☆</span>
          </div>
          <div className="text-[10px] leading-tight text-white/55">Lawan standar — cocok untuk belajar</div>
        </button>
        <button
          onClick={() => onPick(true)}
          className={`tile ultra-btn cut pointer-events-auto relative overflow-hidden px-3 py-2.5 text-left ${ultra ? 'tile-on' : ''}`}
          style={cssVar('--c', ULTRA_COLOR)}
        >
          <div className="relative z-10 flex items-center justify-between">
            <span className="font-display text-[22px] tracking-wider" style={{ color: ULTRA_COLOR }}>
              ULTRA HARD
            </span>
            <span className="text-sm">{ultra ? '🔥' : '☠'}</span>
          </div>
          <div className="relative z-10 text-[10px] leading-tight text-white/65">HP +40% · serangan +30% · baca & balas super cepat · semua lawan punya Overdrive</div>
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
  1: 'Seperti biasa',
  2: 'Baca & dodge lebih cepat',
  3: 'Dodge presisi, batalkan serangan',
  10: 'Hampir tak terkalahkan',
  12: 'ULTRA CERDAS — punya rencana: mengamati gayamu, memancing, menyudutkan ke tali, menyimpan Overdrive untuk saat kamu lemah',
};

/** how many times smarter the enemy is: reads you faster, dodges and blocks more, counters harder */
export function IqPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div>
      <SectionTitle right={value >= 10 ? <span className="font-tech text-[9px] tracking-[0.2em] text-red-400">☠ EKSTREM</span> : undefined}>KECERDASAN MUSUH (AI)</SectionTitle>
      <div className="grid grid-cols-5 gap-1.5">
        {IQ_STEPS.map((m) => {
          const on = m === value;
          const col = m >= 12 ? '#ffb030' : m >= 10 ? '#ff4a64' : '#c58bff';
          return (
            <button
              key={m}
              onClick={() => onPick(m)}
              className={`tile cut-sm pointer-events-auto relative px-1 py-2 text-center ${on ? 'tile-on' : ''}`}
              style={cssVar('--c', col)}
            >
              <div className="font-display text-[24px] leading-none" style={{ color: on ? col : '#ffffff' }}>
                {IQ_LABEL[m] ?? `${m}×`}
              </div>
              <div className="mt-0.5 font-tech text-[8px] tracking-[0.12em] text-white/60">{IQ_NAME[m]}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-white/50">{IQ_SUB[value] ?? ''} — makin tinggi, musuh membaca seranganmu lebih cepat, lebih sering dodge &amp; blok, dan membalas lebih tajam.</div>
    </div>
  );
}
