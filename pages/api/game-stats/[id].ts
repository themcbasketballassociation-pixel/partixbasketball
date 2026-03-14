import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { points, rebounds_off, rebounds_def, assists, steals, blocks, turnovers, minutes_played, fg_made, fg_attempted, three_pt_made, three_pt_attempted } = req.body;
    const updates: Record<string, unknown> = {};
    if (points !== undefined) updates.points = points;
    if (rebounds_off !== undefined) updates.rebounds_off = rebounds_off;
    if (rebounds_def !== undefined) updates.rebounds_def = rebounds_def;
    if (assists !== undefined) updates.assists = assists;
    if (steals !== undefined) updates.steals = steals;
    if (blocks !== undefined) updates.blocks = blocks;
    if (turnovers !== undefined) updates.turnovers = turnovers;
    if (minutes_played !== undefined) updates.minutes_played = minutes_played;
    if (fg_made !== undefined) updates.fg_made = fg_made;
    if (fg_attempted !== undefined) updates.fg_attempted = fg_attempted;
    if (three_pt_made !== undefined) updates.three_pt_made = three_pt_made;
    if (three_pt_attempted !== undefined) updates.three_pt_attempted = three_pt_attempted;
    const { data, error } = await supabase.from("game_stats").update(updates).eq("id", id).select("*, players(mc_uuid, mc_username)").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("game_stats").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
