import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, team_id, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("cap_retentions")
      .select("*, players(mc_uuid, mc_username)")
      .order("created_at" as any, { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (team_id) query = query.eq("retaining_team_id", team_id as string);
    if (status) query = query.eq("status", status as string);
    else query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }
  return res.status(405).json({ error: "Method not allowed" });
}
