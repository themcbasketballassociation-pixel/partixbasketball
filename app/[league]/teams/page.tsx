"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

const TOTAL_CAP = 25000;

// ── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; abbreviation: string; division: string | null; logo_url: string | null; color2?: string | null };
type Player = { mc_uuid: string; mc_username: string };
type PlayerTeam = { mc_uuid: string; team_id: string; season: string | null; players: Player };
type ContractSimple = { team_id: string; amount: number };
type ContractFull = { id: string; mc_uuid: string; team_id: string; amount: number; is_two_season: boolean; season: string | null; players: Player };
type Accolade = { mc_uuid: string; type: string; season: string };
type StatRow = { mc_uuid: string; mc_username?: string; ppg: number | null; rpg: number | null; apg: number | null; spg: number | null; bpg: number | null; gp: number | null; fg_pct: number | null; topg: number | null };
type Game = {
  id: string; league: string; season: string | null;
  home_team_id: string; away_team_id: string;
  scheduled_at: string; home_score: number | null; away_score: number | null; status: string;
  home_team: { name: string; abbreviation: string; logo_url: string | null } | null;
  away_team: { name: string; abbreviation: string; logo_url: string | null } | null;
};

function fmt(n: number | null | undefined, dec = 1) {
  if (n == null) return "—";
  return n.toFixed(dec);
}

// ── Team Detail Modal ─────────────────────────────────────────────────────────

function TeamDetailModal({ team, league, seasons, defaultSeason, onClose }: {
  team: Team; league: string; seasons: string[]; defaultSeason: string; onClose: () => void;
}) {
  const [modalSeason, setModalSeason] = React.useState(defaultSeason || seasons[0] || "");
  const [allSeasons, setAllSeasons] = React.useState<string[]>(seasons);

  // Static data (championships)
  const [allAccolades, setAllAccolades] = React.useState<Accolade[]>([]);
  const [allPlayerTeams, setAllPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [allGames, setAllGames] = React.useState<Game[]>([]);
  const [loadingStatic, setLoadingStatic] = React.useState(true);

  // Season-specific data
  const [contracts, setContracts] = React.useState<ContractFull[]>([]);
  const [stats, setStats] = React.useState<StatRow[]>([]);
  const [seasonRoster, setSeasonRoster] = React.useState<PlayerTeam[]>([]);
  const [loadingSeason, setLoadingSeason] = React.useState(true);

  // Lock body scroll
  React.useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Fetch static data once
  React.useEffect(() => {
    setLoadingStatic(true);
    Promise.all([
      fetch(`/api/accolades?league=${league}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${league}`).then(r => r.json()),
      fetch(`/api/games?league=${league}`).then(r => r.json()),
      fetch(`/api/stats/seasons?league=${league}`).then(r => r.json()),
    ]).then(([accolades, pt, games, sznData]) => {
      setAllAccolades(Array.isArray(accolades) ? accolades : []);
      setAllPlayerTeams(Array.isArray(pt) ? pt : []);
      setAllGames(Array.isArray(games) ? games : []);
      if (Array.isArray(sznData)) {
        const all = [...new Set((sznData as { season: string }[]).map(d => d.season).filter(Boolean))].sort((a, b) => b.localeCompare(a));
        if (all.length > 0) setAllSeasons(all);
      }
      setLoadingStatic(false);
    }).catch(() => setLoadingStatic(false));
  }, [league]);

  // Fetch season-specific data
  React.useEffect(() => {
    if (!modalSeason) return;
    setLoadingSeason(true);
    // First resolve the correct team ID for this season (teams are per-season rows)
    Promise.all([
      fetch(`/api/teams?league=${league}&season=${encodeURIComponent(modalSeason)}`).then(r => r.json()),
      fetch(`/api/stats?league=${league}&season=${encodeURIComponent(modalSeason)}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${league}&season=${encodeURIComponent(modalSeason)}`).then(r => r.json()),
    ]).then(([seasonTeams, s, pt]) => {
      // Match this team to the season's version by name
      const seasonTeam = Array.isArray(seasonTeams)
        ? seasonTeams.find((t: { id: string; name: string }) => t.name === team.name)
        : null;
      const effectiveId = seasonTeam?.id ?? team.id;
      return fetch(`/api/contracts?league=${league}&team_id=${effectiveId}&season=${encodeURIComponent(modalSeason)}&status=active`)
        .then(r => r.json())
        .then(c => {
          setContracts(Array.isArray(c) ? c : []);
          setStats(Array.isArray(s) ? s : []);
          setSeasonRoster((Array.isArray(pt) ? pt : []).filter((p: PlayerTeam) => p.team_id === effectiveId));
          setLoadingSeason(false);
        });
    }).catch(() => setLoadingSeason(false));
  }, [league, team.id, team.name, modalSeason]);

  // Championships: seasons where this team won a Finals
  const championships = React.useMemo(() => {
    const champs = allAccolades.filter(a => a.type === "Finals Champion");
    const champSeasons = [...new Set(champs.map(a => a.season))];
    return champSeasons.filter(szn => {
      const champUuids = new Set(champs.filter(a => a.season === szn).map(a => a.mc_uuid));
      return allPlayerTeams.some(pt => pt.team_id === team.id && pt.season === szn && champUuids.has(pt.mc_uuid));
    }).sort((a, b) => b.localeCompare(a));
  }, [allAccolades, allPlayerTeams, team.id]);

  // Cap usage
  const capUsed = contracts.reduce((sum, c) => sum + c.amount, 0);
  const showCap = league !== "mcaa" && league !== "mbgl";

  // Team stats for selected season (filtered to roster)
  const rosterUuids = React.useMemo(() => new Set(seasonRoster.map(pt => pt.mc_uuid)), [seasonRoster]);
  const teamStats = React.useMemo(() => stats.filter(s => rosterUuids.has(s.mc_uuid)), [stats, rosterUuids]);

  // Team totals per game = sum of each player's per-game averages
  const totals = React.useMemo(() => {
    if (teamStats.length === 0) return null;
    let ppg = 0, rpg = 0, apg = 0, spg = 0, bpg = 0, topg = 0, gp = 0;
    for (const s of teamStats) {
      ppg  += s.ppg  ?? 0;
      rpg  += s.rpg  ?? 0;
      apg  += s.apg  ?? 0;
      spg  += s.spg  ?? 0;
      bpg  += s.bpg  ?? 0;
      topg += s.topg ?? 0;
      gp = Math.max(gp, s.gp ?? 0);
    }
    if (gp === 0) return null;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return { ppg: r1(ppg), rpg: r1(rpg), apg: r1(apg), spg: r1(spg), bpg: r1(bpg), topg: r1(topg), gp };
  }, [teamStats]);

  // Games for this team — match by ID OR abbreviation (teams can get new UUIDs each season)
  // Include null-season games (games created without a season tag)
  const teamGames = React.useMemo(() => {
    const abbr = team.abbreviation;
    const all = allGames.filter(g =>
      g.home_team_id === team.id || g.away_team_id === team.id ||
      g.home_team?.abbreviation === abbr || g.away_team?.abbreviation === abbr
    );
    if (!modalSeason) return all;
    return all.filter(g => g.season === modalSeason || g.season == null);
  }, [allGames, team.id, team.abbreviation, modalSeason]);

  const accent = team.color2 ?? "#3b82f6";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 880, background: "#101318", borderRadius: "1.25rem", border: "1px solid #1c2028", borderTop: `3px solid ${accent}`, overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #1c2028", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 60, height: 60, borderRadius: 10, background: "#13161e", border: "1px solid #272c36", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
            {team.logo_url
              ? <img src={team.logo_url} alt={team.abbreviation} style={{ width: 50, height: 50, objectFit: "contain" }} />
              : <span style={{ fontSize: "1rem", fontWeight: 800, color: "#666" }}>{team.abbreviation}</span>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "1.4rem", lineHeight: 1.2 }}>{team.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.75rem", color: "#555", fontFamily: "monospace" }}>{team.abbreviation}</span>
              {team.division && <span style={{ fontSize: "0.72rem", color: "#444", border: "1px solid #272c36", borderRadius: 4, padding: "1px 6px" }}>{team.division}</span>}
              {!loadingStatic && championships.length > 0 && (
                <span style={{ fontSize: "0.8rem", color: "#fbbf24", fontWeight: 700 }}>
                  🏆 {championships.length}× Finals Champion
                </span>
              )}
            </div>
            {!loadingStatic && championships.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {championships.map(szn => (
                  <span key={szn} style={{ fontSize: "0.7rem", color: "#92400e", background: "#451a03", border: "1px solid #78350f", borderRadius: 4, padding: "1px 7px", fontWeight: 600 }}>{szn}</span>
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "1.5rem", padding: "4px 8px", lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* Season selector */}
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #1c2028", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#555", fontSize: "0.8rem" }}>Season</span>
          <select value={modalSeason} onChange={e => setModalSeason(e.target.value)}
            style={{ background: "#0a0d12", border: "1px solid #272c36", color: "#fff", borderRadius: "0.6rem", padding: "5px 12px", fontSize: "0.85rem", outline: "none", cursor: "pointer" }}>
            {allSeasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loadingSeason ? (
          <div style={{ padding: 60, textAlign: "center", color: "#555" }}>Loading...</div>
        ) : (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>

            {/* ── Roster & Salary Cap ───────────────────────────────────────── */}
            <section>
              <SectionHeader title={showCap ? "Roster & Salary Cap" : "Roster"} />
              {contracts.length === 0 && seasonRoster.length === 0 ? (
                <Empty text="No roster data for this season." />
              ) : (
                <>
                  <div style={{ border: "1px solid #1c2028", borderRadius: "0.75rem", overflow: "hidden", marginBottom: 14 }}>
                    {(contracts.length > 0 ? contracts : seasonRoster).map((row, i, arr) => {
                      const isContract = "amount" in row;
                      const c = row as ContractFull;
                      const pt = row as PlayerTeam;
                      const username = isContract ? (c.players?.mc_username ?? c.mc_uuid) : (pt.players?.mc_username ?? pt.mc_uuid);
                      return (
                        <div key={isContract ? c.mc_uuid : pt.mc_uuid} style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
                          borderBottom: i < arr.length - 1 ? "1px solid #171b26" : "none",
                          background: "#0a0d12",
                        }}>
                          <img
                            src={`https://minotar.net/avatar/${username}/24`} alt=""
                            style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0 }}
                            onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                          />
                          <span style={{ flex: 1, color: "#ddd", fontSize: "0.875rem", fontWeight: 500 }}>{username}</span>
                          {showCap && isContract && c.is_two_season && (
                            <span style={{ fontSize: "0.68rem", color: "#818cf8", border: "1px solid #4338ca", borderRadius: 4, padding: "1px 5px" }}>2-yr</span>
                          )}
                          {showCap && (isContract
                            ? <span style={{ color: "#aaa", fontSize: "0.875rem", fontFamily: "monospace", fontWeight: 600 }}>${c.amount.toLocaleString()}</span>
                            : <span style={{ color: "#555", fontSize: "0.78rem", fontStyle: "italic" }}>No contract</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {showCap && <CapBar capUsed={capUsed} />}
                </>
              )}
            </section>

            {/* ── Team Stats ────────────────────────────────────────────────── */}
            <section>
              <SectionHeader title={`Team Stats · ${modalSeason}`} />
              {teamStats.length === 0 ? (
                <Empty text="No stats recorded for this season." />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #222" }}>
                        {["Player","GP","PPG","RPG","APG","SPG","BPG","TO","FG%"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", color: "#555", fontWeight: 600, textAlign: h === "Player" ? "left" : "center", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teamStats.map((s, i) => (
                        <tr key={s.mc_uuid} style={{ borderBottom: "1px solid #111520", background: i % 2 === 0 ? "#0a0d12" : "transparent" }}>
                          <td style={{ padding: "8px 10px", color: "#ddd", fontWeight: 500 }}>{s.mc_username ?? s.mc_uuid}</td>
                          <td style={{ padding: "8px 10px", color: "#666", textAlign: "center" }}>{s.gp ?? "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#fff", textAlign: "center", fontWeight: 600 }}>{fmt(s.ppg)}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa", textAlign: "center" }}>{fmt(s.rpg)}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa", textAlign: "center" }}>{fmt(s.apg)}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa", textAlign: "center" }}>{fmt(s.spg)}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa", textAlign: "center" }}>{fmt(s.bpg)}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa", textAlign: "center" }}>{fmt(s.topg)}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa", textAlign: "center" }}>{s.fg_pct != null ? `${s.fg_pct.toFixed(1)}%` : "—"}</td>
                        </tr>
                      ))}
                      {totals && (
                        <tr style={{ borderTop: "2px solid #272c36", background: "#13161e" }}>
                          <td style={{ padding: "9px 10px", color: "#fff", fontWeight: 700 }}>TEAM AVG</td>
                          <td style={{ padding: "9px 10px", color: "#666", textAlign: "center" }}>{totals.gp}</td>
                          <td style={{ padding: "9px 10px", color: "#22c55e", textAlign: "center", fontWeight: 700 }}>{fmt(totals.ppg)}</td>
                          <td style={{ padding: "9px 10px", color: "#22c55e", textAlign: "center", fontWeight: 700 }}>{fmt(totals.rpg)}</td>
                          <td style={{ padding: "9px 10px", color: "#22c55e", textAlign: "center", fontWeight: 700 }}>{fmt(totals.apg)}</td>
                          <td style={{ padding: "9px 10px", color: "#22c55e", textAlign: "center", fontWeight: 700 }}>{fmt(totals.spg)}</td>
                          <td style={{ padding: "9px 10px", color: "#22c55e", textAlign: "center", fontWeight: 700 }}>{fmt(totals.bpg)}</td>
                          <td style={{ padding: "9px 10px", color: "#22c55e", textAlign: "center", fontWeight: 700 }}>{fmt(totals.topg)}</td>
                          <td style={{ padding: "9px 10px", color: "#555", textAlign: "center" }}>—</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Schedule ──────────────────────────────────────────────────── */}
            <section>
              <SectionHeader title={`Schedule · ${modalSeason}`} />
              {teamGames.length === 0 ? (
                <Empty text="No games found for this season." />
              ) : (() => {
                  const sorted = [...teamGames].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
                  // Group by ISO calendar week (Mon–Sun)
                  const epochMonday = (d: Date) => {
                    const day = d.getDay(); // 0=Sun
                    const diff = (day === 0 ? -6 : 1 - day);
                    const mon = new Date(d);
                    mon.setHours(0, 0, 0, 0);
                    mon.setDate(d.getDate() + diff);
                    return mon.getTime();
                  };
                  const weekGroups: { weekLabel: string; games: typeof sorted }[] = [];
                  let weekNum = 0;
                  let lastEpoch = -1;
                  for (const g of sorted) {
                    const epoch = epochMonday(new Date(g.scheduled_at));
                    if (epoch !== lastEpoch) {
                      weekNum++;
                      lastEpoch = epoch;
                      weekGroups.push({ weekLabel: `Week ${weekNum}`, games: [] });
                    }
                    weekGroups[weekGroups.length - 1].games.push(g);
                  }
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {weekGroups.map(({ weekLabel, games }) => (
                        <div key={weekLabel}>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{weekLabel}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {games.map(g => {
                              const isHome = g.home_team_id === team.id || g.home_team?.abbreviation === team.abbreviation;
                              const opponent = isHome ? g.away_team : g.home_team;
                              const myScore = isHome ? g.home_score : g.away_score;
                              const oppScore = isHome ? g.away_score : g.home_score;
                              const d = new Date(g.scheduled_at);
                              const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Etc/GMT+5" });
                              const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Etc/GMT+5" });
                              let result = "";
                              let resultColor = "#aaa";
                              if (g.status === "final" && myScore != null && oppScore != null) {
                                if (myScore > oppScore) { result = "W"; resultColor = "#22c55e"; }
                                else if (myScore < oppScore) { result = "L"; resultColor = "#ef4444"; }
                                else { result = "T"; }
                              }
                              return (
                                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#0a0d12", border: "1px solid #171b26", borderRadius: "0.6rem", flexWrap: "wrap" }}>
                                  <span style={{ color: "#555", fontSize: "0.75rem", minWidth: 120 }}>{date} · {time}</span>
                                  <span style={{ color: "#444", fontSize: "0.72rem", minWidth: 14, textAlign: "center" }}>{isHome ? "vs" : "@"}</span>
                                  <span style={{ color: "#ccc", fontWeight: 600, fontSize: "0.875rem", flex: 1 }}>{opponent?.name ?? "TBD"}</span>
                                  {result ? (
                                    <span style={{ fontWeight: 700, color: resultColor, fontSize: "0.875rem", fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>
                                      {result}  {myScore}–{oppScore}
                                    </span>
                                  ) : (
                                    <span style={{ color: "#555", fontSize: "0.75rem" }}>
                                      {g.status === "scheduled" ? "Upcoming" : g.status}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <h3 style={{ fontSize: "0.7rem", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{title}</h3>
      <div style={{ flex: 1, height: 1, background: "#1c2028" }} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p style={{ color: "#444", fontSize: "0.85rem", margin: 0 }}>{text}</p>;
}

function CapBar({ capUsed }: { capUsed: number }) {
  const pct = Math.min(100, (capUsed / TOTAL_CAP) * 100);
  const barColor = capUsed > TOTAL_CAP ? "#ef4444" : pct > 80 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ background: "#13161e", border: "1px solid #1c2028", borderRadius: "0.75rem", padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#555", fontSize: "0.78rem" }}>Salary cap</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>
          <span style={{ color: capUsed > TOTAL_CAP ? "#ef4444" : "#ccc" }}>${capUsed.toLocaleString()}</span>
          <span style={{ color: "#333" }}> / </span>
          <span style={{ color: "#444" }}>${TOTAL_CAP.toLocaleString()}</span>
        </span>
      </div>
      <div style={{ background: "#101318", borderRadius: 4, height: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: barColor, transition: "width 0.3s" }} />
      </div>
      <div style={{ color: capUsed > TOTAL_CAP ? "#ef4444" : "#22c55e", fontSize: "0.72rem", marginTop: 5, textAlign: "right" }}>
        {capUsed > TOTAL_CAP ? `$${(capUsed - TOTAL_CAP).toLocaleString()} over cap` : `$${(TOTAL_CAP - capUsed).toLocaleString()} available`}
      </div>
    </div>
  );
}

// ── Team Card ─────────────────────────────────────────────────────────────────

function TeamCard({ team, players, capUsed, onClick, showCap }: { team: Team; players: PlayerTeam[]; capUsed: number; onClick: () => void; showCap: boolean }) {
  const accent = team.color2 ?? null;
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: "0.875rem", border: "1px solid #1c2028", background: "#13161e",
        overflow: "hidden", display: "flex", flexDirection: "column",
        borderLeft: accent ? `3px solid ${accent}` : "1px solid #1c2028",
        cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#171b26"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "#13161e"; }}
    >
      {/* Logo + name */}
      <div style={{ borderBottom: "1px solid #1c2028", padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 8, background: "#101318", border: "1px solid #272c36", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
          {team.logo_url
            ? <img src={team.logo_url} alt={team.abbreviation} style={{ width: 40, height: 40, objectFit: "contain" }} />
            : <span style={{ fontSize: "0.8rem", fontWeight: 800, color: "#666" }}>{team.abbreviation}</span>
          }
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: "1rem", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</div>
          <div style={{ fontSize: "0.72rem", color: "#555", fontFamily: "monospace", marginTop: 2 }}>{team.abbreviation}</div>
        </div>
        <span style={{ fontSize: "0.7rem", color: "#444", flexShrink: 0 }}>→</span>
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
                  src={`https://minotar.net/avatar/${pt.players?.mc_username}/24`} alt=""
                  style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                />
                <span style={{ color: "#bbb", fontSize: "0.875rem", fontWeight: 500 }}>{pt.players?.mc_username}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cap bar */}
      {showCap && (
        <div style={{ padding: "10px 18px 14px", borderTop: "1px solid #1c2028" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <span style={{ color: "#555", fontSize: "0.72rem" }}>Cap used</span>
            <span style={{ fontSize: "0.72rem", fontWeight: 700 }}>
              <span style={{ color: capUsed > TOTAL_CAP ? "#ef4444" : "#aaa" }}>{capUsed.toLocaleString()}</span>
              <span style={{ color: "#333" }}> / </span>
              <span style={{ color: "#444" }}>{TOTAL_CAP.toLocaleString()}</span>
            </span>
          </div>
          <div style={{ background: "#101318", borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${Math.min(100, (capUsed / TOTAL_CAP) * 100)}%`,
              background: capUsed > TOTAL_CAP ? "#ef4444" : capUsed / TOTAL_CAP > 0.8 ? "#f59e0b" : "#22c55e",
              borderRadius: 4, transition: "width 0.3s",
            }} />
          </div>
          <div style={{ color: capUsed > TOTAL_CAP ? "#ef4444" : "#22c55e", fontSize: "0.72rem", marginTop: 4, textAlign: "right" }}>
            {capUsed > TOTAL_CAP ? `-${(capUsed - TOTAL_CAP).toLocaleString()} over` : `${(TOTAL_CAP - capUsed).toLocaleString()} available`}
          </div>
        </div>
      )}
    </div>
  );
}

function EvenGrid({ teams, players, capByTeam, onTeamClick, showCap }: { teams: Team[]; players: PlayerTeam[]; capByTeam: Map<string, number>; onTeamClick: (t: Team) => void; showCap: boolean }) {
  const n = teams.length;
  // Pick columns so rows are as balanced as possible.
  // Last partial row is centered automatically by justify-content: center.
  const cols =
    n <= 1 ? 1 :
    n <= 2 ? 2 :
    n <= 3 ? 3 :   // single row
    n <= 4 ? 2 :   // 2 × 2
    n <= 6 ? 3 :   // 3+2 or 3+3
    n <= 8 ? 4 :   // 4+3 or 4+4
    4;
  // flex-basis per card accounts for (cols-1) gaps of 14 px spread across cols cards
  const basis = `calc(${(100 / cols).toFixed(4)}% - ${(14 * (cols - 1) / cols).toFixed(2)}px)`;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
      {teams.map(t => (
        <div key={t.id} style={{ flex: `0 0 ${basis}`, minWidth: 0 }}>
          <TeamCard team={t} players={players.filter(pt => pt.team_id === t.id)} capUsed={capByTeam.get(t.id) ?? 0} onClick={() => onTeamClick(t)} showCap={showCap} />
        </div>
      ))}
    </div>
  );
}

function ConferenceSection({ title, teams, players, capByTeam, accent, onTeamClick, showCap }: { title: string; teams: Team[]; players: PlayerTeam[]; capByTeam: Map<string, number>; accent: string; onTeamClick: (t: Team) => void; showCap: boolean }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>{title}</h3>
        <div style={{ flex: 1, height: 1, background: "#1c2028" }} />
        <span style={{ fontSize: "0.7rem", color: "#444" }}>{teams.length} team{teams.length !== 1 ? "s" : ""}</span>
      </div>
      <EvenGrid teams={teams} players={players} capByTeam={capByTeam} onTeamClick={onTeamClick} showCap={showCap} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamsPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  // Read URL params for deep-linking from stats page
  const [urlTeamId, setUrlTeamId] = React.useState<string | null>(null);
  const [urlSeason, setUrlSeason] = React.useState<string | null>(null);
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setUrlTeamId(sp.get("team"));
    setUrlSeason(sp.get("season"));
  }, []);

  const [teams, setTeams] = React.useState<Team[]>([]);
  const [playerTeams, setPlayerTeams] = React.useState<PlayerTeam[]>([]);
  const [contracts, setContracts] = React.useState<ContractSimple[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [seasons, setSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");
  const [selectedTeam, setSelectedTeam] = React.useState<Team | null>(null);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    fetch(`/api/stats/seasons?league=${slug}`)
      .then(r => r.json())
      .then((data: { season: string }[]) => {
        if (Array.isArray(data)) {
          const unique = [...new Set(
            data.map(d => d.season).filter(s => s && !s.toLowerCase().includes("playoff"))
          )].sort((a, b) => b.localeCompare(a));
          setSeasons(unique);
          // Use URL season param if provided, else default to most recent
          const initial = urlSeason && unique.includes(urlSeason) ? urlSeason : (unique[0] ?? "");
          setSeason(initial);
        }
      }).catch(() => {});
  }, [slug, urlSeason]);

  React.useEffect(() => {
    if (!slug || !season) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/teams?league=${slug}&season=${encodeURIComponent(season)}`).then(r => r.json()),
      fetch(`/api/contracts?league=${slug}&status=active`).then(r => r.json()),
    ]).then(([t, c]) => {
      const loadedTeams: Team[] = Array.isArray(t) ? t : [];
      setTeams(loadedTeams);
      const contractsData: ContractFull[] = Array.isArray(c) ? c : [];
      setContracts(contractsData);
      // Build deduped PlayerTeam list from contracts so roster matches admin tab
      const seenPerTeam = new Map<string, Set<string>>();
      const ptFromContracts: PlayerTeam[] = [];
      for (const ct of contractsData) {
        if (!seenPerTeam.has(ct.team_id)) seenPerTeam.set(ct.team_id, new Set());
        if (!seenPerTeam.get(ct.team_id)!.has(ct.mc_uuid)) {
          seenPerTeam.get(ct.team_id)!.add(ct.mc_uuid);
          ptFromContracts.push({ mc_uuid: ct.mc_uuid, team_id: ct.team_id, season: ct.season, players: ct.players });
        }
      }
      setPlayerTeams(ptFromContracts);
      setLoading(false);
      // Auto-open team from URL param
      if (urlTeamId && !selectedTeam) {
        const match = loadedTeams.find(tm => tm.id === urlTeamId);
        if (match) setSelectedTeam(match);
      }
    }).catch(() => setLoading(false));
  }, [slug, season, urlTeamId]);

  const westTeams = teams.filter(t => t.division === "West");
  const eastTeams = teams.filter(t => t.division === "East");
  const otherTeams = teams.filter(t => !t.division);
  const hasConferences = westTeams.length > 0 || eastTeams.length > 0;
  const showCap = slug !== "mcaa" && slug !== "mbgl";

  const capByTeam = React.useMemo(() => {
    const m = new Map<string, number>();
    const seen = new Map<string, Set<string>>();
    for (const c of contracts) {
      if (!seen.has(c.team_id)) seen.set(c.team_id, new Set());
      if (!seen.get(c.team_id)!.has(c.mc_uuid)) {
        seen.get(c.team_id)!.add(c.mc_uuid);
        m.set(c.team_id, (m.get(c.team_id) ?? 0) + c.amount);
      }
    }
    return m;
  }, [contracts]);

  return (
    <>
      {selectedTeam && (
        <TeamDetailModal
          team={selectedTeam}
          league={slug}
          seasons={seasons}
          defaultSeason={season}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      <div style={{ borderRadius: "1rem", border: "1px solid #1c2028", background: "#101318", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #1c2028", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Teams</h2>
            <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay} · {season} · {teams.length} teams · click a team to view details</p>
          </div>
          {seasons.length > 0 && (
            <select value={season} onChange={e => setSeason(e.target.value)}
              style={{ background: "#0a0d12", border: "1px solid #272c36", color: "#fff", borderRadius: "0.75rem", padding: "6px 14px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
              {seasons.map(s => <option key={s} value={s}>{s}</option>)}
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
              <ConferenceSection title="Western Conference" teams={westTeams} players={playerTeams} capByTeam={capByTeam} accent="#ef4444" onTeamClick={setSelectedTeam} showCap={showCap} />
            )}
            {eastTeams.length > 0 && (
              <ConferenceSection title="Eastern Conference" teams={eastTeams} players={playerTeams} capByTeam={capByTeam} accent="#3b82f6" onTeamClick={setSelectedTeam} showCap={showCap} />
            )}
            {otherTeams.length > 0 && (
              <ConferenceSection title="Other" teams={otherTeams} players={playerTeams} capByTeam={capByTeam} accent="#888" onTeamClick={setSelectedTeam} showCap={showCap} />
            )}
          </div>
        ) : (
          <div style={{ padding: 28 }}>
            <EvenGrid teams={teams} players={playerTeams} capByTeam={capByTeam} onTeamClick={setSelectedTeam} showCap={showCap} />
          </div>
        )}
      </div>
    </>
  );
}
