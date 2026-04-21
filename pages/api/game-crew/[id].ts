import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "DELETE") {
    const { id } = req.query;
    const session = await getServerSession(req, res, authOptions as any);
    if (!session?.user) return res.status(401).json({ error: "Not logged in" });
    const discordId = (session.user as any).id as string;

    const { data: claim, error: fetchErr } = await supabase
      .from("game_crew")
      .select("discord_id")
      .eq("id", id as string)
      .single();
    if (fetchErr || !claim) return res.status(404).json({ error: "Not found" });

    if (claim.discord_id !== discordId) {
      const adminId = await requireAdmin(req, res);
      if (!adminId) return;
    }

    const { error } = await supabase.from("game_crew").delete().eq("id", id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
