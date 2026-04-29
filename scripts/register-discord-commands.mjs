/**
 * One-time script to register Discord slash commands for the Partix Basketball bot.
 *
 * Usage:
 *   node scripts/register-discord-commands.mjs
 *
 * Required .env.local vars:
 *   DISCORD_APPLICATION_ID  — your Discord app's application ID
 *   DISCORD_BOT_TOKEN       — your Discord bot token
 *   DISCORD_GUILD_ID        — (optional) register to a specific guild for instant updates
 *                             Omit to register as global commands (up to 1h propagation delay)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dep required)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local not found — assume env vars are set externally
  }
}
loadEnv();

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID; // optional

if (!APPLICATION_ID || !BOT_TOKEN) {
  console.error("❌ Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN in .env.local");
  process.exit(1);
}

const commands = [
  {
    name: "stats",
    description: "View a player's Partix Basketball stats",
    options: [
      {
        name: "player",
        description: "The player to look up (leave blank to see your own stats)",
        type: 6, // USER
        required: false,
      },
      {
        name: "league",
        description: "League to show stats for (default: PBA)",
        type: 3, // STRING
        required: false,
        choices: [
          { name: "PBA (Pro)", value: "pba" },
          { name: "PCAA (College)", value: "pcaa" },
          { name: "PBGL (G League)", value: "pbgl" },
        ],
      },
    ],
  },
  {
    name: "site",
    description: "Get the link to the Partix Basketball website",
  },
];

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`;

console.log(`Registering ${commands.length} command(s) ${GUILD_ID ? `to guild ${GUILD_ID}` : "globally"}...`);

const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${BOT_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

const data = await response.json();

if (!response.ok) {
  console.error("❌ Failed to register commands:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("✅ Commands registered successfully!");
for (const cmd of data) {
  console.log(`  /${cmd.name} (id: ${cmd.id})`);
}
