import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { sendWebhookEmbed, getWebhookUrl } from "../../../lib/discordWebhook";

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number>  = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
const LEAGUE_LOGOS:  Record<string, string>  = { pba: "/logos/mba.webp", pcaa: "/logos/mcaa.webp", pbgl: "/logos/MBGL.png" };

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";

function leagueLogoUrl(league: string) {
  return `${BASE_URL}${LEAGUE_LOGOS[league] ?? ""}`;
}

async function fireApprovalWebhook(contract: {
  league: string;
  status: string;
  phase: number;
  amount: number;
  season: string | null;
  players: { mc_uuid: string; mc_username: string } | null;
  teams: { id: string; name: string; abbreviation: string; logo_url?: string | null } | null;
}) {
  const league = contract.league;
  const player = contract.players;
  const team = contract.teams;
  if (!player || !team) return;

  const label = LEAGUE_LABELS[league] ?? league.toUpperCase();
  const color = LEAGUE_COLORS[league] ?? 0x5865F2;
  const logoUrl = leagueLogoUrl(league);
  const playerFace = `https://minotar.net/avatar/${player.mc_username}/128.png`;
  const teamLogoUrl = (team as any).logo_url ?? undefined;
  const showSalary = league !== "pcaa" && league !== "pbgl";

  const { status, phase, amount, season } = contract;

  let webhookUrl: string | undefined;
  let title: string;
  let description: string;
  let embedColor = color;

  if (status === "active") {
    webhookUrl = getWebhookUrl(league, "transaction");
    const isCoach = phase === 0;
    title = isCoach ? "🎓 Coach Signed" : "✍️ Player Signed";
    const salaryLine = showSalary && amount > 0 ? `\n**Salary:** $${amount.toLocaleString()}` : "";
    const seasonLine = season ? `\n**Season:** ${season}` : "";
    description = `**${player.mc_username}** has signed with **${team.name}**${salaryLine}${seasonLine}`;
  } else if (status === "cut") {
    webhookUrl = getWebhookUrl(league, "transaction");
    title = "✂️ Player Cut";
    embedColor = 0xdc2626;
    description = `**${player.mc_username}** has been released by **${team.name}**`;
  } else if (status === "in_portal") {
    webhookUrl = getWebhookUrl(league, "portal");
    title = "🚪 Transfer Portal";
    embedColor = 0xf59e0b;
    description = `**${player.mc_username}** has entered the transfer portal from **${team.name}**`;
  } else {
    return; // no webhook for other statuses
  }

  const embed: Record<string, unknown> = {
    color: embedColor,
    author: teamLogoUrl
      ? { name: team.name, icon_url: teamLogoUrl }
      : { name: team.name },
    title,
    description,
    thumbnail: { url: playerFace },
    footer: { text: label, icon_url: logoUrl },
    timestamp: new Date().toISOString(),
  };

  await sendWebhookEmbed(webhookUrl, embed);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { status, team_id, amount } = req.body;

    // Fetch existing contract before updating so we know old status
    const { data: existing } = await supabase
      .from("contracts")
      .select("status, mc_uuid, team_id, league")
      .eq("id", id as string)
      .single();

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (team_id !== undefined) updates.team_id = team_id;
    if (amount !== undefined) updates.amount = Number(amount);
    const { data, error } = await supabase
      .from("contracts")
      .update(updates)
      .eq("id", id)
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation, logo_url)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // ── Sync player_teams ──────────────────────────────────────────────────────
    if (status === "active" && data) {
      const mc_uuid = (data as any).mc_uuid;
      const contractLeague = (data as any).league;
      const newTeamId = (data as any).team_id;
      const contractSeason = (data as any).season ?? null;

      // Add (or move) player to the new team in player_teams (include season)
      await supabase
        .from("player_teams")
        .upsert([{ mc_uuid, team_id: newTeamId, league: contractLeague, season: contractSeason }], { onConflict: "mc_uuid,league" });

      // If this was a portal claim, close the original in_portal contract
      if (existing?.status === "portal_claim") {
        await supabase
          .from("contracts")
          .update({ status: "cut" })
          .eq("mc_uuid", mc_uuid)
          .eq("league", contractLeague)
          .eq("status", "in_portal");
      }
    }

    if ((status === "cut" || status === "in_portal") && data) {
      const mc_uuid = (data as any).mc_uuid;
      const contractLeague = (data as any).league;
      // Remove player from their team in player_teams
      await supabase
        .from("player_teams")
        .delete()
        .eq("mc_uuid", mc_uuid)
        .eq("league", contractLeague);
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Fire Discord webhook for approvals
    if (status && ["active", "cut", "in_portal"].includes(status)) {
      await fireApprovalWebhook(data as any);
    }

    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
