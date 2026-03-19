import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase.from("accolades").select("*, players(mc_uuid, mc_username)").order("season", { ascending: false });
    if (league) query = query.eq("league", league as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, mc_uuid, type, season, description } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !mc_uuid || !type || !season) return res.status(400).json({ error: "league, mc_uuid, type, season required" });
    const { data, error } = await supabase.from("accolades").insert([{ league, mc_uuid, type, season, description: description ?? null }]).select("*, players(mc_uuid, mc_username)").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
