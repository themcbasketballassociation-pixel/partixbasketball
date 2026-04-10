import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number> = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
const LEAGUE_SLUGS: Record<string, string> = { pba: "mba", pcaa: "mcaa", pbgl: "mbgl" };

type StatRow = {
  mc_uuid: string;
  points: number | null;
  rebounds_off: number | null;
  rebounds_def: number | null;
  assists: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  fg_made: number | null;
  fg_attempted: number | null;
  players: { mc_uuid: string; mc_username: string | null; discord_id: string | null } | null;
};

function potgScore(s: StatRow): number {
  const pts = s.points ?? 0;
  const reb = (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0);
  const ast = s.assists ?? 0;
  const stl = s.steals ?? 0;
  const blk = s.blocks ?? 0;
  const tov = s.turnovers ?? 0;
  const miss = (s.fg_attempted ?? 0) - (s.fg_made ?? 0);
  return pts + reb * 1.2 + ast * 1.5 + stl * 2 + blk * 2 - tov - miss * 0.5;
}

function fmtPct(made: number | null, att: number | null): string {
  if (!att) return "—";
  return `${Math.round(((made ?? 0) / att) * 100)}%`;
}

async function postScoreToDiscord(game: Record<string, unknown>) {
  const league = game.league as string;
  const webhookUrl = process.env[`DISCORD_SCORES_WEBHOOK_${league.toUpperCase()}`];
  if (!webhookUrl) return;

  const home = game.home_team as Record<string, string> | null;
  const away = game.away_team as Record<string, string> | null;
  const homeName = home?.name ?? "Home";
  const awayName = away?.name ?? "Away";
  const homeAbbr = home?.abbreviation ?? "HME";
  const awayAbbr = away?.abbreviation ?? "AWY";
  const homeScore = game.home_score as number;
  const awayScore = game.away_score as number;
  const winnerName = homeScore > awayScore ? homeName : awayName;
  const winnerLogo = homeScore > awayScore ? home?.logo_url : away?.logo_url;
  const gameDate = new Date(game.scheduled_at as string).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
  const slug = LEAGUE_SLUGS[league] ?? league;
  const boxscoreUrl = `${baseUrl}/${slug}/boxscores?game=${game.id}`;

  // Fetch game stats to calculate POTG
  const { data: stats } = await supabase
    .from("game_stats")
    .select("*, players(mc_uuid, mc_username, discord_id)")
    .eq("game_id", game.id as string);

  let potgField: Record<string, unknown> | null = null;
  let pingContent = "";

  if (stats && stats.length > 0) {
    const best = (stats as StatRow[]).reduce((a, b) => potgScore(a) >= potgScore(b) ? a : b);
    const name = best.players?.mc_username ?? best.mc_uuid;
    const discordId = best.players?.discord_id;
    const pts = best.points ?? 0;
    const reb = (best.rebounds_off ?? 0) + (best.rebounds_def ?? 0);
    const ast = best.assists ?? 0;
    const stl = best.steals ?? 0;
    const blk = best.blocks ?? 0;
    const tov = best.turnovers ?? 0;
    const fgPct = fmtPct(best.fg_made, best.fg_attempted);

    const statLine = [
      `${pts} PTS`,
      `${reb} REB`,
      `${ast} AST`,
      stl > 0 ? `${stl} STL` : null,
      blk > 0 ? `${blk} BLK` : null,
      tov > 0 ? `${tov} TO` : null,
      `${best.fg_made ?? 0}/${best.fg_attempted ?? 0} FG (${fgPct})`,
    ].filter(Boolean).join(" · ");

    potgField = {
      name: `Player of the Game`,
      value: `**${name}**\n${statLine}`,
      inline: false,
    };

    if (discordId) pingContent = `<@${discordId}> is the Player of the Game!`;
  }

  const embed: Record<string, unknown> = {
    title: `${homeAbbr} ${homeScore} – ${awayScore} ${awayAbbr}`,
    description: `**${winnerName}** win on ${gameDate}`,
    color: LEAGUE_COLORS[league] ?? 0x5865F2,
    fields: [
      { name: homeName, value: String(homeScore), inline: true },
      { name: awayName, value: String(awayScore), inline: true },
      ...(potgField ? [potgField] : []),
    ],
    footer: { text: `${LEAGUE_LABELS[league] ?? league.toUpperCase()} · Final` },
    timestamp: new Date().toISOString(),
    url: boxscoreUrl,
  };

  if (winnerLogo) embed.thumbnail = { url: winnerLogo };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: pingContent || undefined,
        embeds: [embed],
      }),
    });
  } catch {
    // Discord failure shouldn't break the response
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { scheduled_at, home_team_id, away_team_id, home_score, away_score, status } = req.body;
    const updates: Record<string, unknown> = {};
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
    if (home_team_id !== undefined) updates.home_team_id = home_team_id;
    if (away_team_id !== undefined) updates.away_team_id = away_team_id;
    if (home_score !== undefined) updates.home_score = home_score;
    if (away_score !== undefined) updates.away_score = away_score;
    if (status !== undefined) updates.status = status;
    // Auto-set final when both scores are provided and no explicit status given
    if (home_score !== undefined && away_score !== undefined && status === undefined) {
      updates.status = "final";
    }
    const { data, error } = await supabase
      .from("games")
      .update(updates)
      .eq("id", id)
      .select("*, home_team:home_team_id(id,name,abbreviation,logo_url), away_team:away_team_id(id,name,abbreviation,logo_url)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Post score to Discord when a game is marked completed/final
    const isCompleted = data.status === "completed" || data.status === "final";
    const wasJustCompleted = (status === "completed" || status === "final") ||
      (home_score !== undefined && away_score !== undefined && status === undefined);
    if (isCompleted && wasJustCompleted) {
      await postScoreToDiscord(data as Record<string, unknown>);
    }

    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
