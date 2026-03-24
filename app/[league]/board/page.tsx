"use client";
import { useSession, signIn } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

// ── Types ───────────────────────────────────────────────────────────────────
type PlayerRow = { mc_uuid: string; mc_username: string };
type TeamRow   = { id: string; name: string; abbreviation: string };

// ── Constants ───────────────────────────────────────────────────────────────
const BOARD_SEASONS = ["Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7"];
const BOARD_AWARDS = [
  { key: "MVP",  label: "Most Valuable Player" },
  { key: "DPOY", label: "Defensive Player of the Year" },
  { key: "ROY",  label: "Rookie of the Year" },
  { key: "MIP",  label: "Most Improved Player" },
  { key: "SMOY", label: "6th Man of the Year" },
];
function boardPlayerPts(rank: number) { return Math.max(0, 11 - rank); }
function boardAwardPts(rank: number)  { return rank === 1 ? 5 : rank === 2 ? 3 : 1; }

// ── Styles ───────────────────────────────────────────────────────────────────
const card: React.CSSProperties    = { background: "#111", border: "1px solid #222", borderRadius: 16, overflow: "hidden" };
const btnPrimary: React.CSSProperties = { padding: "10px 24px", borderRadius: 8, border: "1px solid #3b82f6", background: "#1d4ed8", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "8px 16px", borderRadius: 8, border: "1px solid #333", background: "#181818", color: "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const selectStyle: React.CSSProperties = { flex: 1, borderRadius: 8, border: "1px solid #2a2a2a", background: "#0d0d0d", color: "#fff", fontSize: 14, padding: "8px 12px", outline: "none" };
const innerCard: React.CSSProperties  = { background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 14px" };

export default function BoardPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = params ? (null as any) : null; // handled below via useParams
  const routeParams = useParams() as { league?: string };
  const leagueSlug = routeParams.league ?? "";

  const { data: session, status } = useSession();
  const [isMember, setIsMember] = useState<boolean | "loading">("loading");
  const [memberSeason, setMemberSeason] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch(`/api/board-members?league=${leagueSlug}&check=me`)
      .then(r => r.json())
      .then(d => {
        setIsMember(!!d.isMember);
        if (d.member?.season) setMemberSeason(d.member.season);
      })
      .catch(() => setIsMember(false));
  }, [status, leagueSlug]);

  if (status === "loading" || isMember === "loading") {
    return (
      <div style={{ color: "#444", textAlign: "center", padding: 60, fontSize: 15 }}>Loading…</div>
    );
  }

  if (status !== "authenticated") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", ...card, padding: 40, textAlign: "center" as const }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Board Portal</div>
        <div style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>Sign in with Discord to access the Board Portal.</div>
        <button onClick={() => signIn("discord")} style={btnPrimary}>Sign in with Discord</button>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", ...card, padding: 40, textAlign: "center" as const }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Board Portal</div>
        <div style={{ color: "#555", fontSize: 14 }}>
          You are not registered as a board member for {leagueSlug.toUpperCase()}. Contact the commissioner to be added.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <BoardVotingUI league={leagueSlug} defaultSeason={memberSeason ?? BOARD_SEASONS[BOARD_SEASONS.length - 1]} />
    </div>
  );
}

// ── Main voting UI ───────────────────────────────────────────────────────────
function BoardVotingUI({ league, defaultSeason }: { league: string; defaultSeason: string }) {
  const [season, setSeason] = useState(defaultSeason);
  const [tab, setTab] = useState<"players" | "teams" | "awards">("players");

  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams]     = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [playerRanks, setPlayerRanks] = useState<string[]>(Array(10).fill(""));
  const [teamRanks, setTeamRanks]     = useState<string[]>([]);
  const [awardVotes, setAwardVotes]   = useState<Record<string, Record<string, string>>>({});

  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [results, setResults]               = useState<any>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Load teams (season-aware)
  useEffect(() => {
    fetch(`/api/teams?league=${league}&season=${encodeURIComponent(season)}`)
      .then(r => r.json())
      .then(t => {
        const ts: TeamRow[] = Array.isArray(t) ? t : [];
        setTeams(ts);
        setTeamRanks(Array(ts.length).fill(""));
      });
  }, [league, season]);

  // Load players
  useEffect(() => {
    setLoading(true);
    fetch(`/api/teams/players?league=${league}&season=${encodeURIComponent(season)}`)
      .then(r => r.json())
      .then(pt => {
        const seen = new Set<string>();
        const ps: PlayerRow[] = [];
        for (const entry of (Array.isArray(pt) ? pt : [])) {
          if (entry.players && !seen.has(entry.mc_uuid)) {
            seen.add(entry.mc_uuid);
            ps.push({ mc_uuid: entry.mc_uuid, mc_username: entry.players.mc_username });
          }
        }
        ps.sort((a, b) => a.mc_username.localeCompare(b.mc_username));
        setPlayers(ps);
        setLoading(false);
      });
  }, [league, season]);

  // Load my votes
  useEffect(() => {
    fetch(`/api/board-votes?league=${league}&season=${encodeURIComponent(season)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const pr = Array(10).fill("");
        const tr: Record<number, string> = {};
        const av: Record<string, Record<string, string>> = {};
        for (const v of data) {
          if (v.vote_type === "player" && v.rank >= 1 && v.rank <= 10) pr[v.rank - 1] = v.mc_uuid ?? "";
          else if (v.vote_type === "team" && v.rank >= 1) tr[v.rank - 1] = v.team_id ?? "";
          else if (v.vote_type === "award" && v.category) {
            if (!av[v.category]) av[v.category] = {};
            av[v.category][String(v.rank)] = v.mc_uuid ?? "";
          }
        }
        setPlayerRanks(pr);
        setTeamRanks(prev => {
          const next = [...prev];
          Object.entries(tr).forEach(([i, tid]) => { if (parseInt(i) < next.length) next[parseInt(i)] = tid; });
          return next;
        });
        setAwardVotes(av);
      });
  }, [league, season]);

  // Load results
  const loadResults = useCallback(() => {
    setResultsLoading(true);
    fetch(`/api/board-votes/results?league=${league}&season=${encodeURIComponent(season)}`)
      .then(r => r.json())
      .then(d => { setResults(d); setResultsLoading(false); })
      .catch(() => setResultsLoading(false));
  }, [league, season]);
  useEffect(() => { loadResults(); }, [loadResults]);

  const saveBallot = async () => {
    setSaving(true); setSaveMsg("");
    const votes: any[] = [];
    playerRanks.forEach((uuid, i) => { if (uuid) votes.push({ vote_type: "player", rank: i + 1, mc_uuid: uuid }); });
    teamRanks.forEach((tid, i)   => { if (tid)  votes.push({ vote_type: "team",   rank: i + 1, team_id: tid }); });
    for (const [aKey, ranks] of Object.entries(awardVotes)) {
      for (const [rank, uuid] of Object.entries(ranks)) {
        if (uuid) votes.push({ vote_type: "award", category: aKey, rank: parseInt(rank), mc_uuid: uuid });
      }
    }
    const r = await fetch("/api/board-votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, season, votes }),
    });
    if (r.ok) { setSaveMsg("✓ Ballot saved!"); loadResults(); }
    else { const d = await r.json(); setSaveMsg(d.error ?? "Error saving"); }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  function playerOpts(selected: string[], thisVal: string) {
    const used = new Set(selected.filter(u => u && u !== thisVal));
    return players.filter(p => !used.has(p.mc_uuid));
  }
  function teamOpts(selected: string[], thisVal: string) {
    const used = new Set(selected.filter(u => u && u !== thisVal));
    return teams.filter(t => !used.has(t.id));
  }
  function awardPlayerOpts(key: string, thisRank: string) {
    const ranks = awardVotes[key] ?? {};
    const used = new Set(Object.entries(ranks).filter(([r]) => r !== thisRank).map(([, u]) => u).filter(Boolean));
    return players.filter(p => !used.has(p.mc_uuid));
  }
  const ord = (n: number) => ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th"][n] ?? `${n+1}th`;

  // Save bar
  const SaveBar = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 16, marginTop: 8, borderTop: "1px solid #1a1a1a" }}>
      <button style={{ ...btnPrimary, background: saving ? "#333" : "#7c3aed", borderColor: saving ? "#333" : "#7c3aed", color: saving ? "#666" : "#fff", cursor: saving ? "not-allowed" : "pointer" }}
        onClick={saveBallot} disabled={saving}>
        {saving ? "Saving…" : "Save Ballot"}
      </button>
      {saveMsg && <span style={{ fontSize: 13, fontWeight: 600, color: saveMsg.startsWith("✓") ? "#4ade80" : "#f87171" }}>{saveMsg}</span>}
    </div>
  );

  // Results panel
  const ResultsPanel = () => {
    const voterLine = <div style={{ fontSize: 11, color: "#444", marginBottom: 10 }}>{results?.totalVoters ?? 0} voter{results?.totalVoters !== 1 ? "s" : ""}</div>;
    if (resultsLoading) return <div style={{ color: "#444", fontSize: 12, textAlign: "center", padding: "16px 0" }}>Loading…</div>;
    if (!results) return <div style={{ color: "#333", fontSize: 12, textAlign: "center", padding: "16px 0" }}>No results yet.</div>;

    if (tab === "players") {
      if (!results.players?.length) return <>{voterLine}<div style={{ color: "#333", fontSize: 12 }}>No votes yet.</div></>;
      return <>
        {voterLine}
        {results.players.map((row: any) => {
          const p = players.find(pl => pl.mc_uuid === row.mc_uuid);
          return (
            <div key={row.mc_uuid} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "6px 10px" }}>
              <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace", width: 20, flexShrink: 0 }}>#{row.place}</span>
              <img src={`https://minotar.net/avatar/${p?.mc_username ?? "MHF_Steve"}/20`} style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0 }} alt="" onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }} />
              <span style={{ color: "#ddd", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.mc_username ?? row.mc_uuid}</span>
              <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{row.points}pt</span>
            </div>
          );
        })}
      </>;
    }

    if (tab === "teams") {
      if (!results.teams?.length) return <>{voterLine}<div style={{ color: "#333", fontSize: 12 }}>No votes yet.</div></>;
      return <>
        {voterLine}
        {results.teams.map((row: any) => {
          const t = teams.find(tm => tm.id === row.team_id);
          return (
            <div key={row.team_id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "6px 10px" }}>
              <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace", width: 20, flexShrink: 0 }}>#{row.place}</span>
              <span style={{ color: "#ddd", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t ? `${t.name} (${t.abbreviation})` : row.team_id}</span>
              <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{row.points}pt</span>
            </div>
          );
        })}
      </>;
    }

    // awards
    const hasAwards = Object.keys(results.awards ?? {}).some(k => results.awards[k]?.length > 0);
    if (!hasAwards) return <>{voterLine}<div style={{ color: "#333", fontSize: 12 }}>No votes yet.</div></>;
    return <>
      {voterLine}
      {BOARD_AWARDS.filter(a => results.awards?.[a.key]?.length > 0).map(award => (
        <div key={award.key} style={{ marginBottom: 12 }}>
          <div style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{award.label}</div>
          {results.awards[award.key].map((row: any) => {
            const p = players.find(pl => pl.mc_uuid === row.mc_uuid);
            return (
              <div key={row.mc_uuid} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 8, marginBottom: 3, padding: "5px 10px" }}>
                <span style={{ color: "#555", fontSize: 11, fontFamily: "monospace", width: 20, flexShrink: 0 }}>#{row.place}</span>
                <img src={`https://minotar.net/avatar/${p?.mc_username ?? "MHF_Steve"}/18`} style={{ width: 18, height: 18, borderRadius: 3, flexShrink: 0 }} alt="" onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/18"; }} />
                <span style={{ color: "#ddd", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.mc_username ?? row.mc_uuid}</span>
                <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{row.points}pt</span>
              </div>
            );
          })}
        </div>
      ))}
    </>;
  };

  if (loading) return <div style={{ ...card, padding: 40, textAlign: "center" as const, color: "#555" }}>Loading…</div>;

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12 }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>Board Portal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#555", fontSize: 12 }}>Season:</span>
          <select style={{ background: "#181818", border: "1px solid #2a2a2a", borderRadius: 8, color: "#fff", padding: "6px 10px", fontSize: 13 }}
            value={season} onChange={e => setSeason(e.target.value)}>
            {BOARD_SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
        {(["players", "teams", "awards"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "12px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "none",
              borderBottom: `2px solid ${tab === t ? "#7c3aed" : "transparent"}`,
              color: tab === t ? "#fff" : "#555" }}>
            {t === "players" ? "Players" : t === "teams" ? `Teams (${teams.length})` : "Awards"}
          </button>
        ))}
      </div>

      {/* Content: ballot left, results right */}
      <div style={{ display: "flex", gap: 24, padding: 24, alignItems: "flex-start" }}>

        {/* LEFT — Ballot */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Players ballot */}
          {tab === "players" && (
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Top 10 Players</div>
              <div style={{ color: "#555", fontSize: 12, marginBottom: 14 }}>1st = 10 pts · 10th = 1 pt</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {playerRanks.map((val, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#555", fontSize: 12, fontFamily: "monospace", width: 28, textAlign: "right" as const, flexShrink: 0 }}>{ord(i)}</span>
                    <select style={selectStyle} value={val}
                      onChange={e => { const n = [...playerRanks]; n[i] = e.target.value; setPlayerRanks(n); }}>
                      <option value="">— Select player —</option>
                      {playerOpts(playerRanks, val).map(p => (
                        <option key={p.mc_uuid} value={p.mc_uuid}>{p.mc_username}</option>
                      ))}
                    </select>
                    <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, width: 36, textAlign: "right" as const, flexShrink: 0 }}>{val ? `+${boardPlayerPts(i + 1)}` : ""}</span>
                  </div>
                ))}
              </div>
              <SaveBar />
            </div>
          )}

          {/* Teams ballot */}
          {tab === "teams" && (
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Team Rankings</div>
              <div style={{ color: "#555", fontSize: 12, marginBottom: 14 }}>Rank all {teams.length} teams · 1st = {teams.length} pts · last = 1 pt</div>
              {teams.length === 0
                ? <div style={{ color: "#444", fontSize: 13, padding: "16px 0" }}>No teams found for {season}.</div>
                : (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {teamRanks.map((val, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#555", fontSize: 12, fontFamily: "monospace", width: 28, textAlign: "right" as const, flexShrink: 0 }}>{ord(i)}</span>
                        <select style={selectStyle} value={val}
                          onChange={e => { const n = [...teamRanks]; n[i] = e.target.value; setTeamRanks(n); }}>
                          <option value="">— Select team —</option>
                          {teamOpts(teamRanks, val).map(t => (
                            <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>
                          ))}
                        </select>
                        <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, width: 36, textAlign: "right" as const, flexShrink: 0 }}>{val ? `+${teams.length - i}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              <SaveBar />
            </div>
          )}

          {/* Awards ballot */}
          {tab === "awards" && (
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Award Votes</div>
              <div style={{ color: "#555", fontSize: 12, marginBottom: 14 }}>Top 3 per award · 1st = 5 pts · 2nd = 3 pts · 3rd = 1 pt</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {BOARD_AWARDS.map(award => (
                  <div key={award.key} style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ color: "#c4b5fd", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{award.label}</div>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                      {[1, 2, 3].map(rank => {
                        const val = awardVotes[award.key]?.[String(rank)] ?? "";
                        return (
                          <div key={rank} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: "#555", fontSize: 11, width: 24, flexShrink: 0 }}>{ord(rank - 1)}</span>
                            <select style={{ ...selectStyle, fontSize: 12, padding: "6px 8px" }} value={val}
                              onChange={e => setAwardVotes(prev => ({ ...prev, [award.key]: { ...(prev[award.key] ?? {}), [String(rank)]: e.target.value } }))}>
                              <option value="">— Select —</option>
                              {awardPlayerOpts(award.key, String(rank)).map(p => (
                                <option key={p.mc_uuid} value={p.mc_uuid}>{p.mc_username}</option>
                              ))}
                            </select>
                            {val && <span style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700, width: 28, flexShrink: 0, textAlign: "right" as const }}>+{boardAwardPts(rank)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <SaveBar />
            </div>
          )}
        </div>

        {/* RIGHT — Live Results */}
        <div style={{ width: 220, flexShrink: 0, background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 12, padding: 14 }}>
          <div style={{ color: "#555", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 10 }}>Live Results</div>
          <ResultsPanel />
        </div>

      </div>
    </div>
  );
}
