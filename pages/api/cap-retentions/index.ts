import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, team_id, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("cap_retentions")
      .select("*, players(mc_uuid, mc_username)");
    if (league) query = query.eq("league", league as string);
    if (team_id) query = query.eq("retaining_team_id", team_id as string);
    if (status) query = query.eq("status", status as string);
    else query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) {
      // Table doesn't exist yet — return empty array so portal doesn't break
      if (error.code === "42P01" || error.message?.includes("does not exist")) {
        return res.status(200).json([]);
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data ?? []);
  }
  if (req.method === "POST") {
    const { requireAdmin } = await import("../../../lib/adminAuth");
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, team_id, mc_uuid, retention_amount, status: retStatus } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !team_id || retention_amount == null)
      return res.status(400).json({ error: "league, team_id, retention_amount required" });
    const { data, error } = await supabase
      .from("cap_retentions")
      .insert([{ league, retaining_team_id: team_id, mc_uuid: mc_uuid || null, retention_amount: Number(retention_amount), status: retStatus ?? "active" }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "PATCH") {
    const { requireAdmin } = await import("../../../lib/adminAuth");
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id, retention_amount, status: retStatus, team_id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const updates: Record<string, unknown> = {};
    if (retention_amount != null) updates.retention_amount = Number(retention_amount);
    if (retStatus) updates.status = retStatus;
    if (team_id) updates.retaining_team_id = team_id;
    const { data, error } = await supabase.from("cap_retentions").update(updates).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const { requireAdmin } = await import("../../../lib/adminAuth");
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("cap_retentions").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
