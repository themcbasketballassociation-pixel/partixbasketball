import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "DELETE") {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) return res.status(401).json({ error: "Must be signed in" });

    const { id } = req.query;
    const discordId = (session.user as any).id as string;

    const { data: comment } = await supabase
      .from("game_comments").select("discord_id").eq("id", id as string).single();
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
    if (comment.discord_id !== discordId && !adminIds.includes(discordId)) {
      return res.status(403).json({ error: "Cannot delete someone else's comment" });
    }

    const { error } = await supabase.from("game_comments").delete().eq("id", id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
