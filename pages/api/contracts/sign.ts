import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

const TOTAL_CAP = 25000;

function seasonNum(s: string | null | undefined): number {
  const m = (s ?? "").match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) return res.status(401).json({ error: "Unauthorized" });

  const leagueRaw = req.query.league ?? req.body?.league;
  const leagueSlug = Array.isArray(leagueRaw) ? leagueRaw[0] : (leagueRaw ?? "");
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  const isMcaa = league === "pcaa";

  // Resolve owner's team — check both DB identifier and slug to handle storage inconsistency
  const leagueValues = [...new Set([league, leagueSlug])].filter(Boolean);
  const { data: ownerRecords } = await supabase
    .from("team_owners")
    .select("id, season, teams(id, name, abbreviation)")
    .eq("discord_id", discordId)
    .in("league", leagueValues);
  if (!ownerRecords?.length) return res.status(403).json({ error: "You don't own a team in this league" });
  const ownerRecord = [...ownerRecords].sort((a: any, b: any) =>
    seasonNum(b.season) - seasonNum(a.season)
  )[0] as any;
  const teamId = ownerRecord.teams?.id;
  if (!teamId) return res.status(403).json({ error: "Team not found" });

  if (req.method === "GET") {
    // Players already contracted (active or pending)
    const { data: takenContracts } = await supabase
      .from("contracts")
      .select("mc_uuid")
      .eq("league", league)
      .in("status", ["active", "pending_approval", "portal_claim"]);
    const taken = new Set((takenContracts ?? []).map((c: any) => c.mc_uuid));

    if (isMcaa) {
      // MCAA: any player in the league without an active/pending contract is available
      // This includes players in the transfer portal (in_portal status)
      const { data: playerTeams } = await supabase
        .from("player_teams")
        .select("mc_uuid, players(mc_uuid, mc_username)")
        .eq("league", league);
      const available = (playerTeams ?? [])
        .filter((pt: any) => !taken.has(pt.mc_uuid))
        .map((pt: any) => ({
          mc_uuid: pt.mc_uuid,
          mc_username: (pt.players as any)?.mc_username ?? pt.mc_uuid,
          min_price: 0,
        }));
      return res.status(200).json(available);
    }

    // MBA/MBGL: only players whose auction closed with no winner
    const { data: closedAuctions } = await supabase
      .from("auction_items")
      .select("mc_uuid, min_price, players(mc_uuid, mc_username)")
      .eq("league", league)
      .eq("status", "closed");
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

    // Player must not already have a contract
    const { data: existingContract } = await supabase
      .from("contracts")
      .select("id")
      .eq("mc_uuid", mc_uuid)
      .eq("league", league)
      .in("status", ["active", "pending_approval", "portal_claim"])
      .maybeSingle();
    if (existingContract) return res.status(400).json({ error: "Player already has an active or pending contract" });

    // Check if player is currently in the portal (makes this a portal claim, not a signing)
    const { data: portalContract } = await supabase
      .from("contracts")
      .select("id")
      .eq("mc_uuid", mc_uuid)
      .eq("league", league)
      .eq("status", "in_portal")
      .maybeSingle();
    const isPortalClaim = !!portalContract;

    let amt = 0;

    if (!isMcaa) {
      // MBA/MBGL: must have a closed auction to get the signing salary
      const { data: auction } = await supabase
        .from("auction_items")
        .select("mc_uuid, min_price")
        .eq("league", league)
        .eq("mc_uuid", mc_uuid)
        .eq("status", "closed")
        .maybeSingle();
      if (!auction) return res.status(400).json({ error: "Player is not available for signing (must have a closed auction with no winner)" });
      amt = (auction as any).min_price as number;

      // Cap check for non-MCAA leagues
      const { data: teamContracts } = await supabase
        .from("contracts")
        .select("amount")
        .eq("team_id", teamId)
        .eq("league", league)
        .in("status", ["active", "pending_approval"]);
      const capUsed = (teamContracts ?? []).reduce((s: number, c: any) => s + c.amount, 0);
      if (capUsed + amt > TOTAL_CAP)
        return res.status(400).json({ error: `Exceeds cap: ${capUsed.toLocaleString()} + ${amt.toLocaleString()} > ${TOTAL_CAP.toLocaleString()}` });
    }

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
        // Portal claims get their own status so they stay in the portal tab (not signings)
        status: isPortalClaim ? "portal_claim" : "pending_approval",
      }])
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json(contract);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
