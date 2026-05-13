"use client";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Player = { mc_uuid: string; mc_username: string; discord_id: string | null };
type Team = { id: string; name: string; abbreviation: string; logo_url: string | null };
type StatRow = {
  mc_uuid: string; mc_username: string; team: Team | null;
  gp: number | null; ppg: number | null; rpg: number | null; apg: number | null;
  spg: number | null; bpg: number | null; fg_pct: number | null;
  three_pt_made: number | null; tppg: number | null; three_pt_pct: number | null;
};
type Accolade = { id: string; type: string; season: string; description: string | null; mc_uuid: string };
type PlayerTeam = { mc_uuid: string; team_id: string; season: string | null };
type TeamRecord = { team_id: string; wins: number; losses: number };
type GameStat = {
  id: string; game_id: string; mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null;
  turnovers: number | null; fg_made: number | null; fg_attempted: number | null;
  three_pt_made: number | null;
};
type Game = {
  id: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team_id: string; away_team_id: string;
  home_team: Team; away_team: Team;
};

type StatType = "regular" | "playoffs" | "combined";
type Tab = "overview" | "stats" | "gamelog";

const fmt = (v: number | null | undefined, dec = 0) =>
  v == null ? "—" : dec > 0 ? v.toFixed(dec) : String(Math.round(v));

export default function PlayerProfilePage({ params }: { params?: Promise<{ league?: string; username?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string; username?: string };
  const slug = resolved.league ?? "";
  const username = resolved.username ?? "";

  const [player, setPlayer] = useState<Player | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [statsRegular, setStatsRegular] = useState<StatRow | null>(null);
  const [statsPlayoffs, setStatsPlayoffs] = useState<StatRow | null>(null);
  const [statsCombined, setStatsCombined] = useState<StatRow | null>(null);
  const [accolades, setAccolades] = useState<Accolade[]>([]);
  const [record, setRecord] = useState({ wins: 0, losses: 0 });
  const [gameLogs, setGameLogs] = useState<{ game: Game; stat: GameStat }[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [statType, setStatType] = useState<StatType>("regular");
  const [playerTeamIds, setPlayerTeamIds] = useState<Set<string>>(new Set());
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("all");
  const [statsLoading, setStatsLoading] = useState(false);
  const router = useRouter();

  // Initial load: player info, accolades, records, team
  useEffect(() => {
    if (!slug || !username) return;
    Promise.all([
      fetch("/api/players").then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/records?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams?league=${slug}`).then(r => r.json()),
    ]).then(([players, accs, records, playerTeams, teams]) => {
      const playersArr: Player[] = Array.isArray(players) ? players : [];
      const found = playersArr.find(p => p.mc_username.toLowerCase() === username.toLowerCase());
      if (!found) { setNotFound(true); setLoading(false); return; }
      setPlayer(found);

      if (Array.isArray(accs)) setAccolades(accs.filter((a: Accolade) => a.mc_uuid === found.mc_uuid));

      const ptArr: PlayerTeam[] = Array.isArray(playerTeams) ? playerTeams : [];
      const recArr: TeamRecord[] = Array.isArray(records) ? records : [];
      const teamsArr: Team[] = Array.isArray(teams) ? teams : [];

      const mine = ptArr.filter(pt => pt.mc_uuid === found.mc_uuid);
      setPlayerTeamIds(new Set(mine.map(pt => pt.team_id)));
      if (mine.length > 0) {
        const sorted = [...mine].sort((a, b) => {
          const na = a.season ? parseInt(a.season.replace(/\D/g, "") || "0") : -1;
          const nb = b.season ? parseInt(b.season.replace(/\D/g, "") || "0") : -1;
          return nb - na;
        });
        setCurrentTeam(teamsArr.find(t => t.id === sorted[0].team_id) ?? null);
      }

      let wins = 0, losses = 0;
      for (const pt of mine) {
        const rec = recArr.find(r => r.team_id === pt.team_id);
        if (rec) { wins += rec.wins; losses += rec.losses; }
      }
      setRecord({ wins, losses });
      setLoading(false);
    });
  }, [slug, username]);

  // Fetch available seasons
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then(r => r.json())
      .then((data: { season: string }[]) => {
        if (Array.isArray(data)) {
          const reg = [...new Set(
            data.map(d => d.season).filter(s => s && !s.toLowerCase().includes("playoff"))
          )].sort((a, b) => b.localeCompare(a));
          setSeasons(reg);
        }
      })
      .catch(() => {});
  }, [slug]);

  // Re-fetch stats whenever player or selected season changes
  const fetchStats = useCallback(async (p: Player, league: string, season: string) => {
    setStatsLoading(true);
    const enc = encodeURIComponent(season);
    const [sReg, sPly, sCom] = await Promise.all([
      fetch(`/api/stats?league=${league}&season=${enc}&type=regular`).then(r => r.json()),
      fetch(`/api/stats?league=${league}&season=${enc}&type=playoffs`).then(r => r.json()),
      fetch(`/api/stats?league=${league}&season=${enc}&type=combined`).then(r => r.json()),
    ]);
    setStatsRegular(Array.isArray(sReg) ? sReg.find((s: StatRow) => s.mc_uuid === p.mc_uuid) ?? null : null);
    setStatsPlayoffs(Array.isArray(sPly) ? sPly.find((s: StatRow) => s.mc_uuid === p.mc_uuid) ?? null : null);
    setStatsCombined(Array.isArray(sCom) ? sCom.find((s: StatRow) => s.mc_uuid === p.mc_uuid) ?? null : null);
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    if (!player || !slug) return;
    fetchStats(player, slug, selectedSeason);
  }, [player, slug, selectedSeason, fetchStats]);

  // Game log
  useEffect(() => {
    if (!player || !slug) return;
    Promise.all([
      fetch(`/api/games?league=${slug}`).then(r => r.json()),
      fetch(`/api/game-stats?mc_uuid=${player.mc_uuid}`).then(r => r.json()),
    ]).then(([games, gameStats]) => {
      const gamesArr: Game[] = Array.isArray(games) ? games : [];
      const gsArr: GameStat[] = Array.isArray(gameStats) ? gameStats : [];
      const logs = gsArr
        .map(gs => {
          const game = gamesArr.find(g => g.id === gs.game_id && (g.status === "final" || g.status === "completed"));
          return game ? { game, stat: gs } : null;
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b!.game.scheduled_at).getTime() - new Date(a!.game.scheduled_at).getTime()) as { game: Game; stat: GameStat }[];
      setGameLogs(logs);
    });
  }, [player, slug]);

  const winPct = record.wins + record.losses > 0
    ? ((record.wins / (record.wins + record.losses)) * 100).toFixed(1) + "%"
    : "—";
  const rings = accolades.filter(a => a.type === "Finals Champion");
  const otherAccolades = accolades.filter(a => a.type !== "Finals Champion");
  const activeStats = statType === "regular" ? statsRegular : statType === "playoffs" ? statsPlayoffs : statsCombined;

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center text-slate-500">
        Loading player...
      </div>
    );
  }

  if (notFound || !player) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center">
        <p className="text-slate-400 text-lg font-semibold mb-2">Player not found</p>
        <p className="text-slate-600 text-sm mb-5">"{username}" doesn't exist in this league.</p>
        <Link href={`/${slug}/players`} className="text-blue-400 text-sm hover:underline">← Back to Players</Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">

      {/* Hero */}
      <div className="relative bg-gradient-to-br from-slate-800 to-slate-950 border-b border-slate-800 px-6 pt-4 pb-6">
        {/* Back link */}
        <Link href={`/${slug}/players`} className="inline-flex items-center gap-1 text-slate-500 text-xs hover:text-slate-300 transition mb-4">
          ← Players
        </Link>

        <div className="flex items-center gap-6 flex-wrap">
          {/* Big Minecraft head */}
          <div className="flex-shrink-0">
            <img
              src={`https://minotar.net/helm/${player.mc_username}/160`}
              alt={player.mc_username}
              className="w-28 h-28 rounded-2xl object-contain drop-shadow-2xl"
              style={{ imageRendering: "pixelated" }}
              onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/helm/MHF_Steve/160"; }}
            />
          </div>

          {/* Player info */}
          <div className="flex-1 min-w-[180px]">
            <h1 className="text-4xl font-black text-white leading-tight">{player.mc_username}</h1>

            {rings.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {rings.map(r => (
                  <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-yellow-950 border border-yellow-700 px-2.5 py-0.5 text-xs text-yellow-300 font-semibold">
                    🏆 {r.season}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 flex items-center gap-3 max-w-[260px]">
              {currentTeam?.logo_url
                ? <img src={currentTeam.logo_url} className="w-8 h-8 object-contain flex-shrink-0" alt="" />
                : <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex-shrink-0" />}
              <div>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Current Team</p>
                <p className="text-white font-bold text-sm leading-tight mt-0.5">{currentTeam?.name ?? "—"}</p>
              </div>
            </div>

            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-950 border border-blue-800 px-3 py-1 text-xs text-blue-300 font-semibold">
              Player
            </span>
          </div>

          {/* Right side: season picker + stat cards */}
          <div className="flex flex-col gap-2 flex-shrink-0 self-start pt-1">
            {/* Season selector */}
            <div className="flex items-center gap-2 justify-end">
              <span className="text-xs text-slate-500 font-medium">Season</span>
              <select
                value={selectedSeason}
                onChange={e => setSelectedSeason(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">Career</option>
                {seasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Stat cards 2×2 */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "GP",   value: statsLoading ? "…" : fmt(statsRegular?.gp),  color: "text-white" },
                { label: "W",    value: String(record.wins),    color: "text-green-400" },
                { label: "L",    value: String(record.losses),  color: "text-red-400" },
                { label: "WIN%", value: winPct,                 color: "text-yellow-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-3 text-center min-w-[80px]">
                  <div className={`text-2xl font-black leading-none ${color}`}>{value}</div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-widest mt-1 font-bold">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 px-6 flex">
        {([
          { key: "overview", label: "Overview" },
          { key: "stats",    label: "Statistics" },
          { key: "gamelog",  label: "Game Log" },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition -mb-px ${
              activeTab === key
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-6 space-y-4">

        {/* Overview */}
        {activeTab === "overview" && (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
              <h3 className="text-sm font-bold text-white mb-2">About</h3>
              <p className="text-slate-600 text-sm italic">No description yet.</p>
            </div>

            {/* Player Analysis */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Player Analysis</h3>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
                  {selectedSeason === "all" ? "Career" : selectedSeason} · Regular Season
                </span>
              </div>
              {statsLoading ? (
                <p className="text-slate-600 text-sm text-center py-4">Loading…</p>
              ) : !statsRegular ? (
                <p className="text-slate-600 text-sm text-center py-4">No stats recorded.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "PTS", sublabel: "Points", value: statsRegular.ppg, max: 30, color: "#C8102E", format: (v: number) => v.toFixed(1) },
                    { label: "REB", sublabel: "Rebounds", value: statsRegular.rpg, max: 15, color: "#3b82f6", format: (v: number) => v.toFixed(1) },
                    { label: "AST", sublabel: "Assists", value: statsRegular.apg, max: 10, color: "#22c55e", format: (v: number) => v.toFixed(1) },
                    { label: "STL", sublabel: "Steals", value: statsRegular.spg, max: 5, color: "#a855f7", format: (v: number) => v.toFixed(1) },
                    { label: "BLK", sublabel: "Blocks", value: statsRegular.bpg, max: 5, color: "#f59e0b", format: (v: number) => v.toFixed(1) },
                    { label: "FG%", sublabel: "Field Goal %", value: statsRegular.fg_pct, max: 100, color: "#06b6d4", format: (v: number) => `${v.toFixed(1)}%` },
                    { label: "3FG%", sublabel: "Three-Point %", value: statsRegular.three_pt_pct, max: 100, color: "#f97316", format: (v: number) => `${v.toFixed(1)}%` },
                  ].map(({ label, sublabel, value, max, color, format }) => {
                    const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest w-8">{label}</span>
                            <span className="text-[10px] text-slate-600">{sublabel}</span>
                          </div>
                          <span className="text-xs font-bold tabular-nums" style={{ color: value != null ? color : undefined }}>
                            {value != null ? format(value) : "—"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: color, opacity: value != null ? 1 : 0 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
              <h3 className="text-sm font-bold text-white mb-3">Accolades</h3>
              {accolades.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2 text-center">
                  <svg className="w-10 h-10 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  <p className="text-slate-500 text-sm font-medium">No accolades yet</p>
                  <p className="text-slate-600 text-xs">Keep playing to earn accolades!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rings.length > 0 && (
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-yellow-400 font-bold text-lg">{rings.length}×</span>
                      <span className="text-yellow-300 text-sm font-semibold">Finals Champion</span>
                      {rings.map(r => (
                        <span key={r.id} className="text-xs text-yellow-500 bg-yellow-950 border border-yellow-800 rounded-full px-2 py-0.5">{r.season}</span>
                      ))}
                    </div>
                  )}
                  {otherAccolades.map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2.5">
                      <span className="font-semibold text-slate-200 text-sm">{a.type}</span>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">{a.season}</div>
                        {a.description && <div className="text-xs text-slate-600 mt-0.5">{a.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Statistics */}
        {activeTab === "stats" && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-white">
                {selectedSeason === "all" ? "Career" : selectedSeason} Statistics
              </h3>
              <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
                {(["regular", "playoffs", "combined"] as StatType[]).map(t => (
                  <button key={t} onClick={() => setStatType(t)}
                    className={`px-3 py-1.5 transition ${statType === t ? "bg-blue-600 text-white font-semibold" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                    {t === "regular" ? "Regular" : t === "playoffs" ? "Playoffs" : "Combined"}
                  </button>
                ))}
              </div>
            </div>
            {statsLoading ? (
              <p className="text-slate-600 text-sm text-center py-6">Loading stats…</p>
            ) : !activeStats ? (
              <p className="text-slate-600 text-sm text-center py-6">No stats recorded.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[
                  { label: "GP",   value: fmt(activeStats.gp) },
                  { label: "PPG",  value: fmt(activeStats.ppg, 1) },
                  { label: "RPG",  value: fmt(activeStats.rpg, 1) },
                  { label: "APG",  value: fmt(activeStats.apg, 1) },
                  { label: "SPG",  value: fmt(activeStats.spg, 1) },
                  { label: "BPG",  value: fmt(activeStats.bpg, 1) },
                  { label: "FG%",  value: activeStats.fg_pct == null ? "—" : `${activeStats.fg_pct}%` },
                  { label: "3PM",  value: fmt(activeStats.three_pt_made) },
                  { label: "3PPG", value: fmt(activeStats.tppg, 1) },
                  { label: "3FG%", value: activeStats.three_pt_pct == null ? "—" : `${activeStats.three_pt_pct}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-3 text-center">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
                    <div className="text-base font-bold text-white tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Game Log */}
        {activeTab === "gamelog" && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
            {gameLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-600">No completed games found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900">
                      {["Date", "Matchup", "PTS", "REB", "AST", "STL", "BLK", "FG", "3PM"].map(h => (
                        <th key={h} className={`px-3 py-3 text-slate-500 font-bold uppercase tracking-wide ${h === "Date" || h === "Matchup" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gameLogs.map(({ game, stat }) => {
                      const reb = (stat.rebounds_off ?? 0) + (stat.rebounds_def ?? 0);
                      // Use all historical team IDs (not just current team) to correctly determine home/away
                      const playerIsHome = playerTeamIds.has(game.home_team_id);
                      const playerIsAway = playerTeamIds.has(game.away_team_id);
                      // If matched to both or neither, assume away (show home team as opponent)
                      const effectivelyHome = playerIsHome && !playerIsAway;
                      const myTeam = effectivelyHome ? game.home_team : game.away_team;
                      const opponent = effectivelyHome ? game.away_team : game.home_team;
                      const myScore = effectivelyHome ? game.home_score : game.away_score;
                      const oppScore = effectivelyHome ? game.away_score : game.home_score;
                      const won = myScore != null && oppScore != null && myScore > oppScore;
                      const lost = myScore != null && oppScore != null && myScore < oppScore;
                      return (
                        <tr
                          key={stat.id}
                          className="border-b border-slate-800/50 hover:bg-slate-700/30 transition cursor-pointer"
                          onClick={() => router.push(`/${slug}/boxscores/${game.id}`)}
                        >
                          <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                            {new Date(game.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              {/* Player's team logo */}
                              {myTeam?.logo_url
                                ? <img src={myTeam.logo_url} className="w-5 h-5 object-contain flex-shrink-0" alt="" />
                                : <div className="w-5 h-5 rounded bg-slate-800 flex-shrink-0" />}
                              {/* vs / @ */}
                              <span className="text-slate-600 text-[10px] font-semibold">{effectivelyHome ? "vs" : "@"}</span>
                              {/* Opponent logo */}
                              {opponent?.logo_url
                                ? <img src={opponent.logo_url} className="w-5 h-5 object-contain flex-shrink-0" alt="" />
                                : <div className="w-5 h-5 rounded bg-slate-800 flex-shrink-0" />}
                              {/* Opponent abbreviation */}
                              <span className="font-bold text-white">{opponent?.abbreviation ?? "?"}</span>
                              {/* Score */}
                              {myScore != null && (
                                <span className={`ml-1 tabular-nums font-semibold ${won ? "text-green-400" : lost ? "text-red-400" : "text-slate-500"}`}>
                                  {myScore}-{oppScore}
                                </span>
                              )}
                              {/* Win/Loss badge */}
                              {myScore != null && (
                                <span className={`text-[9px] font-black px-1 py-0.5 rounded ${won ? "bg-green-950 text-green-400" : lost ? "bg-red-950 text-red-400" : "bg-slate-800 text-slate-500"}`}>
                                  {won ? "W" : lost ? "L" : "—"}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-black text-white tabular-nums">{stat.points ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{reb || "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{stat.assists ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{stat.steals ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-300">{stat.blocks ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{stat.fg_made ?? "—"}/{stat.fg_attempted ?? "—"}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">{stat.three_pt_made ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
