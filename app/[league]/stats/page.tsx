"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

const SEASONS = [
  "Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7",
];

type TabType = "regular" | "playoffs" | "combined";
const TABS: { key: TabType; label: string }[] = [
  { key: "regular",  label: "Regular Season" },
  { key: "playoffs", label: "Playoffs" },
  { key: "combined", label: "Combined" },
];

type Team = { id: string; name: string; abbreviation: string };
type StatRow = {
  rank: number;
  mc_uuid: string;
  mc_username: string;
  team: Team | null;
  gp: number | null;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pt_made: number | null;
  tppg: number | null;
  three_pt_pct: number | null;
  topg: number | null;
  pass_attempts_pg: number | null;
  possession_time_pg: number | null;
};

const na = (v: number | null | undefined) => (v == null ? "—" : v);

function r1(n: number) { return Math.round(n * 10) / 10; }

// Compute totals from averages × GP
function computeTotals(row: StatRow) {
  const g = row.gp ?? 0;
  return {
    pts:  g && row.ppg  != null ? Math.round(row.ppg  * g) : null,
    reb:  g && row.rpg  != null ? Math.round(row.rpg  * g) : null,
    ast:  g && row.apg  != null ? Math.round(row.apg  * g) : null,
    stl:  g && row.spg  != null ? Math.round(row.spg  * g) : null,
    blk:  g && row.bpg  != null ? Math.round(row.bpg  * g) : null,
    to:   g && row.topg != null ? Math.round(row.topg * g) : null,
    pass: g && row.pass_attempts_pg  != null ? Math.round(row.pass_attempts_pg  * g) : null,
    poss: g && row.possession_time_pg != null ? Math.round(row.possession_time_pg * g) : null,
  };
}

export default function StatsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [season, setSeason] = React.useState(SEASONS[SEASONS.length - 1]);
  const [tab, setTab] = React.useState<TabType>("regular");
  const [rows, setRows] = React.useState<StatRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"avg" | "total">("avg");
  const [sortKey, setSortKey] = React.useState<string>("ppg");
  const [sortDir, setSortDir] = React.useState<"desc" | "asc">("desc");
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 10;

  const apiSeason = season === "All Time" ? "all" : season;

  React.useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/stats?league=${encodeURIComponent(slug)}&season=${encodeURIComponent(apiSeason)}&type=${tab}`)
      .then((r) => r.json())
      .then((d) => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, apiSeason, tab]);

  // Reset sort key + page when switching view modes
  React.useEffect(() => {
    setSortKey(viewMode === "avg" ? "ppg" : "pts");
    setSortDir("desc");
    setPage(1);
  }, [viewMode]);

  // Reset page when season or tab changes
  React.useEffect(() => { setPage(1); }, [tab, apiSeason]);

  const handleSort = (key: string) => {
    setPage(1);
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Build sortable value for each row
  function getSortVal(row: StatRow, key: string): number {
    if (viewMode === "avg") {
      if (key === "ast_pass") {
        const ap = row.apg != null && row.pass_attempts_pg != null && row.pass_attempts_pg > 0
          ? r1(row.apg / row.pass_attempts_pg) : null;
        return ap ?? -Infinity;
      }
      const v = (row as Record<string, unknown>)[key] as number | null;
      return v ?? -Infinity;
    } else {
      // totals mode
      const tots = computeTotals(row);
      if (key in tots) return (tots as Record<string, number | null>)[key] ?? -Infinity;
      if (key === "gp") return row.gp ?? -Infinity;
      if (key === "three_pt_made") return row.three_pt_made ?? -Infinity;
      return -Infinity;
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = getSortVal(a, sortKey);
    const bv = getSortVal(b, sortKey);
    const diff = bv - av;
    return sortDir === "desc" ? diff : -diff;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Average-mode columns
  type ColDef = { key: string; label: string; title: string };
  const avgCols: ColDef[] = [
    { key: "gp",               label: "GP",       title: "Games Played" },
    { key: "ppg",              label: "PPG",      title: "Points Per Game" },
    { key: "rpg",              label: "RPG",      title: "Rebounds Per Game" },
    { key: "apg",              label: "APG",      title: "Assists Per Game" },
    { key: "spg",              label: "SPG",      title: "Steals Per Game" },
    { key: "bpg",              label: "BPG",      title: "Blocks Per Game" },
    { key: "topg",             label: "TO/G",     title: "Turnovers Per Game" },
    { key: "fg_pct",           label: "FG%",      title: "Field Goal %" },
    { key: "three_pt_made",    label: "3s",       title: "Total 3-Pointers Made" },
    { key: "tppg",             label: "3PPG",     title: "3-Pointers Per Game" },
    { key: "three_pt_pct",     label: "3FG%",     title: "3-Point %" },
    { key: "pass_attempts_pg", label: "PASS/G",   title: "Pass Attempts Per Game" },
    { key: "possession_time_pg", label: "POSS/G", title: "Avg Possession Seconds Per Game" },
    { key: "ast_pass",         label: "AST/PASS", title: "Assists to Pass Attempt Ratio" },
  ];

  // Totals-mode columns
  const totalCols: ColDef[] = [
    { key: "gp",            label: "GP",   title: "Games Played" },
    { key: "pts",           label: "PTS",  title: "Total Points" },
    { key: "reb",           label: "REB",  title: "Total Rebounds" },
    { key: "ast",           label: "AST",  title: "Total Assists" },
    { key: "stl",           label: "STL",  title: "Total Steals" },
    { key: "blk",           label: "BLK",  title: "Total Blocks" },
    { key: "to",            label: "TO",   title: "Total Turnovers" },
    { key: "three_pt_made", label: "3s",   title: "Total 3-Pointers Made" },
    { key: "pass",          label: "PASS", title: "Total Pass Attempts" },
    { key: "poss",          label: "POSS", title: "Total Possession Seconds" },
  ];

  const activeCols = viewMode === "avg" ? avgCols : totalCols;

  function renderCell(row: StatRow, key: string): string {
    if (viewMode === "avg") {
      if (key === "fg_pct" || key === "three_pt_pct") {
        const v = (row as Record<string, unknown>)[key] as number | null;
        return v == null || v === 0 ? "—" : `${v}%`;
      }
      if (key === "possession_time_pg") return String(na(row.possession_time_pg));
      if (key === "ast_pass") {
        if (row.apg == null || row.pass_attempts_pg == null || row.pass_attempts_pg === 0) return "—";
        return String(r1(row.apg / row.pass_attempts_pg));
      }
      const v = (row as Record<string, unknown>)[key] as number | null;
      return String(na(v));
    } else {
      // totals
      const tots = computeTotals(row);
      if (key === "gp") return String(na(row.gp));
      if (key === "three_pt_made") return String(na(row.three_pt_made));
      if (key === "poss") return String(na(tots.poss));
      if (key in tots) {
        const v = (tots as Record<string, number | null>)[key];
        return String(na(v));
      }
      return "—";
    }
  }

  const seasonOptions = ["All Time", ...SEASONS];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Player Stats</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Avg / Totals toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
            <button
              onClick={() => setViewMode("avg")}
              className={`px-3 py-1.5 font-medium transition ${viewMode === "avg" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              Averages
            </button>
            <button
              onClick={() => setViewMode("total")}
              className={`px-3 py-1.5 font-medium transition ${viewMode === "total" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"}`}
            >
              Totals
            </button>
          </div>
          <select
            className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            {seasonOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 px-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-blue-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading stats...</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-slate-500">
          No stats recorded for {season}{tab === "playoffs" ? " Playoffs" : tab === "combined" ? " (Regular + Playoffs)" : ""} yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-left">Team</th>
                {activeCols.map(({ key, label, title }) => (
                  <th
                    key={key}
                    title={title}
                    className={`px-3 py-3 text-right cursor-pointer select-none hover:text-white transition whitespace-nowrap ${sortKey === key ? "text-blue-400" : ""}`}
                    onClick={() => handleSort(key)}
                  >
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => {
                const globalRank = (page - 1) * PAGE_SIZE + i + 1;
                return (
                  <tr
                    key={row.mc_uuid}
                    className={`border-b border-slate-800/50 hover:bg-slate-800/40 transition ${globalRank === 1 ? "bg-slate-800/20" : ""}`}
                  >
                    <td className="px-4 py-3 text-slate-500 text-xs">{globalRank}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://minotar.net/avatar/${row.mc_username}/32`}
                          alt={row.mc_username}
                          className="w-8 h-8 rounded"
                          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }}
                        />
                        <span className="font-medium text-white">{row.mc_username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {row.team ? (row.team as Team).abbreviation : "—"}
                    </td>
                    {activeCols.map(({ key }) => (
                      <td
                        key={key}
                        className={`px-3 py-3 text-right tabular-nums ${sortKey === key ? "text-blue-300 font-semibold" : "text-slate-300"}`}
                      >
                        {renderCell(row, key)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
              <span className="text-sm text-slate-500">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length} players
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === "…" ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-slate-600 text-sm">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p as number)}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                          page === p
                            ? "bg-blue-600 text-white"
                            : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  Next ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1.5 rounded text-sm text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
