import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { game_id, discord_id, mentioned_mc_username } = req.query;

    let query = supabase.from("game_comments").select("*").order("created_at", { ascending: true });
    if (game_id) query = query.eq("game_id", game_id as string);
    if (discord_id) query = query.eq("discord_id", discord_id as string);
    if (mentioned_mc_username) query = query.ilike("content", `%@${mentioned_mc_username as string}%`);
    if (!game_id && !discord_id && !mentioned_mc_username) return res.status(400).json({ error: "game_id, discord_id, or mentioned_mc_username required" });

    const { data: comments, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Enrich with MC username/uuid where discord is linked
    const discordIds = [...new Set((comments ?? []).map((c: any) => c.discord_id).filter(Boolean))];
    const playerMap: Record<string, { mc_username: string; mc_uuid: string }> = {};
    if (discordIds.length > 0) {
      const { data: players } = await supabase
        .from("players")
        .select("mc_uuid, mc_username, discord_id")
        .in("discord_id", discordIds);
      for (const p of (players ?? [])) {
        if (p.discord_id) playerMap[p.discord_id] = { mc_username: p.mc_username, mc_uuid: p.mc_uuid };
      }
    }

    const enriched = (comments ?? []).map((c: any) => ({
      ...c,
      mc_username: playerMap[c.discord_id]?.mc_username ?? null,
      mc_uuid:     playerMap[c.discord_id]?.mc_uuid     ?? null,
    }));
    return res.status(200).json(enriched);
  }

  if (req.method === "POST") {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) return res.status(401).json({ error: "Must be signed in with Discord" });

    const discordId = (session.user as any).id as string;
    const { game_id, content } = req.body;
    if (!game_id) return res.status(400).json({ error: "game_id required" });
    if (!content?.trim()) return res.status(400).json({ error: "Comment cannot be empty" });
    if (content.trim().length > 500) return res.status(400).json({ error: "Max 500 characters" });

    const { data, error } = await supabase
      .from("game_comments")
      .insert([{ game_id, discord_id: discordId, discord_name: session.user.name ?? null, content: content.trim() }])
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
