import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number> = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
const LEAGUE_SLUGS: Record<string, string> = { pba: "mba", pcaa: "mcaa", pbgl: "mbgl" };

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
  const winner = homeScore > awayScore ? homeName : awayName;
  const gameDate = new Date(game.scheduled_at as string).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
  const slug = LEAGUE_SLUGS[league] ?? league;
  const boxscoreUrl = `${baseUrl}/${slug}/boxscores?game=${game.id}`;

  const embed = {
    title: `${homeAbbr} ${homeScore} – ${awayScore} ${awayAbbr}`,
    description: `**${winner}** win on ${gameDate}`,
    color: LEAGUE_COLORS[league] ?? 0x5865F2,
    fields: [
      { name: homeName, value: String(homeScore), inline: true },
      { name: awayName, value: String(awayScore), inline: true },
    ],
    footer: { text: `${LEAGUE_LABELS[league] ?? league.toUpperCase()} · Final` },
    timestamp: new Date().toISOString(),
    url: boxscoreUrl,
  };

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
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
