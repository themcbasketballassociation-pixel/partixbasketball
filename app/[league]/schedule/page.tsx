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
  home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};

function getWeekKey(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  const dow = d.getDay();
  const daysToThursday = dow >= 4 ? dow - 4 : dow + 3;
  const thu = new Date(d);
  thu.setDate(d.getDate() - daysToThursday);
  return thu.toISOString().slice(0, 10);
}

export default function SchedulePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [seasons, setSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
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
    if (!slug || !season) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((data) => { setGames(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug, season]);

  const filteredGames = games;

  const grouped = filteredGames.reduce<Record<string, Game[]>>((acc, g) => {
    const key = getWeekKey(g.scheduled_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const weekKeys = Object.keys(grouped).sort();

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Schedule</h2>
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
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading schedule...</div>
      ) : games.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>No games scheduled yet.</div>
      ) : (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {weekKeys.map((weekKey, wi) => {
            const weekGames = grouped[weekKey].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
            const byDay = weekGames.reduce<Record<string, Game[]>>((acc, g) => {
              const dayLabel = new Date(g.scheduled_at).toLocaleDateString(undefined, { weekday: "long" });
              if (!acc[dayLabel]) acc[dayLabel] = [];
              acc[dayLabel].push(g);
              return acc;
            }, {});
            return (
              <div key={weekKey} style={{ borderRadius: "0.75rem", border: "1px solid #1e1e1e", background: "#161616", overflow: "hidden" }}>
                <div style={{ padding: "10px 20px", borderBottom: "1px solid #1e1e1e", background: "#111", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.875rem", letterSpacing: "0.05em" }}>WEEK {wi + 1}</span>
                  <span style={{ color: "#555", fontSize: "0.75rem" }}>{new Date(weekKey).toLocaleDateString(undefined, { month: "long", day: "numeric" })} week</span>
                </div>
                {Object.keys(byDay).map((day) => (
                  <div key={day}>
                    <div style={{ padding: "6px 20px", borderBottom: "1px solid #1e1e1e", background: "rgba(17,17,17,0.5)" }}>
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em" }}>{day}</span>
                    </div>
                    <div>
                      {byDay[day].map((g, gi) => (
                        <div key={g.id} style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderTop: gi > 0 ? "1px solid #1e1e1e" : undefined }}>
                          <span style={{ color: "#555", fontSize: "0.875rem", width: 80, flexShrink: 0 }}>
                            {new Date(g.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} EST
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                            <div style={{ textAlign: "right", minWidth: 100 }}>
                              <div style={{ fontWeight: 600, color: "#fff" }}>{g.home_team?.name ?? "?"}</div>
                              <div style={{ fontSize: "0.75rem", color: "#555" }}>{g.home_team?.abbreviation}</div>
                            </div>
                            {g.status === "completed" ? (
                              <div style={{ textAlign: "center", padding: "0 12px" }}>
                                <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{g.home_score} – {g.away_score}</div>
                                <div style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 600 }}>Final</div>
                              </div>
                            ) : (
                              <div style={{ color: "#333", fontWeight: 500, padding: "0 12px" }}>vs</div>
                            )}
                            <div style={{ textAlign: "left", minWidth: 100 }}>
                              <div style={{ fontWeight: 600, color: "#fff" }}>{g.away_team?.name ?? "?"}</div>
                              <div style={{ fontSize: "0.75rem", color: "#555" }}>{g.away_team?.abbreviation}</div>
                            </div>
                          </div>
                          <span style={{
                            borderRadius: "9999px", padding: "2px 8px", fontSize: "0.75rem", fontWeight: 600, flexShrink: 0,
                            background: g.status === "completed" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
                            color: g.status === "completed" ? "#4ade80" : "#facc15",
                          }}>
                            {g.status === "completed" ? "Final" : "Scheduled"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
