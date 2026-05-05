import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season, team_id, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("draft_picks")
      .select(`
        *,
        original_team:teams!draft_picks_original_team_id_fkey(id, name, abbreviation, color2),
        current_team:teams!draft_picks_current_team_id_fkey(id, name, abbreviation, color2)
      `)
      .order("season").order("round").order("pick_number");
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    if (team_id) query = query.eq("current_team_id", team_id as string);
    if (status && status !== "all") query = query.eq("status", status as string);
    else if (!status) query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) {
      // Table doesn't exist or FK names wrong — return empty array so portal doesn't break
      return res.status(200).json([]);
    }
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, season, round, pick_number, original_team_id, current_team_id, notes } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !season || !round || !original_team_id)
      return res.status(400).json({ error: "league, season, round, original_team_id required" });
    const { data, error } = await supabase
      .from("draft_picks")
      .insert([{
        league,
        season,
        round: Number(round),
        pick_number: pick_number ? Number(pick_number) : null,
        original_team_id,
        current_team_id: current_team_id ?? original_team_id,
        notes: notes ?? null,
        status: "active",
      }])
      .select(`*, original_team:teams!draft_picks_original_team_id_fkey(id, name, abbreviation), current_team:teams!draft_picks_current_team_id_fkey(id, name, abbreviation)`)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id, league: leagueRaw, season } = req.body;

    // Bulk delete: league + season (no id)
    if (!id && leagueRaw && season) {
      const league = resolveLeague(leagueRaw);
      if (!league) return res.status(400).json({ error: "Invalid league" });
      const { error, count } = await supabase
        .from("draft_picks")
        .delete({ count: "exact" })
        .eq("league", league)
        .eq("season", season);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, deleted: count });
    }

    // Single delete by id
    if (!id) return res.status(400).json({ error: "id or (league + season) required" });
    const { error } = await supabase.from("draft_picks").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
