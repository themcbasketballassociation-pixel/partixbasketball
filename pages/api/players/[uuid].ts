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

  // PATCH — change MC account entirely (migrates all data to new UUID)
  if (req.method === "PATCH") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { new_uuid, new_username } = req.body;
    if (!new_uuid || !new_username) return res.status(400).json({ error: "new_uuid and new_username required" });

    // Same UUID — just a username rename
    if (new_uuid === uuid) {
      const { data, error } = await supabase.from("players").update({ mc_username: new_username }).eq("mc_uuid", uuid).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // Different UUID — full account migration
    // 1. Get old player's discord_id
    const { data: oldPlayer } = await supabase.from("players").select("discord_id").eq("mc_uuid", uuid).single();

    // 2. Insert new player record first (so FKs can point to it)
    const { error: insertErr } = await supabase.from("players").upsert(
      [{ mc_uuid: new_uuid, mc_username: new_username, discord_id: oldPlayer?.discord_id ?? null }],
      { onConflict: "mc_uuid" }
    );
    if (insertErr) return res.status(500).json({ error: `Failed to create new player: ${insertErr.message}` });

    // 3. Migrate all FK references
    const tables = ["game_stats", "player_teams", "contracts", "accolades", "stats"];
    for (const table of tables) {
      const { error: e } = await supabase.from(table).update({ mc_uuid: new_uuid }).eq("mc_uuid", uuid);
      if (e) return res.status(500).json({ error: `Failed to migrate ${table}: ${e.message}` });
    }

    // 4. Delete old player record
    await supabase.from("players").delete().eq("mc_uuid", uuid);

    return res.status(200).json({ success: true, new_uuid, new_username });
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
