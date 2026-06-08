"use client";

import Link from "next/link";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null };
type Game = { id: string; status: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null };
type StandingRow = { team: Team; w: number; l: number; pf: number; pa: number; pct: number; diff: number; confW: number; confL: number; confPct: number };

function TeamLogo({ team, size = 32 }: { team: Team; size?: number }) {
  if (team.logo_url) {
    return <img src={team.logo_url} alt={team.abbreviation} width={size} height={size} style={{ objectFit: "contain", borderRadius: 8, flexShrink: 0, width: size, height: size }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 8, background: "#111827", border: "1px solid #263244", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, fontWeight: 900, color: "#94a3b8" }}>
      {team.abbreviation}
    </div>
  );
}

function computeH2HRecord(teamId: string, otherIds: Set<string>, games: Game[]): number {
  let w = 0, l = 0;
  for (const g of games) {
    if (g.status !== "completed") continue;
    const hs = g.home_score ?? 0;
    const as = g.away_score ?? 0;
    if (g.home_team_id === teamId && otherIds.has(g.away_team_id)) hs > as ? w++ : l++;
    else if (g.away_team_id === teamId && otherIds.has(g.home_team_id)) as > hs ? w++ : l++;
  }
  return w + l > 0 ? w / (w + l) : -1;
}

function applyTiebreakers(group: StandingRow[], games: Game[]): StandingRow[] {
  if (group.length <= 1) return group;
  const groupIds = new Set(group.map((r) => r.team.id));
  return [...group].sort((a, b) => {
    const confDiff = b.confPct - a.confPct;
    if (Math.abs(confDiff) > 0.0001) return confDiff;
    const aH2H = computeH2HRecord(a.team.id, new Set([...groupIds].filter((id) => id !== a.team.id)), games);
    const bH2H = computeH2HRecord(b.team.id, new Set([...groupIds].filter((id) => id !== b.team.id)), games);
    if (Math.abs(bH2H - aH2H) > 0.0001) return bH2H - aH2H;
    return b.diff - a.diff;
  });
}

function sortStandings(rows: StandingRow[], games: Game[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => b.w !== a.w ? b.w - a.w : b.pct - a.pct);
  const groups: StandingRow[][] = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0].w === row.w && Math.abs(last[0].pct - row.pct) < 0.0001) last.push(row);
    else groups.push([row]);
  }
  return groups.flatMap((g) => applyTiebreakers(g, games));
}

function StandingsTable({ rows, games, league, accent = "#38bdf8" }: { rows: StandingRow[]; games: Game[]; league: string; accent?: string }) {
  if (rows.length === 0) return <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 }}>No teams yet.</div>;
  const sorted = sortStandings(rows, games);
  const leader = sorted[0];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: 720, fontSize: 14, borderCollapse: "separate", borderSpacing: 0 }}>
        <thead>
          <tr>
            {["#", "Team", "W", "L", "PCT", "GB", "CONF", "DIFF"].map((h) => (
              <th key={h} style={{
                padding: "12px 14px",
                fontSize: 11,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "#64748b",
                textAlign: h === "Team" ? "left" : "center",
                whiteSpace: "nowrap",
                borderBottom: "1px solid #263244",
                background: "#0b0f16",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const gb = i === 0 ? "-" : ((leader.w - leader.l - (row.w - row.l)) / 2).toFixed(1);
            const gp = row.w + row.l;
            const isFirst = i === 0;
            return (
              <tr key={row.team.id} style={{ background: isFirst ? `${accent}12` : "transparent" }}>
                <td style={{ padding: "13px 14px", textAlign: "center", color: isFirst ? "#f8fafc" : "#94a3b8", fontSize: 13, fontWeight: 900, borderBottom: "1px solid #151c28" }}>{i + 1}</td>
                <td style={{ padding: "13px 14px", borderBottom: "1px solid #151c28" }}>
                  <Link href={`/${league}/teams`} style={{ display: "flex", alignItems: "center", gap: 11, textDecoration: "none" }}>
                    <TeamLogo team={row.team} />
                    <span>
                      <span style={{ display: "block", fontWeight: 900, color: "#f8fafc", fontSize: 15, lineHeight: 1.15 }}>{row.team.name}</span>
                      <span style={{ color: "#64748b", fontSize: 11, fontWeight: 900, letterSpacing: "0.08em" }}>{row.team.abbreviation}</span>
                    </span>
                  </Link>
                </td>
                <td style={{ padding: "13px 14px", textAlign: "center", fontWeight: 900, color: "#22c55e", fontSize: 15, borderBottom: "1px solid #151c28" }}>{row.w}</td>
                <td style={{ padding: "13px 14px", textAlign: "center", color: "#fb7185", fontWeight: 800, fontSize: 15, borderBottom: "1px solid #151c28" }}>{row.l}</td>
                <td style={{ padding: "13px 14px", textAlign: "center", fontWeight: 800, color: "#e2e8f0", borderBottom: "1px solid #151c28" }}>{gp > 0 ? row.pct.toFixed(3).replace(/^0/, "") : ".000"}</td>
                <td style={{ padding: "13px 14px", textAlign: "center", color: "#94a3b8", borderBottom: "1px solid #151c28" }}>{gb}</td>
                <td style={{ padding: "13px 14px", textAlign: "center", color: "#94a3b8", borderBottom: "1px solid #151c28" }}>{row.confW + row.confL > 0 ? `${row.confW}-${row.confL}` : "-"}</td>
                <td style={{ padding: "13px 14px", textAlign: "center", fontWeight: 900, borderBottom: "1px solid #151c28", color: row.diff > 0 ? "#22c55e" : row.diff < 0 ? "#fb7185" : "#94a3b8" }}>
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
  const [season, setSeason] = React.useState("");
  const [viewAll, setViewAll] = React.useState(false);

  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/stats/seasons?league=${slug}`)
      .then((r) => r.json())
      .then((data: { season: string }[]) => {
        if (!Array.isArray(data)) return;
        const unique = [...new Set(data.map((d) => d.season).filter((s) => s && !s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
        setSeasons(unique);
        if (unique.length > 0 && !season) setSeason(unique[0]);
      }).catch(() => {});
  }, [slug, season]);

  React.useEffect(() => {
    if (!slug || !season) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/teams?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
      fetch(`/api/games?league=${slug}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
    ]).then(([teams, gamesData]: [Team[], Game[]]) => {
      if (!Array.isArray(teams) || !Array.isArray(gamesData)) {
        setLoading(false);
        return;
      }
      const completedGames = gamesData.filter((g) => g.status === "completed");
      setGames(completedGames);
      const map: Record<string, StandingRow> = {};
      for (const t of teams) map[t.id] = { team: t, w: 0, l: 0, pf: 0, pa: 0, pct: 0, diff: 0, confW: 0, confL: 0, confPct: 0 };
      for (const g of completedGames) {
        const hs = g.home_score ?? 0;
        const as = g.away_score ?? 0;
        if (map[g.home_team_id]) {
          map[g.home_team_id].pf += hs;
          map[g.home_team_id].pa += as;
          hs > as ? map[g.home_team_id].w++ : map[g.home_team_id].l++;
        }
        if (map[g.away_team_id]) {
          map[g.away_team_id].pf += as;
          map[g.away_team_id].pa += hs;
          as > hs ? map[g.away_team_id].w++ : map[g.away_team_id].l++;
        }
      }
      for (const g of completedGames) {
        const hr = map[g.home_team_id];
        const ar = map[g.away_team_id];
        if (!hr || !ar || !hr.team.division || hr.team.division !== ar.team.division) continue;
        const hs = g.home_score ?? 0;
        const as = g.away_score ?? 0;
        if (hs > as) { hr.confW++; ar.confL++; } else { hr.confL++; ar.confW++; }
      }
      for (const row of Object.values(map)) {
        const cGP = row.confW + row.confL;
        row.confPct = cGP > 0 ? row.confW / cGP : 0;
        const gp = row.w + row.l;
        row.pct = gp > 0 ? row.w / gp : 0;
        row.diff = row.pf - row.pa;
      }
      setAllRows(Object.values(map));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, season]);

  const hasDivisions = allRows.some((r) => r.team.division === "East" || r.team.division === "West");
  const eastRows = allRows.filter((r) => r.team.division === "East");
  const westRows = allRows.filter((r) => r.team.division === "West");

  return (
    <div style={{ borderRadius: 18, border: "1px solid #263244", background: "#0b0f16", overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.28)" }}>
      <div style={{ padding: "22px 24px", borderBottom: "1px solid #263244", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, background: "linear-gradient(135deg,#0f172a 0%,#0b0f16 62%,rgba(127,29,29,0.28) 100%)" }}>
        <div>
          <div style={{ color: "#f43f5e", fontSize: 11, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase" }}>{leagueDisplay}</div>
          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3.2rem)", fontWeight: 950, color: "#fff", margin: "3px 0 0", lineHeight: 1 }}>Standings</h2>
          <p style={{ color: "#94a3b8", fontSize: 14, margin: "8px 0 0" }}>{season || "Season"} table, tiebreakers, and point differential.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/${slug}/teams`} style={{ border: "1px solid #334155", background: "#111827", color: "#f8fafc", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 900, textDecoration: "none" }}>
            View Teams
          </Link>
          {hasDivisions && (
            <div style={{ display: "flex", background: "#05070b", border: "1px solid #334155", borderRadius: 10, overflow: "hidden" }}>
              {(["Conferences", "All"] as const).map((label) => {
                const active = label === "All" ? viewAll : !viewAll;
                return (
                  <button key={label} type="button" onClick={() => setViewAll(label === "All")}
                    style={{ padding: "10px 14px", fontSize: 13, fontWeight: 900, border: "none", cursor: "pointer", background: active ? "#dc2626" : "transparent", color: active ? "#fff" : "#94a3b8" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <select value={season} onChange={(e) => { setSeason(e.target.value); setLoading(true); }}
            style={{ background: "#05070b", border: "1px solid #334155", color: "#fff", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 800, outline: "none", cursor: "pointer" }}>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 58, textAlign: "center", color: "#64748b" }}>Loading standings...</div>
      ) : allRows.length === 0 ? (
        <div style={{ padding: 58, textAlign: "center", color: "#64748b" }}>No teams or games yet.</div>
      ) : hasDivisions && !viewAll ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 0 }}>
          <div style={{ borderRight: "1px solid #1f2937" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #263244", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ fontSize: 12, fontWeight: 900, color: "#fecaca", textTransform: "uppercase", letterSpacing: "0.14em" }}>Western Conference</span>
            </div>
            <StandingsTable rows={westRows} games={games} league={slug} accent="#ef4444" />
          </div>
          <div>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #263244", display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#38bdf8" }} />
              <span style={{ fontSize: 12, fontWeight: 900, color: "#bae6fd", textTransform: "uppercase", letterSpacing: "0.14em" }}>Eastern Conference</span>
            </div>
            <StandingsTable rows={eastRows} games={games} league={slug} accent="#38bdf8" />
          </div>
        </div>
      ) : (
        <StandingsTable rows={allRows} games={games} league={slug} />
      )}

      {!loading && allRows.length > 0 && (
        <div style={{ padding: "13px 20px", borderTop: "1px solid #263244", fontSize: 12, color: "#64748b", background: "#080b11" }}>
          Tiebreakers: Wins, win percentage, conference record, head-to-head, then point differential.
        </div>
      )}
    </div>
  );
}
