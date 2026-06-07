"use client";

import Link from "next/link";
import React from "react";

type StatRow = {
  mc_uuid: string;
  mc_username: string;
  rank: number;
  gp: number;
  ppg: number | null;
  rpg: number | null;
  orpg: number | null;
  drpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pt_pct: number | null;
  mpg: number | null;
  topg: number | null;
  tppg: number | null;
  pass_attempts_pg: number | null;
  possession_time_pg: number | null;
  vorp: number | null;
  team?: { id: string; name: string; abbreviation: string; logo_url?: string | null } | null;
};

type SeasonRow = StatRow & {
  season: string;
  seasonNumber: number;
  recentWeight: number;
  weightedVorp: number | null;
  impactScore: number;
};

type PlayerSummary = {
  mc_uuid: string;
  mc_username: string;
  seasons: number;
  latestSeason: string;
  gp: number;
  ppg: number | null;
  apg: number | null;
  rpg: number | null;
  mpg: number | null;
  vorpTotal: number;
  recentVorp: number;
  peakVorp: number;
  latestTeam: SeasonRow["team"];
};

type SortKey =
  | "recentVorp"
  | "vorpTotal"
  | "peakVorp"
  | "seasonNumber"
  | "vorp"
  | "impactScore"
  | "ppg"
  | "apg"
  | "rpg"
  | "mpg"
  | "gp";

const fmt = (value: number | null | undefined, decimals = 1) =>
  value == null || Number.isNaN(value) ? "-" : value.toFixed(decimals);

const signed = (value: number | null | undefined, decimals = 1) => {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
};

const seasonNumber = (season: string) => parseInt(season.match(/\d+/)?.[0] ?? "0", 10);

const vorpColor = (value: number | null | undefined) => {
  if (value == null) return "text-slate-600";
  if (value >= 6) return "text-amber-300";
  if (value >= 2) return "text-emerald-300";
  if (value >= 0) return "text-cyan-300";
  if (value >= -2) return "text-orange-300";
  return "text-red-300";
};

const playerImpactScore = (row: StatRow) => {
  const scoring = row.ppg ?? 0;
  const boards = row.rpg ?? 0;
  const playmaking = row.apg ?? 0;
  const defense = (row.spg ?? 0) + (row.bpg ?? 0);
  const turnovers = row.topg ?? 0;
  const shooting = row.fg_pct != null ? (row.fg_pct - 45) / 4 : 0;
  return scoring + boards * 0.45 + playmaking * 0.75 + defense * 1.6 + shooting - turnovers * 1.1;
};

const recentWeightFor = (seasonNum: number, latestSeasonNum: number) => {
  const age = Math.max(0, latestSeasonNum - seasonNum);
  return Math.max(0.35, 1 - age * 0.15);
};

function PlayerCell({ row, league }: { row: Pick<SeasonRow, "mc_username" | "team">; league: string }) {
  return (
    <Link href={`/${league}/players/${encodeURIComponent(row.mc_username)}`} className="flex items-center gap-2.5 group">
      <img
        src={`https://minotar.net/avatar/${row.mc_username}/32`}
        alt=""
        className="h-8 w-8 rounded-md border border-slate-700 bg-slate-950"
        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }}
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-white group-hover:text-cyan-200">{row.mc_username}</div>
        <div className="truncate text-[11px] text-slate-500">{row.team?.abbreviation ?? "FA"}</div>
      </div>
    </Link>
  );
}

export default function AdvancedPlayerStatsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const league = resolved.league ?? "mba";

  const [rows, setRows] = React.useState<SeasonRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<"summary" | "season">("summary");
  const [seasonFilter, setSeasonFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("recentVorp");
  const [sortAsc, setSortAsc] = React.useState(false);
  const [statType, setStatType] = React.useState<"regular" | "combined">("regular");

  React.useEffect(() => {
    if (!league) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const seasonsRes = await fetch(`/api/stats/seasons?league=${league}`);
      const seasonData = await seasonsRes.json().catch(() => []);
      const regularSeasons = Array.isArray(seasonData)
        ? [...new Set(
            seasonData
              .map((s: { season?: string }) => s.season)
              .filter((s: string | undefined): s is string => !!s && !s.toLowerCase().includes("playoff"))
          )].sort((a, b) => seasonNumber(b) - seasonNumber(a))
        : [];

      const latestSeasonNum = Math.max(0, ...regularSeasons.map(seasonNumber));
      const fetched = await Promise.all(
        regularSeasons.map(async (season) => {
          const typeParam = statType === "combined" ? "&type=combined" : "";
          const res = await fetch(`/api/stats?league=${league}&season=${encodeURIComponent(season)}${typeParam}`);
          const data = await res.json().catch(() => []);
          if (!Array.isArray(data)) return [];
          const sNum = seasonNumber(season);
          const recentWeight = recentWeightFor(sNum, latestSeasonNum);
          return data.map((row: StatRow) => ({
            ...row,
            season,
            seasonNumber: sNum,
            recentWeight,
            weightedVorp: row.vorp == null ? null : row.vorp * recentWeight,
            impactScore: playerImpactScore(row),
          } satisfies SeasonRow));
        })
      );

      if (!cancelled) {
        setRows(fetched.flat());
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setRows([]);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [league, statType]);

  const seasons = React.useMemo(
    () => [...new Set(rows.map((row) => row.season))].sort((a, b) => seasonNumber(b) - seasonNumber(a)),
    [rows]
  );

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (seasonFilter !== "all" && row.season !== seasonFilter) return false;
      if (q && !row.mc_username.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, seasonFilter]);

  const summaries = React.useMemo<PlayerSummary[]>(() => {
    const byPlayer = new Map<string, SeasonRow[]>();
    for (const row of filteredRows) {
      if (!byPlayer.has(row.mc_uuid)) byPlayer.set(row.mc_uuid, []);
      byPlayer.get(row.mc_uuid)!.push(row);
    }

    return [...byPlayer.values()].map((playerRows) => {
      const sortedSeasons = [...playerRows].sort((a, b) => b.seasonNumber - a.seasonNumber);
      const weightedGp = playerRows.reduce((sum, row) => sum + (row.gp ?? 0), 0);
      const weightedMean = (key: keyof Pick<StatRow, "ppg" | "apg" | "rpg" | "mpg">) => {
        let total = 0;
        let gp = 0;
        for (const row of playerRows) {
          const value = row[key];
          if (value == null) continue;
          total += value * (row.gp ?? 0);
          gp += row.gp ?? 0;
        }
        return gp > 0 ? total / gp : null;
      };
      const vorps = playerRows.map((row) => row.vorp).filter((v): v is number => v != null);
      return {
        mc_uuid: sortedSeasons[0].mc_uuid,
        mc_username: sortedSeasons[0].mc_username,
        seasons: playerRows.length,
        latestSeason: sortedSeasons[0].season,
        gp: weightedGp,
        ppg: weightedMean("ppg"),
        apg: weightedMean("apg"),
        rpg: weightedMean("rpg"),
        mpg: weightedMean("mpg"),
        vorpTotal: vorps.reduce((sum, value) => sum + value, 0),
        recentVorp: playerRows.reduce((sum, row) => sum + (row.weightedVorp ?? 0), 0),
        peakVorp: vorps.length ? Math.max(...vorps) : 0,
        latestTeam: sortedSeasons[0].team,
      };
    });
  }, [filteredRows]);

  const sortedSummaries = React.useMemo(() => {
    return [...summaries].sort((a, b) => {
      const av = a[sortKey as keyof PlayerSummary];
      const bv = b[sortKey as keyof PlayerSummary];
      const an = typeof av === "number" ? av : 0;
      const bn = typeof bv === "number" ? bv : 0;
      return sortAsc ? an - bn : bn - an;
    });
  }, [summaries, sortKey, sortAsc]);

  const sortedSeasonRows = React.useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const av = (a[sortKey as keyof SeasonRow] as number | null | undefined) ?? -999;
      const bv = (b[sortKey as keyof SeasonRow] as number | null | undefined) ?? -999;
      return sortAsc ? av - bv : bv - av;
    });
  }, [filteredRows, sortKey, sortAsc]);

  const setSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const topPlayer = sortedSummaries[0] ?? null;
  const negativeSeasons = rows.filter((row) => (row.vorp ?? 0) < 0).length;
  const mvpSeasons = rows.filter((row) => (row.vorp ?? 0) >= 6).length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
        <div className="border-b border-slate-800 bg-slate-950/70 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Player lab</p>
              <h1 className="mt-1 text-2xl font-black text-white">Advanced Player Stats</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                VORP is now scaled like plus/minus: above-average seasons go positive,
                weak seasons can go negative, and recent seasons carry more weight in the summary.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <div className="text-lg font-black text-white">{summaries.length}</div>
                <div className="text-[10px] uppercase text-slate-500">Players</div>
              </div>
              <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2">
                <div className="text-lg font-black text-amber-300">{mvpSeasons}</div>
                <div className="text-[10px] uppercase text-slate-500">MVP level</div>
              </div>
              <div className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2">
                <div className="text-lg font-black text-red-300">{negativeSeasons}</div>
                <div className="text-[10px] uppercase text-slate-500">Negative</div>
              </div>
            </div>
          </div>

          {topPlayer && (
            <div className="mt-4 rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={`https://minotar.net/avatar/${topPlayer.mc_username}/40`}
                    className="h-10 w-10 rounded-lg border border-cyan-800 bg-slate-950"
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }}
                  />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Current advanced leader</div>
                    <Link href={`/${league}/players/${encodeURIComponent(topPlayer.mc_username)}`} className="text-lg font-black text-white hover:text-cyan-200">
                      {topPlayer.mc_username}
                    </Link>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-slate-500">Recent VORP <b className={vorpColor(topPlayer.recentVorp)}>{signed(topPlayer.recentVorp)}</b></span>
                  <span className="text-slate-500">Peak <b className={vorpColor(topPlayer.peakVorp)}>{signed(topPlayer.peakVorp)}</b></span>
                  <span className="text-slate-500">Latest <b className="text-white">{topPlayer.latestSeason}</b></span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
              {(["summary", "season"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={`px-3 py-2 font-bold capitalize transition ${view === mode ? "bg-cyan-700 text-white" : "bg-slate-950 text-slate-400 hover:text-white"}`}
                >
                  {mode === "summary" ? "Player Summary" : "Season Rows"}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-lg border border-slate-700 text-xs">
              {(["regular", "combined"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setStatType(mode)}
                  className={`px-3 py-2 font-bold capitalize transition ${statType === mode ? "bg-slate-700 text-white" : "bg-slate-950 text-slate-400 hover:text-white"}`}
                >
                  {mode === "combined" ? "Reg + Playoffs" : "Regular"}
                </button>
              ))}
            </div>
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
            >
              <option value="all">All seasons</option>
              {seasons.map((season) => <option key={season} value={season}>{season}</option>)}
            </select>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player..."
            className="w-52 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
          />
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading advanced stats...</div>
        ) : view === "summary" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Player</th>
                  {[
                    ["recentVorp", "Recent VORP"],
                    ["vorpTotal", "Total VORP"],
                    ["peakVorp", "Peak"],
                    ["gp", "GP"],
                    ["ppg", "PPG"],
                    ["rpg", "RPG"],
                    ["apg", "APG"],
                    ["mpg", "MPG"],
                  ].map(([key, label]) => (
                    <th key={key} onClick={() => setSort(key as SortKey)} className="cursor-pointer px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-cyan-200">
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Seasons</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedSummaries.map((row) => (
                  <tr key={row.mc_uuid} className="hover:bg-slate-800/25">
                    <td className="px-4 py-3">
                      <PlayerCell row={{ mc_username: row.mc_username, team: row.latestTeam }} league={league} />
                    </td>
                    <td className={`px-3 py-3 text-center font-mono font-black ${vorpColor(row.recentVorp)}`}>{signed(row.recentVorp)}</td>
                    <td className={`px-3 py-3 text-center font-mono ${vorpColor(row.vorpTotal)}`}>{signed(row.vorpTotal)}</td>
                    <td className={`px-3 py-3 text-center font-mono ${vorpColor(row.peakVorp)}`}>{signed(row.peakVorp)}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{row.gp}</td>
                    <td className="px-3 py-3 text-center text-slate-200">{fmt(row.ppg)}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{fmt(row.rpg)}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{fmt(row.apg)}</td>
                    <td className="px-3 py-3 text-center text-slate-400">{fmt(row.mpg)}</td>
                    <td className="px-3 py-3 text-center text-slate-400">{row.seasons}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Player</th>
                  {[
                    ["seasonNumber", "Season"],
                    ["vorp", "VORP"],
                    ["impactScore", "Impact"],
                    ["gp", "GP"],
                    ["mpg", "MPG"],
                    ["ppg", "PPG"],
                    ["rpg", "RPG"],
                    ["apg", "APG"],
                  ].map(([key, label]) => (
                    <th key={key} onClick={() => setSort(key as SortKey)} className="cursor-pointer px-3 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-cyan-200">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sortedSeasonRows.map((row) => (
                  <tr key={`${row.mc_uuid}-${row.season}`} className="hover:bg-slate-800/25">
                    <td className="px-4 py-3">
                      <PlayerCell row={row} league={league} />
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-white">{row.season}</td>
                    <td className={`px-3 py-3 text-center font-mono font-black ${vorpColor(row.vorp)}`}>{signed(row.vorp)}</td>
                    <td className="px-3 py-3 text-center font-mono text-slate-300">{signed(row.impactScore)}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{row.gp}</td>
                    <td className="px-3 py-3 text-center text-slate-400">{fmt(row.mpg)}</td>
                    <td className="px-3 py-3 text-center text-slate-200">{fmt(row.ppg)}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{fmt(row.rpg)}</td>
                    <td className="px-3 py-3 text-center text-slate-300">{fmt(row.apg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
