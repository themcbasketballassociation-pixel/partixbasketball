"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type StatRow = {
  mc_uuid: string; mc_username: string; rank: number; gp: number;
  ppg: number | null; rpg: number | null; apg: number | null;
  spg: number | null; bpg: number | null; fg_pct: number | null; three_pt_pct: number | null;
  mpg: number | null; topg: number | null;
  tppg: number | null;
  pass_attempts_pg: number | null;
  possession_time_pg: number | null;
  team?: { id: string; name: string; abbreviation: string; logo_url?: string | null } | null;
};

type SortKey = "gp" | "ppg" | "rpg" | "apg" | "spg" | "bpg" | "fg_pct" | "three_pt_pct" | "mpg" | "topg" | "tppg" | "pass_attempts_pg" | "possession_time_pg";
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

  const [viewMode, setViewMode] = React.useState<"player" | "team">("player");
  const [teamStats, setTeamStats] = React.useState<TeamStatRow[]>([]);
  const [teamSortKey, setTeamSortKey] = React.useState<TeamSortKey>("ppg");
  const [teamSortAsc, setTeamSortAsc] = React.useState(false);
  const [teamView, setTeamView] = React.useState<"for"|"against">("for");

  const seasonNum = parseInt(season.replace(/\D/g, "")) || 0;
  const showMpg = seasonNum >= 6;

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
    return `px-4 py-4 text-xs font-bold uppercase tracking-widest select-none transition ${
      isPlayer
        ? "text-left text-slate-400"
        : `text-center cursor-pointer ${isActive ? "text-blue-400 bg-blue-950/40" : "text-slate-500 hover:text-white"}`
    }`;
  };

  // Returns extra classes for a data cell based on whether its column is sorted
  const tdHighlight = (col: SortKey) =>
    col === sortKey ? "bg-blue-950/20 text-white font-bold" : "";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Stats</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Player / Team toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            {(["player", "team"] as const).map((v) => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-4 py-1.5 font-semibold capitalize transition ${
                  viewMode === v ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}>
                {v === "player" ? "👤 Players" : "🏀 Teams"}
              </button>
            ))}
          </div>
          {/* Stat type toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            {(["regular", "playoffs", "total"] as StatType[]).map((t) => (
              <button
                key={t}
                onClick={() => setStatType(t)}
                className={`px-3 py-1.5 font-semibold capitalize transition whitespace-nowrap ${
                  statType === t ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {/* Season dropdown */}
          <select
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            <option value="all">All Time</option>
            {regularSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
            <table className="min-w-full text-base">
              <thead>
                <tr className="border-b-2 border-slate-800">
                  <th className={thClass("_rank")}>#</th>
                  <th className={thClass("_player", true)}>Player</th>
                  {COLS.filter((c) => c.key !== "_rank" && c.key !== "_player" && (c.key !== "mpg" || showMpg)).map((c) => (
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
              <tbody className="divide-y divide-slate-800/60">
                {pageRows.map((s, i) => (
                  <tr key={s.mc_uuid} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-4 text-center text-slate-500 text-sm font-mono w-10">{page * PAGE_SIZE + i + 1}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <img src={`https://minotar.net/avatar/${s.mc_username}/36`} alt={s.mc_username} className="w-9 h-9 rounded-lg ring-1 ring-slate-700 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }} />
                        <div>
                          <div className="font-bold text-white text-base">{s.mc_username}</div>
                          {s.team && (
                            <a
                              href={`/${slug}/teams?team=${s.team.id}&season=${encodeURIComponent(statType === "playoffs" ? season : season)}`}
                              className="flex items-center gap-1.5 mt-0.5 hover:opacity-80 transition"
                            >
                              {s.team.logo_url && <img src={s.team.logo_url} alt={s.team.name} className="w-5 h-5 object-contain flex-shrink-0" />}
                              <span className="text-sm text-slate-300 font-medium">{s.team.name}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-4 text-center text-slate-400 text-base ${tdHighlight("gp")}`}>{s.gp}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("ppg") || "text-slate-200"}`}>{fmt(s.ppg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("rpg") || "text-slate-300"}`}>{fmt(s.rpg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("apg") || "text-slate-300"}`}>{fmt(s.apg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("spg") || "text-slate-300"}`}>{fmt(s.spg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("bpg") || "text-slate-300"}`}>{fmt(s.bpg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("topg") || "text-slate-300"}`}>{fmt(s.topg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("tppg") || "text-slate-300"}`}>{s.tppg != null ? fmt(s.tppg) : <span className="text-slate-600">N/A</span>}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("fg_pct") || "text-slate-300"}`}>{s.fg_pct != null ? `${s.fg_pct.toFixed(1)}%` : "—"}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("three_pt_pct") || "text-slate-300"}`}>{s.three_pt_pct != null ? `${s.three_pt_pct.toFixed(1)}%` : "—"}</td>
                    {showMpg && <td className={`px-4 py-4 text-center text-base ${tdHighlight("mpg") || "text-slate-300"}`}>{fmt(s.mpg)}</td>}
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("pass_attempts_pg") || "text-slate-300"}`}>{s.pass_attempts_pg != null ? fmt(s.pass_attempts_pg) : <span className="text-slate-600">N/A</span>}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("possession_time_pg") || "text-slate-300"}`}>{s.possession_time_pg != null ? `${s.possession_time_pg}s` : <span className="text-slate-600">N/A</span>}</td>
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
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-slate-400">Team</th>
                    <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white" onClick={() => handleTeamSort("gp")}>
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
                        className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-widest cursor-pointer transition select-none ${
                          teamSortKey === key ? "text-blue-400 bg-blue-950/40" : "text-slate-500 hover:text-white"
                        }`}
                        onClick={() => handleTeamSort(key)}>
                        {label} {teamSortKey === key ? (teamSortAsc ? "↑" : "↓") : <span className="text-slate-700">↕</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedTeamStats.map((row) => {
                    const f = (v: number | null) => v != null ? v.toFixed(1) : "—";
                    const fPct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
                    const diffVal = row.diff ?? 0;
                    const diffColor = diffVal > 0 ? "text-green-400" : diffVal < 0 ? "text-red-400" : "text-slate-400";
                    const hl = (key: TeamSortKey) => teamSortKey === key ? "bg-blue-950/20 font-bold text-white" : "text-slate-300";
                    return (
                      <tr key={row.team.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {row.team.logo_url
                              ? <img src={row.team.logo_url} alt="" className="w-7 h-7 object-contain flex-shrink-0" />
                              : <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold flex-shrink-0">{row.team.abbreviation}</div>
                            }
                            <div>
                              <div className="font-bold text-white text-sm">{row.team.name}</div>
                              <div className="text-xs text-slate-500">{row.gp} GP</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-sm">{row.gp}</td>
                        {teamView === "for" ? (
                          <>
                            <td className={`px-4 py-3 text-center text-sm ${hl("ppg")}`}>{f(row.ppg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("rpg")}`}>{f(row.rpg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("apg")}`}>{f(row.apg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("spg")}`}>{f(row.spg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("bpg")}`}>{f(row.bpg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("topg")}`}>{f(row.topg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("fg_pct")}`}>{fPct(row.fg_pct)}</td>
                            <td className={`px-4 py-3 text-center text-sm font-bold ${diffColor} ${hl("diff")}`}>{row.diff != null ? (row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)) : "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_ppg")}`}>{f(row.opp_ppg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_rpg")}`}>{f(row.opp_rpg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_apg")}`}>{f(row.opp_apg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_spg")}`}>{f(row.opp_spg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_bpg")}`}>{f(row.opp_bpg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_topg")}`}>{f(row.opp_topg)}</td>
                            <td className={`px-4 py-3 text-center text-sm ${hl("opp_fg_pct")}`}>{fPct(row.opp_fg_pct)}</td>
                            <td className={`px-4 py-3 text-center text-sm font-bold ${diffColor} ${hl("diff")}`}>{row.diff != null ? (row.diff > 0 ? `+${row.diff.toFixed(1)}` : row.diff.toFixed(1)) : "—"}</td>
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

