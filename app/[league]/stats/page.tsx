"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

const SEASONS = [
  "Season 1","Season 1 Playoffs","Season 2","Season 2 Playoffs","Season 3","Season 3 Playoffs",
  "Season 4","Season 4 Playoffs","Season 5","Season 5 Playoffs","Season 6","Season 6 Playoffs",
  "Season 7","Season 7 Playoffs",
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
};

const na = (v: number | null | undefined) => (v == null ? "—" : v);

export default function StatsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [season, setSeason] = React.useState(SEASONS[SEASONS.length - 1]);
  const [rows, setRows] = React.useState<StatRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<keyof StatRow>("ppg");
  const [sortDir, setSortDir] = React.useState<"desc" | "asc">("desc");

  React.useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/stats?league=${encodeURIComponent(slug)}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((d) => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, season]);

  const handleSort = (key: keyof StatRow) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] as number | null;
    const bv = b[sortKey] as number | null;
    const diff = ((bv ?? -Infinity) - (av ?? -Infinity));
    return sortDir === "desc" ? diff : -diff;
  });

  const cols: { key: keyof StatRow; label: string; title: string }[] = [
    { key: "gp",            label: "GP",    title: "Games Played" },
    { key: "ppg",           label: "PPG",   title: "Points Per Game" },
    { key: "rpg",           label: "RPG",   title: "Rebounds Per Game" },
    { key: "apg",           label: "APG",   title: "Assists Per Game" },
    { key: "spg",           label: "SPG",   title: "Steals Per Game" },
    { key: "bpg",           label: "BPG",   title: "Blocks Per Game" },
    { key: "fg_pct",        label: "FG%",   title: "Field Goal %" },
    { key: "three_pt_made", label: "3s",    title: "Total 3-Pointers Made" },
    { key: "tppg",          label: "3PPG",  title: "3-Pointers Per Game" },
    { key: "three_pt_pct",  label: "3FG%",  title: "3-Point %" },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Player Stats</h2>
          <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
        </div>
        <select
          className="rounded-lg border border-slate-700 bg-slate-800 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
        >
          {SEASONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading stats...</div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No stats recorded for {season} yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Player</th>
                <th className="px-4 py-3 text-left">Team</th>
                {cols.map(({ key, label, title }) => (
                  <th
                    key={key}
                    title={title}
                    className={`px-3 py-3 text-right cursor-pointer select-none hover:text-white transition ${sortKey === key ? "text-blue-400" : ""}`}
                    onClick={() => handleSort(key)}
                  >
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.mc_uuid}
                  className={`border-b border-slate-800/50 hover:bg-slate-800/40 transition ${i === 0 ? "bg-slate-800/20" : ""}`}
                >
                  <td className="px-4 py-3 text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <img
                        src={`https://crafatar.com/avatars/${row.mc_uuid}?size=24&default=MHF_Steve&overlay`}
                        alt={row.mc_username}
                        className="w-6 h-6 rounded"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <span className="font-medium text-white">{row.mc_username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {row.team ? (row.team as Team).abbreviation : "—"}
                  </td>
                  {cols.map(({ key }) => (
                    <td
                      key={key}
                      className={`px-3 py-3 text-right tabular-nums ${sortKey === key ? "text-blue-300 font-semibold" : "text-slate-300"}`}
                    >
                      {key === "fg_pct" || key === "three_pt_pct"
                        ? na(row[key] as number | null) === "—" ? "—" : `${na(row[key] as number | null)}%`
                        : na(row[key] as number | null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
