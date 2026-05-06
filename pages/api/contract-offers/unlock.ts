/**
 * POST /api/contract-offers/unlock
 * Admin-only: immediately open the acceptance window for a player's pending offers
 * by backdating offered_at so the 24-hour check passes right away.
 *
 * Body: { mc_uuid: string, league: string }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { mc_uuid, league: leagueRaw } = req.body as { mc_uuid?: string; league?: string };
  if (!mc_uuid || !leagueRaw) return res.status(400).json({ error: "mc_uuid and league required" });
  const league = resolveLeague(leagueRaw);

  // Set offered_at to 25 hours ago so the 24-hour check passes immediately
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("contract_offers")
    .update({ offered_at: twentyFiveHoursAgo })
    .eq("mc_uuid", mc_uuid)
    .eq("league", league)
    .eq("status", "pending")
    .select("id");

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ unlocked: (data ?? []).length });
}
