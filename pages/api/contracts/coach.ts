import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireOwner } from "../../../lib/ownerAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

const MAX_COACHES = 4;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { mc_username, league: leagueSlug } = req.body;
  if (!mc_username || !leagueSlug) return res.status(400).json({ error: "mc_username and league required" });

  const dbLeague = resolveLeague(leagueSlug);
  const owner = await requireOwner(req, res, dbLeague);
  if (!owner) return;

  // Look up or create the player record by username
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("mc_uuid, mc_username")
    .ilike("mc_username", mc_username)
    .maybeSingle();

  if (playerErr) return res.status(500).json({ error: playerErr.message });
  if (!player) return res.status(404).json({ error: `Player "${mc_username}" not found. Make sure they're registered in the system.` });

  // Check coach limit (active + pending)
  const { data: existingCoaches } = await supabase
    .from("contracts")
    .select("id")
    .eq("team_id", owner.teamId)
    .eq("league", dbLeague)
    .eq("phase", 0)
    .in("status", ["active", "pending_approval"]);

  if ((existingCoaches ?? []).length >= MAX_COACHES)
    return res.status(400).json({ error: `You already have ${MAX_COACHES} coaches (the maximum).` });

  // Check not already a coach on this team
  const { data: alreadyCoach } = await supabase
    .from("contracts")
    .select("id")
    .eq("team_id", owner.teamId)
    .eq("league", dbLeague)
    .eq("mc_uuid", player.mc_uuid)
    .eq("phase", 0)
    .in("status", ["active", "pending_approval"])
    .maybeSingle();

  if (alreadyCoach) return res.status(400).json({ error: `${player.mc_username} is already a coach on your team.` });

  const { data: contract, error } = await supabase
    .from("contracts")
    .insert([{
      league: dbLeague,
      mc_uuid: player.mc_uuid,
      team_id: owner.teamId,
      amount: 0,
      is_two_season: false,
      season: owner.season ?? null,
      phase: 0, // phase 0 = coach
      status: "pending_approval",
    }])
    .select("*, players(mc_uuid, mc_username), teams(id, name, abbreviation)")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(contract);
}
