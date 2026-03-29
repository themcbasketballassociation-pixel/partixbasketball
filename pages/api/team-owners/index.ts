import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("team_owners")
      .select("*, teams(id, name, abbreviation, color2)")
      .order("created_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id, team_id, league: leagueRaw } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!discord_id || !team_id || !league)
      return res.status(400).json({ error: "discord_id, team_id, league required" });
    // Remove any existing owner assignment for this discord_id + team in this league first
    await supabase.from("team_owners").delete().match({ discord_id, team_id, league });
    const { data, error } = await supabase
      .from("team_owners")
      .insert([{ discord_id, team_id, league }])
      .select("*, teams(id, name, abbreviation, color2)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("team_owners").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
