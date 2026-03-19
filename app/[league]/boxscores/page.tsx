"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string };
type Game = {
  id: string; league: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};
type GameStat = {
  id: string; mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null;
  minutes_played: number | null; fg_made: number | null; fg_attempted: number | null;
  three_pt_made: number | null; three_pt_attempted: number | null;
  players: { mc_uuid: string; mc_username: string };
};

function fmtMins(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function BoxScoresPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [statsCache, setStatsCache] = React.useState<Record<string, GameStat[]>>({});

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/games?league=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        const completed = Array.isArray(data) ? data.filter((g: Game) => g.home_score !== null && g.away_score !== null) : [];
        setGames(completed.reverse());
        setLoading(false);
      });
  }, [slug]);

  const toggleGame = async (gameId: string) => {
    if (expanded === gameId) { setExpanded(null); return; }
    setExpanded(gameId);
    if (!statsCache[gameId]) {
      const data = await fetch(`/api/game-stats?game_id=${gameId}`).then((r) => r.json());
      setStatsCache((prev) => ({ ...prev, [gameId]: Array.isArray(data) ? data : [] }));
    }
  };

  const na = (v: number | null) => v === null ? "N/A" : v;
  const statCols: { key: string; label: string; render: (s: GameStat) => React.ReactNode }[] = [
    { key: "minutes_played", label: "MIN", render: (s) => s.minutes_played === null ? "N/A" : fmtMins(s.minutes_played) },
    { key: "points",         label: "PTS", render: (s) => na(s.points) },
    { key: "rebounds_off",   label: "ORB", render: (s) => na(s.rebounds_off) },
    { key: "rebounds_def",   label: "DRB", render: (s) => na(s.rebounds_def) },
    { key: "assists",        label: "AST", render: (s) => na(s.assists) },
    { key: "steals",         label: "STL", render: (s) => na(s.steals) },
    { key: "blocks",         label: "BLK", render: (s) => na(s.blocks) },
    { key: "turnovers",      label: "TO",  render: (s) => na(s.turnovers) },
    { key: "fg",             label: "FG",  render: (s) => s.fg_made === null && s.fg_attempted === null ? "N/A" : `${s.fg_made ?? 0}/${s.fg_attempted ?? 0}` },
    { key: "three_fg",       label: "3FG", render: (s) => s.three_pt_made === null && s.three_pt_attempted === null ? "N/A" : `${s.three_pt_made ?? 0}/${s.three_pt_attempted ?? 0}` },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white">Box Scores</h2>
        <p className="text-slate-400 text-sm mt-0.5">{leagueDisplay}</p>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-500">Loading...</div>
      ) : games.length === 0 ? (
        <div className="p-10 text-center text-slate-500">No completed games yet.</div>
      ) : (
        <div className="p-6 space-y-3">
          {games.map((g) => {
            const stats = statsCache[g.id] ?? [];
            const isOpen = expanded === g.id;
            return (
              <div key={g.id} className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden hover:border-slate-600 transition">
                <button
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
                  onClick={() => toggleGame(g.id)}
                >
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="font-bold text-white">{g.home_team?.abbreviation}</div>
                        <div className="text-xs text-slate-500">{g.home_team?.name}</div>
                      </div>
                      <div className="text-xl font-bold text-white tabular-nums">
                        {g.home_score} – {g.away_score}
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-white">{g.away_team?.abbreviation}</div>
                        <div className="text-xs text-slate-500">{g.away_team?.name}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-slate-500 text-sm">{new Date(g.scheduled_at).toLocaleDateString()}</span>
                    <span className="text-slate-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-800 overflow-x-auto">
                    {stats.length === 0 ? (
                      <p className="px-5 py-4 text-slate-600 text-sm">No box score entered for this game yet.</p>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="bg-slate-900 border-b border-slate-800">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-widest">Player</th>
                            {statCols.map((c) => (
                              <th key={c.key} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase tracking-widest">{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {stats.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-900 transition">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <img
                                    src={`https://crafatar.com/avatars/${s.mc_uuid}?size=24&default=MHF_Steve&overlay`}
                                    alt={s.players?.mc_username}
                                    className="w-6 h-6 rounded ring-1 ring-slate-700 flex-shrink-0"
                                  />
                                  <span className="font-semibold text-white">{s.players?.mc_username ?? s.mc_uuid}</span>
                                </div>
                              </td>
                              {statCols.map((c) => (
                                <td key={c.key} className="px-3 py-2.5 text-center text-slate-300">
                                  {c.render(s)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
