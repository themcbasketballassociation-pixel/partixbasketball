import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * POST /api/admin/sync-rosters
 * Rebuilds player_teams from active contracts so the Teams tab matches the team portal.
 * Uses delete+insert per player to avoid needing a specific unique constraint.
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

  // Fetch existing player_teams to find what's already there
  let ptQuery = supabase.from("player_teams").select("mc_uuid, team_id, league, season");
  if (league) ptQuery = ptQuery.eq("league", league);
  const { data: existing } = await ptQuery;
  const existingSet = new Set((existing ?? []).map(p => `${p.mc_uuid}|${p.team_id}|${p.league}|${p.season ?? ""}`));

  // Only insert contracts that don't already have a matching player_teams row
  const toInsert = contracts.filter(c => {
    const key = `${c.mc_uuid}|${c.team_id}|${c.league}|${c.season ?? ""}`;
    return !existingSet.has(key);
  }).map(c => ({ mc_uuid: c.mc_uuid, team_id: c.team_id, league: c.league, season: c.season ?? null }));

  if (toInsert.length === 0) return res.status(200).json({ synced: 0 });

  const { error: insertErr } = await supabase.from("player_teams").insert(toInsert);
  if (insertErr) return res.status(500).json({ error: insertErr.message });

  return res.status(200).json({ synced: toInsert.length });
}
