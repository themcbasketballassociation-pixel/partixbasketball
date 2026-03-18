import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";

/**
 * GET /api/stats/seasons?league=pba
 * Returns every raw stat row (one per player per season) without aggregating.
 * Used by minigames to check single-season thresholds (e.g. "Had a 30+ PPG season").
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { league } = req.query;
  if (!league) return res.status(400).json({ error: "league required" });

  const { data, error } = await supabase
    .from("stats")
    .select("mc_uuid, season, gp, ppg, rpg, apg, spg, bpg")
    .eq("league", league as string);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data ?? []);
}
