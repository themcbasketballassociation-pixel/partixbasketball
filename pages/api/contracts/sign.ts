import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

const TOTAL_CAP = 25000;
const MIN_SALARY = 1000;
const MAX_SALARY = 12000;
const SALARY_INCREMENT = 250;
const MAX_SIGNINGS_PER_PHASE = 2;

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
    // Free agents: players with no active contract in this league
    const { data: allPlayers } = await supabase.from("players").select("mc_uuid, mc_username").order("mc_username");
    const { data: activeContracts } = await supabase
      .from("contracts").select("mc_uuid").eq("league", league).eq("status", "active");
    const signed = new Set((activeContracts ?? []).map((c: any) => c.mc_uuid));
    return res.status(200).json((allPlayers ?? []).filter((p: any) => !signed.has(p.mc_uuid)));
  }

  if (req.method === "POST") {
    const { mc_uuid, amount, is_two_season, phase } = req.body;
    if (!mc_uuid || !amount) return res.status(400).json({ error: "mc_uuid and amount required" });

    const amt = parseInt(amount);
    if (isNaN(amt) || amt < MIN_SALARY) return res.status(400).json({ error: `Minimum salary is ${MIN_SALARY}` });
    if (amt > MAX_SALARY) return res.status(400).json({ error: `Maximum salary is ${MAX_SALARY}` });
    if (amt % SALARY_INCREMENT !== 0) return res.status(400).json({ error: `Salary must be a multiple of ${SALARY_INCREMENT}` });

    // Player must be a free agent
    const { data: existingContract } = await supabase
      .from("contracts").select("id").eq("mc_uuid", mc_uuid).eq("league", league).eq("status", "active").maybeSingle();
    if (existingContract) return res.status(400).json({ error: "Player already has an active contract" });

    // Cap check
    const { data: teamContracts } = await supabase
      .from("contracts").select("amount").eq("team_id", teamId).eq("league", league).eq("status", "active");
    const capUsed = (teamContracts ?? []).reduce((s: number, c: any) => s + c.amount, 0);
    if (capUsed + amt > TOTAL_CAP) return res.status(400).json({ error: `Exceeds cap: ${capUsed.toLocaleString()} + ${amt.toLocaleString()} > ${TOTAL_CAP.toLocaleString()}` });

    // Phase signing limit (pending_approval counts too)
    const currentPhase = parseInt(phase) || 1;
    const { data: phaseSignings } = await supabase
      .from("contracts").select("id").eq("team_id", teamId).eq("league", league).eq("phase", currentPhase).in("status", ["active", "pending_approval"]);
    if ((phaseSignings ?? []).length >= MAX_SIGNINGS_PER_PHASE)
      return res.status(400).json({ error: `Already submitted ${MAX_SIGNINGS_PER_PHASE} signings this phase (pending admin approval)` });

    const { data: contract, error } = await supabase
      .from("contracts")
      .insert([{ league, mc_uuid, team_id: teamId, amount: amt, is_two_season: is_two_season ?? false, season: ownerRecord.season ?? null, phase: currentPhase, status: "pending_approval" }])
      .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(contract);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
