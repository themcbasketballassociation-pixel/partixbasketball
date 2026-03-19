import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase.from("teams").select("*").order("name");
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, name, abbreviation, division, season } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !name || !abbreviation) return res.status(400).json({ error: "league, name, abbreviation required" });
    const { data, error } = await supabase.from("teams").insert([{ league, name, abbreviation, division: division ?? null, season: season ?? null }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
