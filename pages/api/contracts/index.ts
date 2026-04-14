import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, team_id, season, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("contracts")
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation, color2)")
      .order("amount", { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (team_id) query = query.eq("team_id", team_id as string);
    if (season) query = query.eq("season", season as string);
    // Default to active unless explicitly passed
    const statusFilter = (status as string) ?? "active";
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, mc_uuid, team_id, amount, is_two_season, season, phase } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !mc_uuid || !team_id || amount == null)
      return res.status(400).json({ error: "league, mc_uuid, team_id, amount required" });
    const { data, error } = await supabase
      .from("contracts")
      .insert([{
        league,
        mc_uuid,
        team_id,
        amount: Number(amount),
        is_two_season: is_two_season ?? false,
        season: season ?? null,
        phase: phase ?? 1,
        status: "active",
      }])
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Sync player_teams: add player to this team
    await supabase
      .from("player_teams")
      .upsert([{ mc_uuid, team_id, league }], { onConflict: "mc_uuid,league" });

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
