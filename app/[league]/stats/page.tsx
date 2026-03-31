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
  spg: number | null; bpg: number | null; fg_pct: number | null;
  mpg: number | null; topg: number | null;
};

type SortKey = "gp" | "ppg" | "rpg" | "apg" | "spg" | "bpg" | "fg_pct" | "mpg" | "topg";
type StatType = "regular" | "playoffs" | "combined";

const PAGE_SIZE = 10;

const COLS: { key: SortKey | "_rank" | "_player"; label: string; always?: boolean }[] = [
  { key: "_rank",    label: "#",      always: true },
  { key: "_player",  label: "Player", always: true },
  { key: "gp",       label: "GP",     always: true },
  { key: "ppg",      label: "PPG",    always: true },
  { key: "rpg",      label: "RPG",    always: true },
  { key: "apg",      label: "APG",    always: true },
  { key: "spg",      label: "SPG",    always: true },
  { key: "bpg",      label: "BPG",    always: true },
  { key: "topg",     label: "TOPG",   always: true },
  { key: "fg_pct",   label: "FG%",    always: true },
  { key: "mpg",      label: "MPG",    always: false },
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
    const fetchSeason = statType === "playoffs" ? `${season} Playoffs` : season;
    const typeParam = statType === "combined" ? "&type=combined" : "";
    fetch(`/api/stats?league=${slug}&season=${encodeURIComponent(fetchSeason)}${typeParam}`)
      .then((r) => r.json())
      .then((data) => { setStats(Array.isArray(data) ? data : []); setLoading(false); });
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
          {/* Stat type toggle */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            {(["regular", "playoffs", "combined"] as StatType[]).map((t) => (
              <button
                key={t}
                onClick={() => setStatType(t)}
                className={`px-3 py-1.5 font-semibold capitalize transition whitespace-nowrap ${
                  statType === t ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {t === "combined" ? "Total" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {/* Season dropdown — regular seasons only */}
          <select
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            {regularSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading stats...</div>
      ) : stats.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No {statType} stats for {season} yet.</div>
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
                        <span className="font-bold text-white text-base">{s.mc_username}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-4 text-center text-slate-400 text-base ${tdHighlight("gp")}`}>{s.gp}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("ppg") || "text-slate-200"}`}>{fmt(s.ppg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("rpg") || "text-slate-300"}`}>{fmt(s.rpg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("apg") || "text-slate-300"}`}>{fmt(s.apg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("spg") || "text-slate-300"}`}>{fmt(s.spg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("bpg") || "text-slate-300"}`}>{fmt(s.bpg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("topg") || "text-slate-300"}`}>{fmt(s.topg)}</td>
                    <td className={`px-4 py-4 text-center text-base ${tdHighlight("fg_pct") || "text-slate-300"}`}>{s.fg_pct != null ? `${s.fg_pct.toFixed(1)}%` : "—"}</td>
                    {showMpg && <td className={`px-4 py-4 text-center text-base ${tdHighlight("mpg") || "text-slate-300"}`}>{fmt(s.mpg)}</td>}
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
      )}
    </div>
  );
}
