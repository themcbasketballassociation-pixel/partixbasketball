import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  const { data, error } = await supabase
    .from("auctions")
    .update({ status: "cancelled" })
    .eq("league", league)
    .in("status", ["active", "pending", "player_choice"])
    .select("id");

  if (error) return res.status(500).json({ error: error.message });

  // Invalidate all bids on cancelled auctions so teams regain their cap holds
  if (data && data.length > 0) {
    const ids = data.map((a: any) => a.id);
    await supabase.from("auction_bids").update({ is_valid: false }).in("auction_id", ids).eq("is_valid", true);
  }

  return res.status(200).json({ cancelled: data?.length ?? 0 });
}
