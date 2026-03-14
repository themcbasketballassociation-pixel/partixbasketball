import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { data, error } = await supabase.from("players").select("*").order("mc_username");
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { mc_uuid, mc_username_override, discord_id } = req.body;
    if (!mc_uuid) return res.status(400).json({ error: "mc_uuid required" });

    let mc_username: string;

    if (mc_username_override) {
      // Display name provided — skip Mojang lookup, use the override directly
      mc_username = mc_username_override;
    } else {
      // No override — try to look up the username from the UUID
      try {
        const r = await fetch(`https://playerdb.co/api/player/minecraft/${mc_uuid}`);
        const data = await r.json();
        if (!data.success) return res.status(404).json({ error: "Minecraft player not found" });
        mc_username = data.data.player.username;
      } catch {
        return res.status(500).json({ error: "Failed to fetch Minecraft player" });
      }
    }

    const { data, error } = await supabase
      .from("players")
      .upsert([{ mc_uuid, mc_username, discord_id: discord_id ?? null }], { onConflict: "mc_uuid" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
