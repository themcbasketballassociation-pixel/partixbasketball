import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("auctions")
      .select(`
        *,
        players(mc_uuid, mc_username),
        winning_team:teams!auctions_winning_team_id_fkey(id, name, abbreviation, color2),
        auction_bids(
          id, team_id, amount, is_two_season, effective_value, placed_at, is_valid, invalidation_reason,
          teams(id, name, abbreviation, color2)
        )
      `)
      .eq("id", id)
      .single();
    if (error) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(data);
  }

  // PUT: admin updates auction (close it, set winner, set player_choice, launch pending, edit min_price)
  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { status, winning_team_id, winning_bid, winning_is_two_season, action, min_price } = req.body;
    const updates: Record<string, unknown> = {};

    // Special action: launch a pending auction → active
    if (action === "launch") {
      updates.status = "active";
      updates.closes_at = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    } else if (action === "cancel") {
      updates.status = "cancelled";
    } else {
      if (status !== undefined) updates.status = status;
      if (winning_team_id !== undefined) updates.winning_team_id = winning_team_id;
      if (winning_bid !== undefined) updates.winning_bid = Number(winning_bid);
      if (winning_is_two_season !== undefined) updates.winning_is_two_season = winning_is_two_season;
      if (min_price !== undefined) updates.min_price = Number(min_price);
    }

    const { data, error } = await supabase
      .from("auctions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE: admin removes a pending auction
  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    // Only allow deleting pending auctions
    const { data: auction } = await supabase.from("auctions").select("status").eq("id", id).single();
    if (!auction) return res.status(404).json({ error: "Not found" });
    if (auction.status !== "pending") return res.status(400).json({ error: "Can only delete pending auctions" });
    const { error } = await supabase.from("auctions").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
