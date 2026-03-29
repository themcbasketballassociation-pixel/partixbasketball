import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

const TOTAL_CAP = 25000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) return res.status(401).json({ error: "Unauthorized" });

  const leagueRaw = req.query.league ?? req.body?.league;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  // Resolve owner's team
  const { data: ownerRecords } = await supabase
    .from("team_owners")
    .select("id, season, teams(id, name, abbreviation)")
    .eq("discord_id", discordId)
    .eq("league", league);
  if (!ownerRecords?.length) return res.status(403).json({ error: "You don't own a team in this league" });
  const ownerRecord = ownerRecords.sort((a: any, b: any) =>
    parseInt((b.season ?? "0").match(/\d+/)?.[0] ?? "0") - parseInt((a.season ?? "0").match(/\d+/)?.[0] ?? "0")
  )[0] as any;
  const teamId = ownerRecord.teams?.id;
  if (!teamId) return res.status(403).json({ error: "Team not found" });

  if (req.method === "GET") {
    // Available for signing: players whose auction closed with no winner and no active/pending contract
    const { data: closedAuctions } = await supabase
      .from("auction_items")
      .select("mc_uuid, min_price, players(mc_uuid, mc_username)")
      .eq("league", league)
      .eq("status", "closed");

    const { data: takenContracts } = await supabase
      .from("contracts")
      .select("mc_uuid")
      .eq("league", league)
      .in("status", ["active", "pending_approval"]);

    const taken = new Set((takenContracts ?? []).map((c: any) => c.mc_uuid));
    const available = (closedAuctions ?? [])
      .filter((a: any) => !taken.has(a.mc_uuid))
      .map((a: any) => ({
        mc_uuid: a.mc_uuid,
        mc_username: (a.players as any)?.mc_username ?? a.mc_uuid,
        min_price: a.min_price,
      }));

    return res.status(200).json(available);
  }

  if (req.method === "POST") {
    const { mc_uuid } = req.body;
    if (!mc_uuid) return res.status(400).json({ error: "mc_uuid required" });

    // Look up their closed auction to get the min_price (that IS the signing salary)
    const { data: auction } = await supabase
      .from("auction_items")
      .select("mc_uuid, min_price")
      .eq("league", league)
      .eq("mc_uuid", mc_uuid)
      .eq("status", "closed")
      .maybeSingle();
    if (!auction) return res.status(400).json({ error: "Player is not available for signing (must have a closed auction with no winner)" });

    const amt = (auction as any).min_price as number;

    // Player must not already have a contract
    const { data: existingContract } = await supabase
      .from("contracts")
      .select("id")
      .eq("mc_uuid", mc_uuid)
      .eq("league", league)
      .in("status", ["active", "pending_approval"])
      .maybeSingle();
    if (existingContract) return res.status(400).json({ error: "Player already has an active or pending contract" });

    // Cap check
    const { data: teamContracts } = await supabase
      .from("contracts")
      .select("amount")
      .eq("team_id", teamId)
      .eq("league", league)
      .in("status", ["active", "pending_approval"]);
    const capUsed = (teamContracts ?? []).reduce((s: number, c: any) => s + c.amount, 0);
    if (capUsed + amt > TOTAL_CAP)
      return res.status(400).json({ error: `Exceeds cap: ${capUsed.toLocaleString()} + ${amt.toLocaleString()} > ${TOTAL_CAP.toLocaleString()}` });

    const { data: contract, error } = await supabase
      .from("contracts")
      .insert([{
        league,
        mc_uuid,
        team_id: teamId,
        amount: amt,
        is_two_season: false,
        season: ownerRecord.season ?? null,
        phase: 1,
        status: "pending_approval",
      }])
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(contract);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
