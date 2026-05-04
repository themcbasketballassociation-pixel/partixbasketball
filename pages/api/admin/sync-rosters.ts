import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

/**
 * POST /api/admin/sync-rosters
 * Admin-only: for every active contract, ensure the player exists in player_teams.
 * Fixes any contracts approved before the season-column upsert bug was patched.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  // Fetch all active contracts
  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("mc_uuid, team_id, league")
    .eq("status", "active");

  if (error) return res.status(500).json({ error: error.message });
  if (!contracts || contracts.length === 0) return res.status(200).json({ synced: 0 });

  // Upsert each into player_teams (no season column)
  const rows = contracts.map((c) => ({
    mc_uuid: c.mc_uuid,
    team_id: c.team_id,
    league: c.league,
  }));

  const { error: upsertErr } = await supabase
    .from("player_teams")
    .upsert(rows, { onConflict: "mc_uuid,league" });

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  return res.status(200).json({ synced: rows.length });
}
