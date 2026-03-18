"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";

// Day advances at 10 AM EST (15:00 UTC)
const EPOCH_MS = new Date("2026-03-19T15:00:00Z").getTime();
const SEASON_SEED = Math.floor(EPOCH_MS / 86400000); // auto-changes with epoch
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Player = { mc_uuid: string; mc_username: string };
type PlayerTeamEntry = { mc_uuid: string; team_id: string; teams: { id: string; name: string }; season: string | null };
type StatRow = { mc_uuid: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };
type SeasonRow = { mc_uuid: string; season: string; ppg: number | null; rpg: number | null; apg: number | null };
type Accolade = { mc_uuid: string; type: string };

type GroupColor = "yellow" | "green" | "blue" | "purple";
type Group = { label: string; description: string; color: GroupColor; players: Player[] };

const COLOR_BG: Record<GroupColor, string> = {
  yellow: "bg-yellow-900 border-yellow-700",
  green:  "bg-green-900  border-green-700",
  blue:   "bg-blue-900   border-blue-700",
  purple: "bg-purple-900 border-purple-700",
};
const COLOR_TEXT: Record<GroupColor, string> = {
  yellow: "text-yellow-200", green: "text-green-200", blue: "text-blue-200", purple: "text-purple-200",
};
const COLOR_TILE_SEL: Record<GroupColor, string> = {
  yellow: "ring-yellow-500", green: "ring-green-500", blue: "ring-blue-500", purple: "ring-purple-500",
};
const COLOR_EMOJI: Record<GroupColor, string> = {
  yellow: "🟨", green: "🟩", blue: "🟦", purple: "🟪",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed | 1;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMostRecentTeamName(uuid: string, ptArr: PlayerTeamEntry[]): string | null {
  const mine = ptArr.filter(pt => pt.mc_uuid === uuid);
  if (!mine.length) return null;
  const sorted = [...mine].sort((a, b) => {
    const na = a.season ? parseInt(a.season.replace(/\D/g, "") || "0") : -1;
    const nb = b.season ? parseInt(b.season.replace(/\D/g, "") || "0") : -1;
    return nb - na;
  });
  return sorted[0].teams?.name ?? null;
}

function generateGroups(
  dayNum: number,
  players: Player[],
  ptArr: PlayerTeamEntry[],
  seasonRows: SeasonRow[],
  accsArr: Accolade[],
): Group[] | null {
  const rng = seededRng((SEASON_SEED + dayNum) * 53 + 7);

  // Most-recent team for each player
  const playerTeam: Record<string, string> = {};
  for (const p of players) {
    const t = getMostRecentTeamName(p.mc_uuid, ptArr);
    if (t) playerTeam[p.mc_uuid] = t;
  }

  // Group players by most recent team
  const byTeam: Record<string, Player[]> = {};
  for (const p of players) {
    const t = playerTeam[p.mc_uuid];
    if (!t) continue;
    if (!byTeam[t]) byTeam[t] = [];
    byTeam[t].push(p);
  }

  // Candidate groups list (label, description, players pool)
  type Candidate = { label: string; description: string; pool: Player[] };
  const candidates: Candidate[] = [];

  // ── Team-based groups ─────────────────────────────────────────────────────
  for (const [teamName, teamPlayers] of Object.entries(byTeam)) {
    if (teamPlayers.length >= 4) {
      candidates.push({ label: teamName, description: `Played for ${teamName}`, pool: teamPlayers });
    }
  }

  // ── Season stat groups (regular season) ───────────────────────────────────
  const maxSznPPG: Record<string, number> = {};
  const maxSznRPG: Record<string, number> = {};
  const maxSznAPG: Record<string, number> = {};
  const maxPOPPG:  Record<string, number> = {};
  for (const row of seasonRows) {
    const isPO = row.season?.toLowerCase().includes("playoff");
    if (!isPO) {
      if (row.ppg != null) maxSznPPG[row.mc_uuid] = Math.max(maxSznPPG[row.mc_uuid] ?? 0, row.ppg);
      if (row.rpg != null) maxSznRPG[row.mc_uuid] = Math.max(maxSznRPG[row.mc_uuid] ?? 0, row.rpg);
      if (row.apg != null) maxSznAPG[row.mc_uuid] = Math.max(maxSznAPG[row.mc_uuid] ?? 0, row.apg);
    } else {
      if (row.ppg != null) maxPOPPG[row.mc_uuid] = Math.max(maxPOPPG[row.mc_uuid] ?? 0, row.ppg);
    }
  }

  const statThresholds = [
    { map: maxSznPPG, min: 30, label: "30+ PPG Season",   desc: "Had a 30+ PPG regular season" },
    { map: maxSznPPG, min: 25, label: "25+ PPG Season",   desc: "Had a 25+ PPG regular season" },
    { map: maxSznPPG, min: 20, label: "20+ PPG Season",   desc: "Had a 20+ PPG regular season" },
    { map: maxSznPPG, min: 15, label: "15+ PPG Season",   desc: "Had a 15+ PPG regular season" },
    { map: maxSznRPG, min: 10, label: "10+ RPG Season",   desc: "Had a 10+ RPG regular season" },
    { map: maxSznRPG, min: 7,  label: "7+ RPG Season",    desc: "Had a 7+ RPG regular season"  },
    { map: maxSznAPG, min: 8,  label: "8+ APG Season",    desc: "Had an 8+ APG regular season" },
    { map: maxSznAPG, min: 5,  label: "5+ APG Season",    desc: "Had a 5+ APG regular season"  },
    { map: maxPOPPG,  min: 20, label: "20+ PPG Playoffs", desc: "Averaged 20+ PPG in a playoff run" },
    { map: maxPOPPG,  min: 15, label: "15+ PPG Playoffs", desc: "Averaged 15+ PPG in a playoff run" },
  ];

  for (const { map, min, label, desc } of statThresholds) {
    const pool = players.filter(p => (map[p.mc_uuid] ?? 0) >= min);
    if (pool.length >= 4) candidates.push({ label, description: desc, pool });
  }

  // ── Award-based groups ────────────────────────────────────────────────────
  const awardMap: Record<string, Player[]> = {};
  for (const a of accsArr) {
    const player = players.find(p => p.mc_uuid === a.mc_uuid);
    if (!player) continue;
    if (!awardMap[a.type]) awardMap[a.type] = [];
    if (!awardMap[a.type].find(p => p.mc_uuid === a.mc_uuid)) awardMap[a.type].push(player);
  }
  for (const [awardType, awardPlayers] of Object.entries(awardMap)) {
    if (awardPlayers.length >= 4)
      candidates.push({ label: awardType, description: `Won ${awardType}`, pool: awardPlayers });
  }

  // ── Played-with groups ────────────────────────────────────────────────────
  // Build team_id → player list map (any season)
  const teamIdToPlayers: Record<string, Player[]> = {};
  for (const pt of ptArr) {
    const p = players.find(pl => pl.mc_uuid === pt.mc_uuid);
    if (!p) continue;
    if (!teamIdToPlayers[pt.team_id]) teamIdToPlayers[pt.team_id] = [];
    if (!teamIdToPlayers[pt.team_id].find(pl => pl.mc_uuid === p.mc_uuid))
      teamIdToPlayers[pt.team_id].push(p);
  }
  // For each player, check if they have 4+ other players who shared a team with them
  for (const refPlayer of players) {
    const refTeamIds = new Set((ptArr.filter(pt => pt.mc_uuid === refPlayer.mc_uuid)).map(pt => pt.team_id));
    if (refTeamIds.size === 0) continue;
    const teammates = players.filter(p =>
      p.mc_uuid !== refPlayer.mc_uuid &&
      ptArr.some(pt => pt.mc_uuid === p.mc_uuid && refTeamIds.has(pt.team_id))
    );
    if (teammates.length >= 4) {
      candidates.push({
        label: `Teammate of ${refPlayer.mc_username}`,
        description: `Played on the same team as ${refPlayer.mc_username}`,
        pool: teammates,
      });
    }
  }

  // ── Greedily pick 4 non-overlapping groups of exactly 4 players ───────────
  const shuffledCandidates = shuffled(candidates, rng);
  const selected: Group[] = [];
  const usedUuids = new Set<string>();
  const colors: GroupColor[] = shuffled(["yellow", "green", "blue", "purple"] as GroupColor[], rng);

  for (const cand of shuffledCandidates) {
    if (selected.length >= 4) break;
    const available = cand.pool.filter(p => !usedUuids.has(p.mc_uuid));
    if (available.length < 4) continue;
    const picked = shuffled(available, rng).slice(0, 4);
    selected.push({ label: cand.label, description: cand.description, color: colors[selected.length], players: picked });
    for (const p of picked) usedUuids.add(p.mc_uuid);
  }

  return selected.length === 4 ? selected : null;
}

// ── localStorage ──────────────────────────────────────────────────────────────

type SavedConn = { foundGroups: number[]; guessHistory: number[][]; attemptsLeft: number };
function connKey(league: string, day: number) { return `partix:conn:${league}:${SEASON_SEED}:${day}`; }
function loadConn(league: string, day: number): SavedConn | null {
  try { const r = localStorage.getItem(connKey(league, day)); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveConn(league: string, day: number, s: SavedConn) {
  try { localStorage.setItem(connKey(league, day), JSON.stringify(s)); } catch { /**/ }
}

// ── Share modal ───────────────────────────────────────────────────────────────

function ShareModal({ groups, guessHistory, foundOrder, dayNum, onClose }: {
  groups: Group[]; guessHistory: number[][]; foundOrder: number[]; dayNum: number; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const colorForGroup = (gi: number) => groups[gi]?.color ?? "yellow";

  const lines = [
    `Partix Basketball Connections – Day #${dayNum}`,
    `${foundOrder.length}/4 groups found`,
    "",
    ...guessHistory.map(guess =>
      guess.map(gi => COLOR_EMOJI[colorForGroup(gi)]).join("")
    ),
  ];
  const text = lines.join("\n");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /**/ }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold">Share Result</h3>
            <p className="text-slate-400 text-xs mt-0.5">Day #{dayNum} · {foundOrder.length}/4 groups</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-col items-center gap-1.5">
            {guessHistory.map((guess, i) => (
              <div key={i} className="flex gap-1">
                {guess.map((gi, j) => <span key={j} className="text-3xl leading-none">{COLOR_EMOJI[colorForGroup(gi)]}</span>)}
              </div>
            ))}
          </div>
          <button onClick={copy}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold transition ${copied ? "bg-green-700 text-green-200" : "bg-blue-600 hover:bg-blue-500 text-white"}`}>
            {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectionsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const dayNum = getDayNum();
  const { status: authStatus } = useSession();

  const [groups,      setGroups]      = useState<Group[] | null>(null);
  const [allTiles,    setAllTiles]    = useState<Player[]>([]);   // 16 players in shuffled order
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [foundGroups, setFoundGroups] = useState<number[]>([]);   // group indices already found
  const [attemptsLeft, setAttemptsLeft] = useState(4);
  const [guessHistory, setGuessHistory] = useState<number[][]>([]); // each guess = array of 4 group indices
  const [shake,       setShake]       = useState(false);
  const [showShare,   setShowShare]   = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [noData,      setNoData]      = useState(false);
  const [stateReady,  setStateReady]  = useState(false);

  // Load data
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/players`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/stats/seasons?league=${slug}`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
    ]).then(([players, playerTeams, seasons, accolades, stats]) => {
      const playersArr: Player[]          = Array.isArray(players)     ? players     : [];
      const ptArr:      PlayerTeamEntry[] = Array.isArray(playerTeams) ? playerTeams : [];
      const sznArr:     SeasonRow[]       = Array.isArray(seasons)     ? seasons     : [];
      const accsArr:    Accolade[]        = Array.isArray(accolades)   ? accolades   : [];
      const statsArr:   StatRow[]         = Array.isArray(stats)       ? stats       : [];

      const leagueUuids = new Set([
        ...ptArr.map(pt => pt.mc_uuid),
        ...statsArr.map(s => s.mc_uuid),
      ]);
      const leaguePlayers = playersArr.filter(p => leagueUuids.has(p.mc_uuid));

      const gs = generateGroups(dayNum, leaguePlayers, ptArr, sznArr, accsArr);
      if (!gs) { setNoData(true); setLoading(false); return; }

      setGroups(gs);

      // Shuffle the 16 tiles using seeded RNG for consistent daily order
      const rng = seededRng((SEASON_SEED + dayNum) * 53 + 99);
      const tiles = gs.flatMap(g => g.players);
      setAllTiles([...tiles].sort(() => rng() - 0.5));

      // Restore state
      const saved = loadConn(slug, dayNum);
      if (saved) {
        setFoundGroups(saved.foundGroups);
        setGuessHistory(saved.guessHistory);
        setAttemptsLeft(saved.attemptsLeft);
      }
      setLoading(false);
      setStateReady(true);
    });
  }, [slug, dayNum]);

  // Persist state
  useEffect(() => {
    if (!stateReady) return;
    saveConn(slug, dayNum, { foundGroups, guessHistory, attemptsLeft });
  }, [foundGroups, guessHistory, attemptsLeft, stateReady, slug, dayNum]);

  const isDone = !groups ? false : (foundGroups.length === 4 || attemptsLeft === 0);

  const toggleTile = useCallback((uuid: string) => {
    if (isDone) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(uuid)) { next.delete(uuid); return next; }
      if (next.size >= 4) return prev; // max 4
      next.add(uuid); return next;
    });
  }, [isDone]);

  const submitGuess = useCallback(() => {
    if (!groups || selected.size !== 4) return;
    const selectedArr = [...selected];

    // Find which group each selected player belongs to
    const groupIndices = selectedArr.map(uuid =>
      groups.findIndex(g => g.players.some(p => p.mc_uuid === uuid))
    );
    const historyEntry = groupIndices;
    const uniqueGroups = new Set(groupIndices);

    if (uniqueGroups.size === 1 && groupIndices[0] !== -1) {
      // Correct!
      const gi = groupIndices[0];
      const newFound = [...foundGroups, gi];
      const newHistory = [...guessHistory, historyEntry];
      setFoundGroups(newFound);
      setGuessHistory(newHistory);
      setSelected(new Set());
      if (newFound.length === 4) setTimeout(() => setShowShare(true), 600);
    } else {
      // Wrong
      const newLeft = attemptsLeft - 1;
      setShake(true); setTimeout(() => setShake(false), 600);
      setGuessHistory(prev => [...prev, historyEntry]);
      setAttemptsLeft(newLeft);
      setSelected(new Set());
      if (newLeft === 0) setTimeout(() => setShowShare(true), 600);
    }
  }, [groups, selected, foundGroups, guessHistory, attemptsLeft]);

  // ── Discord gate ──────────────────────────────────────────────────────────

  if (authStatus === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Connections</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · Group 16 players into 4 categories</p>
        </div>
        <div className="p-12 flex flex-col items-center gap-5 text-center">
          <div className="text-5xl">🔐</div>
          <div>
            <p className="text-white font-semibold text-lg">Sign in to play</p>
            <p className="text-slate-400 text-sm mt-1">Discord login is required to track your daily result.</p>
          </div>
          <button onClick={() => signIn("discord")}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 transition">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.017.012.033.026.044a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const tileUuidsLeft = allTiles.filter(p => !foundGroups.some(gi => groups?.[gi]?.players.some(gp => gp.mc_uuid === p.mc_uuid)));

  return (
    <>
      {showShare && groups && (
        <ShareModal groups={groups} guessHistory={guessHistory} foundOrder={foundGroups} dayNum={dayNum} onClose={() => setShowShare(false)} />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-bold text-white">Connections</h2>
            <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · Group the 16 players into 4 categories of 4</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-300 text-sm font-semibold">{foundGroups.length}/4 found</span>
            <div className="flex gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full ${i < attemptsLeft ? "bg-green-500" : "bg-slate-700"}`} />
              ))}
            </div>
            {isDone && (
              <button onClick={() => setShowShare(true)}
                className="rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 text-sm transition">
                📋 Share
              </button>
            )}
          </div>
        </div>

        {loading || authStatus === "loading" ? (
          <div className="p-10 text-center text-slate-500">Building today's puzzle...</div>
        ) : noData ? (
          <div className="p-10 text-center text-slate-500">Not enough data to generate Connections for this league yet.</div>
        ) : groups ? (
          <div className="p-4 space-y-3">
            {/* Found groups (revealed at top) */}
            {foundGroups.map(gi => (
              <div key={gi} className={`rounded-xl border-2 p-3 ${COLOR_BG[groups[gi].color]}`}>
                <div className={`text-center font-bold text-sm uppercase tracking-wider ${COLOR_TEXT[groups[gi].color]}`}>
                  {groups[gi].description}
                </div>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {groups[gi].players.map(p => (
                    <div key={p.mc_uuid} className="flex items-center gap-1.5">
                      <img src={`https://minotar.net/avatar/${p.mc_username}/20`} className="w-5 h-5 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }} />
                      <span className={`text-xs font-medium ${COLOR_TEXT[groups[gi].color]}`}>{p.mc_username}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Remaining tiles */}
            {!isDone && (
              <div className={`grid grid-cols-4 gap-2 ${shake ? "animate-bounce" : ""}`}>
                {tileUuidsLeft.map(p => {
                  const isSel = selected.has(p.mc_uuid);
                  return (
                    <button
                      key={p.mc_uuid}
                      onClick={() => toggleTile(p.mc_uuid)}
                      className={`rounded-xl border-2 flex flex-col items-center justify-center gap-1.5 p-2 min-h-[80px] transition
                        ${isSel
                          ? "border-blue-500 bg-blue-950 ring-2 ring-blue-400"
                          : "border-slate-700 bg-slate-950 hover:border-slate-500 hover:bg-slate-800"
                        }`}
                    >
                      <img src={`https://minotar.net/avatar/${p.mc_username}/28`} className="w-7 h-7 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }} />
                      <span className="text-[10px] font-semibold text-white text-center leading-tight break-all line-clamp-2">
                        {p.mc_username}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Submit / done */}
            {!isDone ? (
              <div className="flex justify-center gap-3 pt-1">
                <button onClick={() => setSelected(new Set())}
                  className="rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-white text-sm px-4 py-2 transition disabled:opacity-30"
                  disabled={selected.size === 0}>
                  Deselect All
                </button>
                <button onClick={submitGuess}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={selected.size !== 4}>
                  Submit ({selected.size}/4 selected)
                </button>
              </div>
            ) : (
              <div className={`rounded-xl border p-4 text-center ${foundGroups.length === 4 ? "border-green-800 bg-green-950" : "border-slate-700 bg-slate-950"}`}>
                {foundGroups.length === 4
                  ? <div className="text-xl font-bold text-green-300">🎉 Solved it!</div>
                  : (
                    <>
                      <div className="text-lg font-bold text-white mb-2">Out of attempts!</div>
                      <div className="space-y-2">
                        {groups.filter((_, gi) => !foundGroups.includes(gi)).map((g, i) => (
                          <div key={i} className={`rounded-lg border p-2 ${COLOR_BG[g.color]}`}>
                            <span className={`text-xs font-semibold ${COLOR_TEXT[g.color]}`}>{g.description}: </span>
                            <span className={`text-xs ${COLOR_TEXT[g.color]}`}>{g.players.map(p => p.mc_username).join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                <button onClick={() => setShowShare(true)}
                  className="mt-3 rounded-lg border border-blue-700 bg-blue-900 hover:bg-blue-800 text-blue-200 text-sm font-medium px-4 py-2 transition">
                  📋 Share Result
                </button>
              </div>
            )}

            {!isDone && (
              <p className="text-xs text-slate-600 text-center">
                Select 4 players that share something in common, then hit Submit. {attemptsLeft} attempt{attemptsLeft !== 1 ? "s" : ""} left.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
