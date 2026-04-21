import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { discord_id } = req.query;
    if (discord_id) {
      // Single-user access check (used by Press Row page)
      const { data } = await supabase
        .from("crew_access")
        .select("discord_id, display_name")
        .eq("discord_id", discord_id as string)
        .single();
      return res.status(200).json({ hasAccess: !!data, display_name: data?.display_name ?? null });
    }
    // Full list — admin only
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { data, error } = await supabase
      .from("crew_access")
      .select("*")
      .order("granted_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id, display_name } = req.body;
    if (!discord_id?.trim()) return res.status(400).json({ error: "discord_id required" });
    const { data, error } = await supabase
      .from("crew_access")
      .upsert([{ discord_id: discord_id.trim(), display_name: display_name?.trim() || null }], { onConflict: "discord_id" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id } = req.body;
    if (!discord_id) return res.status(400).json({ error: "discord_id required" });
    const { error } = await supabase.from("crew_access").delete().eq("discord_id", discord_id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
