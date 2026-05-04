const DISCORD_API = "https://discord.com/api/v10";

type DmPayload = {
  content?: string;
  embeds?: unknown[];
  components?: unknown[];
};

/**
 * Sends a Discord DM to a user via the bot token.
 * Returns true if the message was sent successfully.
 */
export async function sendDiscordDm(discord_id: string, payload: DmPayload): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return false;

  try {
    // Step 1: Create/open DM channel with the user
    const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discord_id }),
    });
    if (!dmRes.ok) return false;
    const dmChannel = await dmRes.json() as { id: string };

    // Step 2: Send the message to the DM channel
    const msgRes = await fetch(`${DISCORD_API}/channels/${dmChannel.id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return msgRes.ok;
  } catch {
    return false;
  }
}
