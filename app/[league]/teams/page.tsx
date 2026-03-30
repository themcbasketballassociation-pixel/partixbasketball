"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

const TOTAL_CAP = 25000;

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null; color2?: string | null };
type Player = { mc_uuid: string; mc_username: string };
type PlayerTeam = { mc_uuid: string; team_id: string; players: Player };
type Contract = { team_id: string; amount: number };

function TeamCard({ team, players, capUsed }: { team: Team; players: PlayerTeam[]; capUsed: number }) {
  const accent = team.color2 ?? null;
  return (
    <div style={{
      borderRadius: "0.875rem",
      border: "1px solid #1e1e1e",
      background: "#161616",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      borderLeft: accent ? `3px solid ${accent}` : "1px solid #1e1e1e",
    }}>
      {/* Logo + name */}
      <div style={{
        borderBottom: "1px solid #1e1e1e",
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8,
          background: "#111", border: "1px solid #2a2a2a",
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

      {/* Cap bar */}
      <div style={{ padding: "10px 18px 14px", borderTop: "1px solid #1e1e1e" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ color: "#555", fontSize: "0.72rem" }}>Cap used</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>
            <span style={{ color: capUsed > TOTAL_CAP ? "#ef4444" : "#aaa" }}>{capUsed.toLocaleString()}</span>
            <span style={{ color: "#333" }}> / </span>
            <span style={{ color: "#444" }}>{TOTAL_CAP.toLocaleString()}</span>
          </span>
        </div>
        <div style={{ background: "#111", borderRadius: 4, height: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, (capUsed / TOTAL_CAP) * 100)}%`,
            background: capUsed > TOTAL_CAP ? "#ef4444" : capUsed / TOTAL_CAP > 0.8 ? "#f59e0b" : "#22c55e",
            borderRadius: 4,
            transition: "width 0.3s",
          }} />
        </div>
        <div style={{ color: capUsed > TOTAL_CAP ? "#ef4444" : "#22c55e", fontSize: "0.72rem", marginTop: 4, textAlign: "right" }}>
          {capUsed > TOTAL_CAP ? `-${(capUsed - TOTAL_CAP).toLocaleString()} over` : `${(TOTAL_CAP - capUsed).toLocaleString()} available`}
        </div>
      </div>
    </div>
  );
}

function EvenGrid({ teams, players, capByTeam }: { teams: Team[]; players: PlayerTeam[]; capByTeam: Map<string, number> }) {
  const cols = Math.max(2, Math.ceil(teams.length / 2));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
      {teams.map((t) => (
        <TeamCard key={t.id} team={t} players={players.filter((pt) => pt.team_id === t.id)} capUsed={capByTeam.get(t.id) ?? 0} />
      ))}
    </div>
  );
}

function ConferenceSection({ title, teams, players, capByTeam, accent }: { title: string; teams: Team[]; players: PlayerTeam[]; capByTeam: Map<string, number>; accent: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{title}</h3>
        <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
        <span style={{ fontSize: "0.7rem", color: "#444" }}>{teams.length} team{teams.length !== 1 ? "s" : ""}</span>
      </div>
      <EvenGrid teams={teams} players={players} capByTeam={capByTeam} />
    </div>
  );
}

export default function TeamsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [teams, setTeams] = React.useState<Team[]>([]);
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [contracts, setContracts] = React.useState<Contract[]>([]);
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
      fetch(`/api/contracts?league=${slug}&season=${encodeURIComponent(season)}&status=active`).then((r) => r.json()),
    ]).then(([t, pt, c]) => {
      setTeams(Array.isArray(t) ? t : []);
      setPlayerTeams(Array.isArray(pt) ? pt : []);
      setContracts(Array.isArray(c) ? c : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, season]);

  const westTeams = teams.filter((t) => t.division === "West");
  const eastTeams = teams.filter((t) => t.division === "East");
  const otherTeams = teams.filter((t) => !t.division);
  const hasConferences = westTeams.length > 0 || eastTeams.length > 0;

  const capByTeam = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contracts) {
      m.set(c.team_id, (m.get(c.team_id) ?? 0) + c.amount);
    }
    return m;
  }, [contracts]);

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
            <ConferenceSection title="Western Conference" teams={westTeams} players={playerTeams} capByTeam={capByTeam} accent="#ef4444" />
          )}
          {eastTeams.length > 0 && (
            <ConferenceSection title="Eastern Conference" teams={eastTeams} players={playerTeams} capByTeam={capByTeam} accent="#3b82f6" />
          )}
          {otherTeams.length > 0 && (
            <ConferenceSection title="Other" teams={otherTeams} players={playerTeams} capByTeam={capByTeam} accent="#888" />
          )}
        </div>
      ) : (
        <div style={{ padding: 28 }}>
          <EvenGrid teams={teams} players={playerTeams} capByTeam={capByTeam} />
        </div>
      )}
    </div>
  );
}
