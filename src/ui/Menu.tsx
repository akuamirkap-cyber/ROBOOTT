import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  FOOTWORK_STEPS,
  OPPONENTS,
  PLAYER_NAME,
  ULTRA_COLOR,
  loadGloveSkin, loadArmorSkin,
  loadHelmetSkin,
  hpThick,
  smartDef,
  ultraDef,
  type Game,
  type HeroPose,
  type HudState,
  type OpponentDef,
  type TransId,
} from '../game/Game';
import { ARMOR_SKINS, GLOVE_SKINS, HELMET_SKINS } from '../game/build';
import type { SfxProfile } from '../game/audio';
import { Key, cssVar } from './Emblem';
import { CamPicker, DifficultyPicker, FootworkPicker, IqPicker, SfxPicker, TransitionPicker } from './Pickers';
import { ACCOUNT_NAME, MODES, levelOf, tierOf, weekResetIn, wrcPoints, type ModeId, type Profile } from '../game/progress';
import { Avatar, ProfileCard, ProfileSheet } from './Profile';
import { Leaderboard, ModeDossier, ModeHub, type LobbyView } from './Modes';

export type MenuTab = 'lobby' | 'arena' | 'titan' | 'controls' | 'settings';

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
  cam: number;
  onCam: (i: number) => void;
  iq: number;
  onIq: (n: number) => void;
  muted?: boolean;
  onToggleMute?: () => void;
  game?: Game | null;
  hud?: HudState | null;
  profile: Profile;
  portrait: string | null;
  mode: ModeId;
  onMode: (m: ModeId) => void;
  onStartMode: (m: ModeId) => void;
  /** the picked ring transition, and a live preview of it (see TRANSITIONS in Game.ts) */
  trans: TransId;
  onTrans: (id: TransId) => void;
  onTransTry: () => void;
}

const act = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.blur();
  fn();
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** which lobby chrome: 'mw' = the military-shooter main menu (vertical list, hero centre, challenges right); 'classic' = the esports deck */
export type LobbyLayout = 'mw' | 'classic';
const LS_LAYOUT = 'steel-titans-lobby-ui-v1';
export const loadLayout = (): LobbyLayout => {
  try {
    return localStorage.getItem(LS_LAYOUT) === 'classic' ? 'classic' : 'mw';
  } catch {
    return 'mw';
  }
};
const saveLayout = (l: LobbyLayout) => {
  try {
    localStorage.setItem(LS_LAYOUT, l);
  } catch {
    /* private mode */
  }
};

/** the weekly targets of the MW-style challenge rail (progress read straight from the profile) */
function weeklyTargets(p: Profile) {
  return [
    { text: 'Menangkan 3 pertandingan di mode mana pun minggu ini', cur: Math.min(3, p.weekWins), max: 3, reward: 2500 },
    { text: 'Capai 2 kemenangan beruntun tanpa kalah', cur: Math.min(2, p.bestStreak), max: 2, reward: 2500 },
    { text: 'Menangkan 1 pertandingan RANK MODE', cur: Math.min(1, p.rankWins), max: 1, reward: 2500 },
    { text: 'Juarai TOURNAMENT 16 Titan sampai Grand Final', cur: Math.min(1, p.titles), max: 1, reward: 10000 },
  ];
}

const IcoCam = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="1.5" y="4" width="9" height="8" rx="1" />
    <path d="M10.5 7l4-2v6l-4-2z" />
  </svg>
);
const IcoSkull = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M8 1.5a5.5 5.5 0 0 0-3.5 9.8V13h7v-1.7A5.5 5.5 0 0 0 8 1.5z" />
    <circle cx="6" cy="7.5" r="1.1" fill="currentColor" />
    <circle cx="10" cy="7.5" r="1.1" fill="currentColor" />
    <path d="M6.5 13v1.5M9.5 13v1.5" />
  </svg>
);
const IcoGear = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
  </svg>
);
const IcoSound = ({ off }: { off: boolean }) => (
  <svg width="16" height="14" viewBox="0 0 18 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
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
const Chevrons = () => (
  <svg width="22" height="18" viewBox="0 0 22 18" fill="currentColor" aria-hidden="true">
    <path d="M1 1h5l7 8-7 8H1l7-8z" />
    <path d="M10 1h5l7 8-7 8h-5l7-8z" opacity="0.7" />
  </svg>
);

function statsOf(d: OpponentDef) {
  const bars = [
    { k: 'VITALITAS', v: clamp01(d.hp / 210) },
    { k: 'KEKUATAN', v: clamp01(d.dmg / 1.4) },
    { k: 'KECEPATAN', v: clamp01(d.speed / 4.8) },
    { k: 'KECERDASAN', v: clamp01((d.react * 0.6 + d.punish * 0.4) / 0.8) },
    { k: 'AGRESI', v: clamp01(d.aggro / 0.9) },
  ];
  const threat = bars.reduce((a, b) => a + b.v, 0) / bars.length;
  const pwr = Math.round(1400 + d.hp * 12 + d.dmg * 650 + d.speed * 220 + threat * 950);
  return { bars, threat, pwr };
}

const THREAT = ['', 'RENDAH', 'SEDANG', 'TINGGI', 'EKSTREM', 'MAUT'];
const TIER_TAG = ['TIER I · ROOKIE', 'TIER II · BRAWLER', 'TIER III · HEAVY', 'TIER IV · CHAMPION'];
const STYLE_DESC = [
  'Lambat dan kasar. Serangannya mudah dibaca — sparring ideal untuk menguasai kombo dasar dan timed dodge.',
  'Agresif dan lincah. Sering memotong jarak dan menghindar ke samping. Balas dengan hook lebar saat ia sidestep.',
  'Raksasa bertenaga petir. Memiliki armor tebal dan Overdrive banting penghancur. Jaga jarak dan manfaatkan counter.',
  'Sang juara dunia tak terkalahkan. Membaca pola serangan spammed, menghindar refleks sempurna, dan membalas tanpa ampun.',
];

/** Custom SVG Mecha Head Portrait for each challenger */
function MechaCrest({ index, color, locked, size = 34 }: { index: number; color: string; locked?: boolean; size?: number }) {
  const c = locked ? '#64748b' : color;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className="shrink-0" aria-hidden="true">
      {/* Hexagonal frame */}
      <polygon
        points="24,2 44,13 44,35 24,46 4,35 4,13"
        fill="rgba(8, 12, 26, 0.9)"
        stroke={c}
        strokeWidth="2"
        strokeOpacity={locked ? 0.35 : 0.85}
      />
      {index === 0 && (
        /* SCRAP-9: Industrial welded brawler visor */
        <>
          <rect x="13" y="13" width="22" height="22" rx="3" fill="#1e293b" stroke={c} strokeWidth="1.6" />
          <rect x="16" y="18" width="16" height="6" rx="1" fill={c} />
          <line x1="17" y1="29" x2="31" y2="29" stroke={c} strokeWidth="2" />
          <line x1="20" y1="13" x2="20" y2="35" stroke="#0f172a" strokeWidth="1.5" />
          <line x1="28" y1="13" x2="28" y2="35" stroke="#0f172a" strokeWidth="1.5" />
        </>
      )}
      {index === 1 && (
        /* CRIMSON FANG: Sharp predator horns & V-visor */
        <>
          <polygon points="12,11 18,17 30,17 36,11 34,34 24,38 14,34" fill="#1e293b" stroke={c} strokeWidth="1.6" />
          <polygon points="15,20 24,24 33,20 30,25 24,27 18,25" fill={c} />
          <polygon points="19,31 24,29 29,31 27,34 21,34" fill={c} fillOpacity="0.6" />
        </>
      )}
      {index === 2 && (
        /* VOLT TITAN: Heavy juggernaut dome & twin arc coils */
        <>
          <rect x="10" y="15" width="4" height="14" rx="1" fill={c} />
          <rect x="34" y="15" width="4" height="14" rx="1" fill={c} />
          <path d="M14 14 H34 L36 34 H12 Z" fill="#1e293b" stroke={c} strokeWidth="1.6" />
          <circle cx="20" cy="22" r="2.6" fill={c} />
          <circle cx="28" cy="22" r="2.6" fill={c} />
          <rect x="17" y="28" width="14" height="3" fill={c} fillOpacity="0.75" />
        </>
      )}
      {index >= 3 && (
        /* OMEGA ZEUS: Crowned God-Tier Emperor Mecha */
        <>
          <polygon points="12,16 16,9 24,14 32,9 36,16" fill={c} />
          <polygon points="13,16 35,16 33,35 24,39 15,35" fill="#1e293b" stroke={c} strokeWidth="1.6" />
          <polygon points="16,21 24,24 32,21 30,26 24,28 18,26" fill={c} />
          <circle cx="24" cy="18" r="1.8" fill="#ffffff" />
        </>
      )}
    </svg>
  );
}

/** Crisp SVG Threat Diamond Icons (replaces blurry unicode skull text) */
function ThreatMeter({ level, color }: { level: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2, 3, 4].map((i) => {
        const active = i < level;
        return (
          <svg
            key={i}
            width="12"
            height="12"
            viewBox="0 0 14 14"
            className="transition-transform duration-200"
            style={{
              filter: active ? `drop-shadow(0 0 6px ${color})` : 'none',
              transform: active ? 'scale(1.05)' : 'scale(0.9)',
            }}
          >
            <polygon
              points="7,1 13,7 7,13 1,7"
              fill={active ? color : 'rgba(255,255,255,0.12)'}
              stroke={active ? '#ffffff' : 'rgba(255,255,255,0.2)'}
              strokeWidth="1"
            />
          </svg>
        );
      })}
    </div>
  );
}

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
    title: 'PILIH TANGAN AKTIF',
    rows: [
      [['A', '/', 'D'], 'Tap kiri / kanan untuk ganti tangan menyerang (Kiri ◀ / Kanan ▶)'],
      [['◀', '▶'], 'Chip di HUD kiri-atas menunjukkan tangan aktif untuk Jab, Hook, Uppercut & Counter'],
    ],
  },
  {
    title: 'SERANGAN & KOMBO',
    rows: [
      [['H'], 'JAB — pukulan tercepat & terpanjang (jangkauan 4,4 m): pembuka kombo, penembus guard, dan pengisi meter Overdrive terbaik. Beruntun 1-1-1-1 makin cepat (sampai +30%)'],
      [['J'], 'Hook samping melengkung'],
      [['K'], 'Uppercut (melontarkan lawan ke udara)'],
      [['L'], 'COUNTER — tangkap serangan lawan tepat waktu & balas lurus otomatis!'],
      [['P'], 'Grab bantingan — menembus pertahanan blok lawan'],
      [['X'], 'Straight lurus (cross) bertenaga'],
      [['LARI', '+', 'H J K L'], 'Running strike berdaya dorong dahsyat'],
    ],
  },
  {
    title: 'TARGET PUKULAN, RAGE & OVERDRIVE',
    rows: [
      [['G'], 'RAGE MODE 🔥 — tingkatkan kecepatan bertarung, kombo agresif & dorongan pukulan!'],
      [['R'], 'OVERDRIVE (4 jurus bergiliran): FREESTYLE 360° muter-muter tangan → STRAIGHT lurus sepanjang ring → UPPERCUT pelontar ke udara (paling tinggi!) → SLAM hantaman atas. Semua menembus blok (bisa mencopot kepala)!'],
      [['Q', '/', 'T'], 'Ganti titik sasaran: KEPALA (stun & KO cepat) → DADA (kuras stamina & hancurkan blok) → REMIX (kombinasi otomatis atas-bawah, lawan tak bisa pasang blok di satu level)'],
    ],
  },
  {
    title: 'DODGE FLUID (GAYA MUHAMMAD ALI) & BLOK',
    rows: [
      [['SPACE'], 'DODGE fluid gaya Muhammad Ali (slip kepala, weave bahu & pull-back). Tekan saat ◎ muncul = Timed Dodge'],
      [['SPACE', '→', 'SERANG'], 'Dodge Strike: pukulan setelah dodge keluar 38% lebih cepat & 22% lebih keras'],
      [['SPACE', 'TAHAN'], 'Tahan SPACE untuk menjaga Blok aktif'],
    ],
  },
  {
    title: 'GAYA IPPO — DEMPSEY ROLL',
    rows: [
      [['E'], 'PEEK-A-BOO (tahan): goyang kepala angka-8, slip otomatis dari pukulan lurus'],
      [['E', '+', 'H J K L'], 'DEMPSEY SMASH: makin lama menenun goyangan, pukulan makin mematikan!'],
    ],
  },
  {
    title: 'TEKNIK JUARA & KAMERA',
    rows: [
      [['M', '/', 'N'], 'Taunt provokasi: pound dada 3× cepat & sombong / angkat sabuk (mengisi meter Overdrive)'],
      [['4'], 'ADU TINJU — adu kedua sarung tinju di tengah dada 3× dengan percikan api, lalu dagu terangkat'],
      [['B', 'U', 'I', 'Y', 'O', '1', '2', '3'], 'Buku freestyle lain: gulir bahu, lambaian, pamer kabel, kincir, gas piston, cek servo, inti nyala, bor tinju'],
      [['R'], 'OVERDRIVE FINISHER saat meter mencapai 100%'],
      [['[', ']'], 'Ubah kecepatan footwork secara instan saat bertanding'],
      [['/', '.'], 'Ganti sudut kamera (SIARAN · AKSI · DEKAT · RING LUAS · PUNDAK)'],
      [['ESC'], 'Jeda pertandingan / Menu Pause'],
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
  cam,
  onCam,
  iq,
  onIq,
  muted = false,
  onToggleMute,
  game,
  hud,
  profile,
  portrait,
  mode,
  onMode,
  onStartMode,
  trans,
  onTrans,
  onTransTry,
}: MenuProps) {
  const [tab, setTab] = useState<MenuTab>('lobby');
  const [showProfile, setShowProfile] = useState(false);
  const [layout, setLayoutState] = useState<LobbyLayout>(loadLayout);
  const mw = layout === 'mw';
  const setLayout = (l: LobbyLayout) => {
    setLayoutState(l);
    saveLayout(l);
    game?.uiCue('click');
  };
  const lobbyView: LobbyView = showProfile ? 'profile' : mode;
  const [heroPose, setHeroPoseState] = useState<HeroPose>('ready');
  const [camMode, setCamModeState] = useState<'hero' | 'arena' | 'full'>('hero');
  const [helmetId, setHelmetId] = useState<number>(loadHelmetSkin);
  const [gloveId, setGloveId] = useState<number>(loadGloveSkin);
  const [armorId, setArmorId] = useState<number>(loadArmorSkin);
  const [armoryTab, setArmoryTab] = useState<'helmet' | 'glove' | 'armor'>('helmet');
  const dragRef = useRef({ dragging: false, startX: 0, moved: false });

  const def = smartDef(ultra ? ultraDef(OPPONENTS[sel]) : OPPONENTS[sel], iq);
  const col = ultra ? ULTRA_COLOR : def.color;
  const { bars, threat, pwr } = statsOf(def);
  const skulls = Math.max(1, Math.round(threat * 5));

  // Sync state from HUD if available
  useEffect(() => {
    if (hud?.heroPose) setHeroPoseState(hud.heroPose);
    if (hud?.menuCamMode) setCamModeState(hud.menuCamMode);
    if (hud?.helmetSkin !== undefined) setHelmetId(hud.helmetSkin);
    if (hud?.gloveSkin !== undefined) setGloveId(hud.gloveSkin);
    if (hud?.armorSkin !== undefined) setArmorId(hud.armorSkin);
  }, [hud?.heroPose, hud?.menuCamMode, hud?.helmetSkin, hud?.gloveSkin, hud?.armorSkin]);

  const pickHelmet = (id: number) => {
    const v = (id + HELMET_SKINS.length) % HELMET_SKINS.length;
    setHelmetId(v);
    game?.setHelmetSkin(v);
    if (camMode === 'arena') {
      const want = tab === 'titan' ? 'full' : 'hero';
      setCamModeState(want);
      game?.setMenuCamMode(want);
    }
  };

  const pickGlove = (id: number) => {
    const v = (id + GLOVE_SKINS.length) % GLOVE_SKINS.length;
    setGloveId(v);
    game?.setGloveSkin(v);
    if (camMode === 'arena') {
      const want = tab === 'titan' ? 'full' : 'hero';
      setCamModeState(want);
      game?.setMenuCamMode(want);
    }
  };

  const pickArmor = (id: number) => {
    const v = (id + ARMOR_SKINS.length) % ARMOR_SKINS.length;
    setArmorId(v);
    game?.setArmorSkin(v);
    if (camMode === 'arena') {
      const want = tab === 'titan' ? 'full' : 'hero';
      setCamModeState(want);
      game?.setMenuCamMode(want);
    }
  };

  const ARMORY = { helmet: HELMET_SKINS, glove: GLOVE_SKINS, armor: ARMOR_SKINS } as const;
  const armoryList = ARMORY[armoryTab];
  const armoryActiveId = armoryTab === 'helmet' ? helmetId : armoryTab === 'glove' ? gloveId : armorId;
  const armoryPick = (id: number) => (armoryTab === 'helmet' ? pickHelmet(id) : armoryTab === 'glove' ? pickGlove(id) : pickArmor(id));
  const armoryActive = armoryList[armoryActiveId];
  const armoryLabel = armoryTab === 'helmet' ? 'HELM' : armoryTab === 'glove' ? 'SARUNG TINJU' : 'ARMOR BADAN';
  const armoryHover = armoryTab === 'helmet' ? 'hover:border-sky-400' : armoryTab === 'glove' ? 'hover:border-amber-400' : 'hover:border-rose-400';

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
      if (e.code === 'Escape') {
        if (tab !== 'lobby') setTab('lobby');
        else if (showProfile) setShowProfile(false);
        return;
      }
      if (e.code === 'Enter') {
        if (tab === 'lobby' && lobbyView !== 'leaderboard' && lobbyView !== 'profile') onStartMode(lobbyView);
        else onStart();
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
  }, [tab, sel, unlocked, onSel, onStart, onStartMode, lobbyView, showProfile]);

  const setPose = (p: HeroPose) => {
    setHeroPoseState(p);
    game?.setHeroPose(p);
  };

  // THE LENS FOLLOWS THE TAB: the garage shows the whole machine head to boots, the lobby frames it waist-up
  useEffect(() => {
    if (!game || camMode === 'arena') return;
    const want = tab === 'titan' ? 'full' : 'hero';
    if (camMode !== want) {
      setCamModeState(want);
      game.setMenuCamMode(want);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, game]);

  const toggleCam = () => {
    const next = camMode === 'arena' ? (tab === 'titan' ? 'full' : 'hero') : 'arena';
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
      className={`menu-root ${mw ? 'mw-root' : ''} absolute inset-0 select-none overflow-hidden text-white`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* ---------- Cinematic Atmosphere Overlays ---------- */}
      <div className="menu-shade" />
      <div className="menu-streaks" />
      <div className="menu-scan" />

      {/* ===================================================================
          MW-STYLE TOP BAR: wordmark left · identity centre · icon strip right
      =================================================================== */}
      {mw && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between px-4 sm:h-[72px] sm:px-8">
          <div className="pointer-events-auto mw-brand">
            <div className="font-display mw-brand-t">
              <span>STEEL</span> <span className={ultra ? 'mw-brand-red' : 'mw-brand-sky'}>TITANS</span>
              <span className="mw-brand-mark">II</span>
            </div>
            <div className="mw-brand-s">WRC ONLINE ARENA</div>
          </div>

          <button
            className="pointer-events-auto mw-ident"
            onClick={act(() => {
              setShowProfile(true);
              setTab('lobby');
            })}
            title="Profil akun"
          >
            <Avatar url={portrait} size={28} color={ultra ? ULTRA_COLOR : '#38bdf8'} />
            <span className="mw-ident-lv">{levelOf(profile.xp).level}</span>
            <span className="mw-ident-tag">[{tierOf(profile.rp).tier.short}WRC]</span>
            <span className="mw-ident-name">{ACCOUNT_NAME}</span>
          </button>

          <div className="pointer-events-auto mw-icons">
            <div className="mw-ico mw-ico-txt" title="Poin liga WRC">
              <span className="mw-ico-k">WRC</span>
              <span className="mw-ico-v">{wrcPoints(profile).toLocaleString('id-ID')}</span>
            </div>
            <button onClick={act(toggleCam)} className={`mw-ico ${camMode === 'arena' ? 'mw-ico-on' : ''}`} title="Kamera: Hero / Arena">
              <IcoCam />
            </button>
            <button onClick={act(() => onUltra(!ultra))} className={`mw-ico ${ultra ? 'mw-ico-red' : ''}`} title={ultra ? 'AI: ULTRA' : 'AI: NORMAL'}>
              <IcoSkull />
            </button>
            {onToggleMute && (
              <button onClick={act(onToggleMute)} className={`mw-ico ${muted ? 'mw-ico-red' : ''}`} title={muted ? 'Suara mati' : 'Suara aktif'}>
                <IcoSound off={!!muted} />
              </button>
            )}
            <button onClick={act(() => setTab(tab === 'settings' ? 'lobby' : 'settings'))} className={`mw-ico ${tab === 'settings' ? 'mw-ico-on' : ''}`} title="Opsi">
              <IcoGear />
            </button>
          </div>
        </header>
      )}

      {/* ===================================================================
          CLASSIC TOP ESPORTS LOBBY HEADER BAR (3 Clean Zones, Zero Overlap)
      =================================================================== */}
      {!mw && (
      <header className="lobby-header-bg pointer-events-none absolute inset-x-0 top-0 z-30 flex h-16 items-center justify-between px-3 sm:h-20 sm:px-7">
        {/* Zone 1: Pilot Profile Badge + Brand Wordmark */}
        <div className="pointer-events-auto flex items-center gap-3">
          {/* ACCOUNT PROFILE CARD — live 3×4 portrait of the player's own Titan */}
          <ProfileCard
            profile={profile}
            url={portrait}
            color={ultra ? ULTRA_COLOR : '#38bdf8'}
            onClick={() => {
              setShowProfile(true);
              setTab('lobby');
            }}
          />

          <span className="hidden h-7 w-px bg-white/15 lg:block" />

          {/* Brand Title */}
          <div className="flex items-center gap-2">
            <div>
              <div className="brand-skew font-display text-[26px] leading-none tracking-[0.1em] sm:text-[36px]">
                <span className="chrome-text">STEEL</span>{' '}
                <span className={ultra ? 'red-text' : 'blue-text'}>TITANS</span>
              </div>
              <div className="font-tech text-[9px] tracking-[0.4em] text-sky-200/70">
                WRC ONLINE ARENA · 2026
              </div>
            </div>
          </div>
        </div>

        {/* Zone 2: Center Esports Navigation Tabs */}
        <nav className="pointer-events-auto hidden md:flex items-stretch gap-1">
          {[
            { id: 'lobby', label: 'LOBBY' },
            { id: 'arena', label: 'ARENA' },
            { id: 'titan', label: 'GARASI' },
            { id: 'controls', label: 'JURUS' },
            { id: 'settings', label: 'OPSI' },
          ].map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={act(() => setTab(item.id as MenuTab))}
                className={`aaa-tab font-display ${active ? 'aaa-tab-on' : ''} ${ultra && active ? 'aaa-tab-ultra' : ''}`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: League Points, Camera Toggle, Difficulty & Integrated Sound Button */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* WRC League Points */}
          <div className="aaa-pill aaa-pill-gold hidden xl:flex">
            <span className="aaa-pill-k">WRC</span>
            <span className="aaa-pill-v">{wrcPoints(profile)}</span>
          </div>

          {/* Camera Mode Switcher */}
          <button
            onClick={act(toggleCam)}
            className={`aaa-pill ${camMode === 'arena' ? 'aaa-pill-gold' : ''}`}
            title="Ganti sudut pandang: Hero 3D atau Live Arena Sparring"
          >
            <span className="aaa-pill-k">CAM</span>
            <span className="aaa-pill-v hidden sm:inline">{camMode === 'arena' ? 'ARENA' : 'HERO'}</span>
          </button>

          {/* Difficulty */}
          <button
            onClick={act(() => onUltra(!ultra))}
            className={`aaa-pill hidden sm:flex ${ultra ? 'aaa-pill-red' : ''}`}
            title="Ubah tingkat kesulitan kompetisi"
          >
            <span className="aaa-pill-k">AI</span>
            <span className="aaa-pill-v">{ultra ? 'ULTRA' : 'NORMAL'}</span>
          </button>

          {/* Integrated Audio Mute/Unmute Button */}
          {onToggleMute && (
            <button
              onClick={act(onToggleMute)}
              className={`aaa-pill aaa-pill-ico ${muted ? 'aaa-pill-red' : ''}`}
              title={muted ? 'Suara Mati (Klik untuk nyalakan)' : 'Suara Aktif (Klik untuk bisukan)'}
            >
              <svg
                width="16"
                height="14"
                viewBox="0 0 18 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M2 6h3l4-3.5v11L5 10H2z" fill="currentColor" />
                {muted ? (
                  <path d="M12 5l5 6M17 5l-5 6" />
                ) : (
                  <>
                    <path d="M12 5.5c1.3 1.3 1.3 3.7 0 5" />
                    <path d="M14.5 3.5c2.4 2.4 2.4 6.6 0 9" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
      </header>
      )}

      {/* Mobile Subnav Bar (< md) */}
      {!mw && (
      <div className="pointer-events-auto absolute inset-x-3 top-15 z-30 flex gap-1 md:hidden">
        {(['arena', 'titan', 'controls', 'settings'] as MenuTab[]).map((t) => (
          <button
            key={t}
            onClick={act(() => setTab(t))}
            className={`aaa-tab font-display flex-1 text-center ${tab === t ? 'aaa-tab-on' : ''} ${tab === t && ultra ? 'aaa-tab-ultra' : ''}`}
          >
            {t === 'arena' ? 'ARENA' : t === 'titan' ? 'GARASI' : t === 'controls' ? 'JURUS' : 'OPSI'}
          </button>
        ))}
      </div>
      )}

      {/* ===================================================================
          MAIN LOBBY CONTENT (Left Deck · Center 3D Hero Stage · Right Intel & CTA)
      =================================================================== */}
      <div className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-between px-3 pb-20 pt-24 sm:px-7 sm:pb-20 sm:pt-24 ${mw ? 'mw-main sm:px-8' : ''}`}>
        {/* =========================================================
            MW-STYLE MAIN MENU RAIL (left): modes, then the BARAK section
        ========================================================= */}
        {mw && (
          <nav className="mw-menu pointer-events-auto">
            {MODES.map((m) => {
              const on = tab === 'lobby' && !showProfile && mode === m.id;
              return (
                <button
                  key={m.id}
                  className={`mw-item font-display ${on ? 'mw-item-on' : ''}`}
                  onClick={act(() => {
                    setShowProfile(false);
                    if (tab !== 'lobby') setTab('lobby');
                    if (on && m.id !== 'leaderboard') onStartMode(m.id);
                    else onMode(m.id);
                  })}
                  title={on && m.id !== 'leaderboard' ? `Klik lagi / ENTER untuk mulai ${m.name}` : m.desc}
                >
                  {on && (
                    <span className="mw-chev">
                      <Chevrons />
                    </span>
                  )}
                  <span className="mw-item-t">{m.id === 'leaderboard' ? 'LEADERBOARD' : m.name}</span>
                </button>
              );
            })}
            <div className="mw-sec font-display">BARAK</div>
            {[
              { id: 'profile', label: 'PROFIL PILOT' },
              { id: 'arena', label: 'ROSTER LAWAN' },
              { id: 'titan', label: 'GARASI SKIN' },
              { id: 'controls', label: 'JURUS' },
              { id: 'settings', label: 'OPSI' },
            ].map((it) => {
              const on = it.id === 'profile' ? tab === 'lobby' && showProfile : tab === it.id;
              return (
                <button
                  key={it.id}
                  className={`mw-item font-display ${on ? 'mw-item-on' : ''}`}
                  onClick={act(() => {
                    if (it.id === 'profile') {
                      setShowProfile(true);
                      setTab('lobby');
                    } else {
                      setShowProfile(false);
                      setTab(on ? 'lobby' : (it.id as MenuTab));
                    }
                  })}
                >
                  {on && (
                    <span className="mw-chev">
                      <Chevrons />
                    </span>
                  )}
                  <span className="mw-item-t">{it.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* =========================================================
            TAB 1 (LEFT): CHALLENGER ROSTER & AI TUNING DECK
        ========================================================= */}
        {!mw && tab === 'lobby' && (
          <div
            className={`lobby-panel ${
              ultra ? 'lobby-panel-ultra' : ''
            } no-scrollbar stagger pointer-events-auto flex max-h-full w-full flex-col gap-3 overflow-y-auto p-4 sm:w-[440px] xl:w-[490px]`}
          >
            <div className="aaa-head">
              <span className="aaa-head-k">MODE</span>
              <span className="aaa-head-t">PERTANDINGAN</span>
            </div>
            <ModeHub
              mode={lobbyView}
              profile={profile}
              def={def}
              ultra={ultra}
              onPick={(m) => {
                setShowProfile(false);
                onMode(m);
              }}
              onStart={(m) => {
                setShowProfile(false);
                onMode(m);
                onStartMode(m);
              }}
            />
            <button onClick={act(() => setTab('arena'))} className="aaa-link">
              <span>ROSTER LAWAN &amp; TUNING AI</span>
              <span className="aaa-link-arrow">›</span>
            </button>
          </div>
        )}

        {tab === 'arena' && (
          <div
            className={`lobby-panel ${
              ultra ? 'lobby-panel-ultra' : ''
            } no-scrollbar stagger pointer-events-auto flex max-h-full w-full flex-col gap-3 overflow-y-auto p-4 sm:w-[440px] xl:w-[490px]`}
          >
            {/* Top Accent Bar */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-1.5 rounded-xs"
                  style={{ background: ultra ? ULTRA_COLOR : '#38bdf8', boxShadow: `0 0 8px ${ultra ? ULTRA_COLOR : '#38bdf8'}` }}
                />
                <span className="font-tech text-[9.5px] font-bold tracking-[0.22em] text-white/90">
                  {ultra ? 'DIVISI ULTRA HARD' : 'LIGA KEJUARAAN DUNIA'}
                </span>
              </div>
              <span className="rounded border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 font-tech text-[8px] font-bold tracking-[0.16em] text-sky-300">
                {unlocked + 1}/{OPPONENTS.length} TERBUKA
              </span>
            </div>

            {/* 2x2 Challenger Roster Cards */}
            <div>
              <div className="mb-1.5 flex items-center justify-between font-tech text-[8.5px] font-bold tracking-[0.2em] text-white/60">
                <span>PILIH LAWAN TANDING</span>
                <span className="text-white/40">TOMBOL [1–4]</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {OPPONENTS.map((o, i) => {
                  const locked = i > unlocked;
                  const on = sel === i;
                  const oppCol = ultra ? ULTRA_COLOR : o.color;
                  const oppStats = statsOf(smartDef(ultra ? ultraDef(o) : o, iq));
                  return (
                    <button
                      key={o.name}
                      disabled={locked}
                      onClick={act(() => onSel(i))}
                      className={`tile cut-sm group relative flex items-center gap-2.5 p-2 text-left transition-all ${
                        on
                          ? 'tile-on scale-[1.01] shadow-[0_0_18px_rgba(56,189,248,0.22)]'
                          : 'hover:bg-white/[0.04]'
                      } ${locked ? 'cursor-not-allowed opacity-45' : ''}`}
                      style={cssVar('--c', oppCol)}
                    >
                      <MechaCrest index={i} color={oppCol} locked={locked} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-tech text-[7.5px] font-bold tracking-[0.16em] text-white/50">
                            {i === 3 ? 'FINAL BOSS' : `TIER 0${i + 1}`}
                          </span>
                          {locked ? (
                            <span className="font-tech text-[8px] text-white/40">🔒</span>
                          ) : on ? (
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: oppCol, boxShadow: `0 0 6px ${oppCol}` }}
                            />
                          ) : null}
                        </div>
                        <div
                          className="truncate font-display text-[16px] leading-tight tracking-wide"
                          style={{ color: locked ? '#94a3b8' : on ? '#ffffff' : oppCol }}
                        >
                          {o.name}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between font-tech text-[7.5px] text-white/55">
                          <span>PWR {oppStats.pwr}</span>
                          <span style={{ color: locked ? '#64748b' : oppCol }}>
                            {locked ? 'TERKUNCI' : on ? 'TARGET' : 'SIAP'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty & AI Tuning Subcard */}
            <div className="lobby-subcard space-y-2.5 rounded-lg p-3">
              <DifficultyPicker ultra={ultra} onPick={onUltra} />
              <IqPicker value={iq} onPick={onIq} />
            </div>

            {/* Quick Real Steel Skin Customizer (10 Fierce Helmets & 10 Ultra-Rare Boxing Gloves) */}
            <div className="lobby-subcard space-y-2 rounded-lg border border-amber-400/25 p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-tech text-[8.5px] font-bold tracking-[0.18em] text-amber-300">
                  ⚡ GARASI REAL STEEL (12 HELM &amp; 12 GLOVE)
                </span>
                <button
                  onClick={act(() => setTab('titan'))}
                  className="rounded border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-tech text-[7.5px] font-bold tracking-wider text-sky-200 hover:bg-sky-500/30"
                >
                  LIHAT SEMUA 30 SKIN ▶
                </button>
              </div>

              {/* Helmet Quick Selector */}
              <div className="flex items-center justify-between gap-1.5 rounded border border-white/10 bg-slate-950/65 px-2 py-1.5">
                <button
                  onClick={act(() => pickHelmet(helmetId - 1))}
                  className="cut-sm grid h-6 w-6 place-items-center border border-white/15 bg-white/5 font-tech text-[10px] text-white/80 hover:border-sky-400 hover:text-white"
                  title="Helm Sebelumnya"
                >
                  ◀
                </button>
                <button
                  onClick={act(() => {
                    setArmoryTab('helmet');
                    setTab('titan');
                  })}
                  className="min-w-0 flex-1 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: HELMET_SKINS[helmetId].color,
                        boxShadow: `0 0 8px ${HELMET_SKINS[helmetId].color}`,
                      }}
                    />
                    <span className="truncate font-display text-[14px] tracking-wide text-white">
                      🪖 {HELMET_SKINS[helmetId].name}
                    </span>
                    <span className="rounded bg-white/10 px-1 py-0.2 font-tech text-[7px] font-bold text-amber-300">
                      #{helmetId + 1}/10
                    </span>
                  </div>
                  <div className="truncate font-tech text-[7.5px] tracking-wider text-white/55">
                    {HELMET_SKINS[helmetId].rarity} · {HELMET_SKINS[helmetId].sub}
                  </div>
                </button>
                <button
                  onClick={act(() => pickHelmet(helmetId + 1))}
                  className="cut-sm grid h-6 w-6 place-items-center border border-white/15 bg-white/5 font-tech text-[10px] text-white/80 hover:border-sky-400 hover:text-white"
                  title="Helm Berikutnya"
                >
                  ▶
                </button>
              </div>

              {/* Glove Quick Selector */}
              <div className="flex items-center justify-between gap-1.5 rounded border border-white/10 bg-slate-950/65 px-2 py-1.5">
                <button
                  onClick={act(() => pickGlove(gloveId - 1))}
                  className="cut-sm grid h-6 w-6 place-items-center border border-white/15 bg-white/5 font-tech text-[10px] text-white/80 hover:border-amber-400 hover:text-white"
                  title="Sarung Tinju Sebelumnya"
                >
                  ◀
                </button>
                <button
                  onClick={act(() => {
                    setArmoryTab('glove');
                    setTab('titan');
                  })}
                  className="min-w-0 flex-1 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: GLOVE_SKINS[gloveId].color,
                        boxShadow: `0 0 8px ${GLOVE_SKINS[gloveId].color}`,
                      }}
                    />
                    <span className="truncate font-display text-[14px] tracking-wide text-white">
                      🥊 {GLOVE_SKINS[gloveId].name}
                    </span>
                    <span className="rounded bg-white/10 px-1 py-0.2 font-tech text-[7px] font-bold text-amber-300">
                      #{gloveId + 1}/10
                    </span>
                  </div>
                  <div className="truncate font-tech text-[7.5px] tracking-wider text-white/55">
                    {GLOVE_SKINS[gloveId].rarity} · {GLOVE_SKINS[gloveId].sub}
                  </div>
                </button>
                <button
                  onClick={act(() => pickGlove(gloveId + 1))}
                  className="cut-sm grid h-6 w-6 place-items-center border border-white/15 bg-white/5 font-tech text-[10px] text-white/80 hover:border-amber-400 hover:text-white"
                  title="Sarung Tinju Berikutnya"
                >
                  ▶
                </button>
              </div>

              {/* Body Armor Quick Selector */}
              <div className="flex items-center justify-between gap-1.5 rounded border border-white/10 bg-slate-950/65 px-2 py-1.5">
                <button
                  onClick={act(() => pickArmor(armorId - 1))}
                  className="cut-sm grid h-6 w-6 place-items-center border border-white/15 bg-white/5 font-tech text-[10px] text-white/80 hover:border-rose-400 hover:text-white"
                  title="Armor Badan Sebelumnya"
                >
                  ◀
                </button>
                <button
                  onClick={act(() => {
                    setArmoryTab('armor');
                    setTab('titan');
                  })}
                  className="min-w-0 flex-1 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: ARMOR_SKINS[armorId].color,
                        boxShadow: `0 0 8px ${ARMOR_SKINS[armorId].color}`,
                      }}
                    />
                    <span className="truncate font-display text-[14px] tracking-wide text-white">
                      🛡️ {ARMOR_SKINS[armorId].name}
                    </span>
                    <span className="rounded bg-white/10 px-1 py-0.2 font-tech text-[7px] font-bold text-rose-300">
                      #{armorId + 1}/10
                    </span>
                  </div>
                  <div className="truncate font-tech text-[7.5px] tracking-wider text-white/55">
                    {ARMOR_SKINS[armorId].rarity} · {ARMOR_SKINS[armorId].sub}
                  </div>
                </button>
                <button
                  onClick={act(() => pickArmor(armorId + 1))}
                  className="cut-sm grid h-6 w-6 place-items-center border border-white/15 bg-white/5 font-tech text-[10px] text-white/80 hover:border-rose-400 hover:text-white"
                  title="Armor Badan Berikutnya"
                >
                  ▶
                </button>
              </div>
            </div>

            {/* Quick Footwork Speed Bar */}
            <div className="lobby-subcard rounded-lg p-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-tech text-[8.5px] font-bold tracking-[0.2em] text-white/70">
                  KECEPATAN GERAK {PLAYER_NAME}
                </span>
                <span className="font-tech text-[8px] font-bold tracking-[0.15em] text-emerald-300">
                  FOOTWORK {fw}×
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {FOOTWORK_STEPS.map((m) => {
                  const on = m === fw;
                  return (
                    <button
                      key={m}
                      onClick={act(() => onFw(m))}
                      className={`cut-sm py-1 text-center font-tech text-[9px] font-bold tracking-wider transition ${
                        on
                          ? 'border border-emerald-400/70 bg-emerald-500/25 text-emerald-200 shadow-[0_0_10px_rgba(52,211,153,0.25)]'
                          : 'border border-white/10 bg-white/5 text-white/55 hover:text-white'
                      }`}
                    >
                      {m}×
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile-only Start Match Button (< lg screens where right column is hidden) */}
            <button
              onClick={act(onStart)}
              className={`play-btn cut group relative w-full overflow-hidden px-5 py-3.5 text-left lg:hidden ${
                ultra ? 'play-ultra' : ''
              }`}
            >
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <span className="block font-display text-[28px] leading-none tracking-[0.14em]">
                    {ultra ? '☠ MASUK RING' : '⚔ MASUK RING'}
                  </span>
                  <span className="mt-1 block font-tech text-[8.5px] font-bold tracking-[0.22em] opacity-85">
                    {PLAYER_NAME} VS {def.name} · TEKAN [ENTER]
                  </span>
                </div>
                <span className="font-display text-3xl leading-none transition-transform group-hover:translate-x-1.5">
                  ▶▶
                </span>
              </div>
              <span className="play-sheen" />
            </button>
          </div>
        )}

        {/* =========================================================
            TAB 2: HANGGAR TITAN (10 HELM SANGAR & 10 SARUNG TINJU ULTRA LANGKA)
        ========================================================= */}
        {tab === 'titan' && (
          <div className="lobby-panel no-scrollbar stagger pointer-events-auto flex max-h-full w-full flex-col gap-3 overflow-y-auto p-4 sm:w-[500px] xl:w-[540px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <span className="font-tech text-[8.5px] font-bold tracking-[0.26em] text-amber-300">
                  REAL STEEL ARMORY · 20 KOLEKSI EKSKLUSIF
                </span>
                <h2 className="font-display text-2xl tracking-wide text-white sm:text-3xl">
                  GARASI SKIN <span className="blue-text">{PLAYER_NAME}</span>
                </h2>
              </div>
              <button
                onClick={act(() => setTab('arena'))}
                className="cut-sm border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 font-tech text-[9px] font-bold tracking-wider text-sky-200 hover:bg-sky-500/25"
              >
                ◀ KE ARENA
              </button>
            </div>

            {/* Category Sub-Tabs: 10 HELM SANGAR / 10 SARUNG TINJU / 10 ARMOR BADAN */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={act(() => setArmoryTab('helmet'))}
                className={`cut-sm flex items-center justify-between px-3 py-2 font-tech text-[9.5px] font-bold tracking-[0.14em] transition ${
                  armoryTab === 'helmet'
                    ? 'border border-sky-400 bg-gradient-to-r from-sky-500/35 to-blue-600/25 text-white shadow-[0_0_16px_rgba(56,189,248,0.3)]'
                    : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                <span>🪖 12 HELM SANGAR</span>
                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[8px] text-sky-300">
                  #{helmetId + 1}
                </span>
              </button>
              <button
                onClick={act(() => {
                  setArmoryTab('glove');
                  setPose('guard');
                })}
                className={`cut-sm flex items-center justify-between px-3 py-2 font-tech text-[9.5px] font-bold tracking-[0.14em] transition ${
                  armoryTab === 'glove'
                    ? 'border border-amber-400 bg-gradient-to-r from-amber-500/35 to-rose-600/25 text-white shadow-[0_0_16px_rgba(251,191,36,0.3)]'
                    : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                <span>🥊 12 SARUNG TINJU</span>
                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[8px] text-amber-300">
                  #{gloveId + 1}
                </span>
              </button>
              <button
                onClick={act(() => {
                  setArmoryTab('armor');
                  setPose('stand');
                })}
                className={`cut-sm flex items-center justify-between px-3 py-2 font-tech text-[9.5px] font-bold tracking-[0.14em] transition ${
                  armoryTab === 'armor'
                    ? 'border border-rose-400 bg-gradient-to-r from-rose-500/35 to-red-700/25 text-white shadow-[0_0_16px_rgba(251,113,133,0.3)]'
                    : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
                }`}
              >
                <span>🛡️ 12 ARMOR BADAN</span>
                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[8px] text-rose-300">
                  #{armorId + 1}
                </span>
              </button>
            </div>

            {/* Active Equipped Banner */}
            <div
              className="flex items-center justify-between rounded-lg border px-3.5 py-2"
              style={{
                borderColor: `${armoryActive.color}66`,
                background: `linear-gradient(90deg, ${armoryActive.accent}55 0%, rgba(15,23,42,0.85) 100%)`,
              }}
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="rounded px-1.5 py-0.5 font-tech text-[7.5px] font-bold tracking-widest text-black"
                    style={{ background: armoryActive.color }}
                  >
                    {armoryActive.rarity}
                  </span>
                  <span className="font-tech text-[8px] tracking-[0.18em] text-white/70">
                    {armoryLabel} AKTIF #{armoryActiveId + 1}/{armoryList.length}
                  </span>
                </div>
                <div className="mt-0.5 font-display text-xl tracking-wide text-white">{armoryActive.name}</div>
                <div className="font-tech text-[8.5px] text-white/70">{armoryActive.sub}</div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={act(() => armoryPick(armoryActiveId - 1))}
                  className={`cut-sm grid h-8 w-8 place-items-center border border-white/20 bg-black/40 font-tech text-xs ${armoryHover}`}
                >
                  ◀
                </button>
                <button
                  onClick={act(() => armoryPick(armoryActiveId + 1))}
                  className={`cut-sm grid h-8 w-8 place-items-center border border-white/20 bg-black/40 font-tech text-xs ${armoryHover}`}
                >
                  ▶
                </button>
              </div>
            </div>

            {/* 2x5 Grid of 10 Skins */}
            <div className="grid grid-cols-2 gap-2">
              {armoryList.map((item) => {
                const active = armoryActiveId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={act(() => armoryPick(item.id))}
                    className={`tile cut-sm group relative flex flex-col justify-between p-2.5 text-left transition-all ${
                      active
                        ? 'tile-on scale-[1.01] shadow-[0_0_18px_rgba(56,189,248,0.28)]'
                        : 'hover:bg-white/[0.06]'
                    }`}
                    style={cssVar('--c', item.color)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="rounded px-1.5 py-0.5 font-tech text-[7px] font-bold tracking-wider"
                        style={{
                          background: active ? item.color : `${item.color}22`,
                          color: active ? '#020617' : item.color,
                          border: `1px solid ${item.color}55`,
                        }}
                      >
                        {item.rarity}
                      </span>
                      <span className="font-tech text-[7.5px] font-bold text-white/45">
                        {item.id >= 10 && <span className="mr-1 animate-pulse rounded bg-amber-400/20 px-1 text-[6.5px] text-amber-200">✦ BARU</span>}
                        #{String(item.id + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white/20"
                        style={{
                          background: `radial-gradient(circle at 30% 30%, ${item.color}, ${item.accent})`,
                          boxShadow: active ? `0 0 10px ${item.color}` : 'none',
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className="truncate font-display text-[15px] leading-tight tracking-wide"
                          style={{ color: active ? '#ffffff' : item.color }}
                        >
                          {item.name}
                        </div>
                        <div className="truncate font-tech text-[7.5px] text-white/60">
                          {item.sub}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pose Studio */}
            <div className="lobby-subcard rounded-lg p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-tech text-[8px] font-bold tracking-[0.22em] text-white/70">
                  STUDIO POSE INSPEKSI 3D
                </span>
                <button
                  onClick={act(() => game?.resetHeroRotation())}
                  className="font-tech text-[8px] font-bold tracking-wider text-sky-300 hover:underline"
                >
                  ↺ RESET SUDUT
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'ready', label: 'STARE-DOWN' },
                  { id: 'vs', label: 'CALL-OUT' },
                  { id: 'menace', label: 'PREDATOR' },
                  { id: 'stand', label: 'SIAGA' },
                  { id: 'guard', label: 'GUARD' },
                  { id: 'victory', label: 'JUARA' },
                  { id: 'taunt', label: 'TAUNT' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={act(() => setPose(p.id as any))}
                    className={`cut-sm py-1.5 font-tech text-[8.5px] font-bold tracking-wider transition ${
                      heroPose === p.id
                        ? 'border border-sky-400 bg-sky-500/30 text-white shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                        : 'border border-white/10 bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 3: JURUS & KONTROL (COMBO & MOVE LIST)
        ========================================================= */}
        {tab === 'controls' && (
          <div className="lobby-panel no-scrollbar stagger pointer-events-auto flex max-h-full w-full flex-col gap-3 overflow-y-auto p-5 sm:w-[490px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <span className="font-tech text-[8.5px] font-bold tracking-[0.28em] text-amber-300">
                  MANUAL KOMBAT WRC
                </span>
                <h2 className="font-display text-3xl tracking-wide text-white">DAFTAR JURUS &amp; KONTROL</h2>
              </div>
              <button
                onClick={act(() => setTab('arena'))}
                className="cut-sm border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 font-tech text-[9px] font-bold tracking-wider text-sky-200 hover:bg-sky-500/25"
              >
                ◀ KE ARENA
              </button>
            </div>
            <div className="space-y-2.5">
              {CONTROLS.map((g) => (
                <div key={g.title} className="lobby-subcard rounded-lg p-3">
                  <div className="mb-2 flex items-center gap-1.5 font-tech text-[8.5px] font-bold tracking-[0.22em] text-amber-300">
                    <span>▸</span>
                    <span>{g.title}</span>
                  </div>
                  <div className="space-y-1.5">
                    {g.rows.map(([keys, label]) => (
                      <div key={label} className="flex items-center gap-2.5 text-[11px] text-white/85">
                        <span className="flex shrink-0 items-center gap-1">
                          {keys.map((k, i) =>
                            k === '+' || k === '/' || k === '→' ? (
                              <span key={i} className="px-0.5 font-tech text-[9px] text-white/45">
                                {k}
                              </span>
                            ) : (
                              <Key key={i}>{k}</Key>
                            ),
                          )}
                        </span>
                        <span className="leading-snug text-white/75">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 4: PENGATURAN (AUDIO, CAMERA & FOOTWORK)
        ========================================================= */}
        {tab === 'settings' && (
          <div className="lobby-panel no-scrollbar stagger pointer-events-auto flex max-h-full w-full flex-col gap-3.5 overflow-y-auto p-5 sm:w-[450px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div>
                <span className="font-tech text-[8.5px] font-bold tracking-[0.28em] text-sky-400">
                  KONFIGURASI SISTEM
                </span>
                <h2 className="font-display text-3xl tracking-wide text-white">PENGATURAN GAME</h2>
              </div>
              <button
                onClick={act(() => setTab('arena'))}
                className="cut-sm border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 font-tech text-[9px] font-bold tracking-wider text-sky-200 hover:bg-sky-500/25"
              >
                ◀ KE ARENA
              </button>
            </div>
            <div className="space-y-3">
              <div className="lobby-subcard rounded-lg p-3.5">
                <div className="mb-2 font-tech text-[9px] font-bold tracking-[0.28em] text-sky-300">TAMPILAN LOBBY</div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['mw', 'MODERN', 'Daftar menu vertikal gaya shooter AAA · hero di tengah · tantangan di kanan'],
                      ['classic', 'KLASIK', 'Deck esports: panel mode kiri · intel lawan & MASUK RING kanan'],
                    ] as [LobbyLayout, string, string][]
                  ).map(([id, label, desc]) => (
                    <button key={id} onClick={act(() => setLayout(id))} className={`ui-pick ${layout === id ? 'ui-pick-on' : ''}`}>
                      <span className="font-display ui-pick-t">{label}</span>
                      <span className="ui-pick-d">{desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="lobby-subcard rounded-lg p-3.5">
                <TransitionPicker value={trans} onPick={onTrans} onTry={onTransTry} />
              </div>
              <div className="lobby-subcard rounded-lg p-3.5">
                <SfxPicker value={sfx} onPick={onSfx} />
              </div>
              <div className="lobby-subcard rounded-lg p-3.5">
                <CamPicker value={cam} onPick={onCam} />
              </div>
              <div className="lobby-subcard rounded-lg p-3.5">
                <FootworkPicker value={fw} onPick={onFw} />
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            RIGHT COLUMN: TARGET INTEL DOSSIER & GRAND "MASUK RING" CTA
        ========================================================= */}
        {(!mw || tab === 'lobby') && (
        <aside
          className={`${mw ? 'mw-panel' : 'lobby-panel'} ${
            ultra && !mw ? 'lobby-panel-ultra' : ''
          } no-scrollbar slide-r pointer-events-auto hidden max-h-full w-[430px] flex-col gap-3 overflow-y-auto p-5 lg:flex xl:w-[480px] ${mw ? 'mw-aside' : ''}`}
        >
          {tab === 'lobby' && lobbyView === 'profile' ? (
            <ProfileSheet profile={profile} url={portrait} color={ultra ? ULTRA_COLOR : '#38bdf8'} />
          ) : tab === 'lobby' && lobbyView === 'leaderboard' ? (
            <Leaderboard profile={profile} />
          ) : tab === 'lobby' && mode !== 'play' ? (
            <ModeDossier mode={mode} profile={profile} ultra={ultra} onStart={() => onStartMode(mode)} />
          ) : mw && tab === 'lobby' ? (
            <>
              <div className="mw-ch-head">
                <span className="mw-ch-k">TANTANGAN MINGGUAN</span>
                <span className="mw-ch-r">RESET {weekResetIn()}</span>
              </div>
              <div className="mw-ch-list">
                {weeklyTargets(profile).map((c, i) => {
                  const done = c.cur >= c.max;
                  return (
                    <div key={i} className={`mw-ch ${done ? 'mw-ch-done' : ''}`}>
                      <div className="mw-ch-body">
                        <div className="mw-ch-t">{c.text}</div>
                        <div className="mw-ch-bar">
                          <span style={{ width: `${(c.cur / c.max) * 100}%` }} />
                        </div>
                      </div>
                      <div className="mw-ch-n">
                        {c.cur}/{c.max}
                      </div>
                      <div className="mw-ch-rw">
                        <span className="mw-ch-coin" />
                        {c.reward.toLocaleString('id-ID')}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mw-ch-head mt-2">
                <span className="mw-ch-k">LAWAN BERIKUTNYA</span>
                <span className="mw-ch-r" style={{ color: col }}>
                  PWR {pwr}
                </span>
              </div>
              <div className="mw-next">
                <MechaCrest index={sel} color={col} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="mw-next-name font-display" style={{ color: col }}>
                    {def.name}
                  </div>
                  <div className="mw-next-sub">
                    {def.title} · {THREAT[skulls]}
                  </div>
                </div>
                <button onClick={act(() => setTab('arena'))} className="mw-next-btn">
                  GANTI ›
                </button>
              </div>

              <button onClick={act(onStart)} className="mw-go font-display">
                <span className="mw-chev mw-chev-go">
                  <Chevrons />
                </span>
                <span>MASUK RING</span>
                <span className="mw-go-k">ENTER</span>
              </button>
            </>
          ) : (
            <>
          {/* Matchup strip */}
          <div className="aaa-head">
            <span className="aaa-head-k">{PLAYER_NAME}</span>
            <span className="aaa-vs">VS</span>
            <span className="aaa-head-t" style={{ color: col }}>{def.name}</span>
            <span className="aaa-head-r" style={{ color: col }}>PWR {pwr}</span>
          </div>

          {/* Identity */}
          <div className="aaa-id">
            <MechaCrest index={sel} color={col} size={56} />
            <div className="min-w-0 flex-1">
              <div className="aaa-id-tier">{TIER_TAG[sel]}</div>
              <div className="aaa-id-name" style={{ color: col, textShadow: `0 0 26px ${col}66` }}>{def.name}</div>
              <div className="aaa-id-title">{def.title}</div>
            </div>
          </div>

          {/* Threat */}
          <div className="aaa-row">
            <span className="aaa-row-k">ANCAMAN</span>
            <span className="flex items-center gap-2.5">
              <ThreatMeter level={skulls} color={col} />
              <span className="aaa-row-v" style={{ color: col }}>{THREAT[skulls]}</span>
            </span>
          </div>

          {/* Stats */}
          <div className="aaa-stats">
            {bars.map((b) => (
              <div key={b.k} className="aaa-stat">
                <span className="aaa-stat-k">{b.k}</span>
                <span className="aaa-stat-track">
                  <span className="aaa-stat-fill" style={{ width: `${b.v * 100}%`, background: `linear-gradient(90deg, ${col}66, ${col})`, boxShadow: `0 0 12px ${col}88` }} />
                </span>
                <span className="aaa-stat-v">{Math.round(b.v * 100)}</span>
              </div>
            ))}
          </div>

          {/* Spec line */}
          <div className="aaa-spec">
            <span><b>HP</b> {hpThick(def.hp)}</span>
            <i />
            <span><b>COMBO</b> ×{def.combo}</span>
            {def.slam && (
              <>
                <i />
                <span style={{ color: col }}><b>OVERDRIVE</b></span>
              </>
            )}
          </div>

          {/* Coach */}
          <div className="aaa-coach">
            <span className="aaa-coach-k">PELATIH</span>
            <p>{STYLE_DESC[sel]}</p>
          </div>

          {/* GRAND BATTLE CTA BUTTON (Bottom-Right Mobile Online Game Standard) */}
          <button
            onClick={act(onStart)}
            className={`play-btn cut group relative mt-auto w-full overflow-hidden px-5 py-3.5 text-left ${
              ultra ? 'play-ultra' : ''
            }`}
          >
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block font-display text-[44px] leading-none tracking-[0.08em]">MASUK RING</span>
                <span className="aaa-cta-sub font-tech">
                  {ultra ? 'DIVISI ULTRA' : 'BEST OF 3'} · ENTER
                </span>
              </div>
              <span className="aaa-cta-arrow transition-transform group-hover:translate-x-1">›</span>
            </div>
            <span className="play-sheen" />
          </button>
            </>
          )}
        </aside>
        )}
      </div>

      {/* ===================================================================
          CENTER-BOTTOM HERO STAGE DOCK & HOLO NAMEPLATE
      =================================================================== */}
      {mw && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between px-4 pb-3 sm:px-8">
          <div className="mw-foot">
            <IcoSound off={!!muted} />
            <span>SUARA: LOBBY</span>
            <i />
            <span>{PLAYER_NAME}</span>
            <i />
            <span>HELM {String(helmetId + 1).padStart(2, '0')} · GLOVE {String(gloveId + 1).padStart(2, '0')} · ARMOR {String(armorId + 1).padStart(2, '0')}</span>
          </div>
          <div className="mw-foot mw-foot-r">
            <kbd className="mw-key">ENTER</kbd>
            <span>MULAI</span>
            <kbd className="mw-key">1–{Math.min(OPPONENTS.length, unlocked + 1)}</kbd>
            <span>LAWAN</span>
            <kbd className="mw-key">ESC</kbd>
            <span>KEMBALI</span>
            <kbd className="mw-key">DRAG</kbd>
            <span>PUTAR</span>
          </div>
        </div>
      )}
      {!mw && (
      <div className="pointer-events-none absolute inset-x-0 bottom-2.5 z-30 flex flex-col items-center justify-center gap-1 px-3 sm:bottom-3.5">
        {/* Hero stage dock */}
        <div className="aaa-dock pointer-events-auto">
          <div className="aaa-dock-name">
            <span className="aaa-dot" />
            {PLAYER_NAME}
          </div>
          <div className="aaa-seg">
            <button onClick={act(() => pickHelmet(helmetId + 1))} className="aaa-seg-b aaa-seg-sky" title="Ganti helm (10 pilihan)">
              HELM <b>{String(helmetId + 1).padStart(2, '0')}</b>
            </button>
            <button
              onClick={act(() => pickGlove(gloveId + 1))}
              className="aaa-seg-b aaa-seg-gold"
              title="Ganti sarung tinju (10 pilihan)"
            >
              GLOVE <b>{String(gloveId + 1).padStart(2, '0')}</b>
            </button>
            <button onClick={act(() => pickArmor(armorId + 1))} className="aaa-seg-b aaa-seg-red" title="Ganti armor (10 pilihan)">
              ARMOR <b>{String(armorId + 1).padStart(2, '0')}</b>
            </button>
          </div>
          <div className="aaa-seg">
            <button onClick={act(toggleCam)} className="aaa-seg-b">
              CAM <b>{camMode === 'arena' ? 'ARENA' : 'HERO'}</b>
            </button>
            <button onClick={act(() => game?.resetHeroRotation())} className="aaa-seg-b aaa-seg-dim" title="Kembalikan hadap depan">
              RESET
            </button>
          </div>
        </div>

        <div className="aaa-hint">
          DRAG · PUTAR 360° <i /> 1–4 · PILIH LAWAN <i /> ENTER · MULAI
        </div>
      </div>
      )}
    </div>
  );
}
