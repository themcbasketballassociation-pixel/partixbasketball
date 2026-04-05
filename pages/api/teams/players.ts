import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("player_teams")
      .select("mc_uuid, team_id, league, season, players(mc_uuid, mc_username, discord_id), teams(id, name, abbreviation, division, logo_url)");
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, team_id, league: leagueRaw, season, amount, is_two_season } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!mc_uuid || !team_id || !league) return res.status(400).json({ error: "mc_uuid, team_id, league required" });

    // Delete the existing assignment for this player in this league+season only, then insert fresh
    let deleteQuery = supabase.from("player_teams").delete().eq("mc_uuid", mc_uuid).eq("league", league);
    if (season) deleteQuery = (deleteQuery as typeof deleteQuery).eq("season", season);
    await deleteQuery;
    const { error } = await supabase
      .from("player_teams")
      .insert([{ mc_uuid, team_id, league, season: season ?? null }]);
    if (error) return res.status(500).json({ error: error.message });

    // Determine the contract amount: use provided amount, or auto-fetch from the player's auction min_price
    let contractAmount: number | null = (amount != null && Number(amount) > 0) ? Number(amount) : null;

    if (contractAmount == null) {
      // Try season-specific auction first (auctions.season is an int like 7)
      if (season) {
        const seasonNum = parseInt(String(season).replace(/\D/g, ""), 10);
        if (!isNaN(seasonNum)) {
          const { data: auctionRow } = await supabase
            .from("auctions")
            .select("min_price")
            .eq("mc_uuid", mc_uuid)
            .eq("league", league)
            .eq("season", seasonNum)
            .maybeSingle();
          if (auctionRow?.min_price != null) contractAmount = Number(auctionRow.min_price);
        }
      }
      // Fall back to any active/pending auction for this player (season may be null on older auctions)
      if (contractAmount == null) {
        const { data: auctionRow } = await supabase
          .from("auctions")
          .select("min_price")
          .eq("mc_uuid", mc_uuid)
          .eq("league", league)
          .in("status", ["active", "pending"])
          .order("nominated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (auctionRow?.min_price != null) contractAmount = Number(auctionRow.min_price);
      }
    }

    if (contractAmount != null && contractAmount > 0) {
      // Cancel any active or pending auction for this player
      await supabase
        .from("auctions")
        .update({ status: "cancelled" })
        .eq("mc_uuid", mc_uuid)
        .eq("league", league)
        .in("status", ["active", "pending"]);

      // Expire any existing active contracts so there's no duplicate
      await supabase
        .from("contracts")
        .update({ status: "expired" })
        .eq("mc_uuid", mc_uuid)
        .eq("league", league)
        .in("status", ["active", "pending_approval"]);

      // Create the new contract
      const { error: contractErr } = await supabase
        .from("contracts")
        .insert([{
          league,
          mc_uuid,
          team_id,
          amount: contractAmount,
          is_two_season: is_two_season ?? false,
          season: season ?? null,
          phase: 1,
          status: "active",
        }]);
      if (contractErr) return res.status(500).json({ error: contractErr.message });
    }

    return res.status(200).json({ success: true });
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, league: leagueRaw2, season } = req.query;
    const league = resolveLeague(leagueRaw2);
    if (!mc_uuid || !league) return res.status(400).json({ error: "mc_uuid, league required" });

    // Deactivate the player's contract for this league when removed from a team
    await supabase
      .from("contracts")
      .update({ status: "expired" })
      .eq("mc_uuid", mc_uuid as string)
      .eq("league", league as string)
      .in("status", ["active", "pending_approval"]);

    let query = supabase.from("player_teams").delete().eq("mc_uuid", mc_uuid as string).eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
