/**
 * Sends a plain-text message to a Discord webhook URL.
 * Silently no-ops if the URL is not configured.
 */
export async function sendWebhook(url: string | undefined, content: string): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {
    // Don't break the API response if the webhook fails
  }
}

/**
 * Sends a rich Discord embed to a webhook URL.
 * Silently no-ops if the URL is not configured.
 */
export async function sendWebhookEmbed(url: string | undefined, embed: Record<string, unknown>): Promise<void> {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch {
    // Don't break the API response if the webhook fails
  }
}

/**
 * Returns the correct webhook URL for a given league and action type.
 *
 * Env vars (set in Vercel):
 *   DISCORD_WEBHOOK_MBA_BIDS          — MBA bid/auction activity
 *   DISCORD_WEBHOOK_PBA               — MBA signings, cuts, trades
 *   DISCORD_WEBHOOK_PBGL              — MBGL transactions
 *   DISCORD_WEBHOOK_PCAA              — MCAA articles / general news
 *   DISCORD_WEBHOOK_MCAA_TRANSACTIONS — MCAA signings & cuts
 *   DISCORD_WEBHOOK_MCAA_PORTAL       — MCAA portal entries & claims
 */
export function getWebhookUrl(
  league: string, // db league slug (pba/pcaa/pbgl)
  action: "bid" | "transaction" | "portal"
): string | undefined {
  if (league === "pba" && action === "bid") return process.env.DISCORD_WEBHOOK_MBA_BIDS;
  if (league === "pba")  return process.env.DISCORD_WEBHOOK_PBA;
  if (league === "pbgl") return process.env.DISCORD_WEBHOOK_PBGL;
  if (league === "pcaa" && action === "portal") return process.env.DISCORD_WEBHOOK_MCAA_PORTAL;
  if (league === "pcaa") return process.env.DISCORD_WEBHOOK_MCAA_TRANSACTIONS;
  return undefined;
}
