import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    if (!league || !season) return res.status(400).json({ error: "league and season required" });
    const { data, error } = await supabase
      .from("playoff_brackets")
      .select(`
        *,
        team1:team1_id(id, name, abbreviation, logo_url, color2),
        team2:team2_id(id, name, abbreviation, logo_url, color2),
        winner:winner_id(id, name, abbreviation)
      `)
      .eq("league", league as string)
      .eq("season", season as string)
      .order("round_order", { ascending: true })
      .order("matchup_index", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const {
      league: leagueRaw, season, round_name, round_order, matchup_index,
      team1_id, team2_id, team1_score, team2_score, winner_id,
    } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !season || !round_name || matchup_index === undefined)
      return res.status(400).json({ error: "league, season, round_name, matchup_index required" });
    const { data, error } = await supabase
      .from("playoff_brackets")
      .upsert([{
        league, season, round_name,
        round_order: round_order ?? 0,
        matchup_index,
        team1_id: team1_id || null,
        team2_id: team2_id || null,
        team1_score: team1_score ?? null,
        team2_score: team2_score ?? null,
        winner_id: winner_id || null,
      }], { onConflict: "league,season,round_name,matchup_index" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("playoff_brackets").delete().eq("id", id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
