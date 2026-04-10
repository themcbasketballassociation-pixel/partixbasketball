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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: game } = await supabase
    .from("games")
    .select("*, home_team:home_team_id(id,name,abbreviation,logo_url), away_team:away_team_id(id,name,abbreviation,logo_url)")
    .eq("id", id)
    .single();

  if (!game) return new Response("Not found", { status: 404 });

  const home = game.home_team as { name: string; abbreviation: string; logo_url: string | null };
  const away = game.away_team as { name: string; abbreviation: string; logo_url: string | null };
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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          background: "#0f0f0f",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div style={{ width: "100%", height: 4, background: accentColor, display: "flex" }} />

        {/* Main score row */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 56px",
        }}>

          {/* Home team */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1 }}>
            {home.logo_url
              ? <img src={home.logo_url} width={88} height={88} style={{ objectFit: "contain", flexShrink: 0 }} />
              : <div style={{ width: 88, height: 88, background: "#222", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 20, fontWeight: 800 }}>{home.abbreviation}</div>
            }
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ color: "#666", fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{home.abbreviation}</span>
              <span style={{ color: homeWon ? "#ffffff" : "#444", fontSize: 84, fontWeight: 900, lineHeight: "1", letterSpacing: "-2px" }}>{homeScore}</span>
              <span style={{ color: "#333", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>HOME</span>
            </div>
          </div>

          {/* Center — league logo + FINAL + date */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0, padding: "0 32px" }}>
            <img src={leagueLogoUrl} width={52} height={52} style={{ objectFit: "contain" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}>Final</span>
              <span style={{ color: "#555", fontSize: 22, fontWeight: 900 }}>—</span>
              <span style={{ color: "#444", fontSize: 12, letterSpacing: "0.04em" }}>{gameDate}</span>
            </div>
            <span style={{ color: "#333", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>{leagueLabel}</span>
          </div>

          {/* Away team */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1, justifyContent: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <span style={{ color: "#666", fontSize: 18, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>{away.abbreviation}</span>
              <span style={{ color: awayWon ? "#ffffff" : "#444", fontSize: 84, fontWeight: 900, lineHeight: "1", letterSpacing: "-2px" }}>{awayScore}</span>
              <span style={{ color: "#333", fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>AWAY</span>
            </div>
            {away.logo_url
              ? <img src={away.logo_url} width={88} height={88} style={{ objectFit: "contain", flexShrink: 0 }} />
              : <div style={{ width: 88, height: 88, background: "#222", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 20, fontWeight: 800 }}>{away.abbreviation}</div>
            }
          </div>

        </div>

        {/* Bottom accent bar */}
        <div style={{ width: "100%", height: 4, background: accentColor, display: "flex" }} />
      </div>
    ),
    { width: 900, height: 240 }
  );
}
