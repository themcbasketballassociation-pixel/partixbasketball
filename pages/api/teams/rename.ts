import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * POST /api/teams/rename
 * Body: { league, fromName, toName, toAbbreviation }
 *
 * Renames all teams with fromName (case-insensitive) in the league to toName/toAbbreviation.
 * Since games join on team_id, all game references automatically reflect the new name.
 * Returns { updated } count.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, fromName, toName, toAbbreviation } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league || !fromName || !toName || !toAbbreviation) {
    return res.status(400).json({ error: "league, fromName, toName, toAbbreviation required" });
  }

  // Find all teams matching fromName
  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name")
    .eq("league", league)
    .ilike("name", fromName.trim());

  if (error) return res.status(500).json({ error: error.message });
  if (!teams?.length) return res.status(200).json({ updated: 0, message: `No teams found matching "${fromName}"` });

  const ids = teams.map(t => t.id);
  const { error: uErr, count } = await supabase
    .from("teams")
    .update({ name: toName.trim(), abbreviation: toAbbreviation.trim().toUpperCase() })
    .in("id", ids);

  if (uErr) return res.status(500).json({ error: uErr.message });

  return res.status(200).json({ updated: teams.length, message: `Renamed ${teams.length} team row(s) from "${fromName}" to "${toName}"` });
}
