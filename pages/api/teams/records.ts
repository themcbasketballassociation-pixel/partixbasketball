import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { league, season } = req.query;
  if (!league) return res.status(400).json({ error: "league required" });

  if (req.method === "GET") {
    // Fetch team IDs for this league (+season), then get their records
    let teamsQuery = supabase.from("teams").select("id").eq("league", league as string);
    if (season) teamsQuery = teamsQuery.eq("season", season as string);
    const { data: teams, error: te } = await teamsQuery;
    if (te) return res.status(500).json({ error: te.message });
    const ids = (teams ?? []).map((t) => t.id);
    if (!ids.length) return res.status(200).json([]);
    const { data, error } = await supabase.from("team_records").select("*").in("team_id", ids);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { team_id, wins, losses } = req.body;
    if (!team_id) return res.status(400).json({ error: "team_id required" });
    const { data, error } = await supabase
      .from("team_records")
      .upsert([{ team_id, wins: wins ?? 0, losses: losses ?? 0 }], { onConflict: "team_id" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
