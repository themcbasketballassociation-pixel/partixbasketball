"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null; color2?: string | null };
type Player = { mc_uuid: string; mc_username: string };
type PlayerTeam = { mc_uuid: string; team_id: string; players: Player };

function TeamCard({ team, players }: { team: Team; players: PlayerTeam[] }) {
  const accent = team.color2 ?? "#2a2a2a";
  return (
    <div style={{
      borderRadius: "0.875rem",
      border: "1px solid #1e1e1e",
      background: "#161616",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Color bar + logo + name */}
      <div style={{
        background: `linear-gradient(135deg, ${accent}22 0%, transparent 60%)`,
        borderBottom: "1px solid #1e1e1e",
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 10,
          background: "#111", border: `2px solid ${accent}44`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          overflow: "hidden",
        }}>
          {team.logo_url
            ? <img src={team.logo_url} alt={team.abbreviation} style={{ width: 40, height: 40, objectFit: "contain" }} />
            : <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#666" }}>{team.abbreviation}</span>
          }
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
          <div style={{ fontSize: "0.72rem", color: "#555", fontFamily: "monospace", marginTop: 2 }}>{team.abbreviation}</div>
        </div>
      </div>

      {/* Roster */}
      <div style={{ padding: "14px 20px", flex: 1 }}>
        {players.length === 0 ? (
          <p style={{ color: "#333", fontSize: "0.78rem", margin: 0, fontStyle: "italic" }}>No players assigned</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {players.map((pt) => (
              <div key={pt.mc_uuid} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <img
                  src={`https://minotar.net/avatar/${pt.players?.mc_username}/24`}
                  alt=""
                  style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                />
                <span style={{ color: "#bbb", fontSize: "0.875rem", fontWeight: 500 }}>{pt.players?.mc_username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConferenceSection({ title, teams, players, accent }: { title: string; teams: Team[]; players: PlayerTeam[]; accent: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{title}</h3>
        <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
        <span style={{ fontSize: "0.7rem", color: "#444" }}>{teams.length} team{teams.length !== 1 ? "s" : ""}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} players={players.filter((pt) => pt.team_id === t.id)} />
        ))}
      </div>
    </div>
  );
}

export default function TeamsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [teams, setTeams] = React.useState<Team[]>([]);
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
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
      }).catch(() => {});
  }, [slug]);

  React.useEffect(() => {
    if (!slug || !season) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/teams?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
      fetch(`/api/teams/players?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
    ]).then(([t, pt]) => {
      setTeams(Array.isArray(t) ? t : []);
      setPlayerTeams(Array.isArray(pt) ? pt : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, season]);

  const westTeams = teams.filter((t) => t.division === "West");
  const eastTeams = teams.filter((t) => t.division === "East");
  const otherTeams = teams.filter((t) => !t.division);
  const hasConferences = westTeams.length > 0 || eastTeams.length > 0;

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Teams</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay} · {season} · {teams.length} teams</p>
        </div>
        {seasons.length > 0 && (
          <select value={season} onChange={(e) => setSeason(e.target.value)}
            style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", color: "#fff", borderRadius: "0.75rem", padding: "6px 14px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading teams...</div>
      ) : teams.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "#555" }}>No teams this season.</div>
      ) : hasConferences ? (
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 36 }}>
          {westTeams.length > 0 && (
            <ConferenceSection title="Western Conference" teams={westTeams} players={playerTeams} accent="#ef4444" />
          )}
          {eastTeams.length > 0 && (
            <ConferenceSection title="Eastern Conference" teams={eastTeams} players={playerTeams} accent="#3b82f6" />
          )}
          {otherTeams.length > 0 && (
            <ConferenceSection title="Other" teams={otherTeams} players={playerTeams} accent="#888" />
          )}
        </div>
      ) : (
        <div style={{ padding: 28, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} players={playerTeams.filter((pt) => pt.team_id === t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
