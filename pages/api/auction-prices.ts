import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../lib/supabase";
import { requireAdmin } from "../../lib/adminAuth";
import { resolveLeague } from "../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    if (!league) return res.status(400).json({ error: "league required" });
    let query = supabase
      .from("auction_player_prices")
      .select("mc_uuid, league, season, price")
      .eq("league", league);
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, league: leagueRaw, season, price } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!mc_uuid || !league || !season || price == null)
      return res.status(400).json({ error: "mc_uuid, league, season, price required" });
    const { data, error } = await supabase
      .from("auction_player_prices")
      .upsert(
        [{ mc_uuid, league, season, price: Number(price), updated_at: new Date().toISOString() }],
        { onConflict: "mc_uuid,league,season" }
      )
      .select("mc_uuid, league, season, price")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, league: leagueRaw, season } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!mc_uuid || !league || !season)
      return res.status(400).json({ error: "mc_uuid, league, season required" });
    const { error } = await supabase
      .from("auction_player_prices")
      .delete()
      .eq("mc_uuid", mc_uuid)
      .eq("league", league)
      .eq("season", season);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
