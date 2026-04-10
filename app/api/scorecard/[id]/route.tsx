import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { supabase } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";

const LEAGUE_COLORS: Record<string, string> = {
  pba: "#C8102E", pcaa: "#003087", pbgl: "#BB3430",
};
const LEAGUE_LOGOS: Record<string, string> = {
  pba: "/logos/mba.webp", pcaa: "/logos/mcaa.webp", pbgl: "/logos/MBGL.png",
};
const LEAGUE_LABELS: Record<string, string> = {
  pba: "MBA", pcaa: "MCAA", pbgl: "MBGL",
};

type StatRow = {
  mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null;
  turnovers: number | null; fg_made: number | null; fg_attempted: number | null;
  players: { mc_username: string | null } | null;
};

function potgScore(s: StatRow) {
  const pts  = s.points ?? 0;
  const reb  = (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0);
  const ast  = s.assists ?? 0;
  const stl  = s.steals ?? 0;
  const blk  = s.blocks ?? 0;
  const tov  = s.turnovers ?? 0;
  const miss = (s.fg_attempted ?? 0) - (s.fg_made ?? 0);
  return pts + reb * 1.2 + ast * 1.5 + stl * 2.5 + blk * 2 - tov * 0.3 - miss * 0.5;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [{ data: game }, { data: statsRaw }] = await Promise.all([
    supabase
      .from("games")
      .select("*, home_team:home_team_id(id,name,abbreviation,logo_url), away_team:away_team_id(id,name,abbreviation,logo_url)")
      .eq("id", id)
      .single(),
    supabase
      .from("game_stats")
      .select("*, players(mc_username)")
      .eq("game_id", id),
  ]);

  if (!game) return new Response("Not found", { status: 404 });

  const home = game.home_team as { id: string; name: string; abbreviation: string; logo_url: string | null };
  const away = game.away_team as { id: string; name: string; abbreviation: string; logo_url: string | null };
  const homeScore = game.home_score as number;
  const awayScore = game.away_score as number;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  const league = game.league as string;

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
  const leagueLogoUrl = `${baseUrl}${LEAGUE_LOGOS[league] ?? ""}`;
  const accentColor = LEAGUE_COLORS[league] ?? "#5865F2";
  const leagueLabel = LEAGUE_LABELS[league] ?? league.toUpperCase();

  const gameDate = new Date(game.scheduled_at as string).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  // ── POTG (winning team only) ─────────────────────────────────────────────
  const allStats = (statsRaw ?? []) as StatRow[];
  const winnerTeamId = homeWon ? home.id : away.id;
  const { data: winnerRoster } = await supabase
    .from("player_teams").select("mc_uuid").eq("team_id", winnerTeamId);
  const winnerUuids = new Set((winnerRoster ?? []).map((r: { mc_uuid: string }) => r.mc_uuid));
  const potgPool = winnerUuids.size > 0 ? allStats.filter(s => winnerUuids.has(s.mc_uuid)) : allStats;

  let potgName = "";
  let potgStatLine = "";
  if (potgPool.length > 0) {
    const best = potgPool.reduce((a, b) => potgScore(a) >= potgScore(b) ? a : b);
    potgName = best.players?.mc_username ?? best.mc_uuid;
    const reb = (best.rebounds_off ?? 0) + (best.rebounds_def ?? 0);
    potgStatLine = [
      `${best.points ?? 0} PTS`,
      `${reb} REB`,
      `${best.assists ?? 0} AST`,
      (best.steals   ?? 0) > 0  ? `${best.steals} STL`   : null,
      (best.blocks   ?? 0) > 0  ? `${best.blocks} BLK`   : null,
      (best.turnovers ?? 0) > 0 ? `${best.turnovers} TO` : null,
      `${best.fg_made ?? 0}/${best.fg_attempted ?? 0} FG`,
    ].filter(Boolean).join("  ·  ");
  }

  const hasPotg = potgName.length > 0;
  const imgHeight = hasPotg ? 320 : 220;

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%",
        background: "#0f0f0f",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}>
        {/* Top accent bar */}
        <div style={{ width: "100%", height: 5, background: accentColor, display: "flex", flexShrink: 0 }} />

        {/* Score section */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 52px",
          height: hasPotg ? 200 : 200,
          flexShrink: 0,
        }}>
          {/* Home */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1 }}>
            {home.logo_url
              ? <img src={home.logo_url} width={80} height={80} style={{ objectFit: "contain" }} />
              : <div style={{ width: 80, height: 80, background: "#222", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 18, fontWeight: 800 }}>{home.abbreviation}</div>
            }
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#666", fontSize: 15, fontWeight: 700, letterSpacing: "0.1em" }}>{home.abbreviation}</span>
              <span style={{ color: homeWon ? "#ffffff" : "#333", fontSize: 76, fontWeight: 900, lineHeight: "1", letterSpacing: "-3px" }}>{homeScore}</span>
              <span style={{ color: "#252525", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em" }}>HOME</span>
            </div>
          </div>

          {/* Center */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, padding: "0 24px" }}>
            <img src={leagueLogoUrl} width={42} height={42} style={{ objectFit: "contain" }} />
            <span style={{ color: "#4ade80", fontSize: 11, fontWeight: 800, letterSpacing: "0.18em" }}>FINAL</span>
            <span style={{ color: "#252525", fontSize: 28, fontWeight: 900, lineHeight: "1" }}>—</span>
            <span style={{ color: "#333", fontSize: 11, letterSpacing: "0.03em" }}>{gameDate}</span>
            <span style={{ color: "#252525", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>{leagueLabel}</span>
          </div>

          {/* Away */}
          <div style={{ display: "flex", alignItems: "center", gap: 18, flex: 1, justifyContent: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ color: "#666", fontSize: 15, fontWeight: 700, letterSpacing: "0.1em" }}>{away.abbreviation}</span>
              <span style={{ color: awayWon ? "#ffffff" : "#333", fontSize: 76, fontWeight: 900, lineHeight: "1", letterSpacing: "-3px" }}>{awayScore}</span>
              <span style={{ color: "#252525", fontSize: 10, fontWeight: 700, letterSpacing: "0.14em" }}>AWAY</span>
            </div>
            {away.logo_url
              ? <img src={away.logo_url} width={80} height={80} style={{ objectFit: "contain" }} />
              : <div style={{ width: 80, height: 80, background: "#222", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 18, fontWeight: 800 }}>{away.abbreviation}</div>
            }
          </div>
        </div>

        {/* POTG section */}
        {hasPotg && (
          <>
            <div style={{ width: "100%", height: 1, background: "#1e1e1e", display: "flex", flexShrink: 0 }} />
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 52px",
              gap: 5,
            }}>
              <span style={{ color: accentColor, fontSize: 10, fontWeight: 800, letterSpacing: "0.2em" }}>🏆  PLAYER OF THE GAME</span>
              <span style={{ color: "#ffffff", fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" }}>{potgName}</span>
              <span style={{ color: "#777", fontSize: 13, fontWeight: 500 }}>{potgStatLine}</span>
            </div>
          </>
        )}

        {/* Bottom accent bar */}
        <div style={{ width: "100%", height: 5, background: accentColor, display: "flex", flexShrink: 0 }} />
      </div>
    ),
    { width: 900, height: imgHeight }
  );
}
