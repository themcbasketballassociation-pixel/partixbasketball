import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("player_teams")
      .select("mc_uuid, team_id, league, season, players(mc_uuid, mc_username, discord_id), teams(id, name, abbreviation, division, logo_url)");
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, team_id, league, season } = req.body;
    if (!mc_uuid || !team_id || !league) return res.status(400).json({ error: "mc_uuid, team_id, league required" });
    const { data, error } = await supabase
      .from("player_teams")
      .upsert([{ mc_uuid, team_id, league, season: season ?? null }], { onConflict: "mc_uuid,league" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { mc_uuid, league: leagueRaw2, season } = req.query;
    const league = resolveLeague(leagueRaw2);
    if (!mc_uuid || !league) return res.status(400).json({ error: "mc_uuid, league required" });
    let query = supabase.from("player_teams").delete().eq("mc_uuid", mc_uuid as string).eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
