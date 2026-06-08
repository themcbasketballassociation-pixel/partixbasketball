"use client";
import React from "react";
import Link from "next/link";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

// ── Accolades types & helpers ─────────────────────────────────────────────────

type Accolade = {
  id: string; type: string; season: string; description: string | null;
  mc_uuid: string; players?: { mc_uuid: string; mc_username: string } | null;
};
type RecordEntry = { mc_uuid: string; mc_username: string; value: number; season: string };
type Records = {
  season?: Record<string, RecordEntry>; seasonAvg?: Record<string, RecordEntry>;
  career?: Record<string, RecordEntry>; careerAvg?: Record<string, RecordEntry>;
};

function PlayerFace({ username, size = 40 }: { username: string; size?: number }) {
  return (
    <img
      src={`https://minotar.net/avatar/${username || "MHF_Steve"}/${size}`}
      alt="" className="shrink-0 rounded-lg border border-slate-700 bg-slate-950"
      style={{ width: size, height: size }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://minotar.net/avatar/MHF_Steve/${size}`; }}
    />
  );
}
function RecordCard({ label, entry, suffix }: { label: string; entry?: RecordEntry; suffix?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-600">
      <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
      {!entry?.mc_uuid ? (
        <div className="text-sm font-bold text-slate-600">No data</div>
      ) : (
        <div className="flex items-center gap-3">
          <PlayerFace username={entry.mc_username} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-white">{entry.mc_username || entry.mc_uuid}</div>
            <div className="truncate text-[10px] font-bold text-slate-500">{entry.season}</div>
          </div>
          <div className="shrink-0 text-base font-black tabular-nums text-sky-300">
            {entry.value.toLocaleString()}{suffix ?? ""}
          </div>
        </div>
      )}
    </div>
  );
}
function SecTitle({ title }: { title: string }) {
  return <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">{title}</h3>;
}
function awardLabel(type: string) {
  return type.startsWith("Single Game Record:")
    ? `${type.replace("Single Game Record:", "Single Game").trim()} Record`
    : type;
}

type StatRow = {
  mc_uuid: string; mc_username: string; rank: number; gp: number;
  ppg: number | null; rpg: number | null; orpg: number | null; drpg: number | null;
  apg: number | null;
  spg: number | null; bpg: number | null; fg_pct: number | null; three_pt_pct: number | null;
  mpg: number | null; topg: number | null;
  tppg: number | null;
  pass_attempts_pg: number | null;
  possession_time_pg: number | null;
  vorp: number | null;
  team?: { id: string; name: string; abbreviation: string; logo_url?: string | null } | null;
};

type SortKey = "gp" | "ppg" | "rpg" | "orpg" | "drpg" | "apg" | "spg" | "bpg" | "fg_pct" | "three_pt_pct" | "mpg" | "topg" | "tppg" | "pass_attempts_pg" | "possession_time_pg" | "vorp";
type StatType = "regular" | "playoffs" | "total";

type TeamStatRow = {
  team: { id: string; name: string; abbreviation: string; logo_url: string | null };
  gp: number;
  ppg: number | null; rpg: number | null; apg: number | null;
  spg: number | null; bpg: number | null; topg: number | null; fg_pct: number | null;
  opp_ppg: number | null; opp_rpg: number | null; opp_apg: number | null;
  opp_spg: number | null; opp_bpg: number | null; opp_topg: number | null; opp_fg_pct: number | null;
  diff: number | null;
};
type TeamSortKey = "ppg"|"rpg"|"apg"|"spg"|"bpg"|"topg"|"fg_pct"|"opp_ppg"|"opp_rpg"|"opp_apg"|"opp_spg"|"opp_bpg"|"opp_topg"|"opp_fg_pct"|"diff"|"gp";

const PAGE_SIZE = 10;

const COLS: { key: SortKey | "_rank" | "_player"; label: string; always?: boolean }[] = [
  { key: "_rank",             label: "#",       always: true },
  { key: "_player",           label: "Player",  always: true },
  { key: "gp",                label: "GP",      always: true },
  { key: "ppg",               label: "PPG",     always: true },
  { key: "rpg",               label: "RPG",     always: true },
  { key: "orpg",              label: "ORPG",    always: true },
  { key: "drpg",              label: "DRPG",    always: true },
  { key: "apg",               label: "APG",     always: true },
  { key: "spg",               label: "SPG",     always: true },
  { key: "bpg",               label: "BPG",     always: true },
  { key: "topg",              label: "TOPG",    always: true },
  { key: "tppg",              label: "3PG",     always: true },
  { key: "fg_pct",            label: "FG%",     always: true },
  { key: "three_pt_pct",      label: "3FG%",    always: true },
  { key: "mpg",               label: "MPG",     always: false },
  { key: "pass_attempts_pg",  label: "PAPG",    always: true },
  { key: "possession_time_pg",label: "POSS",    always: true },
  { key: "vorp",              label: "VORP",    always: false },
];

export default function StatsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [stats, setStats] = React.useState<StatRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [regularSeasons, setRegularSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState("");
  const [statType, setStatType] = React.useState<StatType>("regular");
  const [sortKey, setSortKey] = React.useState<SortKey>("ppg");
  const [sortAsc, setSortAsc] = React.useState(false);
  const [page, setPage] = React.useState(0);

  const [viewMode, setViewMode] = React.useState<"player" | "team" | "accolades">("player");
  const [teamStats, setTeamStats] = React.useState<TeamStatRow[]>([]);
  const [teamSortKey, setTeamSortKey] = React.useState<TeamSortKey>("ppg");
  const [teamSortAsc, setTeamSortAsc] = React.useState(false);
  const [teamView, setTeamView] = React.useState<"for"|"against">("for");

  // Accolades state
  const [accolades, setAccolades] = React.useState<Accolade[]>([]);
  const [gameRecords, setGameRecords] = React.useState<Accolade[]>([]);
  const [records, setRecords] = React.useState<Records | null>(null);
  const [accoladesLoading, setAccoladesLoading] = React.useState(false);
  const [accoladesLoaded, setAccoladesLoaded] = React.useState(false);
  const [accoladeSeason, setAccoladeSeason] = React.useState("All");

  const seasonNum = parseInt(season.replace(/\D/g, "")) || 0;
  const showMpg = seasonNum >= 6;
  const showVorp = season === "all" || seasonNum >= 6;

  // Load unique regular seasons only
  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then((r) => r.json())
      .then((data: { season: string }[]) => {
        if (Array.isArray(data) && data.length > 0) {
          const reg = [...new Set(
            data.map((d) => d.season).filter((s) => s && !s.toLowerCase().includes("playoff"))
          )].sort((a, b) => b.localeCompare(a));
          setRegularSeasons(reg);
          if (reg.length > 0) setSeason(reg[0]);
        }
      }).catch(() => {});
  }, [slug]);

  // Fetch stats whenever season or type changes
  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    setPage(0);
    const s = season === "all" ? "all" : encodeURIComponent(season);
    let url: string;
    if (statType === "total") {
      // Regular + playoffs combined for the selected season
      url = `/api/stats?league=${slug}&season=${s}&type=combined`;
    } else if (statType === "playoffs") {
      url = `/api/stats?league=${slug}&season=${s}&type=playoffs`;
    } else {
      url = `/api/stats?league=${slug}&season=${s}`;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setStats(Array.isArray(data) ? data : []); setLoading(false); });
  }, [slug, season, statType]);

  // Fetch team stats for all stat types
  React.useEffect(() => {
    if (!slug || !season) { setTeamStats([]); return; }
    const s = season === "all" ? "all" : encodeURIComponent(season);
    let url: string;
    if (statType === "total") {
      url = `/api/stats/team-stats?league=${slug}&season=${s}&type=combined`;
    } else if (statType === "playoffs") {
      url = `/api/stats/team-stats?league=${slug}&season=${s}&type=playoffs`;
    } else {
      url = `/api/stats/team-stats?league=${slug}&season=${s}`;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => setTeamStats(Array.isArray(data) ? data : []))
      .catch(() => setTeamStats([]));
  }, [slug, season, statType]);

  // Load accolades lazily the first time the tab is opened
  React.useEffect(() => {
    if (!slug || viewMode !== "accolades" || accoladesLoaded) return;
    setAccoladesLoading(true);
    Promise.all([
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/stats/records?league=${slug}`).then(r => r.json()),
    ]).then(([accoladesData, recordsData]) => {
      const all = Array.isArray(accoladesData) ? accoladesData : [];
      setGameRecords(all.filter((a: Accolade) => a.type.startsWith("Single Game Record:")));
      setAccolades(all.filter((a: Accolade) => a.type !== "Finals Champion" && !a.type.startsWith("Single Game Record:")));
      setRecords(recordsData && !recordsData.error ? recordsData : null);
      setAccoladesLoading(false);
      setAccoladesLoaded(true);
    }).catch(() => setAccoladesLoading(false));
  }, [slug, viewMode, accoladesLoaded]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  };

  const handleTeamSort = (key: TeamSortKey) => {
    if (teamSortKey === key) setTeamSortAsc((a) => !a);
    else { setTeamSortKey(key); setTeamSortAsc(false); }
  };

  const sortedTeamStats = React.useMemo(() => {
    return [...teamStats].sort((a, b) => {
      const av = (a[teamSortKey] as number | null) ?? -999;
      const bv = (b[teamSortKey] as number | null) ?? -999;
      return teamSortAsc ? av - bv : bv - av;
    });
  }, [teamStats, teamSortKey, teamSortAsc]);

  const sorted = React.useMemo(() => {
    return [...stats].sort((a, b) => {
      const av = (a[sortKey] as number | null) ?? -1;
      const bv = (b[sortKey] as number | null) ?? -1;
      return sortAsc ? av - bv : bv - av;
    });
  }, [stats, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const fmt = (v: number | null | undefined, dec = 1) =>
    v != null ? v.toFixed(dec) : "—";

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-slate-600">↕</span>;
    return <span className="ml-1 text-blue-300">{sortAsc ? "↑" : "↓"}</span>;
  };

  const thClass = (col: SortKey | "_rank" | "_player", isPlayer = false) => {
    const isActive = col === sortKey;
    return `px-3 py-2 text-[10px] font-bold uppercase tracking-widest select-none transition ${
      isPlayer
        ? "text-left text-slate-500"
        : `text-center cursor-pointer ${isActive ? "text-blue-400 bg-blue-950/30" : "text-slate-600 hover:text-slate-300"}`
    }`;
  };

  // Returns extra classes for a data cell based on whether its column is sorted
  const tdHighlight = (col: SortKey) =>
    col === sortKey ? "bg-blue-950/20 text-white font-bold" : "";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 bg-slate-950">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">{leagueDisplay}</div>
          <h2 className="text-2xl font-black text-white leading-tight">Stats</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Player stats, team stats, advanced stats, accolades, and records. Playmaking now adjusts turnovers by possession time.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {viewMode !== "accolades" && (
            <Link
              href={`/${slug}/players/advanced`}
              className="rounded-md border border-cyan-900/70 bg-cyan-950/40 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:border-cyan-600 hover:bg-cyan-900/50 transition"
            >
              Advanced Player Lab
            </Link>
          )}
          {/* Player / Team / Accolades toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            {(["player", "team", "accolades"] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-2 font-black transition ${
                  viewMode === v
                    ? v === "accolades" ? "bg-red-600 text-white" : "bg-blue-600 text-white"
                    : v === "accolades" ? "bg-red-950/40 text-red-200 hover:bg-red-900/60 hover:text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}>
                {v === "player" ? "Players" : v === "team" ? "Teams" : "Accolades & Records"}
              </button>
            ))}
          </div>
          {/* Stat type + season — hidden on Accolades tab */}
          {viewMode !== "accolades" && (
            <>
              <div className="flex rounded-md border border-slate-700 overflow-hidden text-xs">
                {(["regular", "playoffs", "total"] as StatType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setStatType(t)}
                    className={`px-3 py-1.5 font-semibold capitalize transition whitespace-nowrap ${
                      statType === t ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                    }`}
                  >
                    {t === "total" ? "Combined" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <select
                className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-zinc-500 focus:outline-none"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                <option value="all">All Time</option>
                {regularSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
        </div>
      </div>

      {viewMode === "player" && (loading ? (
        <div className="p-10 text-center text-slate-500">Loading stats...</div>
      ) : stats.length === 0 ? (
        <div className="p-10 text-center text-slate-500">
          No {statType === "playoffs" ? "playoff" : statType === "total" ? "combined" : "regular season"} stats for {season === "all" ? "all time" : season} yet.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className={thClass("_rank")}>#</th>
                  <th className={thClass("_player", true)}>Player</th>
                  {COLS.filter((c) => c.key !== "_rank" && c.key !== "_player" && (c.key !== "mpg" || showMpg) && (c.key !== "vorp" || showVorp)).map((c) => (
                    <th
                      key={c.key}
                      className={thClass(c.key as SortKey)}
                      onClick={() => handleSort(c.key as SortKey)}
                    >
                      {c.label}<SortIcon col={c.key as SortKey} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {pageRows.map((s, i) => (
                  <tr key={s.mc_uuid} className="hover:bg-slate-800/20 transition">
                    <td className="px-3 py-2.5 text-center text-slate-600 text-xs font-mono w-8">{page * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <img src={`https://minotar.net/avatar/${s.mc_username}/28`} alt={s.mc_username} className="w-7 h-7 rounded-md ring-1 ring-slate-700 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }} />
                        <div>
                          <div className="font-semibold text-white text-sm leading-tight">{s.mc_username}</div>
                          {s.team && (
                            <a
                              href={`/${slug}/teams?team=${s.team.id}&season=${encodeURIComponent(season)}`}
                              className="flex items-center gap-1 mt-0.5 hover:opacity-80 transition"
                            >
                              {s.team.logo_url && <img src={s.team.logo_url} alt={s.team.name} className="w-3.5 h-3.5 object-contain flex-shrink-0" />}
                              <span className="text-xs text-slate-500">{s.team.name}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 py-2.5 text-center text-slate-500 ${tdHighlight("gp")}`}>{s.gp}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("ppg") || "text-slate-200"}`}>{fmt(s.ppg)}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("rpg") || "text-slate-300"}`}>{fmt(s.rpg)}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("orpg") || "text-slate-400"}`}>{s.orpg != null ? fmt(s.orpg) : <span className="text-slate-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("drpg") || "text-slate-400"}`}>{s.drpg != null ? fmt(s.drpg) : <span className="text-slate-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("apg") || "text-slate-300"}`}>{fmt(s.apg)}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("spg") || "text-slate-300"}`}>{fmt(s.spg)}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("bpg") || "text-slate-300"}`}>{fmt(s.bpg)}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("topg") || "text-slate-300"}`}>{fmt(s.topg)}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("tppg") || "text-slate-400"}`}>{s.tppg != null ? fmt(s.tppg) : <span className="text-slate-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("fg_pct") || "text-slate-300"}`}>{s.fg_pct != null ? `${s.fg_pct.toFixed(1)}%` : "—"}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("three_pt_pct") || "text-slate-300"}`}>{s.three_pt_pct != null ? `${s.three_pt_pct.toFixed(1)}%` : "—"}</td>
                    {showMpg && <td className={`px-3 py-2.5 text-center ${tdHighlight("mpg") || "text-slate-300"}`}>{fmt(s.mpg)}</td>}
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("pass_attempts_pg") || "text-slate-400"}`}>{s.pass_attempts_pg != null ? fmt(s.pass_attempts_pg) : <span className="text-slate-700">—</span>}</td>
                    <td className={`px-3 py-2.5 text-center ${tdHighlight("possession_time_pg") || "text-slate-400"}`}>{s.possession_time_pg != null ? `${s.possession_time_pg}s` : <span className="text-slate-700">—</span>}</td>
                    {showVorp && <td className={`px-3 py-2.5 text-center font-mono ${tdHighlight("vorp") || (s.vorp != null ? (s.vorp >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-700")}`}>{s.vorp != null ? (s.vorp >= 0 ? `+${s.vorp.toFixed(1)}` : s.vorp.toFixed(1)) : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800">
              <span className="text-xs text-slate-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length} players
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs text-slate-400">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      ))}

      {/* ── Accolades ── */}
      {viewMode === "accolades" && (() => {
        const availableSeasons = [...new Set(accolades.map(a => a.season.replace(/ Playoffs$/, "")))].sort();
        const filtered = accoladeSeason === "All" ? accolades : accolades.filter(a => a.season === accoladeSeason || a.season === `${accoladeSeason} Playoffs`);
        const groupedSeasons = [...new Set(filtered.map(a => a.season))].sort((a, b) => b.localeCompare(a));
        const singleGameMap = gameRecords.reduce<Record<string, RecordEntry>>((map, a) => {
          const key = a.type.replace("Single Game Record:", "").trim().toLowerCase();
          const value = parseFloat((a.description ?? "").match(/^(\d+(\.\d+)?)/)?.[1] ?? "0");
          map[key] = { mc_uuid: a.mc_uuid, mc_username: a.players?.mc_username ?? a.mc_uuid, value, season: a.season };
          return map;
        }, {});

        return (
          <div>
            {accoladesLoading ? (
              <div className="p-12 text-center text-slate-500">Loading...</div>
            ) : (
              <div className="space-y-0">
                {/* Records */}
                {records && (
                  <div className="border-b border-slate-800">
                    <div className="px-5 py-4 border-b border-slate-800">
                      <h2 className="text-sm font-bold text-white">Records</h2>
                      <p className="mt-0.5 text-xs text-slate-500">All-time bests from box scores</p>
                    </div>
                    <div className="space-y-6 p-4">
                      {Object.keys(singleGameMap).length > 0 && (
                        <section>
                          <SecTitle title="Single Game" />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            <RecordCard label="Most Points in a Game" entry={singleGameMap.pts} />
                            <RecordCard label="Most Rebounds in a Game" entry={singleGameMap.reb} />
                            <RecordCard label="Most Assists in a Game" entry={singleGameMap.ast} />
                            <RecordCard label="Most Steals in a Game" entry={singleGameMap.stl} />
                            <RecordCard label="Most Blocks in a Game" entry={singleGameMap.blk} />
                            <RecordCard label="Most Turnovers in a Game" entry={singleGameMap.tov} />
                          </div>
                        </section>
                      )}
                      <section>
                        <SecTitle title="Season Totals" />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <RecordCard label="Most Points" entry={records.season?.points} />
                          <RecordCard label="Most Assists" entry={records.season?.assists} />
                          <RecordCard label="Most Rebounds" entry={records.season?.rebounds} />
                          <RecordCard label="Most Steals" entry={records.season?.steals} />
                          <RecordCard label="Most Blocks" entry={records.season?.blocks} />
                        </div>
                      </section>
                      <section>
                        <SecTitle title="Season Averages" />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <RecordCard label="Highest PPG" entry={records.seasonAvg?.ppg} suffix=" PPG" />
                          <RecordCard label="Highest APG" entry={records.seasonAvg?.apg} suffix=" APG" />
                          <RecordCard label="Highest RPG" entry={records.seasonAvg?.rpg} suffix=" RPG" />
                          <RecordCard label="Highest SPG" entry={records.seasonAvg?.spg} suffix=" SPG" />
                          <RecordCard label="Highest BPG" entry={records.seasonAvg?.bpg} suffix=" BPG" />
                        </div>
                      </section>
                      <section>
                        <SecTitle title="Career Totals" />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                          <RecordCard label="Career Points" entry={records.career?.points} />
                          <RecordCard label="Career Assists" entry={records.career?.assists} />
                          <RecordCard label="Career Rebounds" entry={records.career?.rebounds} />
                          <RecordCard label="Career Steals" entry={records.career?.steals} />
                          <RecordCard label="Career Blocks" entry={records.career?.blocks} />
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {/* Award History */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                    <div>
                      <h2 className="text-sm font-bold text-white">Award History</h2>
                    </div>
                    <div className="flex overflow-x-auto rounded-lg border border-slate-700 text-xs">
                      {["All", ...availableSeasons].map((s) => (
                        <button key={s} type="button" onClick={() => setAccoladeSeason(s)}
                          className={`whitespace-nowrap px-3 py-2 font-bold transition ${accoladeSeason === s ? "bg-red-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  {filtered.length === 0 ? (
                    <div className="p-12 text-center text-slate-500">No accolades for {accoladeSeason === "All" ? "this league" : accoladeSeason} yet.</div>
                  ) : (
                    <div className="space-y-5 p-4">
                      {groupedSeasons.map((s) => (
                        <section key={s}>
                          <SecTitle title={s} />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {filtered.filter(a => a.season === s).sort((a, b) => {
                              const order: Record<string, number> = { MVP: 0, OPY: 1, DPOY: 2 };
                              return (order[a.type] ?? 99) - (order[b.type] ?? 99) || a.type.localeCompare(b.type);
                            }).map((a) => {
                              const username = a.players?.mc_username ?? a.mc_uuid;
                              return (
                                <div key={a.id} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 transition hover:border-slate-600">
                                  <div className="mb-3 flex items-center gap-3">
                                    <PlayerFace username={username} />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-black text-white">{username}</div>
                                      <div className="text-[10px] font-bold text-slate-500">{a.season}</div>
                                    </div>
                                  </div>
                                  <div className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2">
                                    <div className="text-xs font-black text-white">{awardLabel(a.type)}</div>
                                    {a.description && <div className="mt-1 text-[11px] text-slate-400">{a.description}</div>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Team Stats ── */}
      {viewMode === "team" && (
        <div>
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <p className="text-slate-500 text-xs">
              {season === "all"
                ? statType === "playoffs" ? "All Time · Playoffs" : statType === "total" ? "All Time · Regular + Playoffs" : "All Time · Regular Season"
                : statType === "playoffs" ? `${season} Playoffs`
                : statType === "total" ? `${season} · Regular + Playoffs`
                : season
              } · Per Game
            </p>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              {(["for", "against"] as const).map((v) => (
                <button key={v} onClick={() => setTeamView(v)}
                  className={`px-4 py-1.5 font-semibold capitalize transition ${
                    teamView === v ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                  }`}>
                  {v === "for" ? "Offense" : "Defense (Opp)"}
                </button>
              ))}
            </div>
          </div>

          {teamStats.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No team stats yet for {season === "all" ? "all time" : season}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Team</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600 cursor-pointer hover:text-slate-300" onClick={() => handleTeamSort("gp")}>
                      GP {teamSortKey === "gp" ? (teamSortAsc ? "↑" : "↓") : <span className="text-slate-700">↕</span>}
                    </th>
                    {(teamView === "for"
                      ? [
                          { key: "ppg" as TeamSortKey,    label: "PPG" },
                          { key: "rpg" as TeamSortKey,    label: "RPG" },
                          { key: "apg" as TeamSortKey,    label: "APG" },
                          { key: "spg" as TeamSortKey,    label: "SPG" },
                          { key: "bpg" as TeamSortKey,    label: "BPG" },
                          { key: "topg" as TeamSortKey,   label: "TOPG" },
                          { key: "fg_pct" as TeamSortKey, label: "FG%" },
                          { key: "diff" as TeamSortKey,   label: "+/-" },
                        ]
                      : [
                          { key: "opp_ppg" as TeamSortKey,    label: "OPP PPG" },
                          { key: "opp_rpg" as TeamSortKey,    label: "OPP RPG" },
                          { key: "opp_apg" as TeamSortKey,    label: "OPP APG" },
                          { key: "opp_spg" as TeamSortKey,    label: "OPP SPG" },
                          { key: "opp_bpg" as TeamSortKey,    label: "OPP BPG" },
                          { key: "opp_topg" as TeamSortKey,   label: "OPP TOPG" },
                          { key: "opp_fg_pct" as TeamSortKey, label: "OPP FG%" },
                          { key: "diff" as TeamSortKey,       label: "+/-" },
                        ]
                    ).map(({ key, label }) => (
                      <th key={key}
                        className={`px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest cursor-pointer transition select-none ${
                          teamSortKey === key ? "text-blue-400 bg-blue-950/30" : "text-slate-600 hover:text-slate-300"
                        }`}
                        onClick={() => handleTeamSort(key)}>
                        {label} {teamSortKey === key ? (teamSortAsc ? "↑" : "↓") : <span className="text-slate-700">↕</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {sortedTeamStats.map((row) => {
                    const f = (v: number | null) => v != null ? v.toFixed(1) : "—";
                    const fPct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
                    const diffVal = row.diff ?? 0;
                    const diffColor = diffVal > 0 ? "text-green-400" : diffVal < 0 ? "text-red-400" : "text-slate-500";
                    const hl = (key: TeamSortKey) => teamSortKey === key ? "bg-blue-950/20 font-semibold text-white" : "text-slate-300";
                    return (
                      <tr key={row.team.id} className="hover:bg-slate-800/20 transition">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {row.team.logo_url
                              ? <img src={row.team.logo_url} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                              : <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-[10px] font-bold flex-shrink-0">{row.team.abbreviation}</div>
                            }
                            <span className="font-semibold text-white text-sm">{row.team.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-500">{row.gp}</td>
                        {teamView === "for" ? (
                          <>
                            <td className={`px-3 py-2.5 text-center ${hl("ppg")}`}>{f(row.ppg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("rpg")}`}>{f(row.rpg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("apg")}`}>{f(row.apg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("spg")}`}>{f(row.spg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("bpg")}`}>{f(row.bpg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("topg")}`}>{f(row.topg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("fg_pct")}`}>{fPct(row.fg_pct)}</td>
                            <td className={`px-3 py-2.5 text-center font-semibold ${diffColor} ${hl("diff")}`}>{row.diff != null ? (row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)) : "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_ppg")}`}>{f(row.opp_ppg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_rpg")}`}>{f(row.opp_rpg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_apg")}`}>{f(row.opp_apg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_spg")}`}>{f(row.opp_spg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_bpg")}`}>{f(row.opp_bpg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_topg")}`}>{f(row.opp_topg)}</td>
                            <td className={`px-3 py-2.5 text-center ${hl("opp_fg_pct")}`}>{fPct(row.opp_fg_pct)}</td>
                            <td className={`px-3 py-2.5 text-center font-semibold ${diffColor} ${hl("diff")}`}>{row.diff != null ? (row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)) : "—"}</td>
                          </>
                        )}
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
  );
}

