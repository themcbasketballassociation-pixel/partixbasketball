/**
 * Cron: notify-offers
 *
 * Finds players with pending contract offers where the most recent offer is
 * ≥12 hours old and no DM has been sent yet, then DMs them via Discord bot
 * with accept/decline buttons.
 *
 * Call this endpoint on a schedule (e.g. every hour via Vercel Cron):
 *   Authorization: Bearer <CRON_SECRET>
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { sendDiscordDm } from "../../../lib/discordDm";

const HOURS_12_MS = 12 * 60 * 60 * 1000;

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number> = { pba: 0xc8102e, pcaa: 0x003087, pbgl: 0xbb3430 };

const BASE_URL = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";

function leagueSlug(league: string) {
  return league === "pba" ? "mba" : league === "pcaa" ? "mcaa" : league === "pbgl" ? "mbgl" : league;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Validate cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Fetch all pending offers where DM hasn't been sent yet
  const { data: pending, error } = await supabase
    .from("contract_offers")
    .select("*, players(mc_uuid, mc_username, discord_id), teams(id, name, abbreviation, logo_url)")
    .eq("status", "pending")
    .is("dm_sent_at", null)
    .order("offered_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  if (!pending?.length) return res.status(200).json({ notified: 0, message: "No pending offers to notify" });

  // Group offers by (mc_uuid + league)
  const groups = new Map<string, typeof pending>();
  for (const offer of pending) {
    const key = `${offer.mc_uuid}:${offer.league}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(offer);
  }

  let notified = 0;
  const now = Date.now();

  for (const [, offers] of groups) {
    const player = (offers[0].players as any);
    if (!player?.discord_id) continue; // can't DM without Discord link

    // Most recent offer (already sorted descending)
    const mostRecentOffer = offers[0];
    const elapsed = now - new Date(mostRecentOffer.offered_at).getTime();
    if (elapsed < HOURS_12_MS) continue; // 12-hour window hasn't passed yet

    const league = offers[0].league as string;
    const label = LEAGUE_LABELS[league] ?? league.toUpperCase();
    const color = LEAGUE_COLORS[league] ?? 0x5865f2;
    const slug = leagueSlug(league);
    const showSalary = league !== "pcaa" && league !== "pbgl";

    // Build offer summary lines
    const offerLines = offers.map((o, i) => {
      const team = o.teams as any;
      const salary = showSalary && o.amount > 0 ? ` — **$${o.amount.toLocaleString()}**` : "";
      const twoSeason = o.is_two_season ? " *(2-season)*" : "";
      return `**${i + 1}. ${team?.name ?? "Unknown"} (${team?.abbreviation ?? "?"})**${salary}${twoSeason}`;
    });

    const profileUrl = `${BASE_URL}/${slug}/profile`;

    const embed = {
      color,
      title: `🏀 You have ${offers.length} contract offer${offers.length !== 1 ? "s" : ""}!`,
      description:
        `Your **${label}** recruitment window is now open. You can accept one of the offers below.\n\n` +
        offerLines.join("\n") +
        `\n\n> You can also accept from your [profile page](${profileUrl}).`,
      footer: { text: "Partix Basketball · Contract Offers" },
      timestamp: new Date().toISOString(),
    };

    // Build accept buttons (max 4 so we can fit a "Decline All" too; Discord limit = 5 per row)
    const acceptButtons = offers.slice(0, 4).map((o) => {
      const team = o.teams as any;
      return {
        type: 2, // BUTTON
        style: 3, // SUCCESS / green
        label: `✅ Accept ${team?.abbreviation ?? "?"}`,
        custom_id: `accept_offer:${o.id}`,
      };
    });

    const declineAllBtn = {
      type: 2,
      style: 4, // DANGER / red
      label: "❌ Decline All",
      custom_id: `decline_all_offers:${offers[0].mc_uuid}:${league}`,
    };

    const components = [
      { type: 1, components: [...acceptButtons, declineAllBtn] },
    ];

    const sent = await sendDiscordDm(player.discord_id, { embeds: [embed], components });

    if (sent) {
      const offerIds = offers.map((o) => o.id);
      await supabase
        .from("contract_offers")
        .update({ dm_sent_at: new Date().toISOString() })
        .in("id", offerIds);
      notified++;
    }
  }

  return res.status(200).json({ notified, total_groups: groups.size });
}
