import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method === "GET") {
    const { data, error } = await supabase.from("articles").select("*").eq("id", id).single();
    if (error || !data) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(data);
  }

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { title, body, status, post_to_discord } = req.body;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (body !== undefined) updates.body = body;
    // approve → "published", reject → "rejected"
    if (status !== undefined) updates.status = status;
    const { data, error } = await supabase.from("articles").update(updates).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Post to Discord when approving/publishing a press article
    if (status === "published" && post_to_discord) {
      const article = data as any;
      const webhookUrl = process.env[`DISCORD_WEBHOOK_${(article.league ?? "").toUpperCase()}`];
      if (webhookUrl) {
        try {
          const leagueLabels: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
          const embed: Record<string, unknown> = {
            title: article.title,
            description: (article.body ?? "").length > 4096 ? (article.body as string).slice(0, 4093) + "..." : article.body,
            color: article.league === "pba" ? 0xC8102E : article.league === "pcaa" ? 0x003087 : 0xBB3430,
            footer: { text: leagueLabels[article.league] ?? (article.league ?? "").toUpperCase() },
            timestamp: new Date().toISOString(),
          };
          if (article.image_url) embed.image = { url: article.image_url };
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
          });
        } catch {
          // Discord failure shouldn't block the response
        }
      }
    }

    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
