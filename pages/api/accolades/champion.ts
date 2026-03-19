import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET — list champion accolades for a league (optionally filtered by season)
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    if (!league) return res.status(400).json({ error: "league required" });
    let query = supabase
      .from("accolades")
      .select("*, players(mc_uuid, mc_username)")
      .eq("league", league as string)
      .eq("type", "Finals Champion")
      .order("season", { ascending: false });
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — set champion team for a season (replaces existing for that season)
  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league, season, team_id } = req.body;
    if (!league || !season || !team_id)
      return res.status(400).json({ error: "league, season, team_id required" });

    // Find all players on that team for that season
    const { data: playerTeams, error: ptError } = await supabase
      .from("player_teams")
      .select("mc_uuid")
      .eq("team_id", team_id)
      .eq("league", league)
      .eq("season", season);
    if (ptError) return res.status(500).json({ error: ptError.message });
    if (!playerTeams?.length)
      return res.status(400).json({ error: "No players found on that team for that season" });

    // Remove existing champion accolades for this league+season
    await supabase
      .from("accolades")
      .delete()
      .eq("league", league)
      .eq("season", season)
      .eq("type", "Finals Champion");

    // Insert a ring for each player
    const rows = playerTeams.map((pt) => ({
      league,
      mc_uuid: pt.mc_uuid,
      type: "Finals Champion",
      season,
      description: null,
    }));
    const { data, error } = await supabase
      .from("accolades")
      .insert(rows)
      .select("*, players(mc_uuid, mc_username)");
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove champion accolades for a league+season
  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw2, season } = req.query;
    const league = resolveLeague(leagueRaw2);
    if (!league || !season) return res.status(400).json({ error: "league, season required" });
    const { error } = await supabase
      .from("accolades")
      .delete()
      .eq("league", league as string)
      .eq("season", season as string)
      .eq("type", "Finals Champion");
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
