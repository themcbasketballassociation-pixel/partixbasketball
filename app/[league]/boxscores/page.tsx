"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
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
  const [seasons, setSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then((r) => r.json())
      .then((data: { season: string }[]) => {
        if (Array.isArray(data)) {
          const unique = [...new Set(
            data.map((d) => d.season).filter((s) => s && !s.toLowerCase().includes("playoff"))
          )].sort((a, b) => b.localeCompare(a));
          setSeasons(unique);
          if (unique.length > 0) setSeason(unique[0]);
        }
      })
      .catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((data) => {
        const completed = Array.isArray(data) ? data.filter((g: Game) => g.home_score !== null && g.away_score !== null) : [];
        setGames(completed.reverse());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, season]);

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

  const displayedGames = games;

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Box Scores</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay}</p>
        </div>
        {seasons.length > 0 && (
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: "0.75rem", padding: "6px 12px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}
          >
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading...</div>
      ) : displayedGames.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>No completed games yet.</div>
      ) : (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {displayedGames.map((g) => {
            const stats = statsCache[g.id] ?? [];
            const isOpen = expanded === g.id;
            return (
              <div key={g.id} style={{ borderRadius: "0.75rem", border: "1px solid #1e1e1e", background: "#161616", overflow: "hidden" }}>
                <button
                  style={{ width: "100%", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textAlign: "left", background: "none", cursor: "pointer", border: "none" }}
                  onClick={() => toggleGame(g.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{g.home_team?.abbreviation}</div>
                        <div style={{ fontSize: "0.75rem", color: "#555" }}>{g.home_team?.name}</div>
                      </div>
                      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                        {g.home_score} – {g.away_score}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{g.away_team?.abbreviation}</div>
                        <div style={{ fontSize: "0.75rem", color: "#555" }}>{g.away_team?.name}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                    <span style={{ color: "#555", fontSize: "0.875rem" }}>{new Date(g.scheduled_at).toLocaleDateString()}</span>
                    <span style={{ color: "#888", fontSize: "0.75rem" }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: "1px solid #1e1e1e", overflowX: "auto" }}>
                    {stats.length === 0 ? (
                      <p style={{ padding: "16px 20px", color: "#444", fontSize: "0.875rem" }}>No box score entered for this game yet.</p>
                    ) : (
                      <table style={{ minWidth: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #1e1e1e", background: "#111" }}>
                            <th style={{ padding: "10px 16px", textAlign: "left", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em" }}>Player</th>
                            {statCols.map((c) => (
                              <th key={c.key} style={{ padding: "10px 12px", textAlign: "center", fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em" }}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stats.map((s, si) => (
                            <tr key={s.id} style={{ borderTop: si > 0 ? "1px solid #1e1e1e" : undefined }}>
                              <td style={{ padding: "10px 16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <img
                                    src={`https://crafatar.com/avatars/${s.mc_uuid}?size=24&default=MHF_Steve&overlay`}
                                    alt={s.players?.mc_username}
                                    style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }}
                                  />
                                  <span style={{ fontWeight: 600, color: "#fff" }}>{s.players?.mc_username ?? s.mc_uuid}</span>
                                </div>
                              </td>
                              {statCols.map((c) => (
                                <td key={c.key} style={{ padding: "10px 12px", textAlign: "center", color: "#aaa" }}>
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
