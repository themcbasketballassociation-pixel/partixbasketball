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

const computeVORP = (player: StatRow | null, all: StatRow[]): number | null => {
  if (!player || (player.gp ?? 0) === 0) return null;
  const qualified = all.filter(s => (s.gp ?? 0) >= 1);
  if (qualified.length === 0) return null;
  const eff = (s: StatRow) => (s.ppg ?? 0) + 1.2 * (s.rpg ?? 0) + 1.5 * (s.apg ?? 0) + 2 * (s.spg ?? 0) + 2 * (s.bpg ?? 0);
  const avgEff = qualified.reduce((sum, s) => sum + eff(s), 0) / qualified.length;
  const bpm = eff(player) - avgEff;
  const maxGP = Math.max(1, ...qualified.map(s => s.gp ?? 0));
  return Math.round((bpm + 2.0) * ((player.gp ?? 0) / maxGP) * 10) / 10;
};

const vorpContext = (v: number): { label: string; color: string } => {
  if (v >= 8)  return { label: "MVP Candidate",     color: "#f59e0b" };
  if (v >= 5)  return { label: "All-Star Caliber",  color: "#14b8a6" };
  if (v >= 2)  return { label: "Solid Starter",     color: "#22c55e" };
  if (v >= 1)  return { label: "Rotation Player",   color: "#60a5fa" };
  if (v >= 0)  return { label: "Replacement Level", color: "#94a3b8" };
  return           { label: "Below Replacement",  color: "#ef4444" };
};

const ordinal = (n: number) => {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

type RadarCatDef = { label: string; desc: string; getValue: (s: StatRow) => number | null };
const RADAR_CAT_DEFS: RadarCatDef[] = [
  { label: "Scoring",    desc: "PPG",     getValue: s => s.ppg },
  { label: "3-Point",    desc: "3FG%",    getValue: s => s.three_pt_pct },
  { label: "Defense",    desc: "STL+BLK", getValue: s => (s.spg != null || s.bpg != null) ? (s.spg ?? 0) + (s.bpg ?? 0) : null },
  { label: "Rebounding", desc: "RPG",     getValue: s => s.rpg },
  { label: "Playmaking", desc: "APG",     getValue: s => s.apg },
  { label: "Shooting",   desc: "FG%",     getValue: s => s.fg_pct },
];

function RadarChart({ values, labels, size = 270 }: { values: number[]; labels: string[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.35;
  const n = values.length;
  const angles = Array.from({ length: n }, (_, i) => (i * 2 * Math.PI) / n - Math.PI / 2);
  const pt = (a: number, rad: number): [number, number] => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const hexPts = (frac: number) => angles.map(a => pt(a, frac * r).join(",")).join(" ");
  const playerPts = values.map((v, i) => pt(angles[i], Math.max(0.04, v) * r).join(",")).join(" ");
  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
      {[0.25, 0.5, 0.75, 1].map((f, fi) => (
        <polygon key={fi} points={hexPts(f)} fill="none"
          stroke={f === 1 ? "#1e293b" : "#0f172a"} strokeWidth={f === 1 ? 1.5 : 1}
          strokeDasharray={f < 1 ? "3 3" : undefined} />
      ))}
      {angles.map((a, i) => { const [x, y] = pt(a, r); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#0f172a" strokeWidth="1" />; })}
      <polygon points={playerPts} fill="#14b8a620" stroke="#14b8a6" strokeWidth="2" strokeLinejoin="round" />
      {values.map((v, i) => { const [x, y] = pt(angles[i], Math.max(0.04, v) * r); return <circle key={i} cx={x} cy={y} r="4" fill="#14b8a6" stroke="#0d1117" strokeWidth="1.5" />; })}
      {labels.map((label, i) => {
        const [x, y] = pt(angles[i], r * 1.24);
        const lines = label.split(" ");
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="10" fontWeight="700" fontFamily="system-ui,sans-serif">
            {lines.length === 1 ? <tspan>{label}</tspan> : lines.map((l, li) => <tspan key={li} x={x} dy={li === 0 ? "-0.5em" : "1.1em"}>{l}</tspan>)}
          </text>
        );
      })}
    </svg>
  );
}

export default function PlayerProfilePage({ params }: { params?: Promise<{ league?: string; username?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string; username?: string };
  const slug = resolved.league ?? "";
  const username = resolved.username ?? "";

  const [player, setPlayer] = useState<Player | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [statsRegular, setStatsRegular] = useState<StatRow | null>(null);
  const [statsPlayoffs, setStatsPlayoffs] = useState<StatRow | null>(null);
  const [statsCombined, setStatsCombined] = useState<StatRow | null>(null);
  const [leagueAll, setLeagueAll] = useState<{ regular: StatRow[]; playoffs: StatRow[]; combined: StatRow[] }>({ regular: [], playoffs: [], combined: [] });
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
    setLeagueAll({
      regular:  Array.isArray(sReg) ? sReg : [],
      playoffs: Array.isArray(sPly) ? sPly : [],
      combined: Array.isArray(sCom) ? sCom : [],
    });
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
  const activeLeagueAll = statType === "regular" ? leagueAll.regular : statType === "playoffs" ? leagueAll.playoffs : leagueAll.combined;

  const pctile = (val: number | null | undefined, key: string): number | null => {
    if (val == null) return null;
    const vals = activeLeagueAll.filter(s => (s.gp ?? 0) >= 1).map(s => (s as Record<string, unknown>)[key] as number | null).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.min(99, Math.round((vals.filter(v => v < val).length + 0.5) / vals.length * 100));
  };
  const pctileCustom = (val: number | null, allVals: (number | null)[]): number | null => {
    if (val == null) return null;
    const valid = allVals.filter((v): v is number => v != null);
    if (valid.length === 0) return null;
    return Math.min(99, Math.round((valid.filter(v => v < val).length + 0.5) / valid.length * 100));
  };
  const radarCats = activeStats ? RADAR_CAT_DEFS.map(cat => {
    const val = cat.getValue(activeStats);
    const allVals = activeLeagueAll.filter(s => (s.gp ?? 0) >= 1).map(s => cat.getValue(s));
    const pct = pctileCustom(val, allVals);
    return { label: cat.label, desc: cat.desc, value: val, percentile: pct };
  }) : [];
  const radarValues = radarCats.map(c => (c.percentile ?? 0) / 100);

  const leagueAvg = activeLeagueAll.length > 0 ? (() => {
    const q = activeLeagueAll.filter(s => (s.gp ?? 0) >= 1);
    const mean = (key: keyof StatRow) => {
      const vals = q.map(s => s[key] as number | null).filter((v): v is number => v != null);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return { ppg: mean("ppg"), rpg: mean("rpg"), apg: mean("apg"), spg: mean("spg"), bpg: mean("bpg"), fg_pct: mean("fg_pct"), three_pt_pct: mean("three_pt_pct") };
  })() : null;
  void pctile;

  const vorp = computeVORP(activeStats, activeLeagueAll);
  const leagueMaxVorp = Math.max(0.1, ...activeLeagueAll.filter(s => (s.gp ?? 0) >= 1).map(s => computeVORP(s, activeLeagueAll) ?? 0));
  const vorpCtx = vorp != null ? vorpContext(vorp) : null;

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
          <>
            {/* Type + Season controls */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
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

            {/* VORP Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-800">
                <span className="text-xs font-black text-white uppercase tracking-widest">VORP</span>
                <span className="text-[10px] text-slate-600">Value Over Replacement Player</span>
              </div>
              {statsLoading ? (
                <p className="text-slate-600 text-sm text-center py-6">Loading…</p>
              ) : !activeStats || vorp == null ? (
                <p className="text-slate-600 text-sm text-center py-6">No stats for this period.</p>
              ) : (
                <div className="px-5 py-5">
                  <div className="flex items-end gap-4 mb-4">
                    <span className="text-5xl font-black tabular-nums leading-none" style={{ color: vorpCtx?.color ?? "#fff" }}>
                      {vorp >= 0 ? "+" : ""}{vorp.toFixed(1)}
                    </span>
                    <div className="pb-1">
                      <div className="text-sm font-bold" style={{ color: vorpCtx?.color ?? "#fff" }}>{vorpCtx?.label}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5">vs replacement baseline (−2.0 BPM)</div>
                    </div>
                  </div>
                  {/* VORP bar */}
                  <div className="relative mb-2">
                    <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(2, Math.min(100, (Math.max(0, vorp) / Math.max(leagueMaxVorp, 1)) * 100))}%`, background: vorpCtx?.color ?? "#64748b" }} />
                    </div>
                  </div>
                  {/* Scale labels */}
                  <div className="flex justify-between text-[9px] text-slate-600 font-bold mb-4 px-0.5">
                    <span>0.0<br/>Replacement</span>
                    <span className="text-center">2.0<br/>Starter</span>
                    <span className="text-center">5.0<br/>All-Star</span>
                    <span className="text-right">8.0+<br/>MVP</span>
                  </div>
                  {/* VORP breakdown */}
                  <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-4">
                    {[
                      { label: "Scoring",    color: "#ef4444", val: (activeStats.ppg ?? 0) },
                      { label: "Rebounding", color: "#3b82f6", val: 1.2 * (activeStats.rpg ?? 0) },
                      { label: "Playmaking", color: "#22c55e", val: 1.5 * (activeStats.apg ?? 0) },
                      { label: "Defense",    color: "#a855f7", val: 2 * ((activeStats.spg ?? 0) + (activeStats.bpg ?? 0)) },
                      { label: "GP Weight",  color: "#f59e0b", val: (activeStats.gp ?? 0) },
                      { label: "BPM",        color: vorpCtx?.color ?? "#94a3b8", val: null },
                    ].map(({ label, color, val }, i) => (
                      <div key={label} className="rounded-lg bg-slate-900 border border-slate-800 px-2 py-2 text-center">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
                        {i === 4 ? (
                          <div className="text-sm font-black tabular-nums" style={{ color }}>{activeStats.gp ?? "—"} GP</div>
                        ) : i === 5 ? (
                          <div className="text-sm font-black tabular-nums" style={{ color }}>{vorp >= 0 ? "+" : ""}{vorp.toFixed(1)}</div>
                        ) : (
                          <div className="text-sm font-black tabular-nums" style={{ color }}>+{val.toFixed(1)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Performance Profile (radar) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-800">
                <div className="w-3.5 h-3.5 rounded-full border-2 border-teal-500 flex items-center justify-center flex-shrink-0">
                  <div className="w-1 h-1 rounded-full bg-teal-500" />
                </div>
                <span className="text-xs font-black text-white uppercase tracking-widest">Performance Profile</span>
                <span className="text-[10px] text-slate-600 ml-auto">{statType === "regular" ? "Regular Season" : statType === "playoffs" ? "Playoffs" : "Combined"}</span>
              </div>
              {statsLoading ? (
                <p className="text-slate-600 text-sm text-center py-10">Loading…</p>
              ) : !activeStats ? (
                <p className="text-slate-600 text-sm text-center py-10">No stats for this period.</p>
              ) : (
                <div className="px-5 py-5">
                  <RadarChart values={radarValues} labels={RADAR_CAT_DEFS.map(c => c.label)} size={270} />
                  <div className="grid grid-cols-3 gap-2 mt-5">
                    {radarCats.map(cat => (
                      <div key={cat.label} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-center">
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">{cat.label}</div>
                        <div className="text-[10px] text-slate-600 mb-1">{cat.desc}</div>
                        <div className="text-xl font-black tabular-nums" style={{ color: cat.percentile != null ? "#14b8a6" : "#333" }}>
                          {cat.percentile != null ? ordinal(cat.percentile) : "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stat bars + league avg */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white">Stat Breakdown</h3>
                <div className="flex items-center gap-4 text-[10px] font-semibold uppercase tracking-widest">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 rounded-full bg-teal-500" /><span className="text-slate-500">Player</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-1 rounded-full bg-slate-600" /><span className="text-slate-600">League Avg</span></div>
                </div>
              </div>
              {statsLoading ? (
                <p className="text-slate-600 text-sm text-center py-8">Loading…</p>
              ) : !activeStats ? (
                <p className="text-slate-600 text-sm text-center py-8">No stats recorded.</p>
              ) : (
                <div>
                  {[
                    { label: "PTS", sublabel: "Points per Game",   value: activeStats.ppg,           avg: leagueAvg?.ppg,           max: 35,  color: "#ef4444", fmtFn: (v: number) => v.toFixed(1) },
                    { label: "REB", sublabel: "Rebounds per Game", value: activeStats.rpg,           avg: leagueAvg?.rpg,           max: 18,  color: "#3b82f6", fmtFn: (v: number) => v.toFixed(1) },
                    { label: "AST", sublabel: "Assists per Game",  value: activeStats.apg,           avg: leagueAvg?.apg,           max: 12,  color: "#22c55e", fmtFn: (v: number) => v.toFixed(1) },
                    { label: "STL", sublabel: "Steals per Game",   value: activeStats.spg,           avg: leagueAvg?.spg,           max: 6,   color: "#a855f7", fmtFn: (v: number) => v.toFixed(1) },
                    { label: "BLK", sublabel: "Blocks per Game",   value: activeStats.bpg,           avg: leagueAvg?.bpg,           max: 6,   color: "#f59e0b", fmtFn: (v: number) => v.toFixed(1) },
                    { label: "FG%", sublabel: "Field Goal %",      value: activeStats.fg_pct,        avg: leagueAvg?.fg_pct,        max: 100, color: "#06b6d4", fmtFn: (v: number) => `${v.toFixed(1)}%` },
                    { label: "3FG%",sublabel: "Three-Point %",     value: activeStats.three_pt_pct,  avg: leagueAvg?.three_pt_pct,  max: 100, color: "#f97316", fmtFn: (v: number) => `${v.toFixed(1)}%` },
                  ].map(({ label, sublabel, value, avg, max, color, fmtFn }, idx, arr) => {
                    const pct    = value != null ? Math.min((value / max) * 100, 100) : 0;
                    const avgPct = avg   != null ? Math.min((avg   / max) * 100, 100) : 0;
                    const aboveAvg = value != null && avg != null && value > avg;
                    return (
                      <div key={label} className={`px-5 py-4${idx < arr.length - 1 ? " border-b border-slate-800/60" : ""}`}>
                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-widest mr-2">{label}</span>
                            <span className="text-[10px] text-slate-600">{sublabel}</span>
                          </div>
                          <div className="flex items-baseline gap-2">
                            {avg != null && <span className="text-[10px] text-slate-600 tabular-nums">avg <span className="text-slate-500">{fmtFn(avg)}</span></span>}
                            <span className="text-2xl font-black tabular-nums leading-none" style={{ color: value != null ? color : "#333" }}>
                              {value != null ? fmtFn(value) : "—"}
                            </span>
                            {value != null && avg != null && (
                              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${aboveAvg ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"}`}>
                                {aboveAvg ? "▲" : "▼"}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-800/80 overflow-hidden mb-1.5">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: value != null ? color : "transparent" }} />
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-800/50 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${avgPct}%`, background: avg != null ? "#475569" : "transparent" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Raw stat grid */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
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
          </>
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
