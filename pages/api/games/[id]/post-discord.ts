import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../../lib/supabase";
import { requireAdmin } from "../../../../lib/adminAuth";

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number>  = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
const LEAGUE_SLUGS:  Record<string, string>  = { pba: "mba",   pcaa: "mcaa",   pbgl: "mbgl" };

type StatRow = {
  mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null;
  turnovers: number | null; fg_made: number | null; fg_attempted: number | null;
  players: { mc_username: string | null; discord_id: string | null } | null;
};

function potgScore(s: StatRow) {
  const pts = s.points ?? 0, reb = (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0);
  const ast = s.assists ?? 0, stl = s.steals ?? 0, blk = s.blocks ?? 0, tov = s.turnovers ?? 0;
  const miss = (s.fg_attempted ?? 0) - (s.fg_made ?? 0);
  return pts + reb * 1.2 + ast * 1.5 + stl * 2 + blk * 2 - tov - miss * 0.5;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("*, home_team:home_team_id(id,name,abbreviation,logo_url), away_team:away_team_id(id,name,abbreviation,logo_url)")
    .eq("id", id)
    .single();
  if (gameErr || !game) return res.status(404).json({ error: "Game not found" });

  const league = game.league as string;
  const webhookUrl = process.env[`DISCORD_SCORES_WEBHOOK_${league.toUpperCase()}`];
  if (!webhookUrl) return res.status(400).json({ error: "No webhook configured for this league" });

  const { data: stats } = await supabase
    .from("game_stats")
    .select("*, players(mc_uuid, mc_username, discord_id)")
    .eq("game_id", id);

  const allStats = (stats ?? []) as StatRow[];

  const home = game.home_team as { id: string; name: string; abbreviation: string; logo_url: string | null };
  const away = game.away_team as { id: string; name: string; abbreviation: string; logo_url: string | null };
  const homeScore = game.home_score as number;
  const awayScore = game.away_score as number;
  const homeWon = homeScore > awayScore;

  const gameDate = new Date(game.scheduled_at as string).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const slug = LEAGUE_SLUGS[league] ?? league;
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
  const boxscoreUrl = `${baseUrl}/${slug}/boxscores?game=${id}`;

  // ── POTG ─────────────────────────────────────────────────────────────────────
  let potgField: Record<string, unknown> | null = null;
  let pingContent = "";

  if (allStats.length > 0) {
    const best = allStats.reduce((a, b) => potgScore(a) >= potgScore(b) ? a : b);
    const name = best.players?.mc_username ?? best.mc_uuid;
    const discordId = best.players?.discord_id;
    const reb = (best.rebounds_off ?? 0) + (best.rebounds_def ?? 0);

    const statParts = [
      `**${best.points ?? 0}** PTS`,
      `**${reb}** REB`,
      `**${best.assists ?? 0}** AST`,
      (best.steals  ?? 0) > 0 ? `**${best.steals}** STL`  : null,
      (best.blocks  ?? 0) > 0 ? `**${best.blocks}** BLK`  : null,
      (best.turnovers ?? 0) > 0 ? `**${best.turnovers}** TO` : null,
      `**${best.fg_made ?? 0}/${best.fg_attempted ?? 0}** FG`,
    ].filter(Boolean).join("  ·  ");

    potgField = {
      name: "🏆  Player of the Game",
      value: `**${name}**\n${statParts}`,
      inline: false,
    };

    if (discordId) pingContent = `<@${discordId}> is the Player of the Game!`;
  }

  // ── Embed ─────────────────────────────────────────────────────────────────────
  // author = home team (icon top-left), thumbnail = away team (image top-right)
  // This mirrors the boxscore header layout as closely as Discord allows
  const embed: Record<string, unknown> = {
    author: {
      name: `${home.name}  ·  ${home.abbreviation}  ·  HOME`,
      icon_url: home.logo_url ?? undefined,
    },
    title: `${homeScore}  –  ${awayScore}`,
    description: `${away.name}  ·  ${away.abbreviation}  ·  AWAY\n\n🟢  **FINAL**  ·  ${gameDate}`,
    color: LEAGUE_COLORS[league] ?? 0x5865F2,
    thumbnail: { url: away.logo_url ?? "" },
    fields: potgField ? [potgField] : [],
    footer: {
      text: `${LEAGUE_LABELS[league] ?? league.toUpperCase()}  ·  View full box score ↗`,
      icon_url: (homeWon ? home.logo_url : away.logo_url) ?? undefined,
    },
    timestamp: new Date().toISOString(),
    url: boxscoreUrl,
  };

  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: pingContent || undefined, embeds: [embed] }),
    });
    if (!r.ok) return res.status(500).json({ error: `Discord returned ${r.status}` });
  } catch {
    return res.status(500).json({ error: "Failed to reach Discord" });
  }

  return res.status(200).json({ ok: true });
}
