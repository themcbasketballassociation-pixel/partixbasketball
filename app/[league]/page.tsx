"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Minecraft Basketball Association", mba: "Minecraft Basketball Association",
  pcaa: "College Basketball", mcaa: "College Basketball",
  pbgl: "G League", mbgl: "G League",
};
const leagueLabel: Record<string, string> = {
  pba: "MBA", mba: "MBA", pcaa: "MCAA", mcaa: "MCAA", pbgl: "MBGL", mbgl: "MBGL",
};
const leagueColor: Record<string, string> = {
  pba: "#C8102E", mba: "#C8102E", pcaa: "#003087", mcaa: "#003087", pbgl: "#BB3430", mbgl: "#BB3430",
};

type Article  = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };
type Team     = { id: string; name: string; abbreviation: string; logo_url: string | null };
type Game     = { id: string; scheduled_at: string; status: string; home_score: number | null; away_score: number | null; home_team: Team; away_team: Team; season?: string };
type StatRow  = { mc_uuid: string; mc_username: string; rank: number; gp: number; ppg: number | null; rpg: number | null; apg: number | null; spg: number | null; fg_pct: number | null; three_pt_pct: number | null };
type GameStat = { mc_uuid: string; points: number | null; rebounds_off: number | null; rebounds_def: number | null; assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null; players: { mc_uuid: string; mc_username: string } | null };
type TeamRecord = { team: Team; wins: number; losses: number };

type BracketMatchup = {
  id: string; round_name: string; round_order: number; matchup_index: number;
  team1_id: string | null; team2_id: string | null;
  team1_score: number | null; team2_score: number | null;
  winner_id: string | null; team1?: Team | null; team2?: Team | null;
};

// ── Bracket layout ────────────────────────────────────────────────────────
const SLOT_H = 52, INNER_GAP = 5, MATCHUP_H = SLOT_H * 2 + INNER_GAP, BASE_GAP = 40;
const gapForRound       = (ri: number) => (Math.pow(2, ri) - 1) * (MATCHUP_H + BASE_GAP) + BASE_GAP;
const topOffsetForRound = (ri: number) => ((Math.pow(2, ri) - 1) * (MATCHUP_H + BASE_GAP)) / 2;
const CONF_COLORS: Record<string, { bg: string; darkBg: string }> = {
  W: { bg: "#991b1b", darkBg: "#7f1d1d" },
  E: { bg: "#1d4ed8", darkBg: "#1e3a8a" },
  F: { bg: "#78350f", darkBg: "#451a03" },
};

const LEADER_CATS: { key: keyof StatRow; label: string; fmt: (v: number) => string; color: string; minGames?: number }[] = [
  { key: "ppg",          label: "PPG",  fmt: v => v.toFixed(1), color: "#f97316" },
  { key: "rpg",          label: "RPG",  fmt: v => v.toFixed(1), color: "#22d3ee" },
  { key: "apg",          label: "APG",  fmt: v => v.toFixed(1), color: "#a78bfa" },
  { key: "spg",          label: "SPG",  fmt: v => v.toFixed(1), color: "#4ade80" },
  { key: "fg_pct",       label: "FG%",  fmt: v => `${v.toFixed(1)}%`, color: "#facc15" },
  { key: "three_pt_pct", label: "3FG%", fmt: v => `${v.toFixed(1)}%`, color: "#fb7185", minGames: 4 },
];

// ── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ icon, title, linkLabel, linkHref }: { icon: string; title: string; linkLabel?: string; linkHref?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</span>
      </div>
      {linkLabel && linkHref && (
        <a href={linkHref} style={{ color: "#444", fontSize: 11, fontWeight: 600, textDecoration: "none", letterSpacing: "0.05em" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#888")} onMouseLeave={e => (e.currentTarget.style.color = "#444")}>
          {linkLabel}
        </a>
      )}
    </div>
  );
}

function TeamLogo({ team, size = 40 }: { team: Team; size?: number }) {
  if (team.logo_url) return <img src={team.logo_url} alt={team.abbreviation} style={{ width: size, height: size, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: 6, background: "#1a1f2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.22, color: "#555", fontWeight: 800, flexShrink: 0 }}>
      {team.abbreviation}
    </div>
  );
}

function LeaderCard({ cat, stats }: { cat: typeof LEADER_CATS[number]; stats: StatRow[] }) {
  const top5 = [...stats].filter(s => (s[cat.key] as number | null) != null && s.gp >= (cat.minGames ?? 1)).sort((a, b) => ((b[cat.key] as number) ?? 0) - ((a[cat.key] as number) ?? 0)).slice(0, 5);
  if (top5.length === 0) return null;
  const leader = top5[0];
  return (
    <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ background: "#0a0d12", borderBottom: "1px solid #1c2028", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: cat.color, fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {cat.label} Leaders{cat.minGames ? <span style={{ color: "#444", fontSize: 10, fontWeight: 600, textTransform: "none", letterSpacing: 0, marginLeft: 5 }}>min. {cat.minGames} GP</span> : null}
        </span>
        <span style={{ color: cat.color, fontSize: 13, fontWeight: 800 }}>{cat.fmt(leader[cat.key] as number)}</span>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #171b26" }}>
        <img src={`https://minotar.net/avatar/${leader.mc_username}/32`} alt={leader.mc_username}
          style={{ width: 26, height: 26, borderRadius: 6, border: `1.5px solid ${cat.color}44`, flexShrink: 0 }}
          onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#e0e0e0", fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leader.mc_username}</div>
          <div style={{ color: "#444", fontSize: 9 }}>League Leader</div>
        </div>
        <div style={{ color: cat.color, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{cat.fmt(leader[cat.key] as number)}</div>
      </div>
      {top5.slice(1).map((s, i) => (
        <div key={s.mc_uuid} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderBottom: i < top5.length - 2 ? "1px solid #111520" : undefined }}>
          <span style={{ color: "#333", fontSize: 10, fontWeight: 700, width: 12, textAlign: "right", flexShrink: 0 }}>{i + 2}</span>
          <img src={`https://minotar.net/avatar/${s.mc_username}/20`} alt={s.mc_username}
            style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }} />
          <span style={{ color: "#888", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.mc_username}</span>
          <span style={{ color: "#bbb", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{cat.fmt(s[cat.key] as number)}</span>
        </div>
      ))}
    </div>
  );
}

function UpcomingCard({ game, slug }: { game: Game; slug: string }) {
  const dt = new Date(game.scheduled_at);
  const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" }) + " ET";
  return (
    <a href={`/${slug}/schedule`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 12, padding: "14px 16px" }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a3048")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#1c2028")}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ background: "#1a1f2e", color: "#777", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 6 }}>
            {leagueLabel[slug] ?? slug.toUpperCase()}
          </span>
          <span style={{ color: "#444", fontSize: 10, fontWeight: 600 }}>🕐 {dateStr} @ {timeStr}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "flex-end" }}>
            <span style={{ color: "#bbb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", textAlign: "right", lineHeight: 1.2 }}>{game.home_team.name}</span>
            <TeamLogo team={game.home_team} size={36} />
          </div>
          <span style={{ color: "#2a2a2a", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", padding: "0 14px", flexShrink: 0 }}>VS</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <TeamLogo team={game.away_team} size={36} />
            <span style={{ color: "#bbb", fontSize: 12, fontWeight: 700, textTransform: "uppercase", lineHeight: 1.2 }}>{game.away_team.name}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

function ResultCard({ game, slug, mvp, isPlayoffs }: { game: Game; slug: string; mvp?: GameStat; isPlayoffs?: boolean }) {
  const homeScore = game.home_score ?? 0;
  const awayScore = game.away_score ?? 0;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  const dateStr = new Date(game.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const mvpName = mvp?.players?.mc_username ?? null;
  const mvpPts  = mvp?.points ?? 0;
  const mvpReb  = (mvp?.rebounds_off ?? 0) + (mvp?.rebounds_def ?? 0);
  const mvpAst  = mvp?.assists ?? 0;
  const mvpStl  = mvp?.steals ?? 0;
  const mvpBlk  = mvp?.blocks ?? 0;

  return (
    <div style={{ background: "#0d1015", border: "1px solid #1c2028", borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#080b0f", borderBottom: "1px solid #1a1f28", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ background: "#1a1f2e", color: "#777", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 5 }}>
            {leagueLabel[slug] ?? slug.toUpperCase()}
          </span>
          {isPlayoffs && (
            <span style={{ background: "#f59e0b22", border: "1px solid #f59e0b44", color: "#f59e0b", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 5 }}>
              PLAYOFFS
            </span>
          )}
          <span style={{ color: "#333", fontSize: 10 }}>{dateStr}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#4ade80", fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>FINAL</span>
          <a href={`/${slug}/boxscores/${game.id}`}
            style={{ background: "#1a1f2e", color: "#888", fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 6, textDecoration: "none", letterSpacing: "0.08em" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#232b3e")} onMouseLeave={e => (e.currentTarget.style.background = "#1a1f2e")}
            onClick={e => e.stopPropagation()}>
            SCORES →
          </a>
        </div>
      </div>

      {/* Scores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "14px 12px" }}>
        {/* Home */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingRight: 12, borderRight: "1px solid #1a1f28" }}>
          <div style={{ position: "relative" }}>
            <TeamLogo team={game.home_team} size={40} />
            {homeWon && (
              <span style={{ position: "absolute", top: -4, right: -4, background: "#f59e0b", color: "#000", fontSize: 7, fontWeight: 900, width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>W</span>
            )}
          </div>
          <span style={{ color: "#555", fontSize: 9, fontWeight: 700, textTransform: "uppercase", textAlign: "center", lineHeight: 1.2 }}>{game.home_team.name}</span>
          <span style={{ color: homeWon ? "#fff" : "#2a2a2a", fontSize: 28, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{homeScore}</span>
        </div>
        {/* Away */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, paddingLeft: 12 }}>
          <div style={{ position: "relative" }}>
            <TeamLogo team={game.away_team} size={40} />
            {awayWon && (
              <span style={{ position: "absolute", top: -4, right: -4, background: "#f59e0b", color: "#000", fontSize: 7, fontWeight: 900, width: 14, height: 14, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>W</span>
            )}
          </div>
          <span style={{ color: "#555", fontSize: 9, fontWeight: 700, textTransform: "uppercase", textAlign: "center", lineHeight: 1.2 }}>{game.away_team.name}</span>
          <span style={{ color: awayWon ? "#fff" : "#2a2a2a", fontSize: 28, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{awayScore}</span>
        </div>
      </div>

      {/* Match MVP */}
      {mvpName && (
        <div style={{ background: "#080b0f", borderTop: "1px solid #1a1f28", padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#f59e0b", fontSize: 8, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0 }}>MATCH MVP</span>
          <img src={`https://minotar.net/avatar/${mvpName}/24`} alt={mvpName}
            style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }}
            onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }} />
          <span style={{ color: "#ccc", fontSize: 11, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mvpName}</span>
          {([["PTS", mvpPts], ["REB", mvpReb], ["AST", mvpAst], ["STL", mvpStl], ["BLK", mvpBlk]] as [string, number][]).map(([label, val]) => (
            <div key={label} style={{ textAlign: "center", flexShrink: 0, minWidth: 30 }}>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{val}</div>
              <div style={{ color: "#555", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bracket sub-components ─────────────────────────────────────────────────

function BracketSlot({ team, score, winnerId, teamId, conf }: { team: Team | null | undefined; score: number | null; winnerId: string | null; teamId: string | null; conf: "W"|"E"|"F" }) {
  const isWinner = !!(winnerId && teamId && winnerId === teamId);
  const isLoser  = !!(winnerId && teamId && winnerId !== teamId);
  const { bg, darkBg } = CONF_COLORS[conf];
  return (
    <div style={{ display: "flex", alignItems: "center", height: SLOT_H, borderRadius: 8, background: bg, border: `2px solid ${isWinner ? "#fff" : "transparent"}`, overflow: "hidden", flexShrink: 0, opacity: isLoser ? 0.35 : 1, filter: isWinner ? "brightness(1.15)" : isLoser ? "brightness(0.45) saturate(0.6)" : "none" }}>
      <div style={{ flex: 1, padding: "0 12px", minWidth: 0 }}>
        {team ? <span style={{ fontSize: "1rem", fontWeight: 900, color: "#fff", letterSpacing: "0.04em", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.abbreviation}</span>
               : <span style={{ fontSize: "0.7rem", color: "#555" }}>TBD</span>}
      </div>
      {score != null && <span style={{ padding: "0 7px", fontSize: "0.9rem", fontWeight: 700, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>{score}</span>}
      <div style={{ width: 46, height: SLOT_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: darkBg, borderLeft: "1px solid rgba(0,0,0,0.25)" }}>
        {team?.logo_url ? <img src={team.logo_url} style={{ width: 32, height: 32, objectFit: "contain" }} alt="" /> : <span style={{ fontSize: "0.65rem", color: "#444", fontWeight: 700 }}>?</span>}
      </div>
    </div>
  );
}

function HomeBracketGroup({ m, conf, bestOf }: { m: BracketMatchup; conf: "W"|"E"|"F"; bestOf: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: INNER_GAP, flexShrink: 0, width: 200 }}>
      <BracketSlot team={m.team1} score={m.team1_score} winnerId={m.winner_id} teamId={m.team1_id} conf={conf} />
      <BracketSlot team={m.team2} score={m.team2_score} winnerId={m.winner_id} teamId={m.team2_id} conf={conf} />
      <div style={{ textAlign: "center", fontSize: "0.58rem", fontWeight: 700, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase", paddingTop: 2 }}>BEST OF {bestOf}</div>
    </div>
  );
}

// Static TBD bracket shown when no bracket data exists in the DB
function StaticTBDBracket() {
  const TBD_SLOT_H = 52, TBD_INNER_GAP = 5;
  const TBD_MATCHUP_H = TBD_SLOT_H * 2 + TBD_INNER_GAP;
  const TBD_BASE_GAP  = 40;
  const tbdGap = (ri: number) => (Math.pow(2, ri) - 1) * (TBD_MATCHUP_H + TBD_BASE_GAP) + TBD_BASE_GAP;
  const tbdTop = (ri: number) => ((Math.pow(2, ri) - 1) * (TBD_MATCHUP_H + TBD_BASE_GAP)) / 2;

  const rounds = [
    { label: "Round 1", bestOf: 3, count: 4 },
    { label: "Round 2", bestOf: 5, count: 2 },
  ];
  const canvasH = tbdTop(0) + 4 * TBD_MATCHUP_H + 3 * tbdGap(0) + 80 + 28;

  const TbdSlot = () => (
    <div style={{ display: "flex", alignItems: "center", height: TBD_SLOT_H, borderRadius: 8, background: "#13161e", border: "1px solid #1c2028", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ flex: 1, padding: "0 12px" }}>
        <span style={{ fontSize: "0.75rem", color: "#333", fontWeight: 700 }}>TBD</span>
      </div>
      <div style={{ width: 46, height: TBD_SLOT_H, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0f14", borderLeft: "1px solid #1c2028" }}>
        <span style={{ fontSize: "0.65rem", color: "#2a2a2a", fontWeight: 700 }}>?</span>
      </div>
    </div>
  );

  const TbdGroup = ({ bestOf }: { bestOf: number }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: TBD_INNER_GAP, flexShrink: 0, width: 200 }}>
      <TbdSlot /><TbdSlot />
      <div style={{ textAlign: "center", fontSize: "0.58rem", fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", paddingTop: 2 }}>BEST OF {bestOf}</div>
    </div>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", minWidth: "max-content", height: canvasH, padding: "20px 28px" }}>
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          {rounds.map((col, ri) => (
            <div key={col.label} style={{ flexShrink: 0 }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, textAlign: "center" }}>{col.label}</div>
              <div style={{ display: "flex", flexDirection: "column", paddingTop: tbdTop(ri), gap: tbdGap(ri) }}>
                {Array.from({ length: col.count }).map((_, i) => <TbdGroup key={i} bestOf={col.bestOf} />)}
              </div>
            </div>
          ))}
          {/* Finals */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ height: Math.max(0, Math.floor((canvasH - 28 - TBD_MATCHUP_H) / 2)) }} />
            <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#facc15", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, textAlign: "center" }}>🏆 Finals</div>
            <TbdGroup bestOf={7} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeBracket({ slug, season }: { slug: string; season: string }) {
  const [matchups, setMatchups] = React.useState<BracketMatchup[] | null>(null);
  const playoffSeason = `${season} Playoffs`;
  React.useEffect(() => {
    if (!slug || !season) return;
    fetch(`/api/playoff-brackets?league=${encodeURIComponent(slug)}&season=${encodeURIComponent(playoffSeason)}`)
      .then(r => r.json()).then(d => setMatchups(Array.isArray(d) ? d : [])).catch(() => setMatchups([]));
  }, [slug, playoffSeason]);

  if (matchups === null) return <StaticTBDBracket />;
  if (matchups.length === 0) return <StaticTBDBracket />;

  const isConf = matchups.some(m => m.round_name.startsWith("East ") || m.round_name.startsWith("West "));
  const groupRounds = (filter: (m: BracketMatchup) => boolean) => {
    const map = new Map<string, { name: string; order: number; matchups: BracketMatchup[] }>();
    for (const m of matchups.filter(filter)) {
      if (!map.has(m.round_name)) map.set(m.round_name, { name: m.round_name, order: m.round_order, matchups: [] });
      map.get(m.round_name)!.matchups.push(m);
    }
    return [...map.values()].sort((a, b) => a.order - b.order).map(r => ({ ...r, matchups: r.matchups.sort((a, b) => a.matchup_index - b.matchup_index) }));
  };
  const westRounds  = groupRounds(m => m.round_name.startsWith("West "));
  const eastRounds  = groupRounds(m => m.round_name.startsWith("East "));
  const flatRounds  = groupRounds(m => !m.round_name.startsWith("East ") && !m.round_name.startsWith("West ") && m.round_name !== "Finals");
  const finalsMatch = matchups.find(m => m.round_name === "Finals") ?? null;

  let canvasH = MATCHUP_H + 80;
  const calcH = (col: { matchups: BracketMatchup[] }, ri: number) => topOffsetForRound(ri) + col.matchups.length * MATCHUP_H + Math.max(0, col.matchups.length - 1) * gapForRound(ri);
  (isConf ? [...westRounds, ...eastRounds] : flatRounds).forEach((col, ri) => { const h = calcH(col, ri); if (h > canvasH) canvasH = h; });
  canvasH += 80;
  const finalsTopPad = Math.max(0, Math.floor((canvasH - 80 - MATCHUP_H) / 2));

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", minWidth: "max-content", height: canvasH, padding: "20px 28px" }}>
        {isConf ? (
          <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
            {westRounds.map((col, ri) => {
              const vis = ri === 0 ? col.matchups.filter(m => m.team1_id && m.team2_id) : col.matchups;
              return (
                <div key={col.name} style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, textAlign: "center" }}>{col.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", paddingTop: topOffsetForRound(ri), gap: gapForRound(ri) }}>
                    {vis.map(m => <HomeBracketGroup key={m.id} m={m} conf="W" bestOf={ri === 0 ? 3 : 5} />)}
                  </div>
                </div>
              );
            })}
            {finalsMatch && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ height: finalsTopPad }} />
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#facc15", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, textAlign: "center" }}>🏆 Finals</div>
                <HomeBracketGroup m={finalsMatch} conf="F" bestOf={7} />
              </div>
            )}
            {[...eastRounds].reverse().map((col, reverseIdx) => {
              const riFromRight = eastRounds.length - 1 - reverseIdx;
              const vis = riFromRight === 0 ? col.matchups.filter(m => m.team1_id && m.team2_id) : col.matchups;
              return (
                <div key={col.name} style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, textAlign: "center" }}>{col.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", paddingTop: topOffsetForRound(riFromRight), gap: gapForRound(riFromRight) }}>
                    {vis.map(m => <HomeBracketGroup key={m.id} m={m} conf="E" bestOf={riFromRight === 0 ? 3 : 5} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
            {flatRounds.map((col, ri) => {
              const vis = ri === 0 ? col.matchups.filter(m => m.team1_id && m.team2_id) : col.matchups;
              return (
                <div key={col.name} style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, textAlign: "center" }}>{col.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", paddingTop: topOffsetForRound(ri), gap: gapForRound(ri) }}>
                    {vis.map(m => <HomeBracketGroup key={m.id} m={m} conf="W" bestOf={ri === 0 ? 3 : 5} />)}
                  </div>
                </div>
              );
            })}
            {finalsMatch && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ height: finalsTopPad }} />
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#facc15", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, textAlign: "center" }}>🏆 Finals</div>
                <HomeBracketGroup m={finalsMatch} conf="F" bestOf={7} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LeagueHome({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueDisplay = leagueNames[slug] ?? slug.toUpperCase();
  const label   = leagueLabel[slug] ?? slug.toUpperCase();
  const color   = leagueColor[slug] ?? "#888";

  const [articles, setArticles]       = React.useState<Article[]>([]);
  const [recentGames, setRecentGames] = React.useState<Game[]>([]);
  const [upcomingGames, setUpcomingGames] = React.useState<Game[]>([]);
  const [leaders, setLeaders]         = React.useState<StatRow[]>([]);
  const [leaderSeason, setLeaderSeason] = React.useState("");
  const [bracketSeason, setBracketSeason] = React.useState("");
  const [isPlayoffs, setIsPlayoffs]   = React.useState(false);
  const [gameMvps, setGameMvps]       = React.useState<Record<string, GameStat>>({});
  const [teamStandings, setTeamStandings] = React.useState<TeamRecord[]>([]);
  const [teamDivisions, setTeamDivisions] = React.useState<Record<string, string | null>>({});
  const [loading, setLoading]         = React.useState(true);

  // Fetch articles
  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    fetch("/api/articles")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const dbSlug = slug === "mba" ? "pba" : slug === "mcaa" ? "pcaa" : slug === "mbgl" ? "pbgl" : slug;
          setArticles(data.filter((a: Article) => a.league === slug || a.league === dbSlug));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  // Fetch games + compute standings
  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/games?league=${slug}`)
      .then(r => r.json())
      .then((data: Game[]) => {
        if (!Array.isArray(data)) return;

        const completed = data.filter(g => (g.status === "final" || g.status === "completed") && g.home_score !== null);
        setRecentGames(completed.slice(-3).reverse());

        const upcoming = data
          .filter(g => g.status === "scheduled")
          .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
          .slice(0, 3);
        setUpcomingGames(upcoming);

        // Filter standings to the current (highest) season only
        const parseSeasonNum = (s: string | null | undefined) => { const m = s?.match(/\d+/); return m ? parseInt(m[0]) : 0; };
        const maxSeason = Math.max(0, ...data.map(g => parseSeasonNum(g.season)));
        const currentCompleted = maxSeason > 0 ? completed.filter(g => parseSeasonNum(g.season) === maxSeason) : completed;

        // Compute standings from current season games only
        const teamMap: Record<string, TeamRecord> = {};
        for (const g of currentCompleted) {
          if (!teamMap[g.home_team.id]) teamMap[g.home_team.id] = { team: g.home_team, wins: 0, losses: 0 };
          if (!teamMap[g.away_team.id]) teamMap[g.away_team.id] = { team: g.away_team, wins: 0, losses: 0 };
          const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
          if (homeWon) { teamMap[g.home_team.id].wins++; teamMap[g.away_team.id].losses++; }
          else         { teamMap[g.away_team.id].wins++; teamMap[g.home_team.id].losses++; }
        }
        const sorted = Object.values(teamMap).sort((a, b) => b.wins - a.wins || a.losses - b.losses);
        setTeamStandings(sorted);
      })
      .catch(() => {});
  }, [slug]);

  // Fetch team divisions
  React.useEffect(() => {
    if (!slug) return;
    fetch(`/api/teams?league=${slug}`)
      .then(r => r.json())
      .then((teams: { id: string; division?: string | null }[]) => {
        if (!Array.isArray(teams)) return;
        const map: Record<string, string | null> = {};
        for (const t of teams) map[t.id] = t.division ?? null;
        setTeamDivisions(map);
      })
      .catch(() => {});
  }, [slug]);

  // Fetch MVP for each recent game
  React.useEffect(() => {
    if (recentGames.length === 0) return;
    recentGames.forEach(async g => {
      try {
        const r = await fetch(`/api/game-stats?game_id=${g.id}`);
        const stats: GameStat[] = await r.json();
        if (Array.isArray(stats) && stats.length > 0) {
          const eff = (s: GameStat) =>
            (s.points ?? 0) +
            1.2 * ((s.rebounds_off ?? 0) + (s.rebounds_def ?? 0)) +
            1.5 * (s.assists ?? 0) +
            2 * (s.steals ?? 0) +
            2 * (s.blocks ?? 0) -
            (s.turnovers ?? 0);
          const mvp = [...stats].sort((a, b) => eff(b) - eff(a))[0];
          setGameMvps(prev => ({ ...prev, [g.id]: mvp }));
        }
      } catch { /**/ }
    });
  }, [recentGames]);

  // Fetch seasons + determine playoffs
  React.useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await fetch(`/api/stats/seasons?league=${slug}`);
        const data: { season: string }[] = await r.json();
        if (!Array.isArray(data)) return;

        const nonPlayoff = [...new Set(data.map(d => d.season).filter(s => s && !s.toLowerCase().includes("playoff")))].sort((a, b) => b.localeCompare(a));
        if (nonPlayoff.length > 0) setBracketSeason(nonPlayoff[0]);

        const seasonKey = (s: string) => { const m = s.match(/Season\s+(\d+)/i); return (m ? parseInt(m[1]) : 0) + (s.toLowerCase().includes("playoff") ? 0.5 : 0); };
        const all = [...new Set(data.map(d => d.season).filter(Boolean))].sort((a, b) => seasonKey(b) - seasonKey(a));
        for (const s of all) {
          const sr = await fetch(`/api/stats?league=${slug}&season=${encodeURIComponent(s)}`);
          const sd = await sr.json();
          if (Array.isArray(sd) && sd.length > 0) {
            setLeaderSeason(s);
            setLeaders(sd);
            setIsPlayoffs(s.toLowerCase().includes("playoff"));
            break;
          }
        }
      } catch { /**/ }
    })();
  }, [slug]);

  const westSeeds = teamStandings.filter(tr => teamDivisions[tr.team.id] === "West");
  const eastSeeds = teamStandings.filter(tr => teamDivisions[tr.team.id] === "East");
  const hasConf = westSeeds.length > 0 || eastSeeds.length > 0;
  const seedOrder = (seeds: TeamRecord[]) =>
    ([0, 3, 1, 2] as const).map(i => seeds[i]).filter((x): x is TeamRecord => x != null);
  const SEED_NUMS = [1, 4, 2, 3] as const;
  type PlayoffSlot = TeamRecord & { conf: string; seed: number };
  const playoffSlots: PlayoffSlot[] = hasConf
    ? [
        ...seedOrder(westSeeds).map((tr, i) => ({ ...tr, conf: "West", seed: SEED_NUMS[i] })),
        ...seedOrder(eastSeeds).map((tr, i) => ({ ...tr, conf: "East", seed: SEED_NUMS[i] })),
      ]
    : seedOrder(teamStandings.slice(0, 4)).map((tr, i) => ({ ...tr, conf: "", seed: SEED_NUMS[i] }));

  return (
    <main style={{ background: "#080808", minHeight: "100vh" }}>

      {/* ── HERO ── */}
      <div style={{ position: "relative", overflow: "hidden", background: "#080808", borderBottom: "1px solid #131820" }}>
        <div style={{ position: "absolute", left: "-5%", top: "50%", transform: "translateY(-50%)", width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, ${color}0d 0%, transparent 65%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ color: "#555", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>{leagueDisplay}</span>
          </div>
          <h1 style={{ margin: "0 0 18px 0", lineHeight: 1.05 }}>
            <span style={{ display: "block", color: "#fff", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 900 }}>Minecraft Basketball</span>
          </h1>
          <a href="https://discord.gg/baWUsXWhdV"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#5865f2", color: "white", padding: "11px 22px", borderRadius: 999, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#4752c4")} onMouseLeave={e => (e.currentTarget.style.background = "#5865f2")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.053 19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" /></svg>
            Join Discord
          </a>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>

        {/* Two-column layout: left = Upcoming + News, right = Results + Stat Leaders */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32, alignItems: "start" }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <SectionHeader icon="📅" title="Upcoming Matchups" linkLabel="VIEW SCHEDULE →" linkHref={`/${slug}/schedule`} />
              {upcomingGames.length === 0 ? (
                <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 12, padding: "32px 16px", textAlign: "center", color: "#2a2a2a", fontSize: 12 }}>No upcoming games scheduled.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {upcomingGames.map(g => <UpcomingCard key={g.id} game={g} slug={slug} />)}
                </div>
              )}
            </div>

            {/* News — compact list */}
            <div>
              <SectionHeader icon="📰" title="News" />
              {loading ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#333", fontSize: 12 }}>Loading...</div>
              ) : articles.length === 0 ? (
                <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 10, padding: "24px 16px", textAlign: "center", color: "#2a2a2a", fontSize: 12 }}>No articles yet for the {label}.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {articles.map(a => (
                    <a key={a.id} href={`/${slug}/articles/${a.id}`}
                      style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 10, padding: "9px 13px", textDecoration: "none", display: "flex", alignItems: "center", gap: 10, transition: "border-color 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = "#2a3048")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#1c2028")}>
                      {a.image_url && (
                        <img src={a.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ background: leagueColor[a.league] ?? "#333", color: "white", fontSize: 8, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "1px 5px", borderRadius: 4 }}>{leagueLabel[a.league] ?? a.league.toUpperCase()}</span>
                          <span style={{ color: "#3a3a3a", fontSize: 10 }}>{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                        </div>
                        <div style={{ color: "#d0d0d0", fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                      </div>
                      <span style={{ color: "#2a2a2a", fontSize: 10, flexShrink: 0 }}>→</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <SectionHeader icon="🏆" title="Latest Results" linkLabel="VIEW ALL →" linkHref={`/${slug}/boxscores`} />
              {recentGames.length === 0 ? (
                <div style={{ background: "#101318", border: "1px solid #1c2028", borderRadius: 12, padding: "32px 16px", textAlign: "center", color: "#2a2a2a", fontSize: 12 }}>No results yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recentGames.map(g => <ResultCard key={g.id} game={g} slug={slug} mvp={gameMvps[g.id]} isPlayoffs={isPlayoffs} />)}
                </div>
              )}
            </div>

            {/* Stat Leaders */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>📊</span>
                  <span style={{ color: "#e0e0e0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>Stat Leaders</span>
                </div>
                {leaderSeason && <span style={{ color: "#333", fontSize: 11, fontWeight: 600 }}>{leaderSeason}</span>}
              </div>
              {leaders.length === 0 ? (
                <div style={{ color: "#2a2a2a", fontSize: 12, textAlign: "center", padding: "24px 0" }}>No stats yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {LEADER_CATS.map(cat => <LeaderCard key={cat.key as string} cat={cat} stats={leaders} />)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── PLAYOFFS SECTION ── */}
        <div style={{ background: "#0a0800", border: "1px solid #1e1800", borderRadius: 16, overflow: "hidden" }}>
          {/* Section header */}
          <div style={{ background: "#0d0b00", borderBottom: "1px solid #1e1800", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ background: "#f59e0b", color: "#000", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", padding: "4px 10px", borderRadius: 6, textTransform: "uppercase" }}>PLAYOFFS</span>
              {bracketSeason && <span style={{ color: "#5a4a20", fontSize: 12, fontWeight: 600 }}>{bracketSeason}</span>}
            </div>
            <a href={`/${slug}/boxscores`}
              style={{ background: "#1a1400", border: "1px solid #332800", color: "#a07a20", fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8, textDecoration: "none", letterSpacing: "0.06em" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#241c00")} onMouseLeave={e => (e.currentTarget.style.background = "#1a1400")}>
              SCORES →
            </a>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 270px", gap: 0 }}>
            {/* Bracket */}
            <div style={{ borderRight: "1px solid #1e1800", padding: "4px 0" }}>
              <HomeBracket slug={slug} season={bracketSeason} />
            </div>

            {/* Playoff Picture */}
            <div style={{ padding: "18px 14px" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#a07a20", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>Playoff Picture</div>
              {playoffSlots.length === 0 ? (
                <div style={{ color: "#333", fontSize: 11, padding: "12px 0" }}>No standings yet.</div>
              ) : (() => {
                const confGroups: { conf: string; color: string; slots: PlayoffSlot[] }[] = hasConf
                  ? [
                      { conf: "West", color: "#ef4444", slots: playoffSlots.filter(s => s.conf === "West") },
                      { conf: "East", color: "#3b82f6", slots: playoffSlots.filter(s => s.conf === "East") },
                    ].filter(g => g.slots.length > 0)
                  : [{ conf: "", color: "#888", slots: playoffSlots }];
                return (
                  <div>
                    {confGroups.map((group, gi) => (
                      <div key={group.conf || "all"} style={{ marginBottom: gi < confGroups.length - 1 ? 12 : 0 }}>
                        {group.conf && (
                          <div style={{ fontSize: "0.55rem", fontWeight: 800, color: group.color, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
                            {group.conf} Conference
                          </div>
                        )}
                        {group.slots.map((slot, i) => (
                          <React.Fragment key={slot.team.id}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#0d0b00", borderLeft: `2px solid ${i < 2 ? "#4ade8055" : "#60a5fa55"}`, padding: "7px 8px", marginBottom: 1, borderRadius: "0 4px 4px 0" }}>
                              <span style={{ color: "#f59e0b", fontSize: 10, fontWeight: 900, width: 12, textAlign: "center", flexShrink: 0 }}>{slot.seed}</span>
                              <TeamLogo team={slot.team} size={24} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: "#ccc", fontSize: 10, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slot.team.name}</div>
                                <div style={{ color: "#444", fontSize: 8, fontWeight: 600 }}>{slot.team.abbreviation}</div>
                              </div>
                              <div style={{ textAlign: "right", flexShrink: 0 }}>
                                <span style={{ color: "#4ade80", fontSize: 10, fontWeight: 700 }}>{slot.wins}</span>
                                <span style={{ color: "#444", fontSize: 10 }}>-</span>
                                <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 700 }}>{slot.losses}</span>
                              </div>
                            </div>
                            {i === 1 && <div style={{ height: 6 }} />}
                          </React.Fragment>
                        ))}
                      </div>
                    ))}
                    <a href={`/${slug}/standings`}
                      style={{ display: "block", textAlign: "center", color: "#5a4a20", fontSize: 10, fontWeight: 700, textDecoration: "none", marginTop: 10, letterSpacing: "0.08em" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#a07a20")} onMouseLeave={e => (e.currentTarget.style.color = "#5a4a20")}>
                      FULL STANDINGS →
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
