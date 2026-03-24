import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
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
      .order("nominated_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    if (status) query = query.eq("status", status as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST: admin nominates a player for auction
  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, mc_uuid, min_price, season, phase } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !mc_uuid)
      return res.status(400).json({ error: "league and mc_uuid required" });

    // Check not already in an active auction
    const { data: existing } = await supabase
      .from("auctions")
      .select("id")
      .eq("mc_uuid", mc_uuid)
      .eq("league", league)
      .eq("status", "active")
      .maybeSingle();
    if (existing) return res.status(400).json({ error: "Player already in an active auction" });

    const closesAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("auctions")
      .insert([{
        league,
        mc_uuid,
        min_price: Number(min_price ?? 1000),
        season: season ?? null,
        phase: Number(phase ?? 1),
        status: "active",
        closes_at: closesAt,
      }])
      .select("*, players(mc_uuid, mc_username)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
