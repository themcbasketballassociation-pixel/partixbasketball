import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, season } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league || !season) return res.status(400).json({ error: "league and season required" });

  // 1. Find all team owners for this league + season and resolve their mc_uuids
  const { data: owners, error: ownersErr } = await supabase
    .from("team_owners")
    .select("discord_id, team_id")
    .eq("league", league);
  if (ownersErr) return res.status(500).json({ error: ownersErr.message });

  const discordIds = (owners ?? []).map((o: any) => o.discord_id as string);

  // Get mc_uuids for these Discord IDs
  let ownerUuids: string[] = [];
  const ownerTeamMap: Record<string, string> = {}; // mc_uuid → team_id
  if (discordIds.length > 0) {
    const { data: ownerPlayers } = await supabase
      .from("players")
      .select("mc_uuid, discord_id")
      .in("discord_id", discordIds);
    for (const p of ownerPlayers ?? []) {
      ownerUuids.push(p.mc_uuid);
      const ownerRow = (owners ?? []).find((o: any) => o.discord_id === p.discord_id);
      if (ownerRow) ownerTeamMap[p.mc_uuid] = ownerRow.team_id;
    }
  }

  // 2. Delete all contracts for this league+season that don't belong to team owners
  let deleted = 0;
  const { data: allContracts } = await supabase
    .from("contracts")
    .select("id, mc_uuid")
    .eq("league", league)
    .eq("season", season);

  const toDelete = (allContracts ?? [])
    .filter((c: any) => !ownerUuids.includes(c.mc_uuid))
    .map((c: any) => c.id as string);

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from("contracts").delete().in("id", toDelete);
    if (delErr) return res.status(500).json({ error: delErr.message });
    deleted = toDelete.length;
  }

  // 3. Ensure each team owner has an active contract for this season
  const existingOwnerContracts = (allContracts ?? [])
    .filter((c: any) => ownerUuids.includes(c.mc_uuid))
    .map((c: any) => c.mc_uuid as string);

  let created = 0;
  for (const mc_uuid of ownerUuids) {
    if (existingOwnerContracts.includes(mc_uuid)) continue;
    const team_id = ownerTeamMap[mc_uuid];
    if (!team_id) continue;
    const { error: insErr } = await supabase.from("contracts").insert([{
      league,
      mc_uuid,
      team_id,
      amount: 0,
      is_two_season: false,
      season,
      status: "active",
    }]);
    if (!insErr) {
      created++;
      // Sync player_teams
      await supabase
        .from("player_teams")
        .upsert([{ mc_uuid, team_id, league, season }], { onConflict: "mc_uuid,league" });
    }
  }

  return res.status(200).json({ deleted, created, ownerCount: ownerUuids.length });
}
