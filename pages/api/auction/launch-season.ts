import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, season, duration_minutes } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league || !season) return res.status(400).json({ error: "league and season required" });

  // 1. Fetch all prices set for this league + season
  const { data: prices, error: pricesErr } = await supabase
    .from("auction_player_prices")
    .select("mc_uuid, price")
    .eq("league", league)
    .eq("season", season);
  if (pricesErr) return res.status(500).json({ error: pricesErr.message });
  if (!prices || prices.length === 0)
    return res.status(400).json({ error: "No prices set for this season. Set prices in the Prices tab first." });

  const isTest = !!duration_minutes;
  console.log("[launch-season] v6 isTest=", isTest, "league=", league, "season=", season, "prices=", prices?.length);

  // 2a. In test mode: wipe ALL auctions (and their bids) for this league so every
  //     priced player re-appears fresh — including closed/cancelled/signed ones.
  let deleteErr: string | null = null;
  let deletedCount = 0;
  if (isTest) {
    // First fetch all auction ids to delete their bids (cascade may not be set up)
    const { data: allAuctions } = await supabase
      .from("auctions")
      .select("id")
      .eq("league", league);
    const allIds = (allAuctions ?? []).map((a) => a.id as string);
    deletedCount = allIds.length;
    if (allIds.length > 0) {
      await supabase.from("auction_bids").delete().in("auction_id", allIds);
      const { error: delErr } = await supabase.from("auctions").delete().eq("league", league);
      if (delErr) deleteErr = delErr.message;
    }
    console.log("[launch-season] deleted", deletedCount, "auctions, deleteErr=", deleteErr);
  }

  // 2b. In real mode: skip players already in a live auction
  let existingSet = new Set<string>();
  if (!isTest) {
    const { data: existing } = await supabase
      .from("auctions")
      .select("mc_uuid")
      .eq("league", league)
      .in("status", ["active", "pending", "player_choice", "signed"]);
    existingSet = new Set((existing ?? []).map((a) => a.mc_uuid));
  }

  // 3. In real mode: skip players who already have an active contract THIS season.
  //    Old season contracts left as "active" should not block new season auctions.
  //    In test mode: include everyone.
  const contractedSet = new Set<string>();
  if (!isTest) {
    const { data: existingContracts } = await supabase
      .from("contracts")
      .select("mc_uuid")
      .eq("league", league)
      .eq("season", season)
      .eq("status", "active");
    for (const c of existingContracts ?? []) contractedSet.add(c.mc_uuid);
  }

  // 3b. Always skip team owners — they are already assigned to their team
  const ownerSet = new Set<string>();
  const { data: teamOwners } = await supabase
    .from("team_owners")
    .select("discord_id")
    .eq("league", league);
  const ownerDiscordIds = (teamOwners ?? []).map((o: any) => o.discord_id as string);
  if (ownerDiscordIds.length > 0) {
    const { data: ownerPlayers } = await supabase
      .from("players")
      .select("mc_uuid")
      .in("discord_id", ownerDiscordIds);
    for (const p of ownerPlayers ?? []) ownerSet.add(p.mc_uuid);
  }

  // 4. Create active auctions for all priced players not already in auction, contracted, or an owner
  const durationMs = isTest ? Number(duration_minutes) * 60 * 1000 : 72 * 60 * 60 * 1000;
  const closesAt = new Date(Date.now() + durationMs).toISOString();
  let created = 0;
  const skippedOwner: string[] = [];
  const skippedContracted: string[] = [];
  const skippedExisting: string[] = [];
  const insertErrors: string[] = [];

  for (const { mc_uuid, price } of prices) {
    if (ownerSet.has(mc_uuid)) { skippedOwner.push(mc_uuid); continue; }
    if (contractedSet.has(mc_uuid)) { skippedContracted.push(mc_uuid); continue; }
    if (existingSet.has(mc_uuid)) { skippedExisting.push(mc_uuid); continue; }
    const { error } = await supabase.from("auctions").insert([{
      league,
      mc_uuid,
      min_price: price,
      season: season ?? null,
      status: "active",
      closes_at: closesAt,
    }]);
    if (!error) created++;
    else insertErrors.push(`${mc_uuid}: ${error.message}`);
  }

  // Resolve usernames for skipped players so the admin can see who was filtered
  const allSkippedUuids = [...skippedOwner, ...skippedContracted, ...skippedExisting];
  let skippedNames: Record<string, string> = {};
  if (allSkippedUuids.length > 0) {
    const { data: pls } = await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", allSkippedUuids);
    for (const p of pls ?? []) skippedNames[p.mc_uuid] = p.mc_username;
  }

  return res.status(200).json({
    created,
    skipped: skippedOwner.length + skippedContracted.length + skippedExisting.length,
    total: prices.length,
    insertErrors,
    skippedOwner: skippedOwner.map(u => skippedNames[u] ?? u),
    skippedContracted: skippedContracted.map(u => skippedNames[u] ?? u),
    skippedExisting: skippedExisting.map(u => skippedNames[u] ?? u),
    debug: {
      isTest,
      existingSetSize: existingSet.size,
      contractedSetSize: contractedSet.size,
      ownerSetSize: ownerSet.size,
      pricesCount: prices.length,
      deletedCount,
      deleteErr,
    },
  });
}
