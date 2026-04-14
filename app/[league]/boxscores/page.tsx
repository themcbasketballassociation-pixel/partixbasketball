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
  possession_time: number | null;
  players: { mc_uuid: string; mc_username: string };
};
type PlayerTeam = {
  mc_uuid: string;
  team_id: string;
  season?: string | null;
  teams?: { id: string; name: string; abbreviation: string } | null;
};

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
  { key: "trb", label: "REB", render: (s) => String((s.rebounds_off ?? 0) + (s.rebounds_def ?? 0)) },
  { key: "ast", label: "AST", render: (s) => na(s.assists) },
  { key: "stl", label: "STL", render: (s) => na(s.steals) },
  { key: "blk", label: "BLK", render: (s) => na(s.blocks) },
  { key: "tov", label: "TO",  render: (s) => na(s.turnovers) },
  { key: "fg",  label: "FG",  render: (s) => fmtFg(s.fg_made, s.fg_attempted) },
  { key: "3fg", label: "3FG", render: (s) => fmtFg(s.three_pt_made, s.three_pt_attempted) },
  { key: "pt",  label: "PT",  render: (s) => s.possession_time === null ? "—" : String(s.possession_time) },
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
    case "trb": return String(stats.reduce((acc, s) => acc + (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0), 0));
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
    case "pt": return String(stats.reduce((acc, s) => acc + (s.possession_time ?? 0), 0));
    default: return "—";
  }
}

function ModalTeamTable({ team, stats }: { team: Team; stats: GameStat[] }) {
  const sorted = [...stats].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Team header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 24px", background: "#131313", borderBottom: "2px solid #1e1e1e" }}>
        {team.logo_url
          ? <img src={team.logo_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }} />
          : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#222", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#555", fontWeight: 700 }}>{team.abbreviation}</div>
        }
        <div>
          <div style={{ fontWeight: 800, color: "#fff", fontSize: "1.05rem", letterSpacing: "-0.01em" }}>{team.name}</div>
          <div style={{ color: "#444", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 1 }}>{team.abbreviation}</div>
        </div>
      </div>

      {stats.length === 0 ? (
        <p style={{ padding: "20px 24px", color: "#444", fontSize: "0.85rem" }}>No stats entered.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ background: "#0d0d0d" }}>
                <th style={{ padding: "9px 24px", textAlign: "left", color: "#3b82f6", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", whiteSpace: "nowrap", borderBottom: "1px solid #1e1e1e" }}>Player</th>
                {COLS.map((c) => (
                  <th key={c.key} style={{ padding: "9px 12px", textAlign: "center", color: "#444", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", borderBottom: "1px solid #1e1e1e" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, si) => {
                const pts = s.points ?? 0;
                const isTopScorer = si === 0 && pts > 0;
                return (
                  <tr key={s.id} style={{ background: si % 2 === 0 ? "#111" : "#0f0f0f", borderBottom: "1px solid #191919" }}>
                    <td style={{ padding: "10px 24px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <img
                          src={`https://minotar.net/avatar/${s.players?.mc_username ?? s.mc_uuid}/28`}
                          alt=""
                          style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0, imageRendering: "pixelated", border: "1px solid #222" }}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }}
                        />
                        <span style={{ fontWeight: isTopScorer ? 700 : 500, color: isTopScorer ? "#fff" : "#ccc", fontSize: "0.9rem" }}>
                          {s.players?.mc_username ?? s.mc_uuid}
                        </span>
                        {isTopScorer && <span style={{ fontSize: "0.6rem", background: "#1d3461", color: "#60a5fa", border: "1px solid #1e40af", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>TOP</span>}
                      </div>
                    </td>
                    {COLS.map((c) => {
                      const val = c.render(s);
                      const isPts = c.key === "pts";
                      const isFg = c.key === "fg" || c.key === "3fg";
                      return (
                        <td key={c.key} style={{
                          padding: "10px 12px", textAlign: "center",
                          color: isPts ? "#f1f5f9" : isFg ? "#94a3b8" : "#64748b",
                          fontWeight: isPts ? 700 : 400,
                          fontSize: isPts ? "0.95rem" : "0.85rem",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "#0d0d0d", borderTop: "2px solid #2a2a2a" }}>
                <td style={{ padding: "10px 24px", color: "#555", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Totals</td>
                {COLS.map((c) => (
                  <td key={c.key} style={{ padding: "10px 12px", textAlign: "center", color: "#94a3b8", fontWeight: 600, fontSize: "0.88rem", fontVariantNumeric: "tabular-nums" }}>
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

function splitStats(stats: GameStat[], game: Game, allPlayerTeams: PlayerTeam[], season: string) {
  const homeId = game.home_team?.id;
  const awayId = game.away_team?.id;
  const homeAbbr = game.home_team?.abbreviation?.toUpperCase();
  const awayAbbr = game.away_team?.abbreviation?.toUpperCase();
  const baseSeason = season.replace(/ Playoffs$/i, "");

  const seasonRecords = allPlayerTeams.filter(
    (pt) => pt.season === baseSeason || pt.season === season
  );
  const pool = seasonRecords.length > 0 ? seasonRecords : allPlayerTeams;

  let homeStats = stats.filter((s) => pool.some((pt) => pt.mc_uuid === s.mc_uuid && pt.team_id === homeId));
  let awayStats = stats.filter((s) => pool.some((pt) => pt.mc_uuid === s.mc_uuid && pt.team_id === awayId));
  let matchedCount = homeStats.length + awayStats.length;

  if (matchedCount < Math.ceil(stats.length / 2) && (homeAbbr || awayAbbr)) {
    homeStats = stats.filter((s) =>
      allPlayerTeams.some((pt) => pt.mc_uuid === s.mc_uuid && pt.teams?.abbreviation?.toUpperCase() === homeAbbr)
    );
    awayStats = stats.filter((s) =>
      allPlayerTeams.some((pt) => pt.mc_uuid === s.mc_uuid && pt.teams?.abbreviation?.toUpperCase() === awayAbbr)
    );
    matchedCount = homeStats.length + awayStats.length;
  }

  const allFallback = stats.length > 0 && matchedCount < Math.ceil(stats.length / 2) ? stats : null;
  return { homeStats, awayStats, allFallback };
}

export default function BoxScoresPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statsCache, setStatsCache] = React.useState<Record<string, GameStat[]>>({});
  const [allPlayerTeams, setAllPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [regularSeasons, setRegularSeasons] = React.useState<string[]>([]);
  const [playoffSeasons, setPlayoffSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");
  const [tab, setTab] = React.useState<"regular" | "playoffs">("regular");

  // Full-screen modal state
  const [modalGame, setModalGame] = React.useState<Game | null>(null);
  const [modalStats, setModalStats] = React.useState<GameStat[]>([]);
  const [modalLoading, setModalLoading] = React.useState(false);
  // Inline expand state
  const [inlineExpanded, setInlineExpanded] = React.useState<Record<string, boolean>>({});

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

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/teams/players?league=${slug}`)
      .then((r) => r.json())
      .then((data: PlayerTeam[]) => {
        if (!Array.isArray(data)) return;
        setAllPlayerTeams(data);
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

  // On mount, open game from ?game= URL param
  React.useEffect(() => {
    if (!slug) return;
    const urlGameId = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("game")
      : null;
    if (!urlGameId) return;
    openModal(urlGameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const openModal = async (game: Game | string) => {
    const gameId = typeof game === "string" ? game : game.id;
    setModalLoading(true);
    setModalGame(typeof game === "string" ? null : game);
    setModalStats([]);

    const [gameData, statsData] = await Promise.all([
      typeof game === "string"
        ? fetch(`/api/games/${gameId}`).then((r) => r.json()).catch(() => null)
        : Promise.resolve(game),
      statsCache[gameId]
        ? Promise.resolve(statsCache[gameId])
        : fetch(`/api/game-stats?game_id=${gameId}`).then((r) => r.json()).then((d) => Array.isArray(d) ? d : []).catch(() => []),
    ]);

    setModalGame(gameData);
    setModalStats(statsData);
    setStatsCache((prev) => ({ ...prev, [gameId]: statsData }));
    setModalLoading(false);
  };

  const closeModal = () => { setModalGame(null); setModalStats([]); setModalLoading(false); };

  const toggleInline = async (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    const isOpen = inlineExpanded[gameId];
    setInlineExpanded((prev) => ({ ...prev, [gameId]: !isOpen }));
    if (!isOpen && !statsCache[gameId]) {
      const data = await fetch(`/api/game-stats?game_id=${gameId}`).then((r) => r.json()).catch(() => []);
      setStatsCache((prev) => ({ ...prev, [gameId]: Array.isArray(data) ? data : [] }));
    }
  };

  // Close modal on Escape key
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modalIsOpen = modalLoading || modalGame !== null;

  return (
    <>
      {/* ── Full-screen modal ── */}
      {modalIsOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          {/* Modal close bar */}
          <div style={{ position: "sticky", top: 0, zIndex: 1, background: "#0a0a0a", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", flexShrink: 0 }}>
            <span style={{ color: "#555", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Box Score</span>
            <button
              onClick={closeModal}
              style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}
            >
              ✕ Close
            </button>
          </div>

          {modalLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "1.1rem" }}>
              Loading box score…
            </div>
          ) : modalGame ? (
            <div style={{ flex: 1, maxWidth: 1400, width: "100%", margin: "0 auto", padding: "0 0 40px" }}>
              {/* Score header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center", padding: "32px 40px", gap: 24,
              }}>
                {/* Home */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "flex-end" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: (modalGame.home_score ?? 0) >= (modalGame.away_score ?? 0) ? "#fff" : "#666", fontSize: "1.5rem", lineHeight: 1.1 }}>{modalGame.home_team?.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 3 }}>{modalGame.home_team?.abbreviation} · HOME</div>
                  </div>
                  {modalGame.home_team?.logo_url
                    ? <img src={modalGame.home_team.logo_url} alt="" style={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0, opacity: (modalGame.home_score ?? 0) >= (modalGame.away_score ?? 0) ? 1 : 0.4 }} />
                    : <div style={{ width: 72, height: 72, borderRadius: 12, background: "#1a1a1a", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14, fontWeight: 700 }}>{modalGame.home_team?.abbreviation}</div>
                  }
                </div>

                {/* Score */}
                <div style={{ textAlign: "center", minWidth: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    <span style={{ fontSize: "3.5rem", fontWeight: 900, color: (modalGame.home_score ?? 0) > (modalGame.away_score ?? 0) ? "#fff" : "#555", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{modalGame.home_score}</span>
                    <span style={{ fontSize: "1.5rem", color: "#333", fontWeight: 700 }}>–</span>
                    <span style={{ fontSize: "3.5rem", fontWeight: 900, color: (modalGame.away_score ?? 0) > (modalGame.home_score ?? 0) ? "#fff" : "#555", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{modalGame.away_score}</span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.1)", borderRadius: 999, padding: "3px 10px" }}>FINAL</span>
                    <span style={{ fontSize: "0.75rem", color: "#444" }}>
                      {new Date(modalGame.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </div>

                {/* Away */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "flex-start" }}>
                  {modalGame.away_team?.logo_url
                    ? <img src={modalGame.away_team.logo_url} alt="" style={{ width: 72, height: 72, objectFit: "contain", flexShrink: 0, opacity: (modalGame.away_score ?? 0) >= (modalGame.home_score ?? 0) ? 1 : 0.4 }} />
                    : <div style={{ width: 72, height: 72, borderRadius: 12, background: "#1a1a1a", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 14, fontWeight: 700 }}>{modalGame.away_team?.abbreviation}</div>
                  }
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 800, color: (modalGame.away_score ?? 0) >= (modalGame.home_score ?? 0) ? "#fff" : "#666", fontSize: "1.5rem", lineHeight: 1.1 }}>{modalGame.away_team?.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 3 }}>{modalGame.away_team?.abbreviation} · AWAY</div>
                  </div>
                </div>
              </div>

              {/* Stat tables */}
              <div style={{ borderTop: "1px solid #1e1e1e", padding: "0 0 32px" }}>
                {modalStats.length === 0 ? (
                  <p style={{ padding: "32px", color: "#444", fontSize: "1rem", textAlign: "center" }}>No box score entered for this game yet.</p>
                ) : (() => {
                  const { homeStats, awayStats, allFallback } = splitStats(modalStats, modalGame, allPlayerTeams, season);
                  return allFallback ? (
                    <ModalTeamTable team={modalGame.home_team} stats={allFallback} />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0 0" }}>
                      <ModalTeamTable team={modalGame.home_team} stats={homeStats} />
                      <ModalTeamTable team={modalGame.away_team} stats={awayStats} />
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Main page ── */}
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
            {/* Season dropdown */}
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
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {games.map((g) => {
              const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
              const awayWon = (g.away_score ?? 0) > (g.home_score ?? 0);
              const isInlineOpen = !!inlineExpanded[g.id];
              const inlineStats = statsCache[g.id] ?? [];

              return (
                <div
                  key={g.id}
                  style={{
                    border: "1px solid #1e1e1e", borderRadius: "0.875rem", overflow: "hidden",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#333")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e1e1e")}
                >
                  {/* Score row — clicking opens modal */}
                  <div
                    onClick={() => openModal(g)}
                    style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", padding: "14px 16px", gap: 12, background: "#161616", cursor: "pointer" }}
                  >
                    {/* Home team */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: homeWon ? "#fff" : "#666", fontSize: "0.95rem", lineHeight: 1.2 }}>{g.home_team?.name}</div>
                        <div style={{ fontSize: "0.65rem", color: "#444", marginTop: 1 }}>{g.home_team?.abbreviation} · HOME</div>
                      </div>
                      {g.home_team?.logo_url
                        ? <img src={g.home_team.logo_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0, opacity: homeWon ? 1 : 0.4 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, background: "#222", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10, fontWeight: 700 }}>{g.home_team?.abbreviation}</div>
                      }
                    </div>

                    {/* Score */}
                    <div style={{ textAlign: "center", minWidth: 100 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                        <span style={{ fontSize: "1.75rem", fontWeight: 900, color: homeWon ? "#fff" : "#555", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{g.home_score}</span>
                        <span style={{ fontSize: "1rem", color: "#333", fontWeight: 700 }}>–</span>
                        <span style={{ fontSize: "1.75rem", fontWeight: 900, color: awayWon ? "#fff" : "#555", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{g.away_score}</span>
                      </div>
                      <div style={{ marginTop: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.1)", borderRadius: 999, padding: "2px 7px" }}>FINAL</span>
                        <span style={{ fontSize: "0.6rem", color: "#444" }}>
                          {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>

                    {/* Away team */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}>
                      {g.away_team?.logo_url
                        ? <img src={g.away_team.logo_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0, opacity: awayWon ? 1 : 0.4 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, background: "#222", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10, fontWeight: 700 }}>{g.away_team?.abbreviation}</div>
                      }
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700, color: awayWon ? "#fff" : "#666", fontSize: "0.95rem", lineHeight: 1.2 }}>{g.away_team?.name}</div>
                        <div style={{ fontSize: "0.65rem", color: "#444", marginTop: 1 }}>{g.away_team?.abbreviation} · AWAY</div>
                      </div>
                    </div>
                  </div>

                  {/* Expand arrow */}
                  <button
                    onClick={(e) => toggleInline(e, g.id)}
                    style={{
                      width: "100%", background: "#111", border: "none", borderTop: "1px solid #1a1a1a",
                      cursor: "pointer", padding: "5px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      color: "#444", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.04em",
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#161616"; e.currentTarget.style.color = "#888"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#111"; e.currentTarget.style.color = "#444"; }}
                  >
                    <span style={{ fontSize: "0.65rem" }}>{isInlineOpen ? "▲ Hide Stats" : "▼ Show Stats"}</span>
                  </button>

                  {/* Inline stats */}
                  {isInlineOpen && (
                    <div style={{ borderTop: "1px solid #1e1e1e" }}>
                      {inlineStats.length === 0 ? (
                        <p style={{ padding: "14px 16px", color: "#444", fontSize: "0.8rem", textAlign: "center" }}>No stats entered yet.</p>
                      ) : (() => {
                        const { homeStats, awayStats, allFallback } = splitStats(inlineStats, g, allPlayerTeams, season);
                        return allFallback ? (
                          <ModalTeamTable team={g.home_team} stats={allFallback} />
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 0 0" }}>
                            <ModalTeamTable team={g.home_team} stats={homeStats} />
                            <ModalTeamTable team={g.away_team} stats={awayStats} />
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
