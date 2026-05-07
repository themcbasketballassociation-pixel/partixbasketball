import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireOwner } from "../../../lib/ownerAuth";
import { resolveLeague } from "../../../lib/leagueMapping";
import { sendDiscordDm } from "../../../lib/discordDm";

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number> = { pba: 0xc8102e, pcaa: 0x003087, pbgl: 0xbb3430 };
const BASE_URL = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
function leagueSlug(l: string) { return l === "pba" ? "mba" : l === "pcaa" ? "mcaa" : l === "pbgl" ? "mbgl" : l; }

const TOTAL_CAP = 25000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ── GET: list offers ────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { mc_uuid, discord_id, team_id, league: leagueRaw, status } = req.query;
    const league = resolveLeague(leagueRaw);

    let query = supabase
      .from("contract_offers")
      .select("*, players(mc_uuid, mc_username, discord_id), teams(id, name, abbreviation, logo_url, color2)")
      .order("offered_at", { ascending: false });

    if (league) query = query.eq("league", league);
    if (team_id) query = query.eq("team_id", team_id as string);
    if (status) {
      query = query.eq("status", status as string);
    } else {
      query = query.eq("status", "pending");
    }

    // Look up by discord_id → player
    if (discord_id && !mc_uuid) {
      const { data: player } = await supabase
        .from("players")
        .select("mc_uuid")
        .eq("discord_id", discord_id as string)
        .maybeSingle();
      if (!player) return res.status(200).json([]);
      query = query.eq("mc_uuid", (player as any).mc_uuid);
    } else if (mc_uuid) {
      query = query.eq("mc_uuid", mc_uuid as string);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  // ── POST: team owner makes an offer ────────────────────────────────────────
  if (req.method === "POST") {
    const { league: leagueRaw, mc_uuid, amount, is_two_season, notes } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !mc_uuid) return res.status(400).json({ error: "league and mc_uuid required" });

    const owner = await requireOwner(req, res, league);
    if (!owner) return;

    const hideCap = league === "pcaa" || league === "pbgl";
    const finalAmount = hideCap ? 0 : Number(amount ?? 0);

    // Cap check for MBA
    if (!hideCap) {
      const { data: teamContracts } = await supabase
        .from("contracts")
        .select("amount")
        .eq("team_id", owner.teamId)
        .eq("league", league)
        .in("status", ["active", "pending_approval"]);
      const capUsed = (teamContracts ?? []).reduce((s: number, c: any) => s + c.amount, 0);
      if (capUsed + finalAmount > TOTAL_CAP)
        return res.status(400).json({
          error: `Exceeds cap: ${capUsed.toLocaleString()} + ${finalAmount.toLocaleString()} > ${TOTAL_CAP.toLocaleString()}`,
        });
    }

    // Verify player exists
    const { data: player } = await supabase
      .from("players")
      .select("mc_uuid, mc_username")
      .eq("mc_uuid", mc_uuid)
      .maybeSingle();
    if (!player) return res.status(404).json({ error: "Player not found" });

    // No duplicate pending offer from same team
    const { data: existingOffer } = await supabase
      .from("contract_offers")
      .select("id")
      .eq("mc_uuid", mc_uuid)
      .eq("team_id", owner.teamId)
      .eq("league", league)
      .eq("status", "pending")
      .maybeSingle();
    if (existingOffer)
      return res.status(400).json({ error: "You already have a pending offer to this player" });

    // Player must not already have an active contract
    const { data: existingContract } = await supabase
      .from("contracts")
      .select("id")
      .eq("mc_uuid", mc_uuid)
      .eq("league", league)
      .in("status", ["active", "pending_approval"])
      .maybeSingle();
    if (existingContract)
      return res.status(400).json({ error: "Player already has an active or pending contract" });

    const { data: offer, error } = await supabase
      .from("contract_offers")
      .insert([{
        league,
        mc_uuid,
        team_id: owner.teamId,
        amount: finalAmount,
        is_two_season: is_two_season ?? false,
        season: owner.season,
        phase: 1,
        status: "pending",
        offered_by_discord_id: owner.discordId,
        notes: notes ?? null,
      }])
      .select("*, players(mc_uuid, mc_username, discord_id), teams(id, name, abbreviation, logo_url)")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Send DM immediately (no 24-hour wait)
    const playerDiscordId: string | null = (offer as any).players?.discord_id ?? null;
    if (playerDiscordId) {
      const team = (offer as any).teams;
      const playerName: string = (offer as any).players?.mc_username ?? mc_uuid;
      const label = LEAGUE_LABELS[league] ?? league.toUpperCase();
      const color = LEAGUE_COLORS[league] ?? 0x5865f2;
      const slug = leagueSlug(league);
      const showSalary = league !== "pcaa" && league !== "pbgl";
      const salary = showSalary && finalAmount > 0 ? ` — **$${finalAmount.toLocaleString()}**` : "";
      const twoSeason = (is_two_season ?? false) ? " *(2-season)*" : "";
      const profileUrl = `${BASE_URL}/${slug}/profile`;

      const embed = {
        color,
        title: `🏀 You have a contract offer!`,
        description:
          `**${team?.name ?? "A team"}** has offered you a contract in the **${label}**.\n\n` +
          `**${team?.name ?? "?"} (${team?.abbreviation ?? "?"})**${salary}${twoSeason}` +
          `\n\n> Accept or decline from your [profile page](${profileUrl}).`,
        thumbnail: team?.logo_url ? { url: team.logo_url } : undefined,
        footer: { text: `Partix Basketball · ${label}` },
        timestamp: new Date().toISOString(),
      };

      const acceptBtn = {
        type: 2, style: 3,
        label: `✅ Accept ${team?.abbreviation ?? "?"}`,
        custom_id: `accept_offer:${(offer as any).id}`,
      };
      const declineBtn = {
        type: 2, style: 4,
        label: "❌ Decline",
        custom_id: `decline_all_offers:${mc_uuid}:${league}`,
      };
      const components = [{ type: 1, components: [acceptBtn, declineBtn] }];

      const sent = await sendDiscordDm(playerDiscordId, { embeds: [embed], components });
      if (sent) {
        await supabase
          .from("contract_offers")
          .update({ dm_sent_at: new Date().toISOString() })
          .eq("id", (offer as any).id);
      }
    }

    return res.status(200).json(offer);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
