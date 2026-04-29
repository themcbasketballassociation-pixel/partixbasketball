import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../lib/adminAuth";

const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "1195236322298843228";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { username } = req.query;
  if (!username || typeof username !== "string")
    return res.status(400).json({ error: "username required" });

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: "Bot token not configured" });

  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(username)}&limit=10`,
      { headers: { Authorization: `Bot ${token}` } }
    );
    if (!r.ok) return res.status(500).json({ error: "Discord API error" });
    const members = await r.json();

    const results = (members as any[]).map((m) => ({
      id: m.user.id,
      username: m.user.username,
      display_name: m.nick ?? m.user.global_name ?? m.user.username,
      avatar: m.user.avatar
        ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=32`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(m.user.id) % 5}.png`,
    }));

    return res.status(200).json(results);
  } catch {
    return res.status(500).json({ error: "Failed to search Discord members" });
  }
}
