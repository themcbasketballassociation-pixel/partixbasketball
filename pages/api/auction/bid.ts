import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId, isAdminId } from "../../../lib/ownerAuth";
import { sendWebhookEmbed, getWebhookUrl } from "../../../lib/discordWebhook";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const TOTAL_CAP = 25000;
const COURT_CAP = 22000;
const MAX_PLAYER_VALUE = 12000;
const MIN_PLAYER_VALUE = 1000;
const TWO_SEASON_BONUS = 500;
const TWO_SEASON_MIN = 5000;
const TWO_SEASON_MAX = 8000;
const BID_INCREMENT = 250;
// Roster viability: top-2 salaries ≤ court_cap − 2 minimum roster spots
const VIABILITY_MAX = COURT_CAP - 2 * MIN_PLAYER_VALUE; // 20,000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const discordId = await getSessionDiscordId(req, res);
  if (!discordId) return;
  const fullSession = await getServerSession(req, res, authOptions as any);
  const performerName: string | null = ((fullSession as any)?.user as any)?.name ?? null;

  const { auction_id, team_id, amount: rawAmount, is_two_season = false } = req.body;
  if (!auction_id || !team_id || rawAmount == null)
    return res.status(400).json({ error: "auction_id, team_id, amount required" });

  const amount = Number(rawAmount);

  // Auth: must be admin or owner of this specific team
  if (!isAdminId(discordId)) {
    const { data: owner } = await supabase
      .from("team_owners")
      .select("team_id")
      .eq("discord_id", discordId)
      .eq("team_id", team_id)
      .maybeSingle();
    if (!owner) return res.status(403).json({ error: "Not authorized to bid for this team" });
  }

  // ── Validate amount ──────────────────────────────────────────────────────────
  if (!Number.isInteger(amount) || amount < MIN_PLAYER_VALUE || amount > MAX_PLAYER_VALUE)
    return res.status(400).json({ error: `Bid must be between ${MIN_PLAYER_VALUE} and ${MAX_PLAYER_VALUE}` });
  if (amount % BID_INCREMENT !== 0)
    return res.status(400).json({ error: `Bid must be a multiple of ${BID_INCREMENT}` });
  if (is_two_season && amount < TWO_SEASON_MIN)
    return res.status(400).json({ error: `2-season contracts require a minimum bid of ${TWO_SEASON_MIN}` });
  if (is_two_season && amount >= TWO_SEASON_MAX)
    return res.status(400).json({ error: `2-season contracts are not allowed on bids of ${TWO_SEASON_MAX.toLocaleString()} or more` });

  const effectiveValue = amount + (is_two_season ? TWO_SEASON_BONUS : 0);

  // ── Fetch auction ────────────────────────────────────────────────────────────
  const { data: auction, error: auctionErr } = await supabase
    .from("auctions")
    .select("*, players(mc_uuid, mc_username), auction_bids(team_id, amount, effective_value, is_valid)")
    .eq("id", auction_id)
    .single();
  if (auctionErr || !auction) return res.status(404).json({ error: "Auction not found" });
  if (auction.status !== "active") return res.status(400).json({ error: "Auction is not active" });
  if (new Date(auction.closes_at) < new Date())
    return res.status(400).json({ error: "Auction has already closed" });

  const validBids: { team_id: string; amount: number; effective_value: number }[] =
    (auction.auction_bids ?? []).filter((b: any) => b.is_valid);
  const topBid = validBids.reduce(
    (best: any, b) => (!best || b.effective_value > best.effective_value ? b : best),
    null
  );

  // Bid must be within $500 of the current top effective value (or meet min_price if no bids yet)
  const minEffective = topBid
    ? Math.max(auction.min_price, topBid.effective_value - 500)
    : auction.min_price;
  if (effectiveValue < minEffective) {
    const msg = topBid
      ? `Bid must be within $500 of the current top (${topBid.effective_value.toLocaleString()}). Minimum: ${minEffective.toLocaleString()}`
      : `Opening bid must be at least ${auction.min_price.toLocaleString()}`;
    return res.status(400).json({ error: msg });
  }

  // ── Cap checks ───────────────────────────────────────────────────────────────
  const { data: teamContracts } = await supabase
    .from("contracts")
    .select("amount")
    .eq("team_id", team_id)
    .eq("status", "active");

  const existingAmounts = (teamContracts ?? []).map((c: any) => c.amount as number);
  const existingTotal = existingAmounts.reduce((s, a) => s + a, 0);
  const maxExisting = existingAmounts.reduce((m, a) => Math.max(m, a), 0);

  // Pending cap holds: team's highest valid bid on every OTHER active/player_choice auction.
  // A bid commits cap until the player signs somewhere (then that auction closes and the hold releases).
  const [{ data: otherBids }, { data: openAuctions }] = await Promise.all([
    supabase
      .from("auction_bids")
      .select("auction_id, amount")
      .eq("team_id", team_id)
      .eq("is_valid", true)
      .neq("auction_id", auction_id),
    supabase
      .from("auctions")
      .select("id")
      .in("status", ["active", "player_choice"]),
  ]);
  const openIds = new Set((openAuctions ?? []).map((a: any) => a.id as string));
  const holdByAuction: Record<string, number> = {};
  for (const b of (otherBids ?? []) as { auction_id: string; amount: number }[]) {
    if (openIds.has(b.auction_id))
      holdByAuction[b.auction_id] = Math.max(holdByAuction[b.auction_id] ?? 0, b.amount);
  }
  const pendingCapHold = Object.values(holdByAuction).reduce((s, a) => s + a, 0);

  // Total cap: signed contracts + pending bid holds + new bid must not exceed 25,000
  if (existingTotal + pendingCapHold + amount > TOTAL_CAP)
    return res.status(400).json({
      error: `Bid exceeds total cap of ${TOTAL_CAP.toLocaleString()}. Signed: ${existingTotal.toLocaleString()}, Pending bid holds: ${pendingCapHold.toLocaleString()}, New bid: ${amount.toLocaleString()}. Would total ${(existingTotal + pendingCapHold + amount).toLocaleString()}.`,
    });

  // Roster viability: highest existing contract + bid ≤ 20,000
  if (maxExisting + amount > VIABILITY_MAX)
    return res.status(400).json({
      error: `Roster viability check failed: owner's contract (${maxExisting}) + highest bid (${amount}) = ${maxExisting + amount} > ${VIABILITY_MAX}. No room for 2 more minimum-priced players.`,
    });

  // ── Place bid ────────────────────────────────────────────────────────────────
  const { data: bid, error: bidErr } = await supabase
    .from("auction_bids")
    .insert([{ auction_id, team_id, amount, is_two_season, effective_value: effectiveValue, is_valid: true, performed_by_discord_id: discordId, performed_by_name: performerName }])
    .select("*, teams(id, name, abbreviation, color2, logo_url)")
    .single();
  if (bidErr) return res.status(500).json({ error: bidErr.message });

  const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
  const LEAGUE_COLORS: Record<string, number>  = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
  const LEAGUE_LOGOS:  Record<string, string>  = { pba: "/logos/mba.webp", pcaa: "/logos/mcaa.webp", pbgl: "/logos/MBGL.png" };
  const BASE_URL = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";

  const playerName = (auction as any).players?.mc_username ?? auction.mc_uuid;
  const playerUuid = (auction as any).players?.mc_uuid ?? auction.mc_uuid;
  const bidTeam = (bid as any).teams;
  const leagueDisplay = LEAGUE_LABELS[auction.league] ?? auction.league.toUpperCase();
  const twoSeasonLabel = is_two_season ? " (2-season 🔁)" : "";

  const embed: Record<string, unknown> = {
    color: LEAGUE_COLORS[auction.league] ?? 0x5865F2,
    author: bidTeam?.logo_url
      ? { name: bidTeam.name, icon_url: bidTeam.logo_url }
      : { name: bidTeam?.name ?? "Unknown Team" },
    title: "🏷️ New Bid",
    description: `**${playerName}** — bid by **${bidTeam?.name ?? "Unknown"}**\n**Amount:** $${amount.toLocaleString()} → eff. $${effectiveValue.toLocaleString()}${twoSeasonLabel}`,
    thumbnail: { url: `https://mc-heads.net/avatar/${playerUuid}/128` },
    footer: { text: leagueDisplay, icon_url: `${BASE_URL}${LEAGUE_LOGOS[auction.league] ?? ""}` },
    timestamp: new Date().toISOString(),
  };

  await sendWebhookEmbed(getWebhookUrl(auction.league, "bid"), embed);

  return res.status(200).json({ bid });
}
