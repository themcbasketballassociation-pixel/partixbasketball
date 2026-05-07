import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { isAdminId } from "../../../lib/ownerAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method !== "PUT" && req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) return res.status(401).json({ error: "Unauthorized" });

  // Fetch the offer with player discord info
  const { data: offer, error: fetchErr } = await supabase
    .from("contract_offers")
    .select("*, players(mc_uuid, mc_username, discord_id), teams(id, name, abbreviation)")
    .eq("id", id)
    .single();
  if (fetchErr || !offer) return res.status(404).json({ error: "Offer not found" });
  if (offer.status !== "pending") return res.status(400).json({ error: "Offer is no longer pending" });

  const isAdmin = isAdminId(discordId);
  const playerDiscordId = (offer.players as any)?.discord_id;
  const isPlayer = playerDiscordId && discordId === playerDiscordId;
  const isOfferingOwner = discordId === offer.offered_by_discord_id;

  const action = req.method === "DELETE" ? "withdraw" : (req.body?.action as string);

  // ── Withdraw: admin or the offering team owner ─────────────────────────────
  if (action === "withdraw") {
    if (!isAdmin && !isOfferingOwner)
      return res.status(403).json({ error: "Not authorized to withdraw this offer" });
    const { error } = await supabase
      .from("contract_offers")
      .update({ status: "withdrawn" })
      .eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── Decline: the player (or admin) ────────────────────────────────────────
  if (action === "decline") {
    if (!isPlayer && !isAdmin)
      return res.status(403).json({ error: "Only the player can decline this offer" });
    const { error } = await supabase
      .from("contract_offers")
      .update({ status: "declined" })
      .eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // ── Accept: the player (or admin) ─────────────────────────────────────────
  if (action === "accept") {
    if (!isPlayer && !isAdmin)
      return res.status(403).json({ error: "Only the player can accept this offer" });

    // Player must not already have an active/pending contract THIS season
    let contractQuery = supabase
      .from("contracts")
      .select("id, season")
      .eq("mc_uuid", offer.mc_uuid)
      .eq("league", offer.league)
      .in("status", ["active", "pending_approval"]);
    // If the offer has a season, only block on same-season contracts
    if (offer.season) contractQuery = contractQuery.eq("season", offer.season);
    const { data: existingContract } = await contractQuery.maybeSingle();
    if (existingContract)
      return res.status(400).json({ error: "You already have an active or pending contract this season" });

    // Create the contract as active immediately — no admin approval needed
    const { data: contract, error: contractErr } = await supabase
      .from("contracts")
      .insert([{
        league: offer.league,
        mc_uuid: offer.mc_uuid,
        team_id: offer.team_id,
        amount: offer.amount,
        is_two_season: offer.is_two_season,
        season: offer.season,
        phase: offer.phase ?? 1,
        status: "active",
      }])
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation)")
      .single();
    if (contractErr) return res.status(500).json({ error: contractErr.message });

    // Sync player_teams so the player appears on their new team immediately
    await supabase
      .from("player_teams")
      .upsert([{ mc_uuid: offer.mc_uuid, team_id: offer.team_id, league: offer.league }], { onConflict: "mc_uuid,league" });

    // Mark this offer as accepted, decline all other pending offers for this player in this league
    await supabase.from("contract_offers").update({ status: "accepted" }).eq("id", id);
    await supabase
      .from("contract_offers")
      .update({ status: "declined" })
      .eq("mc_uuid", offer.mc_uuid)
      .eq("league", offer.league)
      .eq("status", "pending")
      .neq("id", id);

    return res.status(200).json(contract);
  }

  return res.status(400).json({ error: "action must be accept, decline, or withdraw" });
}
