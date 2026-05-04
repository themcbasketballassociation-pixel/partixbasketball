import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "../../../lib/adminAuth";

const COMMANDS = [
  {
    name: "site",
    description: "Get the Partix Basketball website link",
    type: 1,
  },
  {
    name: "stats",
    description: "Look up a player's stats",
    type: 1,
    options: [
      {
        name: "player",
        description: "The Discord user to look up (defaults to yourself)",
        type: 6, // USER
        required: false,
      },
      {
        name: "league",
        description: "Which league to show stats for",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "MBA (PBA)", value: "pba" },
          { name: "MCAA", value: "pcaa" },
          { name: "MBGL", value: "pbgl" },
        ],
      },
    ],
  },
  {
    name: "roster",
    description: "View a team's roster, salary cap, and ownership for the current season",
    type: 1,
    options: [
      {
        name: "league",
        description: "Which league",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "MBA (PBA)", value: "pba" },
          { name: "MCAA", value: "pcaa" },
          { name: "MBGL", value: "pbgl" },
        ],
      },
      {
        name: "team",
        description: "Team name (type to search)",
        type: 3, // STRING
        required: true,
        autocomplete: true,
      },
    ],
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const appId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !botToken) {
    return res.status(500).json({ error: "DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN env vars required" });
  }

  const url = `https://discord.com/api/v10/applications/${appId}/commands`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(COMMANDS),
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(500).json({ error: "Discord API error", details: data });
  }

  return res.status(200).json({ success: true, registered: (data as unknown[]).length, commands: data });
}
