"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Team = {
  id: string;
  name: string;
  abbreviation: string;
  division: string | null;
  logo_url: string | null;
};
type Game = {
  id: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
};
type StandingRow = {
  team: Team;
  w: number;
  l: number;
  pf: number;
  pa: number;
  pct: number;
  diff: number;
  confW: number;
  confL: number;
  confPct: number;
};

function TeamLogo({ team, size = 32 }: { team: Team; size?: number }) {
  if (team.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.abbreviation}
        width={size}
        height={size}
        className="object-contain rounded flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-300"
      style={{ width: size, height: size, fontSize: size < 32 ? 9 : 11 }}
    >
      {team.abbreviation}
    </div>
  );
}

function computeH2HRecord(
  teamId: string,
  otherIds: Set<string>,
  games: Game[]
): number {
  let w = 0, l = 0;
  for (const g of games) {
    if (g.status !== "completed") continue;
    const hs = g.home_score ?? 0, as_ = g.away_score ?? 0;
    if (g.home_team_id === teamId && otherIds.has(g.away_team_id)) {
      hs > as_ ? w++ : l++;
    } else if (g.away_team_id === teamId && otherIds.has(g.home_team_id)) {
      as_ > hs ? w++ : l++;
    }
  }
  return w + l > 0 ? w / (w + l) : -1;
}

function applyTiebreakers(group: StandingRow[], games: Game[]): StandingRow[] {
  if (group.length <= 1) return group;
  const groupIds = new Set(group.map((r) => r.team.id));
  return [...group].sort((a, b) => {
    // 1. Conf record
    const confDiff = b.confPct - a.confPct;
    if (Math.abs(confDiff) > 0.0001) return confDiff;

    // 2. H2H among tied group
    const aOthers = new Set([...groupIds].filter((id) => id !== a.team.id));
    const bOthers = new Set([...groupIds].filter((id) => id !== b.team.id));
    const aH2H = computeH2HRecord(a.team.id, aOthers, games);
    const bH2H = computeH2HRecord(b.team.id, bOthers, games);
    const aP = aH2H === -1 ? 0 : aH2H;
    const bP = bH2H === -1 ? 0 : bH2H;
    if (Math.abs(bP - aP) > 0.0001) return bP - aP;

    // 3. Point diff
    return b.diff - a.diff;
  });
}

function sortStandings(rows: StandingRow[], games: Game[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const groups: StandingRow[][] = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].pct - row.pct) < 0.0001) {
      last.push(row);
    } else {
      groups.push([row]);
    }
  }
  const result: StandingRow[] = [];
  for (const group of groups) {
    result.push(...applyTiebreakers(group, games));
  }
  return result;
}

function StandingsTable({
  rows,
  games,
}: {
  rows: StandingRow[];
  games: Game[];
}) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 text-sm">
        No teams in this division yet.
      </div>
    );
  }
  const sorted = sortStandings(rows, games);
  const leader = sorted[0];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 w-10">#</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-slate-500">Team</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">W</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">L</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">PCT</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">GB</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 hidden sm:table-cell">CONF</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 hidden md:table-cell">PF</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500 hidden md:table-cell">PA</th>
            <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">DIFF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {sorted.map((row, i) => {
            const gp = row.w + row.l;
            const leaderGP = leader.w + leader.l;
            const gb =
              i === 0
                ? "—"
                : (
                    (leader.w - leader.l - (row.w - row.l)) /
                    2
                  ).toFixed(1);
            const confStr =
              row.confW + row.confL > 0
                ? `${row.confW}-${row.confL}`
                : "—";
            return (
              <tr
                key={row.team.id}
                className={`transition hover:bg-slate-800/40 ${i === 0 ? "bg-blue-950/20" : ""}`}
              >
                <td className="px-4 py-3 text-center text-slate-500 text-xs font-mono">
                  {i + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <TeamLogo team={row.team} size={28} />
                    <div>
                      <span className="font-semibold text-white text-sm leading-tight block">
                        {row.team.name}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {row.team.abbreviation}
                        {row.team.division && (
                          <span className="ml-1.5 text-slate-600">
                            {row.team.division}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center font-bold text-green-400">
                  {row.w}
                </td>
                <td className="px-3 py-3 text-center text-red-400">
                  {row.l}
                </td>
                <td className="px-3 py-3 text-center font-semibold text-white">
                  {gp > 0 ? row.pct.toFixed(3) : ".000"}
                </td>
                <td className="px-3 py-3 text-center text-slate-400 text-xs">
                  {gb}
                </td>
                <td className="px-3 py-3 text-center text-slate-400 text-xs hidden sm:table-cell">
                  {confStr}
                </td>
                <td className="px-3 py-3 text-center text-slate-400 hidden md:table-cell">
                  {row.pf}
                </td>
                <td className="px-3 py-3 text-center text-slate-400 hidden md:table-cell">
                  {row.pa}
                </td>
                <td
                  className={`px-3 py-3 text-center font-semibold text-xs ${
                    row.diff > 0
                      ? "text-green-400"
                      : row.diff < 0
                      ? "text-red-400"
                      : "text-slate-500"
                  }`}
                >
                  {row.diff > 0 ? "+" : ""}
                  {row.diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StandingsPage({
  params,
}: {
  params?: Promise<{ league?: string }>;
}) {
  const resolved = React.use(params ?? Promise.resolve({})) as {
    league?: string;
  };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [allRows, setAllRows] = React.useState<StandingRow[]>([]);
  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [divFilter, setDivFilter] = React.useState<"All" | "East" | "West">("All");

  React.useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/teams?league=${slug}`).then((r) => r.json()),
      fetch(`/api/games?league=${slug}`).then((r) => r.json()),
    ]).then(([teams, games]: [Team[], Game[]]) => {
      if (!Array.isArray(teams) || !Array.isArray(games)) {
        setLoading(false);
        return;
      }

      const completedGames = games.filter((g) => g.status === "completed");
      setGames(completedGames);

      const map: Record<string, StandingRow> = {};
      for (const t of teams) {
        map[t.id] = {
          team: t,
          w: 0, l: 0, pf: 0, pa: 0,
          pct: 0, diff: 0,
          confW: 0, confL: 0, confPct: 0,
        };
      }

      for (const g of completedGames) {
        const hs = g.home_score ?? 0;
        const as_ = g.away_score ?? 0;
        if (map[g.home_team_id]) {
          map[g.home_team_id].pf += hs;
          map[g.home_team_id].pa += as_;
          hs > as_ ? map[g.home_team_id].w++ : map[g.home_team_id].l++;
        }
        if (map[g.away_team_id]) {
          map[g.away_team_id].pf += as_;
          map[g.away_team_id].pa += hs;
          as_ > hs ? map[g.away_team_id].w++ : map[g.away_team_id].l++;
        }
      }

      // Compute conf records (same division games)
      for (const g of completedGames) {
        const homeRow = map[g.home_team_id];
        const awayRow = map[g.away_team_id];
        if (!homeRow || !awayRow) continue;
        if (!homeRow.team.division || !awayRow.team.division) continue;
        if (homeRow.team.division !== awayRow.team.division) continue;
        const hs = g.home_score ?? 0;
        const as_ = g.away_score ?? 0;
        if (hs > as_) {
          homeRow.confW++;
          awayRow.confL++;
        } else {
          homeRow.confL++;
          awayRow.confW++;
        }
      }
      for (const row of Object.values(map)) {
        const cGP = row.confW + row.confL;
        row.confPct = cGP > 0 ? row.confW / cGP : 0;
        const gp = row.w + row.l;
        row.pct = gp > 0 ? row.w / gp : 0;
        row.diff = row.pf - row.pa;
      }

      setAllRows(Object.values(map));
      setLoading(false);
    });
  }, [slug]);

  const hasDivisions = allRows.some((r) => r.team.division);
  const filteredRows =
    divFilter === "All"
      ? allRows
      : allRows.filter((r) => r.team.division === divFilter);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Standings</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        {hasDivisions && (
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
            {(["All", "East", "West"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDivFilter(d)}
                className={`px-4 py-1.5 font-medium transition ${
                  divFilter === d
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading standings...</div>
      ) : allRows.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No teams or games yet.</div>
      ) : (
        <StandingsTable rows={filteredRows} games={games} />
      )}

      {/* Tiebreaker legend */}
      {!loading && allRows.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-800 text-xs text-slate-600">
          Tiebreakers: Record → Conf Record → H2H → Point Diff
        </div>
      )}
    </div>
  );
}
