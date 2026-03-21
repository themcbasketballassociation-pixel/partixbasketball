"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null };
type Game = { id: string; status: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null };
type StandingRow = { team: Team; w: number; l: number; pf: number; pa: number; pct: number; diff: number; confW: number; confL: number; confPct: number };

function TeamLogo({ team, size = 28 }: { team: Team; size?: number }) {
  if (team.logo_url) return (
    <img src={team.logo_url} alt={team.abbreviation} width={size} height={size}
      style={{ objectFit: "contain", borderRadius: 4, flexShrink: 0, width: size, height: size }} />
  );
  return (
    <div style={{ width: size, height: size, borderRadius: 4, background: "#1e1e1e", border: "1px solid #2a2a2a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, fontWeight: 700, color: "#888" }}>
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

function StandingsTable({ rows, games, accent }: { rows: StandingRow[]; games: Game[]; accent?: string }) {
  if (rows.length === 0) return <div style={{ padding: 32, textAlign: "center", color: "#555", fontSize: "0.875rem" }}>No teams yet.</div>;
  const sorted = sortStandings(rows, games);
  const leader = sorted[0];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e1e1e" }}>
            {["#", "Team", "W", "L", "PCT", "GB", "CONF", "DIFF"].map((h) => (
              <th key={h} style={{
                padding: "10px 12px",
                fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                color: "#444", textAlign: h === "Team" ? "left" : "center", whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const gb = i === 0 ? "—" : ((leader.w - leader.l - (row.w - row.l)) / 2).toFixed(1);
            const gp = row.w + row.l;
            const isFirst = i === 0;
            return (
              <tr key={row.team.id} style={{
                borderTop: "1px solid #1a1a1a",
                background: isFirst ? "rgba(255,255,255,0.02)" : undefined,
                transition: "background 0.1s",
              }}>
                <td style={{ padding: "11px 14px", textAlign: "center", color: "#444", fontSize: "0.7rem", fontWeight: 600 }}>{i + 1}</td>
                <td style={{ padding: "11px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TeamLogo team={row.team} size={26} />
                    <div>
                      <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.875rem", lineHeight: 1.2 }}>{row.team.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "#555", fontFamily: "monospace" }}>{row.team.abbreviation}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "11px 10px", textAlign: "center", fontWeight: 700, color: "#4ade80", fontSize: "0.875rem" }}>{row.w}</td>
                <td style={{ padding: "11px 10px", textAlign: "center", color: "#f87171", fontSize: "0.875rem" }}>{row.l}</td>
                <td style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, color: "#fff", fontSize: "0.8rem" }}>
                  {gp > 0 ? row.pct.toFixed(3).replace(/^0/, "") : ".000"}
                </td>
                <td style={{ padding: "11px 10px", textAlign: "center", color: "#555", fontSize: "0.75rem" }}>{gb}</td>
                <td style={{ padding: "11px 10px", textAlign: "center", color: "#666", fontSize: "0.75rem" }}>
                  {row.confW + row.confL > 0 ? `${row.confW}-${row.confL}` : "—"}
                </td>
                <td style={{ padding: "11px 10px", textAlign: "center", fontWeight: 600, fontSize: "0.75rem",
                  color: row.diff > 0 ? "#4ade80" : row.diff < 0 ? "#f87171" : "#555" }}>
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
          if (unique.length > 0 && !season) setSeason(unique[0]);
        }
      }).catch(() => {});
  }, [slug]);

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

  const hasDivisions = allRows.some((r) => r.team.division === "East" || r.team.division === "West");
  const eastRows = allRows.filter((r) => r.team.division === "East");
  const westRows = allRows.filter((r) => r.team.division === "West");

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Standings</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay} · {season}</p>
        </div>
        <select value={season} onChange={(e) => { setSeason(e.target.value); setLoading(true); }}
          style={{ background: "#0d0d0d", border: "1px solid #2a2a2a", color: "#fff", borderRadius: "0.75rem", padding: "6px 14px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
          {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: "#555" }}>Loading standings...</div>
      ) : allRows.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center", color: "#555" }}>No teams or games yet.</div>
      ) : hasDivisions ? (
        /* Conference standings — two panels side by side */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          {/* West */}
          <div style={{ borderRight: "1px solid #1e1e1e" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.12em" }}>Western Conference</span>
            </div>
            <StandingsTable rows={westRows} games={games} accent="#ef4444" />
          </div>
          {/* East */}
          <div>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.12em" }}>Eastern Conference</span>
            </div>
            <StandingsTable rows={eastRows} games={games} accent="#3b82f6" />
          </div>
        </div>
      ) : (
        /* No conferences — single table */
        <StandingsTable rows={allRows} games={games} />
      )}

      {!loading && allRows.length > 0 && (
        <div style={{ padding: "10px 20px", borderTop: "1px solid #1e1e1e", fontSize: "0.7rem", color: "#383838" }}>
          Tiebreakers: Win % → Conf Record → H2H → Point Diff
        </div>
      )}
    </div>
  );
}
