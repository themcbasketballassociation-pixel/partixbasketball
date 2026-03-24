import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase.from("articles").select("*").order("created_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league: leagueRaw, title, body, image_url, discord_webhook } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !title || !body) return res.status(400).json({ error: "league, title, and body are required" });
    const { data, error } = await supabase
      .from("articles")
      .insert([{ league, title, body, image_url: image_url ?? null }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Post to Discord webhook if provided
    if (discord_webhook) {
      try {
        const embed: Record<string, unknown> = {
          title,
          description: body.length > 4096 ? body.slice(0, 4093) + "..." : body,
          color: 0x1d4ed8,
          footer: { text: league.toUpperCase() },
          timestamp: new Date().toISOString(),
        };
        if (image_url) embed.image = { url: image_url };
        await fetch(discord_webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embeds: [embed] }),
        });
      } catch {
        // Discord failure shouldn't block the article being saved
      }
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
