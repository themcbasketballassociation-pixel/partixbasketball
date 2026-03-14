import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { scheduled_at, home_team_id, away_team_id, home_score, away_score, status } = req.body;
    const updates: Record<string, unknown> = {};
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;
    if (home_team_id !== undefined) updates.home_team_id = home_team_id;
    if (away_team_id !== undefined) updates.away_team_id = away_team_id;
    if (home_score !== undefined) updates.home_score = home_score;
    if (away_score !== undefined) updates.away_score = away_score;
    if (status !== undefined) updates.status = status;
    const { data, error } = await supabase
      .from("games")
      .update(updates)
      .eq("id", id)
      .select("*, home_team:home_team_id(id,name,abbreviation,logo_url), away_team:away_team_id(id,name,abbreviation,logo_url)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
