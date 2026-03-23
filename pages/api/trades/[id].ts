import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId, isAdminId } from "../../../lib/ownerAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("trade_proposals")
      .select(`
        *,
        proposing_team:teams!trade_proposals_proposing_team_id_fkey(id, name, abbreviation, color2),
        receiving_team:teams!trade_proposals_receiving_team_id_fkey(id, name, abbreviation, color2),
        trade_assets(
          id, from_team_id, contract_id, retention_amount,
          contracts(id, mc_uuid, amount, is_two_season, players(mc_uuid, mc_username)),
          from_team:teams!trade_assets_from_team_id_fkey(id, name, abbreviation)
        )
      `)
      .eq("id", id)
      .single();
    if (error) return res.status(404).json({ error: "Trade not found" });
    return res.status(200).json(data);
  }

  if (req.method === "PUT") {
    const discordId = await getSessionDiscordId(req, res);
    if (!discordId) return;

    const { action, admin_note, winner_team_id } = req.body;
    // action: "accept" | "reject" | "cancel" | "approve" | "deny"

    const { data: trade, error: fetchErr } = await supabase
      .from("trade_proposals")
      .select("*, trade_assets(id, from_team_id, contract_id, retention_amount, contracts(mc_uuid, amount))")
      .eq("id", id)
      .single();
    if (fetchErr || !trade) return res.status(404).json({ error: "Trade not found" });

    const isAdmin = isAdminId(discordId);

    // ── Owner actions ────────────────────────────────────────────────────────
    if (action === "accept" || action === "reject" || action === "cancel") {
      if (!isAdmin) {
        const { data: owner } = await supabase
          .from("team_owners")
          .select("team_id")
          .eq("discord_id", discordId)
          .in("team_id", [trade.proposing_team_id, trade.receiving_team_id])
          .maybeSingle();
        if (!owner) return res.status(403).json({ error: "Not authorized" });
        // Only receiving team can accept/reject; proposing team can cancel
        if (action === "cancel" && owner.team_id !== trade.proposing_team_id)
          return res.status(403).json({ error: "Only the proposing team can cancel" });
        if ((action === "accept" || action === "reject") && owner.team_id !== trade.receiving_team_id)
          return res.status(403).json({ error: "Only the receiving team can accept/reject" });
      }

      const newStatus = action === "accept" ? "admin_review" : action === "reject" ? "rejected" : "cancelled";
      const { data, error } = await supabase
        .from("trade_proposals")
        .update({
          status: newStatus,
          resolved_at: newStatus !== "admin_review" ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // ── Admin-only actions ───────────────────────────────────────────────────
    if (action === "approve" || action === "deny") {
      if (!isAdmin) return res.status(403).json({ error: "Admin only" });

      if (action === "deny") {
        const { data, error } = await supabase
          .from("trade_proposals")
          .update({ status: "denied", resolved_at: new Date().toISOString(), admin_note: admin_note ?? null })
          .eq("id", id)
          .select()
          .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
      }

      // approve: execute the trade
      for (const asset of trade.trade_assets ?? []) {
        const contract = asset.contracts;
        if (!contract || !asset.contract_id) continue;

        // Determine the receiving team for this asset
        const receivingTeamId =
          asset.from_team_id === trade.proposing_team_id
            ? trade.receiving_team_id
            : trade.proposing_team_id;

        const retention = Number(asset.retention_amount ?? 0);
        const newAmount = contract.amount - retention;

        // Move contract + apply retention reduction
        const { error: contractErr } = await supabase
          .from("contracts")
          .update({ team_id: receivingTeamId, amount: newAmount })
          .eq("id", asset.contract_id);
        if (contractErr) return res.status(500).json({ error: contractErr.message });

        // Record cap retention if any
        if (retention > 0) {
          await supabase.from("cap_retentions").insert([{
            league: trade.league,
            retaining_team_id: asset.from_team_id,
            mc_uuid: contract.mc_uuid,
            original_contract_id: asset.contract_id,
            retention_amount: retention,
            status: "active",
          }]);
        }
      }

      const { data, error } = await supabase
        .from("trade_proposals")
        .update({ status: "approved", resolved_at: new Date().toISOString(), admin_note: admin_note ?? null })
        .eq("id", id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: "Invalid action. Use: accept, reject, cancel, approve, deny" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
