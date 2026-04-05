import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * POST /api/games/swap-team
 * Body: { league, fromTeamName, toTeamName }
 *
 * In all games for this league, replaces every reference to fromTeamName's team_id
 * (as home or away) with toTeamName's team_id.
 * Returns { updated } count of games changed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, fromTeamName, toTeamName } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league || !fromTeamName || !toTeamName)
    return res.status(400).json({ error: "league, fromTeamName, toTeamName required" });

  // Find from and to team IDs (any season — just need a matching team per name)
  const [{ data: fromTeams }, { data: toTeams }] = await Promise.all([
    supabase.from("teams").select("id").eq("league", league).ilike("name", fromTeamName.trim()).limit(1),
    supabase.from("teams").select("id").eq("league", league).ilike("name", toTeamName.trim()).limit(1),
  ]);

  if (!fromTeams?.length) return res.status(404).json({ error: `Team not found: "${fromTeamName}"` });
  if (!toTeams?.length) return res.status(404).json({ error: `Team not found: "${toTeamName}"` });

  const fromId = fromTeams[0].id;
  const toId = toTeams[0].id;

  // Update home_team_id references
  const { count: homeCount, error: homeErr } = await supabase
    .from("games")
    .update({ home_team_id: toId })
    .eq("league", league)
    .eq("home_team_id", fromId);
  if (homeErr) return res.status(500).json({ error: homeErr.message });

  // Update away_team_id references
  const { count: awayCount, error: awayErr } = await supabase
    .from("games")
    .update({ away_team_id: toId })
    .eq("league", league)
    .eq("away_team_id", fromId);
  if (awayErr) return res.status(500).json({ error: awayErr.message });

  const updated = (homeCount ?? 0) + (awayCount ?? 0);
  return res.status(200).json({ updated, message: `Swapped ${updated} game slot(s) from "${fromTeamName}" to "${toTeamName}"` });
}
