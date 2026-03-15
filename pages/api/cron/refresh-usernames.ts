import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow GET (Vercel cron) or POST (manual trigger from admin)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (req.method === "GET") {
    // Vercel cron: verify cron secret
    const authHeader = req.headers.authorization;
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else {
    // Manual POST from admin panel: require admin session
    const admin = await requireAdmin(req, res);
    if (!admin) return;
  }

  const { data: players, error } = await supabase
    .from("players")
    .select("mc_uuid, mc_username");

  if (error) return res.status(500).json({ error: error.message });

  let updated = 0;
  let failed = 0;
  const changes: { uuid: string; old: string; new: string }[] = [];

  for (const player of players ?? []) {
    try {
      const r = await fetch(`https://playerdb.co/api/player/minecraft/${player.mc_uuid}`);
      const data = await r.json();
      if (!data.success) { failed++; continue; }
      const newUsername: string = data.data.player.username;
      if (newUsername !== player.mc_username) {
        await supabase
          .from("players")
          .update({ mc_username: newUsername })
          .eq("mc_uuid", player.mc_uuid);
        changes.push({ uuid: player.mc_uuid, old: player.mc_username, new: newUsername });
        updated++;
      }
    } catch {
      failed++;
    }
  }

  return res.status(200).json({ updated, failed, total: players?.length ?? 0, changes });
}
