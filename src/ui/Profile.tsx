import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { ACCOUNT_NAME, ACCOUNT_REGION, ACCOUNT_TAG, levelOf, tierOf, wrcPoints, type Profile } from '../game/progress';

/**
 * usePortrait — asks the 3D engine for a fresh 3×4 head-to-chest photo of the player's robot whenever the equipped
 * skins change (and once right after the lobby mounts).
 */
export function usePortrait(game: Game | null | undefined, helmetId: number, gloveId: number, armorId: number) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!game) return;
    let alive = true;
    const shoot = () => {
      if (!alive) return;
      const u = game.capturePortrait();
      if (u) setUrl(u);
    };
    // first frame may still be building the hero → shoot twice, a beat apart
    const t1 = window.setTimeout(shoot, 140);
    const t2 = window.setTimeout(shoot, 900);
    return () => {
      alive = false;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [game, helmetId, gloveId, armorId]);
  return url;
}

/** the round profile picture: a circular frame with the robot's 3×4 portrait inside */
export function Avatar({ url, size = 44, color = '#38bdf8', level }: { url: string | null; size?: number; color?: string; level?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 210deg, ${color}, #ffffff22 40%, ${color} 70%, #ffd34a 100%)`,
          boxShadow: `0 0 ${size / 4}px ${color}66, inset 0 0 0 1px #ffffff33`,
        }}
      />
      <div className="absolute inset-[2px] overflow-hidden rounded-full bg-slate-950 ring-1 ring-black/60">
        {url ? (
          <img src={url} alt="Titan portrait" className="h-full w-full object-cover" style={{ objectPosition: '50% 38%' }} draggable={false} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-sky-500/30 to-blue-900/60 font-display text-[10px] tracking-widest text-sky-200/70">
            3×4
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 -10px 18px rgba(0,0,0,0.45), inset 0 6px 14px rgba(255,255,255,0.08)' }} />
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" title="Online" />
      {level !== undefined && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm border border-amber-300/60 bg-slate-950 px-1 font-tech text-[7px] font-bold tracking-[0.12em] text-amber-300"
          style={{ fontSize: Math.max(7, size / 7) }}
        >
          LV.{level}
        </span>
      )}
    </div>
  );
}

/** TOP-LEFT account card: PP + name + level/XP + rank + record */
export function ProfileCard({ profile, url, onClick, color = '#38bdf8' }: { profile: Profile; url: string | null; onClick: () => void; color?: string }) {
  const lv = levelOf(profile.xp);
  const { tier, division } = tierOf(profile.rp);
  const games = profile.wins + profile.losses;
  const wr = games ? Math.round((profile.wins / games) * 100) : 0;
  return (
    <button onClick={onClick} className="aaa-card" title="Profil Akun · Statistik Pilot">
      <Avatar url={url} size={52} color={color} />
      <div className="aaa-card-body">
        <div className="aaa-card-top">
          <span className="aaa-card-name">{ACCOUNT_NAME}</span>
          <span className="aaa-card-lv">LV.{lv.level}</span>
          <span className="aaa-card-tier" style={{ color: tier.color }}>
            {tier.name} {['', 'I', 'II', 'III'][division]}
          </span>
        </div>
        <div className="aaa-card-xp" title={`XP ${lv.into}/${lv.need}`}>
          <span style={{ width: `${Math.round(lv.frac * 100)}%` }} />
        </div>
        <div className="aaa-card-meta">
          <span>
            {profile.wins}W-{profile.losses}L · {wr}%
          </span>
          <i />
          <span style={{ color: '#ffd34a' }}>{wrcPoints(profile)} WRC</span>
          <i />
          <span style={{ color: tier.color }}>{profile.rp} RP</span>
          <i />
          <span style={{ color: '#5effb0' }}>{profile.streak} STREAK</span>
        </div>
      </div>
    </button>
  );
}

/** the full stats sheet (right dossier when the account card is clicked) */
export function ProfileSheet({ profile, url, color = '#38bdf8' }: { profile: Profile; url: string | null; color?: string }) {
  const lv = levelOf(profile.xp);
  const { tier, next, division, frac } = tierOf(profile.rp);
  const games = profile.wins + profile.losses;
  const wr = games ? Math.round((profile.wins / games) * 100) : 0;
  const rows = [
    ['PERTANDINGAN', String(games)],
    ['MENANG / KALAH', `${profile.wins} / ${profile.losses}`],
    ['WIN RATE', `${wr}%`],
    ['STREAK TERBAIK', String(profile.bestStreak)],
    ['RANKED W-L', `${profile.rankWins}-${profile.rankLosses}`],
    ['GELAR TURNAMEN', String(profile.titles)],
    ['TEAM SERIES WON', String(profile.teamWins)],
    ['WEEKLY POINTS', String(profile.weekPts)],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar url={url} size={92} color={color} level={lv.level} />
        <div className="min-w-0">
          <div className="font-display text-[22px] leading-none tracking-[0.1em] text-white">{ACCOUNT_NAME}</div>
          <div className="mt-0.5 font-tech text-[8px] tracking-[0.2em] text-white/55">
            {ACCOUNT_TAG} · {ACCOUNT_REGION}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded px-1.5 py-0.5 font-tech text-[9px] font-bold" style={{ background: `${tier.color}22`, color: tier.color, border: `1px solid ${tier.color}66` }}>
              {tier.icon} {tier.name} {['', 'I', 'II', 'III'][division]}
            </span>
            <span className="font-tech text-[9px] font-bold text-amber-300">🏆 {wrcPoints(profile)} WRC</span>
          </div>
          <div className="mt-1.5">
            <div className="flex justify-between font-tech text-[7.5px] tracking-[0.16em] text-white/60">
              <span>LEVEL {lv.level}</span>
              <span>
                {lv.into}/{lv.need} XP
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-gradient-to-r from-sky-400 to-amber-300" style={{ width: `${Math.round(lv.frac * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="lobby-subcard p-2.5">
        <div className="flex justify-between font-tech text-[8px] tracking-[0.18em] text-white/70">
          <span>RANK POINTS · {profile.rp} RP</span>
          <span>{next ? `${next.icon} ${next.name} @ ${next.min} RP` : 'TIER TERTINGGI'}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full" style={{ width: `${Math.round(frac * 100)}%`, background: `linear-gradient(90deg, ${tier.color}, ${next?.color ?? tier.color})` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="lobby-subcard flex items-center justify-between px-2.5 py-1.5">
            <span className="font-tech text-[7.5px] tracking-[0.16em] text-white/55">{k}</span>
            <span className="font-display text-[15px] leading-none text-white">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
