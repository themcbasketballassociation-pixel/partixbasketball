"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null };
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
type PlayerTeam = { mc_uuid: string; team_id: string };

function fmtMins(seconds: number | null) {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}
const na = (v: number | null) => (v === null ? "—" : String(v));
const fmtFg = (m: number | null, a: number | null) =>
  m === null && a === null ? "—" : `${m ?? 0}/${a ?? 0}`;

const COLS: { key: string; label: string; render: (s: GameStat) => string }[] = [
  { key: "min", label: "MIN", render: (s) => fmtMins(s.minutes_played) },
  { key: "pts", label: "PTS", render: (s) => na(s.points) },
  { key: "orb", label: "ORB", render: (s) => na(s.rebounds_off) },
  { key: "drb", label: "DRB", render: (s) => na(s.rebounds_def) },
  { key: "ast", label: "AST", render: (s) => na(s.assists) },
  { key: "stl", label: "STL", render: (s) => na(s.steals) },
  { key: "blk", label: "BLK", render: (s) => na(s.blocks) },
  { key: "tov", label: "TO",  render: (s) => na(s.turnovers) },
  { key: "fg",  label: "FG",  render: (s) => fmtFg(s.fg_made, s.fg_attempted) },
  { key: "3fg", label: "3FG", render: (s) => fmtFg(s.three_pt_made, s.three_pt_attempted) },
];

function sumCol(stats: GameStat[], key: string): string {
  if (stats.length === 0) return "—";
  switch (key) {
    case "min": {
      const total = stats.reduce((acc, s) => acc + (s.minutes_played ?? 0), 0);
      return fmtMins(total);
    }
    case "pts": return String(stats.reduce((acc, s) => acc + (s.points ?? 0), 0));
    case "orb": return String(stats.reduce((acc, s) => acc + (s.rebounds_off ?? 0), 0));
    case "drb": return String(stats.reduce((acc, s) => acc + (s.rebounds_def ?? 0), 0));
    case "ast": return String(stats.reduce((acc, s) => acc + (s.assists ?? 0), 0));
    case "stl": return String(stats.reduce((acc, s) => acc + (s.steals ?? 0), 0));
    case "blk": return String(stats.reduce((acc, s) => acc + (s.blocks ?? 0), 0));
    case "tov": return String(stats.reduce((acc, s) => acc + (s.turnovers ?? 0), 0));
    case "fg": {
      const m = stats.reduce((acc, s) => acc + (s.fg_made ?? 0), 0);
      const a = stats.reduce((acc, s) => acc + (s.fg_attempted ?? 0), 0);
      return `${m}/${a}`;
    }
    case "3fg": {
      const m = stats.reduce((acc, s) => acc + (s.three_pt_made ?? 0), 0);
      const a = stats.reduce((acc, s) => acc + (s.three_pt_attempted ?? 0), 0);
      return `${m}/${a}`;
    }
    default: return "—";
  }
}

function TeamTable({ team, stats, side }: { team: Team; stats: GameStat[]; side: "home" | "away" }) {
  const sorted = [...stats].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const isRight = side === "away";

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Team label */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: "#111", borderBottom: "1px solid #1e1e1e",
        justifyContent: isRight ? "flex-end" : "flex-start",
        flexDirection: isRight ? "row-reverse" : "row",
      }}>
        {team.logo_url
          ? <img src={team.logo_url} alt="" style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }} />
          : <div style={{ width: 28, height: 28, borderRadius: 6, background: "#222", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#555", fontWeight: 700 }}>{team.abbreviation}</div>
        }
        <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.875rem" }}>{team.name}</span>
      </div>

      {stats.length === 0 ? (
        <p style={{ padding: "14px 16px", color: "#444", fontSize: "0.8rem" }}>No stats entered.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#0d0d0d", borderBottom: "1px solid #1e1e1e" }}>
                <th style={{ padding: "8px 10px", textAlign: isRight ? "right" : "left", color: "#555", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>Player</th>
                {COLS.map((c) => (
                  <th key={c.key} style={{ padding: "8px 8px", textAlign: "center", color: "#555", fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, si) => (
                <tr key={s.id} style={{ borderTop: si > 0 ? "1px solid #1a1a1a" : undefined, background: si % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: isRight ? "flex-end" : "flex-start", flexDirection: isRight ? "row-reverse" : "row" }}>
                      <img
                        src={`https://crafatar.com/avatars/${s.mc_uuid}?size=20&default=MHF_Steve&overlay`}
                        alt=""
                        style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }}
                      />
                      <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: "0.8rem" }}>{s.players?.mc_username ?? s.mc_uuid}</span>
                    </div>
                  </td>
                  {COLS.map((c) => {
                    const val = c.render(s);
                    const isPts = c.key === "pts";
                    return (
                      <td key={c.key} style={{ padding: "8px 8px", textAlign: "center", color: isPts ? "#fff" : "#888", fontWeight: isPts ? 700 : 400 }}>
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ borderTop: "2px solid #1e1e1e", background: "#0d0d0d" }}>
                <td style={{ padding: "8px 10px", color: "#555", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", textAlign: isRight ? "right" : "left" }}>Totals</td>
                {COLS.map((c) => (
                  <td key={c.key} style={{ padding: "8px 8px", textAlign: "center", color: "#bbb", fontWeight: 600, fontSize: "0.8rem" }}>
                    {sumCol(sorted, c.key)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BoxScoresPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [statsCache, setStatsCache] = React.useState<Record<string, GameStat[]>>({});
  const [playerTeamMap, setPlayerTeamMap] = React.useState<Record<string, string>>({});
  const [regularSeasons, setRegularSeasons] = React.useState<string[]>([]);
  const [playoffSeasons, setPlayoffSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");
  const [tab, setTab] = React.useState<"regular" | "playoffs">("regular");

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then((r) => r.json())
      .then((data: { season: string }[]) => {
        if (Array.isArray(data)) {
          const all = data.map((d) => d.season).filter(Boolean);
          const reg = [...new Set(all.filter((s) => !s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
          const po  = [...new Set(all.filter((s) =>  s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
          setRegularSeasons(reg);
          setPlayoffSeasons(po);
          if (reg.length > 0) setSeason(reg[0]);
        }
      }).catch(() => {});
  }, [slug]);

  // When tab changes reset season to first available of that type
  React.useEffect(() => {
    if (tab === "regular" && regularSeasons.length > 0) setSeason(regularSeasons[0]);
    if (tab === "playoffs" && playoffSeasons.length > 0) setSeason(playoffSeasons[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Load player→team map for this league
  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/teams/players?league=${slug}`)
      .then((r) => r.json())
      .then((data: PlayerTeam[]) => {
        if (!Array.isArray(data)) return;
        const map: Record<string, string> = {};
        for (const pt of data) map[pt.mc_uuid] = pt.team_id;
        setPlayerTeamMap(map);
      }).catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((data) => {
        const completed = Array.isArray(data)
          ? data.filter((g: Game) => g.home_score !== null && g.away_score !== null)
          : [];
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

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      {/* Page header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Box Scores</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Regular / Playoffs toggle */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #2a2a2a" }}>
            {(["regular", "playoffs"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "6px 16px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", border: "none",
                  borderRight: t === "regular" ? "1px solid #2a2a2a" : "none",
                  background: tab === t ? "#2563eb" : "#161616",
                  color: tab === t ? "#fff" : "#666" }}>
                {t === "regular" ? "Regular Season" : "🏆 Playoffs"}
              </button>
            ))}
          </div>
          {/* Season dropdown for whichever tab is active */}
          {(tab === "regular" ? regularSeasons : playoffSeasons).length > 0 && (
            <select value={season} onChange={(e) => setSeason(e.target.value)}
              style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: "0.75rem", padding: "6px 12px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
              {(tab === "regular" ? regularSeasons : playoffSeasons).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading...</div>
      ) : games.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>
          {tab === "playoffs" ? "No playoff box scores yet." : "No completed games yet."}
        </div>
      ) : (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {games.map((g) => {
            const stats = statsCache[g.id] ?? [];
            const isOpen = expanded === g.id;
            const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
            const awayWon = (g.away_score ?? 0) > (g.home_score ?? 0);

            // Split stats by team
            const homeStats = stats.filter((s) => playerTeamMap[s.mc_uuid] === g.home_team?.id);
            const awayStats = stats.filter((s) => playerTeamMap[s.mc_uuid] === g.away_team?.id);
            // Fallback: if player_team map is empty, just split by order
            const allStats = homeStats.length === 0 && awayStats.length === 0 ? stats : null;

            return (
              <div key={g.id} style={{ borderRadius: "0.875rem", border: "1px solid #1e1e1e", background: "#161616", overflow: "hidden" }}>

                {/* ── Score header (clickable) ── */}
                <button
                  onClick={() => toggleGame(g.id)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    padding: "18px 24px",
                    gap: 16,
                  }}>
                    {/* Home team */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: homeWon ? "#fff" : "#777", fontSize: "1rem", lineHeight: 1.2 }}>{g.home_team?.name}</div>
                        <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}>{g.home_team?.abbreviation} · HOME</div>
                      </div>
                      {g.home_team?.logo_url
                        ? <img src={g.home_team.logo_url} alt="" style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0, opacity: homeWon ? 1 : 0.4 }} />
                        : <div style={{ width: 48, height: 48, borderRadius: 8, background: "#222", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 11, fontWeight: 700 }}>{g.home_team?.abbreviation}</div>
                      }
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: "center", minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                        <span style={{ fontSize: "2rem", fontWeight: 900, color: homeWon ? "#fff" : "#666", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{g.home_score}</span>
                        <span style={{ fontSize: "1.1rem", color: "#333", fontWeight: 700 }}>–</span>
                        <span style={{ fontSize: "2rem", fontWeight: 900, color: awayWon ? "#fff" : "#666", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{g.away_score}</span>
                      </div>
                      <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.1)", borderRadius: 999, padding: "2px 8px" }}>FINAL</span>
                        <span style={{ fontSize: "0.65rem", color: "#444" }}>
                          {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>

                    {/* Away team */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-start" }}>
                      {g.away_team?.logo_url
                        ? <img src={g.away_team.logo_url} alt="" style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0, opacity: awayWon ? 1 : 0.4 }} />
                        : <div style={{ width: 48, height: 48, borderRadius: 8, background: "#222", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 11, fontWeight: 700 }}>{g.away_team?.abbreviation}</div>
                      }
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, color: awayWon ? "#fff" : "#777", fontSize: "1rem", lineHeight: 1.2 }}>{g.away_team?.name}</div>
                        <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 2 }}>{g.away_team?.abbreviation} · AWAY</div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* ── Box score tables ── */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid #1e1e1e" }}>
                    {stats.length === 0 ? (
                      <p style={{ padding: "16px 20px", color: "#444", fontSize: "0.875rem", textAlign: "center" }}>No box score entered for this game yet.</p>
                    ) : allStats ? (
                      /* Fallback: single table if we can't split */
                      <TeamTable team={g.home_team} stats={allStats} side="home" />
                    ) : (
                      /* Side-by-side tables */
                      <div style={{ display: "flex", gap: 0 }}>
                        <div style={{ flex: 1, minWidth: 0, borderRight: "2px solid #0d0d0d" }}>
                          <TeamTable team={g.home_team} stats={homeStats} side="home" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <TeamTable team={g.away_team} stats={awayStats} side="away" />
                        </div>
                      </div>
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
