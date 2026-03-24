import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId, isAdminId } from "../../../lib/ownerAuth";

const TOTAL_CAP = 25000;
const COURT_CAP = 22000;
const MAX_PLAYER_VALUE = 12000;
const MIN_PLAYER_VALUE = 1000;
const TWO_SEASON_BONUS = 500;
const TWO_SEASON_MIN = 5000;
const BID_INCREMENT = 250;
// Roster viability: top-2 salaries ≤ court_cap − 2 minimum roster spots
const VIABILITY_MAX = COURT_CAP - 2 * MIN_PLAYER_VALUE; // 20,000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const discordId = await getSessionDiscordId(req, res);
  if (!discordId) return;

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

  const effectiveValue = amount + (is_two_season ? TWO_SEASON_BONUS : 0);

  // ── Fetch auction ────────────────────────────────────────────────────────────
  const { data: auction, error: auctionErr } = await supabase
    .from("auctions")
    .select("*, auction_bids(team_id, amount, effective_value, is_valid)")
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

  // Must beat the current top effective value (or meet min_price if no bids yet)
  const minEffective = topBid ? topBid.effective_value + 1 : auction.min_price;
  if (effectiveValue < minEffective) {
    const msg = topBid
      ? `Must beat current top effective value of ${topBid.effective_value}`
      : `Opening bid must be at least ${auction.min_price}`;
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

  // ── Phase signing limit (can bid but flagged) ────────────────────────────────
  const { data: phaseSignings } = await supabase
    .from("contracts")
    .select("id")
    .eq("team_id", team_id)
    .eq("league", auction.league)
    .eq("phase", auction.phase);
  const signingsThisPhase = (phaseSignings ?? []).length;

  // ── Place bid ────────────────────────────────────────────────────────────────
  const { data: bid, error: bidErr } = await supabase
    .from("auction_bids")
    .insert([{ auction_id, team_id, amount, is_two_season, effective_value: effectiveValue, is_valid: true }])
    .select("*, teams(id, name, abbreviation, color2)")
    .single();
  if (bidErr) return res.status(500).json({ error: bidErr.message });

  // Reset the 12-hour clock
  const newClosesAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  await supabase.from("auctions").update({ closes_at: newClosesAt }).eq("id", auction_id);

  const warning =
    signingsThisPhase >= 2
      ? `Your team has already signed ${signingsThisPhase} players this phase. You can bid but cannot win until next phase.`
      : null;

  return res.status(200).json({ bid, closes_at: newClosesAt, warning });
}
