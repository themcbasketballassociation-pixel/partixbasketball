import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, season, phase, duration_minutes } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league || !season) return res.status(400).json({ error: "league and season required" });

  // 1. Fetch all prices set for this league + season
  const { data: prices, error: pricesErr } = await supabase
    .from("auction_player_prices")
    .select("mc_uuid, price")
    .eq("league", league)
    .eq("season", season);
  if (pricesErr) return res.status(500).json({ error: pricesErr.message });
  if (!prices || prices.length === 0)
    return res.status(400).json({ error: "No prices set for this season. Set prices in the Prices tab first." });

  // 2. Fetch existing auctions for this league that are active, pending, or signed
  const { data: existing } = await supabase
    .from("auctions")
    .select("mc_uuid, status")
    .eq("league", league)
    .in("status", ["active", "pending", "player_choice", "signed"]);
  const existingSet = new Set((existing ?? []).map((a) => a.mc_uuid));

  // 3. Fetch players who already have an active contract (manually added to a team before launch)
  const { data: existingContracts } = await supabase
    .from("contracts")
    .select("mc_uuid")
    .eq("league", league)
    .in("status", ["active", "pending_approval"]);
  const contractedSet = new Set((existingContracts ?? []).map((c) => c.mc_uuid));

  // 4. Create active auctions for all priced players not already in auction or contracted
  const durationMs = duration_minutes ? Number(duration_minutes) * 60 * 1000 : 12 * 60 * 60 * 1000;
  const closesAt = new Date(Date.now() + durationMs).toISOString();
  let created = 0;
  let skipped = 0;

  for (const { mc_uuid, price } of prices) {
    if (existingSet.has(mc_uuid) || contractedSet.has(mc_uuid)) {
      skipped++;
      continue;
    }
    const { error } = await supabase.from("auctions").insert([{
      league,
      mc_uuid,
      min_price: price,
      season: season ?? null,
      phase: Number(phase ?? 1),
      status: "active",
      closes_at: closesAt,
    }]);
    if (!error) created++;
    else skipped++;
  }

  return res.status(200).json({ created, skipped, total: prices.length });
}
