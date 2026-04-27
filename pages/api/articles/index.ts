import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, check, all } = req.query;
    const league = resolveLeague(leagueRaw);

    // ?check=discord — returns whether a webhook is configured for this league
    if (check === "discord") {
      const configured = !!process.env[`DISCORD_WEBHOOK_${(league as string).toUpperCase()}`];
      return res.status(200).json({ configured });
    }

    let query = supabase.from("articles").select("*").order("created_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    // ?all=true is admin-only and returns all statuses; public gets only published
    if (all !== "true") query = query.eq("status", "published");
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const { league: leagueRaw, title, body, image_url, post_to_discord } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !title || !body) return res.status(400).json({ error: "league, title, and body are required" });

    // Check if admin (published immediately) or press member (pending approval)
    const session = await getServerSession(req, res, authOptions);
    const discordId = (session?.user as { id?: string })?.id;
    if (!discordId) return res.status(401).json({ error: "Not authenticated" });

    // Inline admin check (avoids requireAdmin sending a response on failure)
    const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const isAdmin = adminIds.includes(discordId);

    // If not admin, check press membership
    if (!isAdmin) {
      const { data: pressMember } = await supabase
        .from("press_members")
        .select("id")
        .eq("discord_id", discordId)
        .eq("league", league)
        .maybeSingle();
      if (!pressMember) return res.status(403).json({ error: "Not authorized to submit articles" });
    }

    const status = isAdmin ? "published" : "pending_approval";
    const submittedByName = session?.user?.name ?? null;
    const { data, error } = await supabase
      .from("articles")
      .insert([{ league, title, body, image_url: image_url ?? null, status, submitted_by: discordId, submitted_by_name: submittedByName }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Post to Discord using server-side webhook env var
    if (post_to_discord) {
      const webhookUrl = process.env[`DISCORD_WEBHOOK_${league.toUpperCase()}`];
      if (webhookUrl) {
        try {
          const leagueLabels: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
          const embed: Record<string, unknown> = {
            title,
            description: body.length > 4096 ? body.slice(0, 4093) + "..." : body,
            color: league === "pba" ? 0xC8102E : league === "pcaa" ? 0x003087 : 0xBB3430,
            footer: { text: leagueLabels[league] ?? league.toUpperCase() },
            timestamp: new Date().toISOString(),
          };
          if (image_url) embed.image = { url: image_url };
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed] }),
          });
        } catch {
          // Discord failure shouldn't block the article being saved
        }
      }
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
