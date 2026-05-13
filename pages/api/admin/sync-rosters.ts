import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * POST /api/admin/sync-rosters
 * Rebuilds player_teams from active contracts so the Teams tab matches the team portal.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw } = req.body ?? {};
  const league = leagueRaw ? resolveLeague(leagueRaw) : null;

  // Fetch all active contracts
  let query = supabase
    .from("contracts")
    .select("mc_uuid, team_id, league, season")
    .eq("status", "active");
  if (league) query = query.eq("league", league);

  const { data: contracts, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  if (!contracts || contracts.length === 0) return res.status(200).json({ synced: 0 });

  // Deduplicate by mc_uuid+league (keep first — highest amount since contracts API orders by amount desc)
  const seen = new Set<string>();
  const rows = contracts
    .filter((c) => {
      const key = `${c.mc_uuid}:${c.league}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => ({ mc_uuid: c.mc_uuid, team_id: c.team_id, league: c.league, season: c.season ?? null }));

  const { error: upsertErr } = await supabase
    .from("player_teams")
    .upsert(rows, { onConflict: "mc_uuid,league" });

  if (upsertErr) return res.status(500).json({ error: upsertErr.message });

  return res.status(200).json({ synced: rows.length });
}
