import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireOwner } from "../../../lib/ownerAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { contract_id, league: leagueSlug } = req.body;
  if (!contract_id || !leagueSlug) return res.status(400).json({ error: "contract_id and league required" });

  const dbLeague = resolveLeague(leagueSlug);
  const owner = await requireOwner(req, res, dbLeague);
  if (!owner) return;

  // Verify this contract belongs to the owner's team
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, team_id, status, mc_uuid, amount, players(mc_username), teams(name, abbreviation)")
    .eq("id", contract_id)
    .eq("team_id", owner.teamId)
    .single();

  if (error || !contract) return res.status(403).json({ error: "Contract not found or not on your team" });
  if (contract.status !== "active") return res.status(400).json({ error: "Can only portal active contracts" });

  const { error: updateError } = await supabase
    .from("contracts")
    .update({ status: "portal_requested" })
    .eq("id", contract_id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  return res.status(200).json({ success: true, message: "Portal request submitted — awaiting admin approval." });
}
