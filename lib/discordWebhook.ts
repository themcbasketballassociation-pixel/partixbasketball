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
 * Env vars:
 *   DISCORD_WEBHOOK_MBA_BIDS          — MBA bid/auction activity
 *   DISCORD_WEBHOOK_MBA_TRANSACTIONS  — MBA signings, cuts, trades
 *   DISCORD_WEBHOOK_MBGL_TRANSACTIONS — MBGL transactions
 *   DISCORD_WEBHOOK_MCAA_TRANSACTIONS — MCAA signings & cuts
 *   DISCORD_WEBHOOK_MCAA_PORTAL       — MCAA transfer portal requests
 */
export function getWebhookUrl(
  league: string, // db league slug (pba/pcaa/pbgl)
  action: "bid" | "transaction" | "portal"
): string | undefined {
  const slug = league === "pba" ? "mba" : league === "pcaa" ? "mcaa" : league === "pbgl" ? "mbgl" : league;

  if (slug === "mba" && action === "bid")         return process.env.DISCORD_WEBHOOK_MBA_BIDS;
  if (slug === "mba" && action === "transaction") return process.env.DISCORD_WEBHOOK_MBA_TRANSACTIONS;
  if (slug === "mbgl")                            return process.env.DISCORD_WEBHOOK_MBGL_TRANSACTIONS;
  if (slug === "mcaa" && action === "portal")     return process.env.DISCORD_WEBHOOK_MCAA_PORTAL;
  if (slug === "mcaa")                            return process.env.DISCORD_WEBHOOK_MCAA_TRANSACTIONS;
  return undefined;
}
