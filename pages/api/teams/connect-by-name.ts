import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * POST /api/teams/connect-by-name
 * Body: { league, fromSeason, toSeason }
 *
 * For every player assigned to a team in `fromSeason`, finds a team with the
 * same exact name in `toSeason` and creates a player_teams record there.
 * Skips players who already have an assignment in toSeason.
 * Returns { created, skipped } counts.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, fromSeason, toSeason } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league || !fromSeason || !toSeason) {
    return res.status(400).json({ error: "league, fromSeason, toSeason required" });
  }
  if (fromSeason === toSeason) {
    return res.status(400).json({ error: "fromSeason and toSeason must differ" });
  }

  // Load all teams for both seasons
  const [{ data: fromTeams }, { data: toTeams }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("league", league).eq("season", fromSeason),
    supabase.from("teams").select("id, name").eq("league", league).eq("season", toSeason),
  ]);

  // Build name → id map for toSeason teams
  const toTeamByName: Record<string, string> = {};
  for (const t of toTeams ?? []) toTeamByName[t.name.toLowerCase().trim()] = t.id;

  // Load player assignments for fromSeason
  const { data: fromAssignments } = await supabase
    .from("player_teams")
    .select("mc_uuid, team_id")
    .eq("league", league)
    .eq("season", fromSeason);

  if (!fromAssignments?.length) {
    return res.status(200).json({ created: 0, skipped: 0, message: "No assignments found in fromSeason" });
  }

  // Build fromTeam id → name map
  const fromTeamNameById: Record<string, string> = {};
  for (const t of fromTeams ?? []) fromTeamNameById[t.id] = t.name;

  // Load existing toSeason assignments to avoid duplicates
  const { data: existingTo } = await supabase
    .from("player_teams")
    .select("mc_uuid")
    .eq("league", league)
    .eq("season", toSeason);
  const alreadyAssigned = new Set((existingTo ?? []).map((r) => r.mc_uuid as string));

  // Build inserts
  const inserts: { mc_uuid: string; team_id: string; league: string; season: string }[] = [];
  let skipped = 0;

  for (const row of fromAssignments) {
    const uuid = row.mc_uuid as string;
    if (alreadyAssigned.has(uuid)) { skipped++; continue; }
    const teamName = fromTeamNameById[row.team_id as string];
    if (!teamName) { skipped++; continue; }
    const toTeamId = toTeamByName[teamName.toLowerCase().trim()];
    if (!toTeamId) { skipped++; continue; }
    inserts.push({ mc_uuid: uuid, team_id: toTeamId, league, season: toSeason });
  }

  if (inserts.length === 0) {
    return res.status(200).json({ created: 0, skipped, message: "No matching teams found or all players already assigned" });
  }

  const { error } = await supabase.from("player_teams").insert(inserts);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ created: inserts.length, skipped });
}
