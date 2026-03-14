import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { game_id } = req.query;
    if (!game_id) return res.status(400).json({ error: "game_id required" });
    const { data, error } = await supabase.from("game_stats").select("*, players(mc_uuid, mc_username)").eq("game_id", game_id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { game_id, mc_uuid, points, rebounds_off, rebounds_def, assists, steals, blocks, turnovers, minutes_played, fg_made, fg_attempted } = req.body;
    if (!game_id || !mc_uuid) return res.status(400).json({ error: "game_id, mc_uuid required" });
    const { data, error } = await supabase
      .from("game_stats")
      .upsert([{ game_id, mc_uuid, points: points ?? 0, rebounds_off: rebounds_off ?? 0, rebounds_def: rebounds_def ?? 0, assists: assists ?? 0, steals: steals ?? 0, blocks: blocks ?? 0, turnovers: turnovers ?? 0, minutes_played: minutes_played ?? 0, fg_made: fg_made ?? 0, fg_attempted: fg_attempted ?? 0 }], { onConflict: "game_id,mc_uuid" })
      .select("*, players(mc_uuid, mc_username)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
