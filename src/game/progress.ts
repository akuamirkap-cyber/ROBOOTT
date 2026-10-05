/**
 * PILOT PROGRESSION — the account profile (XP / level / rank points / record), the game modes of the lobby and the
 * "Leaderboard of the Week". Everything is persisted in localStorage; nothing here touches the 3D game.
 */

export const ACCOUNT_NAME = 'AMIRALBANI';
export const ACCOUNT_TAG = '#WRC-7731';
export const ACCOUNT_REGION = 'ID · YOGYAKARTA';

export type ModeId = 'play' | 'rank' | 'tournament' | 'team' | 'leaderboard';

export interface ModeMeta {
  id: ModeId;
  name: string;
  sub: string;
  icon: string;
  color: string;
  desc: string;
  reward: string;
}

export const MODES: ModeMeta[] = [
  { id: 'play', name: 'PLAY MATCH', sub: 'Quick Fight · Best of 3', icon: '⚔', color: '#45d6ff', desc: 'Duel cepat lawan Titan pilihanmu dari roster. Tidak mempengaruhi Rank Points — tempat sempurna untuk latihan jurus & skin baru.', reward: '+80 XP · +60 WRC/menang' },
  { id: 'rank', name: 'RANK MODE', sub: 'Competitive Ladder · RP', icon: '🏅', color: '#ffd34a', desc: 'Pertandingan kompetitif. Lawan dipilih otomatis oleh matchmaking sesuai tier rank-mu. Menang +28 RP, kalah −16 RP. Naik tier dari BRONZE sampai TITAN.', reward: '+150 XP · ±RP · +140 WRC' },
  { id: 'tournament', name: 'TOURNAMENT', sub: 'Bracket 16 Titan · Single Elimination', icon: '🏆', color: '#c070ff', desc: 'Turnamen gugur 16 Titan, 4 babak: 16 Besar → Perempat Final → Semifinal → Grand Final. Kalah sekali = tersingkir. Juarai semuanya untuk gelar WRC CHAMPION.', reward: '+400 XP · +600 WRC · Gelar' },
  { id: 'team', name: 'TEAM MATCH', sub: '2v2 Tag Team · Best of 3 Ronde', icon: '🤝', color: '#5effb0', desc: 'Pertarungan tim 2 lawan 2 di ring yang lebih lebar: kamu dan partner MK-II melawan dua Titan sekaligus. Satu robot tumbang, partnernya terus bertarung — tim yang berdiri terakhir menang ronde.', reward: '+220 XP · +260 WRC' },
  { id: 'leaderboard', name: 'LEADERBOARD OF THE WEEK', sub: 'Top Pilot Mingguan · Reset Senin', icon: '📊', color: '#ff5a36', desc: 'Papan peringkat mingguan. Setiap kemenangan menambah Weekly Points; posisi di-reset setiap Senin 00:00. Masuk 3 besar untuk badge musiman.', reward: 'Badge TOP 3 · Frame Emas' },
];

export const modeOf = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0];

// ------------------------------------------------------------------------------------------------ profile
export interface Profile {
  xp: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  rp: number;
  rankWins: number;
  rankLosses: number;
  titles: number; // tournaments won
  teamWins: number;
  weekId: string;
  weekPts: number;
  weekWins: number;
}

const LS_PROFILE = 'steel-titans-profile-v1';

export const weekIdNow = (d = new Date()): string => {
  // ISO-ish week key: Monday 00:00 local
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7; // 0 = Monday
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() - day);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

export const weekResetIn = (d = new Date()): string => {
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7;
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + (7 - day));
  const ms = t.getTime() - d.getTime();
  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor((ms % 86400000) / 3600000);
  return days > 0 ? `${days}h ${hrs}j` : `${hrs}j`;
};

const DEFAULT_PROFILE: Profile = {
  xp: 2650,
  wins: 0,
  losses: 0,
  streak: 0,
  bestStreak: 0,
  rp: 120,
  rankWins: 0,
  rankLosses: 0,
  titles: 0,
  teamWins: 0,
  weekId: weekIdNow(),
  weekPts: 0,
  weekWins: 0,
};

export const loadProfile = (): Profile => {
  let p: Profile = { ...DEFAULT_PROFILE };
  try {
    const raw = localStorage.getItem(LS_PROFILE);
    if (raw) p = { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    /* ignore */
  }
  if (p.weekId !== weekIdNow()) {
    p = { ...p, weekId: weekIdNow(), weekPts: 0, weekWins: 0 };
  }
  return p;
};

export const saveProfile = (p: Profile) => {
  try {
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
  } catch {
    /* ignore */
  }
};

/** level curve: level n needs 400 + 90·n XP on top of the previous one */
export const levelOf = (xp: number) => {
  let lv = 1;
  let need = 490;
  let rest = xp;
  while (rest >= need && lv < 99) {
    rest -= need;
    lv++;
    need = 400 + 90 * lv;
  }
  return { level: lv, into: rest, need, frac: Math.min(1, rest / need) };
};

export interface RankTier {
  name: string;
  short: string;
  min: number;
  color: string;
  icon: string;
}
export const RANK_TIERS: RankTier[] = [
  { name: 'BRONZE', short: 'B', min: 0, color: '#d08a4a', icon: '🥉' },
  { name: 'SILVER', short: 'S', min: 150, color: '#c9d3df', icon: '🥈' },
  { name: 'GOLD', short: 'G', min: 320, color: '#ffd34a', icon: '🥇' },
  { name: 'PLATINUM', short: 'P', min: 520, color: '#5effd6', icon: '💠' },
  { name: 'DIAMOND', short: 'D', min: 760, color: '#7fb8ff', icon: '💎' },
  { name: 'TITAN', short: 'T', min: 1050, color: '#ff4d6d', icon: '👑' },
];
export const tierOf = (rp: number) => {
  let t = RANK_TIERS[0];
  for (const r of RANK_TIERS) if (rp >= r.min) t = r;
  const idx = RANK_TIERS.indexOf(t);
  const next = RANK_TIERS[idx + 1];
  const div = next ? 3 - Math.min(2, Math.floor(((rp - t.min) / (next.min - t.min)) * 3)) : 1; // III → I inside a tier
  return { tier: t, next, division: div, frac: next ? (rp - t.min) / (next.min - t.min) : 1 };
};

/** the ranked matchmaker: which roster Titan your tier gets paired with */
export const rankOpponent = (rp: number, rosterSize: number) => {
  const { tier } = tierOf(rp);
  const i = RANK_TIERS.indexOf(tier);
  return Math.min(rosterSize - 1, Math.max(0, Math.round((i / (RANK_TIERS.length - 1)) * (rosterSize - 1))));
};

export const wrcPoints = (p: Profile) => 1250 + p.wins * 60 + p.rankWins * 80 + p.titles * 600 + p.teamWins * 260;

export interface MatchOutcome {
  win: boolean;
  mode: ModeId;
  ultra: boolean;
  seriesWon?: boolean; // the tournament title / the team series went to the player
}

/** apply one match result to the profile (pure) */
export const applyOutcome = (p0: Profile, o: MatchOutcome): Profile => {
  const p = { ...loadWeek(p0) };
  const mult = o.ultra ? 1.4 : 1;
  const base = o.mode === 'rank' ? 150 : o.mode === 'tournament' ? 180 : o.mode === 'team' ? 130 : 80;
  if (o.win) {
    p.wins++;
    p.streak++;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.xp += Math.round(base * mult + Math.min(5, p.streak) * 10);
    p.weekWins++;
    p.weekPts += Math.round((o.mode === 'rank' ? 140 : o.mode === 'tournament' ? 160 : o.mode === 'team' ? 120 : 100) * mult);
    if (o.mode === 'rank') {
      p.rankWins++;
      p.rp += 28;
    }
  } else {
    p.losses++;
    p.streak = 0;
    p.xp += Math.round(30 * mult);
    p.weekPts += 20;
    if (o.mode === 'rank') {
      p.rankLosses++;
      p.rp = Math.max(0, p.rp - 16);
    }
  }
  if (o.seriesWon && o.mode === 'tournament') {
    p.titles++;
    p.xp += 400;
    p.weekPts += 500;
  }
  if (o.seriesWon && o.mode === 'team') {
    p.teamWins++;
    p.xp += 220;
    p.weekPts += 240;
  }
  return p;
};

const loadWeek = (p: Profile): Profile => (p.weekId === weekIdNow() ? p : { ...p, weekId: weekIdNow(), weekPts: 0, weekWins: 0 });

// ------------------------------------------------------------------------------------------------ leaderboard
export interface BoardRow {
  rank: number;
  name: string;
  tag: string;
  pts: number;
  wins: number;
  tier: RankTier;
  me: boolean;
  region: string;
}

const RIVALS: [string, string, string][] = [
  ['ZEUS_SOVEREIGN', '#WRC-0001', 'JP · TOKYO'],
  ['NOISYBOY_KENTA', '#WRC-0412', 'JP · OSAKA'],
  ['MIDAS_KINGPIN', '#WRC-0666', 'US · DETROIT'],
  ['TAK_MASHIDO', '#WRC-0007', 'JP · KYOTO'],
  ['CHARLIE_KENTON', '#WRC-1120', 'US · DALLAS'],
  ['FINN_SPARKS', '#WRC-2208', 'UK · LONDON'],
  ['RICKY_CRASHPALACE', '#WRC-3030', 'US · VEGAS'],
  ['BAILEY_TALLET', '#WRC-0450', 'US · TEXAS'],
  ['FARRA_LEMKOVA', '#WRC-0099', 'RU · MOSCOW'],
  ['BUDI_IRONFIST', '#WRC-6212', 'ID · JAKARTA'],
  ['RAKA_STEELJAW', '#WRC-6305', 'ID · SURABAYA'],
  ['SITI_VOLTAGE', '#WRC-6400', 'ID · BANDUNG'],
];

const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** the weekly board: deterministic rivals for this week + the player's own row */
export const weeklyBoard = (p: Profile): BoardRow[] => {
  const wk = weekIdNow();
  const rows: BoardRow[] = RIVALS.map(([name, tag, region], i) => {
    const h = hash(wk + name);
    const pts = 900 + Math.round(((h % 1000) / 1000) * 6200) + (11 - i) * 120;
    const wins = Math.max(1, Math.round(pts / 118));
    const rp = 80 + ((h >> 8) % 1100);
    return { rank: 0, name, tag, pts, wins, tier: tierOf(rp).tier, me: false, region };
  });
  rows.push({
    rank: 0,
    name: ACCOUNT_NAME,
    tag: ACCOUNT_TAG,
    pts: p.weekPts,
    wins: p.weekWins,
    tier: tierOf(p.rp).tier,
    me: true,
    region: ACCOUNT_REGION,
  });
  rows.sort((a, b) => b.pts - a.pts || (a.me ? -1 : 1));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
};

// ------------------------------------------------------------------------------------------------ series (tournament / team)
export interface Series {
  mode: ModeId;
  queue: number[]; // opponent indices in order
  step: number; // which bout is live / was just played
  wins: number;
  losses: number;
  done: boolean;
  won: boolean;
}

export const TOURNEY_STAGES = ['BABAK 16 BESAR', 'PEREMPAT FINAL', 'SEMIFINAL', 'GRAND FINAL'];

export const makeSeries = (mode: ModeId, rosterSize: number, rp: number, selected: number): Series | null => {
  if (mode === 'tournament') {
    const queue = Array.from({ length: Math.min(4, rosterSize) }, (_, i) => i);
    return { mode, queue, step: 0, wins: 0, losses: 0, done: false, won: false };
  }
  if (mode === 'team') {
    const pool = Array.from({ length: rosterSize }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // 2v2: the two Titans in the other corner (queue[0] engages you, queue[1] takes your partner)
    const queue = pool.slice(0, 2);
    while (queue.length < 2) queue.push(Math.floor(Math.random() * rosterSize));
    return { mode, queue, step: 0, wins: 0, losses: 0, done: false, won: false };
  }
  if (mode === 'rank') {
    return { mode, queue: [rankOpponent(rp, rosterSize)], step: 0, wins: 0, losses: 0, done: false, won: false };
  }
  if (mode === 'play') {
    return { mode, queue: [selected], step: 0, wins: 0, losses: 0, done: false, won: false };
  }
  return null;
};

/** advance a series after a bout: returns the updated series (done / won flags set when the series is decided) */
export const seriesAfterBout = (s: Series, win: boolean): Series => {
  const n = { ...s, wins: s.wins + (win ? 1 : 0), losses: s.losses + (win ? 0 : 1) };
  if (n.mode === 'tournament') {
    if (!win) return { ...n, done: true, won: false };
    if (n.step >= n.queue.length - 1) return { ...n, done: true, won: true };
    return n;
  }
  if (n.mode === 'team') return { ...n, done: true, won: win }; // one 2v2 match (best of 3 rounds) decides it
  return { ...n, done: true, won: win };
};

export const seriesLabel = (s: Series | null): string => {
  if (!s) return '';
  if (s.mode === 'tournament') return `TOURNAMENT · ${TOURNEY_STAGES[Math.min(s.step, TOURNEY_STAGES.length - 1)]}`;
  if (s.mode === 'team') return 'TEAM MATCH · 2v2 TAG TEAM';
  if (s.mode === 'rank') return 'RANK MODE · RANKED BOUT';
  return 'PLAY MATCH';
};

// ------------------------------------------------------------------------------------------------ tournament bracket (16)
export interface BracketSlot {
  name: string;
  color: string;
  me: boolean;
  opp: number; // roster index when this is one of the four real Titans, else -1
}
export interface BracketMatch {
  a: BracketSlot | null;
  b: BracketSlot | null;
  winner: 0 | 1 | null;
  mine: boolean;
  live: boolean; // the player's next bout
}

export interface RosterLite {
  name: string;
  color: string;
}

/**
 * the 16-slot single-elimination tree. You open at the top of the left half; the four real Titans are seeded so you meet
 * them in roster order (R16 → QF → SF → GF). Everybody else is a rival pilot whose results are decided by a fixed draw.
 */
export const buildBracket = (roster: RosterLite[], s: Series | null, playerName: string): BracketMatch[][] => {
  const slots: BracketSlot[] = new Array(16);
  const put = (i: number, sl: BracketSlot) => (slots[i] = sl);
  put(0, { name: playerName, color: '#45d6ff', me: true, opp: -1 });
  const seed = [1, 2, 4, 8]; // the slot each real Titan starts from so it reaches you exactly one round later each time
  roster.slice(0, 4).forEach((r, i) => put(seed[i], { name: r.name, color: r.color, me: false, opp: i }));
  let k = 0;
  for (let i = 0; i < 16; i++) {
    if (slots[i]) continue;
    const [name] = RIVALS[k % RIVALS.length];
    k++;
    put(i, { name, color: ['#ff8a2a', '#2f7cff', '#c070ff', '#5effb0', '#ffd34a'][i % 5], me: false, opp: -1 });
  }
  const step = s?.step ?? -1;
  const done = s?.done ?? false;
  const won = s?.won ?? false;
  const rounds: BracketMatch[][] = [];
  let cur: (BracketSlot | null)[] = slots;
  for (let r = 0; r < 4; r++) {
    const ms: BracketMatch[] = [];
    const next: (BracketSlot | null)[] = [];
    for (let m = 0; m < cur.length / 2; m++) {
      const a = cur[m * 2];
      const b = cur[m * 2 + 1];
      const mine = !!(a?.me || b?.me);
      let winner: 0 | 1 | null = null;
      let live = false;
      if (a && b) {
        if (mine) {
          const meIs: 0 | 1 = a.me ? 0 : 1;
          if (r < step || (r === step && done && won)) winner = meIs;
          else if (r === step && done && !won) winner = meIs === 0 ? 1 : 0;
          else if (r === step && !done) live = true;
        } else if (r <= step) {
          // the real Titans always get through to you; the rival-vs-rival bouts follow the fixed draw
          if (a.opp >= 0) winner = 0;
          else if (b.opp >= 0) winner = 1;
          else winner = (hash(a.name + b.name + r) & 1) as 0 | 1;
        }
      }
      ms.push({ a, b, winner, mine, live });
      next.push(winner === null ? null : winner === 0 ? a : b);
    }
    rounds.push(ms);
    cur = next;
  }
  return rounds;
};
