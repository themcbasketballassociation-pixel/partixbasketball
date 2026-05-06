import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";
import { sendWebhookEmbed, getWebhookUrl } from "../../../lib/discordWebhook";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, team_id, season, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("contracts")
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation, color2)")
      .order("amount", { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (team_id) query = query.eq("team_id", team_id as string);
    if (season) query = query.eq("season", season as string);
    // Default to active unless explicitly passed
    const statusFilter = (status as string) ?? "active";
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, mc_uuid, team_id, amount, is_two_season, season } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !mc_uuid || !team_id)
      return res.status(400).json({ error: "league, mc_uuid, team_id required" });
    // MCAA and MBGL have no salary cap — always store amount as 0
    const finalAmount = (league === "pcaa" || league === "pbgl") ? 0 : Number(amount ?? 0);
    const { data, error } = await supabase
      .from("contracts")
      .insert([{
        league,
        mc_uuid,
        team_id,
        amount: finalAmount,
        is_two_season: is_two_season ?? false,
        season: season ?? null,
        status: "active",
      }])
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation, logo_url)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Sync player_teams: add player to this team (include season so roster page finds them)
    await supabase
      .from("player_teams")
      .upsert([{ mc_uuid, team_id, league, season: season ?? null }], { onConflict: "mc_uuid,league" });

    // Fire transactions webhook
    const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
    const LEAGUE_COLORS: Record<string, number>  = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
    const BASE_URL = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
    const playerName = (data as any).players?.mc_username ?? mc_uuid;
    const playerUuid = (data as any).players?.mc_uuid ?? mc_uuid;
    const teamName   = (data as any).teams?.name ?? team_id;
    const teamAbbr   = (data as any).teams?.abbreviation ?? "";
    const teamLogo   = (data as any).teams?.logo_url ?? null;
    const leagueDisplay = LEAGUE_LABELS[league] ?? league.toUpperCase();
    const amountLine = finalAmount > 0 ? `**Salary:** $${finalAmount.toLocaleString()}${is_two_season ? " (2-season 🔁)" : ""}` : "";
    const embed: Record<string, unknown> = {
      color: LEAGUE_COLORS[league] ?? 0x22c55e,
      author: teamLogo
        ? { name: teamName, icon_url: teamLogo }
        : { name: teamName },
      title: "✍️ Player Signed",
      description: `**${playerName}** signed to **${teamName}**${amountLine ? `\n${amountLine}` : ""}`,
      thumbnail: { url: `https://mc-heads.net/avatar/${playerUuid}/128` },
      footer: { text: `${leagueDisplay} · ${teamAbbr}`, icon_url: `${BASE_URL}/logos/${league === "pba" ? "mba" : league === "pcaa" ? "mcaa" : "MBGL"}.${league === "pbgl" ? "png" : "webp"}` },
      timestamp: new Date().toISOString(),
    };
    await sendWebhookEmbed(getWebhookUrl(league, "transaction"), embed);

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
