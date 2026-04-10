import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { uuid } = req.query;
  if (!uuid || typeof uuid !== "string") return res.status(400).json({ error: "Missing uuid" });

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id, mc_username } = req.body;
    const updates: Record<string, unknown> = {};
    if (discord_id !== undefined) updates.discord_id = discord_id;
    if (mc_username !== undefined) updates.mc_username = mc_username;
    const { data, error } = await supabase
      .from("players")
      .update(updates)
      .eq("mc_uuid", uuid)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("players").delete().eq("mc_uuid", uuid);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
