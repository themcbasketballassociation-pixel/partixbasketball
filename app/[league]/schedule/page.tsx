"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  mba: "Minecraft Basketball Association",
  mcaa: "College",
  mbgl: "G League",
};

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null; color2?: string | null };
type Game = {
  id: string; league: string; scheduled_at: string; status: string;
  home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};
type BracketMatchup = {
  id: string; round_name: string; round_order: number; matchup_index: number;
  team1_id: string | null; team2_id: string | null;
  team1_score: number | null; team2_score: number | null;
  winner_id: string | null;
  team1?: Team | null;
  team2?: Team | null;
};

function getWeekKey(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  const dow = d.getDay();
  const daysToThursday = dow >= 4 ? dow - 4 : dow + 3;
  const thu = new Date(d);
  thu.setDate(d.getDate() - daysToThursday);
  return thu.toISOString().slice(0, 10);
}

// ── Bracket layout constants ──────────────────────────────────────────────────
const SLOT_H    = 58;
const INNER_GAP = 6;
const MATCHUP_H = SLOT_H * 2 + INNER_GAP;
const BASE_GAP  = 48;
function gapForRound(ri: number)    { return (Math.pow(2, ri) - 1) * (MATCHUP_H + BASE_GAP) + BASE_GAP; }
function topOffsetForRound(ri: number) { return ((Math.pow(2, ri) - 1) * (MATCHUP_H + BASE_GAP)) / 2; }

const CONF_COLORS: Record<string, { bg: string; darkBg: string }> = {
  W: { bg: "#991b1b", darkBg: "#7f1d1d" },
  E: { bg: "#1d4ed8", darkBg: "#1e3a8a" },
  F: { bg: "#78350f", darkBg: "#451a03" },
};

// ── Read-only team slot ───────────────────────────────────────────────────────
function BracketSlot({ team, score, winnerId, teamId, conf }: {
  team: Team | null | undefined; score: number | null; winnerId: string | null; teamId: string | null; conf: "W"|"E"|"F";
}) {
  const isWinner = !!(winnerId && teamId && winnerId === teamId);
  const isLoser  = !!(winnerId && teamId && winnerId !== teamId);
  const colors   = CONF_COLORS[conf];
  const teamColor = team?.color2 ?? null;
  const pillBg = teamColor ?? colors.bg;
  const logoBg = teamColor ?? colors.darkBg;

  return (
    <div style={{
      display:"flex", alignItems:"center", height:SLOT_H, borderRadius:10,
      background: pillBg,
      border: `2px solid ${isWinner ? "#fff" : "transparent"}`,
      overflow:"hidden", flexShrink:0,
      opacity: isLoser ? 0.35 : 1,
      filter: isWinner ? "brightness(1.15)" : isLoser ? "brightness(0.45) saturate(0.6)" : "none",
    }}>
      <div style={{ flex:1, padding:"0 14px", minWidth:0 }}>
        {team
          ? <span style={{ fontSize:"1.1rem", fontWeight:900, color:"#fff", letterSpacing:"0.04em", textShadow:"0 1px 3px rgba(0,0,0,0.4)", display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {team.abbreviation}
            </span>
          : <span style={{ fontSize:"0.75rem", color:"#444" }}>TBD</span>
        }
      </div>
      {score != null && (
        <span style={{ padding:"0 8px", fontSize:"0.95rem", fontWeight:700, color:"rgba(255,255,255,0.85)", flexShrink:0 }}>{score}</span>
      )}
      <div style={{ width:52, height:SLOT_H, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:logoBg, borderLeft:"1px solid rgba(0,0,0,0.25)" }}>
        {team?.logo_url
          ? <img src={team.logo_url} style={{ width:38, height:38, objectFit:"contain" }} alt="" />
          : <span style={{ fontSize:"0.75rem", color:"#333", fontWeight:700 }}>?</span>
        }
      </div>
    </div>
  );
}

function BracketGroup({ m, conf }: { m: BracketMatchup; conf: "W"|"E"|"F" }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:INNER_GAP, flexShrink:0, width:220 }}>
      <BracketSlot team={m.team1} score={m.team1_score} winnerId={m.winner_id} teamId={m.team1_id} conf={conf} />
      <BracketSlot team={m.team2} score={m.team2_score} winnerId={m.winner_id} teamId={m.team2_id} conf={conf} />
    </div>
  );
}

// ── Bracket view ─────────────────────────────────────────────────────────────
function BracketView({ league, season }: { league: string; season: string }) {
  const [matchups, setMatchups] = React.useState<BracketMatchup[] | null>(null);
  const playoffSeason = `${season} Playoffs`;

  React.useEffect(() => {
    if (!league || !season) return;
    fetch(`/api/playoff-brackets?league=${encodeURIComponent(league)}&season=${encodeURIComponent(playoffSeason)}`)
      .then(r => r.json())
      .then(d => setMatchups(Array.isArray(d) ? d : []))
      .catch(() => setMatchups([]));
  }, [league, playoffSeason]);

  if (matchups === null) return <div style={{ padding:40, textAlign:"center", color:"#555" }}>Loading bracket...</div>;
  if (matchups.length === 0) return (
    <div style={{ padding:60, textAlign:"center" }}>
      <div style={{ fontSize:"2rem", marginBottom:12 }}>🏆</div>
      <div style={{ color:"#888", fontWeight:600, fontSize:"1rem" }}>No bracket yet for {playoffSeason}</div>
      <div style={{ color:"#444", fontSize:"0.8rem", marginTop:6 }}>Check back once the playoffs begin.</div>
    </div>
  );

  const isConf = matchups.some(m => m.round_name.startsWith("East ") || m.round_name.startsWith("West "));

  const groupRounds = (filter: (m: BracketMatchup) => boolean) => {
    const map = new Map<string, { name:string; order:number; matchups:BracketMatchup[] }>();
    for (const m of matchups.filter(filter)) {
      if (!map.has(m.round_name)) map.set(m.round_name, { name:m.round_name, order:m.round_order, matchups:[] });
      map.get(m.round_name)!.matchups.push(m);
    }
    return [...map.values()].sort((a,b)=>a.order-b.order).map(r=>({ ...r, matchups: r.matchups.sort((a,b)=>a.matchup_index-b.matchup_index) }));
  };

  const westRounds  = groupRounds(m => m.round_name.startsWith("West "));
  const eastRounds  = groupRounds(m => m.round_name.startsWith("East "));
  const flatRounds  = groupRounds(m => !m.round_name.startsWith("East ") && !m.round_name.startsWith("West ") && m.round_name !== "Finals");
  const finalsMatch = matchups.find(m => m.round_name === "Finals") ?? null;

  // Canvas height
  let canvasH = MATCHUP_H + 80;
  const calcH = (col: { matchups: BracketMatchup[] }, ri: number) => {
    const n = col.matchups.length;
    return topOffsetForRound(ri) + n * MATCHUP_H + Math.max(0, n-1) * gapForRound(ri);
  };
  if (isConf) {
    westRounds.forEach((col,ri) => { const h=calcH(col,ri); if(h>canvasH) canvasH=h; });
    eastRounds.forEach((col,ri) => { const h=calcH(col,ri); if(h>canvasH) canvasH=h; });
  } else {
    flatRounds.forEach((col,ri) => { const h=calcH(col,ri); if(h>canvasH) canvasH=h; });
  }
  canvasH += 80;

  const finalsTopPad = Math.max(0, Math.floor((canvasH - 80 - MATCHUP_H) / 2));

  return (
    <div style={{ overflowX:"auto" }}>
      <div style={{ position:"relative", minWidth:"max-content", height:canvasH, padding:"28px 36px" }}>
        {isConf ? (
          <div style={{ display:"flex", gap:48, alignItems:"flex-start" }}>
            {westRounds.map((col,ri) => {
              const vis = ri===0 ? col.matchups.filter(m=>m.team1_id&&m.team2_id) : col.matchups;
              return (
                <div key={col.name} style={{ flexShrink:0 }}>
                  <div style={{ fontSize:"0.6rem", fontWeight:700, color:"#ef4444", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, textAlign:"center" }}>{col.name}</div>
                  <div style={{ display:"flex", flexDirection:"column", paddingTop:topOffsetForRound(ri), gap:gapForRound(ri) }}>
                    {vis.map(m=><BracketGroup key={m.id} m={m} conf="W" />)}
                  </div>
                </div>
              );
            })}
            {finalsMatch && (
              <div style={{ flexShrink:0 }}>
                <div style={{ height:finalsTopPad }} />
                <div style={{ fontSize:"0.63rem", fontWeight:700, color:"#facc15", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:10, textAlign:"center" }}>🏆 Championship</div>
                <BracketGroup m={finalsMatch} conf="F" />
              </div>
            )}
            {[...eastRounds].reverse().map((col,reverseIdx) => {
              const riFromRight = eastRounds.length - 1 - reverseIdx;
              const vis = riFromRight===0 ? col.matchups.filter(m=>m.team1_id&&m.team2_id) : col.matchups;
              return (
                <div key={col.name} style={{ flexShrink:0 }}>
                  <div style={{ fontSize:"0.6rem", fontWeight:700, color:"#3b82f6", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, textAlign:"center" }}>{col.name}</div>
                  <div style={{ display:"flex", flexDirection:"column", paddingTop:topOffsetForRound(riFromRight), gap:gapForRound(riFromRight) }}>
                    {vis.map(m=><BracketGroup key={m.id} m={m} conf="E" />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display:"flex", gap:48, alignItems:"flex-start" }}>
            {flatRounds.map((col,ri) => {
              const vis = ri===0 ? col.matchups.filter(m=>m.team1_id&&m.team2_id) : col.matchups;
              return (
                <div key={col.name} style={{ flexShrink:0 }}>
                  <div style={{ fontSize:"0.65rem", fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, textAlign:"center" }}>{col.name}</div>
                  <div style={{ display:"flex", flexDirection:"column", paddingTop:topOffsetForRound(ri), gap:gapForRound(ri) }}>
                    {vis.map(m=><BracketGroup key={m.id} m={m} conf="W" />)}
                  </div>
                </div>
              );
            })}
            {finalsMatch && (
              <div style={{ flexShrink:0 }}>
                <div style={{ height:finalsTopPad }} />
                <div style={{ fontSize:"0.63rem", fontWeight:700, color:"#facc15", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:10, textAlign:"center" }}>🏆 Finals</div>
                <BracketGroup m={finalsMatch} conf="F" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SchedulePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [seasons, setSeasons] = React.useState<string[]>([]);
  const [season, setSeason] = React.useState<string>("");
  const [tab, setTab] = React.useState<"schedule"|"bracket">("schedule");

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

  const grouped = games.reduce<Record<string, Game[]>>((acc, g) => {
    const key = getWeekKey(g.scheduled_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const weekKeys = Object.keys(grouped).sort();

  return (
    <div style={{ borderRadius: "1rem", border: "1px solid #1e1e1e", background: "#111", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", margin: 0 }}>Schedule</h2>
          <p style={{ color: "#888", fontSize: "0.875rem", margin: "2px 0 0" }}>{leagueDisplay}</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          {/* Tab toggle */}
          <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid #2a2a2a" }}>
            {(["schedule","bracket"] as const).map(t => (
              <button key={t} onClick={()=>setTab(t)}
                style={{ padding:"6px 16px", fontSize:"0.8rem", fontWeight:700, cursor:"pointer", border:"none",
                  borderRight: t==="schedule" ? "1px solid #2a2a2a" : "none",
                  background: tab===t ? "#2563eb" : "#161616",
                  color: tab===t ? "#fff" : "#666" }}>
                {t==="schedule" ? "📅 Schedule" : "🏆 Bracket"}
              </button>
            ))}
          </div>
          {seasons.length > 0 && (
            <select value={season} onChange={(e) => setSeason(e.target.value)}
              style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: "0.75rem", padding: "6px 12px", fontSize: "0.875rem", outline: "none", cursor: "pointer" }}>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      {tab === "bracket" ? (
        <BracketView league={slug} season={season} />
      ) : loading ? (
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
                            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minWidth: 130 }}>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 600, color: "#fff" }}>{g.home_team?.name ?? "?"}</div>
                                <div style={{ fontSize: "0.75rem", color: "#555" }}>{g.home_team?.abbreviation}</div>
                              </div>
                              {g.home_team?.logo_url
                                ? <img src={g.home_team.logo_url} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
                                : <div style={{ width: 32, height: 32, borderRadius: 6, background: "#1a1a1a", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{g.home_team?.abbreviation ?? "?"}</div>
                              }
                            </div>
                            {g.status === "completed" ? (
                              <div style={{ textAlign: "center", padding: "0 12px" }}>
                                <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{g.home_score} – {g.away_score}</div>
                                <div style={{ fontSize: "0.75rem", color: "#4ade80", fontWeight: 600 }}>Final</div>
                              </div>
                            ) : (
                              <div style={{ color: "#333", fontWeight: 500, padding: "0 12px" }}>vs</div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
                              {g.away_team?.logo_url
                                ? <img src={g.away_team.logo_url} alt="" style={{ width: 32, height: 32, objectFit: "contain", flexShrink: 0 }} />
                                : <div style={{ width: 32, height: 32, borderRadius: 6, background: "#1a1a1a", border: "1px solid #333", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{g.away_team?.abbreviation ?? "?"}</div>
                              }
                              <div style={{ textAlign: "left" }}>
                                <div style={{ fontWeight: 600, color: "#fff" }}>{g.away_team?.name ?? "?"}</div>
                                <div style={{ fontSize: "0.75rem", color: "#555" }}>{g.away_team?.abbreviation}</div>
                              </div>
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
