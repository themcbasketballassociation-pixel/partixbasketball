import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../lib/supabase";
import { requireAdmin } from "../../lib/adminAuth";
import { resolveLeague } from "../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw } = req.query;
    const league = resolveLeague(leagueRaw);
    if (!league) return res.status(400).json({ error: "league required" });
    const { data, error } = await supabase
      .from("auction_player_prices")
      .select("mc_uuid, league, price")
      .eq("league", league);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, league: leagueRaw, price } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!mc_uuid || !league || price == null)
      return res.status(400).json({ error: "mc_uuid, league, price required" });
    const { data, error } = await supabase
      .from("auction_player_prices")
      .upsert([{ mc_uuid, league, price: Number(price) }], { onConflict: "mc_uuid,league" })
      .select("mc_uuid, league, price")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
