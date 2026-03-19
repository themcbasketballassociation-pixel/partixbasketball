"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null };
type Game = { id: string; status: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; season?: string };
type StandingRow = { team: Team; w: number; l: number; pf: number; pa: number; pct: number; diff: number; confW: number; confL: number; confPct: number };

function TeamLogo({ team, size = 32 }: { team: Team; size?: number }) {
  if (team.logo_url) return <img src={team.logo_url} alt={team.abbreviation} width={size} height={size} style={{ objectFit: "contain", borderRadius: 4, flexShrink: 0, width: size, height: size }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: 4, background: "#1e1e1e", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: size < 32 ? 9 : 11, fontWeight: 700, color: "#888" }}>
      {team.abbreviation}
    </div>
  );
}

function computeH2HRecord(teamId: string, otherIds: Set<string>, games: Game[]): number {
  let w = 0, l = 0;
  for (const g of games) {
    if (g.status !== "completed") continue;
    const hs = g.home_score ?? 0, as_ = g.away_score ?? 0;
    if (g.home_team_id === teamId && otherIds.has(g.away_team_id)) { hs > as_ ? w++ : l++; }
    else if (g.away_team_id === teamId && otherIds.has(g.home_team_id)) { as_ > hs ? w++ : l++; }
  }
  return w + l > 0 ? w / (w + l) : -1;
}

function applyTiebreakers(group: StandingRow[], games: Game[]): StandingRow[] {
  if (group.length <= 1) return group;
  const groupIds = new Set(group.map((r) => r.team.id));
  return [...group].sort((a, b) => {
    const confDiff = b.confPct - a.confPct;
    if (Math.abs(confDiff) > 0.0001) return confDiff;
    const aH2H = computeH2HRecord(a.team.id, new Set([...groupIds].filter(id => id !== a.team.id)), games);
    const bH2H = computeH2HRecord(b.team.id, new Set([...groupIds].filter(id => id !== b.team.id)), games);
    if (Math.abs(bH2H - aH2H) > 0.0001) return bH2H - aH2H;
    return b.diff - a.diff;
  });
}

function sortStandings(rows: StandingRow[], games: Game[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  const groups: StandingRow[][] = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].pct - row.pct) < 0.0001) last.push(row);
    else groups.push([row]);
  }
  return groups.flatMap((g) => applyTiebreakers(g, games));
}

function StandingsTable({ rows, games }: { rows: StandingRow[]; games: Game[] }) {
  if (rows.length === 0) return <div style={{ padding: 48, textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No teams yet.</div>;
  const sorted = sortStandings(rows, games);
  const leader = sorted[0];
  const headers = ["#", "Team", "W", "L", "PCT", "GB", "CONF", "PF", "PA", "DIFF"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ minWidth: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
            {headers.map((h) => (
              <th key={h} style={{
                padding: "12px 12px",
                fontSize: "0.7rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#555",
                textAlign: h === "Team" ? "left" : "center",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const gb = i === 0 ? "—" : ((leader.w - leader.l - (row.w - row.l)) / 2).toFixed(1);
            const gp = row.w + row.l;
            return (
              <tr key={row.team.id} style={{ borderTop: "1px solid #1e1e1e", background: i === 0 ? "rgba(255,255,255,0.03)" : undefined }}>
                <td style={{ padding: "12px 16px", textAlign: "center", color: "#555", fontSize: "0.75rem", fontFamily: "monospace" }}>{i + 1}</td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TeamLogo team={row.team} size={28} />
                    <div>
                      <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.875rem", display: "block" }}>{row.team.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "#555", fontFamily: "monospace" }}>
                        {row.team.abbreviation}
                        {row.team.division && <span style={{ marginLeft: 6, color: "#444" }}>{row.team.division}</span>}
                      </span>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px", textAlign: "center", fontWeight: 700, color: "#4ade80" }}>{row.w}</td>
                <td style={{ padding: "12px", textAlign: "center", color: "#f87171" }}>{row.l}</td>
                <td style={{ padding: "12px", textAlign: "center", fontWeight: 600, color: "#fff" }}>{gp > 0 ? row.pct.toFixed(3) : ".000"}</td>
                <td style={{ padding: "12px", textAlign: "center", color: "#888", fontSize: "0.75rem" }}>{gb}</td>
                <td style={{ padding: "12px", textAlign: "center", color: "#888", fontSize: "0.75rem" }}>{row.confW + row.confL > 0 ? `${row.confW}-${row.confL}` : "—"}</td>
                <td style={{ padding: "12px", textAlign: "center", color: "#888" }}>{row.pf}</td>
                <td style={{ padding: "12px", textAlign: "center", color: "#888" }}>{row.pa}</td>
                <td style={{ padding: "12px", textAlign: "center", fontWeight: 600, fontSize: "0.75rem", color: row.diff > 0 ? "#4ade80" : row.diff < 0 ? "#f87171" : "#555" }}>
                  {row.diff > 0 ? "+" : ""}{row.diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StandingsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [allRows, setAllRows] = React.useState<StandingRow[]>([]);
  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [divFilter, setDivFilter] = React.useState<"All" | "East" | "West">("All");
  const [seasons, setSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");

  // Fetch available seasons
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
          if (unique.length > 0 && !season) setSeason(unique[0]);
        }
      })
      .catch(() => {});
  }, [slug]);

  // Fetch standings data when season changes
  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/teams?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
      fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
    ]).then(([teams, gamesData]: [Team[], Game[]]) => {
      if (!Array.isArray(teams) || !Array.isArray(gamesData)) { setLoading(false); return; }
      const completedGames = gamesData.filter((g) => g.status === "completed");
      setGames(completedGames);
      const map: Record<string, StandingRow> = {};
      for (const t of teams) map[t.id] = { team: t, w: 0, l: 0, pf: 0, pa: 0, pct: 0, diff: 0, confW: 0, confL: 0, confPct: 0 };
      for (const g of completedGames) {
        const hs = g.home_score ?? 0, as_ = g.away_score ?? 0;
        if (map[g.home_team_id]) { map[g.home_team_id].pf += hs; map[g.home_team_id].pa += as_; hs > as_ ? map[g.home_team_id].w++ : map[g.home_team_id].l++; }
        if (map[g.away_team_id]) { map[g.away_team_id].pf += as_; map[g.away_team_id].pa += hs; as_ > hs ? map[g.away_team_id].w++ : map[g.away_team_id].l++; }
      }
      for (const g of completedGames) {
        const hr = map[g.home_team_id], ar = map[g.away_team_id];
        if (!hr || !ar || !hr.team.division || hr.team.division !== ar.team.division) continue;
        const hs = g.home_score ?? 0, as_ = g.away_score ?? 0;
        if (hs > as_) { hr.confW++; ar.confL++; } else { hr.confL++; ar.confW++; }
      }
      for (const row of Object.values(map)) {
        const cGP = row.confW + row.confL; row.confPct = cGP > 0 ? row.confW / cGP : 0;
        const gp = row.w + row.l; row.pct = gp > 0 ? row.w / gp : 0;
        row.diff = row.pf - row.pa;
      }
      setAllRows(Object.values(map));
      setLoading(false);
    });
  }, [slug, season]);

  const hasDivisions = allRows.some((r) => r.team.division);
  const filteredRows = divFilter === "All" ? allRows : allRows.filter((r) => r.team.division === divFilter);

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Standings</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <select
            value={season}
            onChange={(e) => { setSeason(e.target.value); setLoading(true); }}
            style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: "0.75rem", padding: "6px 12px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}
          >
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasDivisions && (
            <div style={{ display: "flex", borderRadius: "0.5rem", border: "1px solid #1e1e1e", overflow: "hidden", fontSize: "0.875rem" }}>
              {(["All", "East", "West"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDivFilter(d)}
                  style={{
                    padding: "6px 16px",
                    fontWeight: 500,
                    background: divFilter === d ? "#fff" : "#111",
                    color: divFilter === d ? "#000" : "#888",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {loading
        ? <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Loading standings...</div>
        : allRows.length === 0
        ? <div style={{ padding: 40, textAlign: "center", color: "#555" }}>No teams or games yet.</div>
        : <StandingsTable rows={filteredRows} games={games} />}
      {!loading && allRows.length > 0 && (
        <div style={{ padding: "12px 24px", borderTop: "1px solid #1e1e1e", fontSize: "0.75rem", color: "#444" }}>
          Tiebreakers: Record → Conf Record → H2H → Point Diff
        </div>
      )}
    </div>
  );
}
