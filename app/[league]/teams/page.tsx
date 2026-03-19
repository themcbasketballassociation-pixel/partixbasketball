"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null };
type Player = { mc_uuid: string; mc_username: string };
type PlayerTeam = { mc_uuid: string; team_id: string; players: Player };

export default function TeamsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [teams, setTeams] = React.useState<Team[]>([]);
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [seasons, setSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("All Seasons");

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
        }
      })
      .catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    Promise.all([
      fetch(`/api/teams?league=${slug}`).then((r) => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then((r) => r.json()),
    ])
      .then(([t, pt]) => {
        setTeams(Array.isArray(t) ? t : []);
        setPlayerTeams(Array.isArray(pt) ? pt : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  const playersForTeam = (teamId: string) => playerTeams.filter((pt) => pt.team_id === teamId);
  const divisions = [...new Set(teams.map((t) => t.division).filter(Boolean))] as string[];
  const hasDivisions = divisions.length > 0;

  const renderTeamCard = (team: Team) => (
    <div key={team.id} style={{ borderRadius: "0.75rem", border: "1px solid #1e1e1e", background: "#161616", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {team.logo_url ? (
          <img src={team.logo_url} alt={team.abbreviation} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 6, background: "#1e1e1e", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#888" }}>{team.abbreviation}</span>
          </div>
        )}
        <div>
          <h3 style={{ fontWeight: 700, color: "#fff", fontSize: "1.125rem", lineHeight: 1.2, margin: 0 }}>{team.name}</h3>
          <span style={{ color: "#555", fontSize: "0.875rem", fontFamily: "monospace" }}>{team.abbreviation}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {playersForTeam(team.id).length === 0 ? (
          <p style={{ color: "#444", fontSize: "0.75rem", margin: 0 }}>No players assigned</p>
        ) : (
          playersForTeam(team.id).map((pt) => (
            <div key={pt.mc_uuid} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img
                src={`https://minotar.net/avatar/${pt.players?.mc_username}/20`}
                alt=""
                style={{ width: 20, height: 20, borderRadius: 3 }}
                onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }}
              />
              <span style={{ color: "#aaa", fontSize: "0.875rem" }}>{pt.players?.mc_username}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Teams</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay} · {teams.length} teams</p>
        </div>
        <select
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: "0.75rem", padding: "6px 12px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}
        >
          <option value="All Seasons">All Seasons</option>
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading teams...</div>
      ) : teams.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#555" }}>No teams yet.</div>
      ) : hasDivisions ? (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
          {divisions.map((div) => (
            <div key={div}>
              <h3 style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>{div} Division</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                {teams.filter((t) => t.division === div).map(renderTeamCard)}
              </div>
            </div>
          ))}
          {teams.filter((t) => !t.division).length > 0 && (
            <div>
              <h3 style={{ fontSize: "0.7rem", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Other</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                {teams.filter((t) => !t.division).map(renderTeamCard)}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {teams.map(renderTeamCard)}
        </div>
      )}
    </div>
  );
}
