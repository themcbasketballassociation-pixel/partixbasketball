import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId, isAdminId } from "../../../lib/ownerAuth";
import { sendWebhook, getWebhookUrl } from "../../../lib/discordWebhook";

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
          id, from_team_id, contract_id, pick_id, retention_amount,
          contracts(id, mc_uuid, amount, is_two_season, players(mc_uuid, mc_username)),
          draft_picks(id, season, round, pick_number, original_team:teams!draft_picks_original_team_id_fkey(id, name, abbreviation)),
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
      .select(`
        *,
        proposing_team:teams!trade_proposals_proposing_team_id_fkey(id, name, abbreviation),
        receiving_team:teams!trade_proposals_receiving_team_id_fkey(id, name, abbreviation),
        trade_assets(
          id, from_team_id, contract_id, pick_id, retention_amount,
          contracts(mc_uuid, amount, players(mc_uuid, mc_username)),
          draft_picks(id, season, round, original_team:teams!draft_picks_original_team_id_fkey(id, abbreviation))
        )
      `)
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
        // Determine the receiving team for this asset
        const receivingTeamId =
          asset.from_team_id === trade.proposing_team_id
            ? trade.receiving_team_id
            : trade.proposing_team_id;

        // Draft pick transfer
        if (asset.pick_id) {
          const { error: pickErr } = await supabase
            .from("draft_picks")
            .update({ current_team_id: receivingTeamId })
            .eq("id", asset.pick_id);
          if (pickErr) return res.status(500).json({ error: pickErr.message });
          continue;
        }

        // Retention-only asset (no contract, no pick)
        if (!asset.contract_id) {
          const retention = Number(asset.retention_amount ?? 0);
          if (retention > 0) {
            // Sending team absorbs the cost; receiving team gets equal cap relief (negative)
            await supabase.from("cap_retentions").insert([
              {
                league: trade.league,
                retaining_team_id: asset.from_team_id,
                mc_uuid: null,
                original_contract_id: null,
                retention_amount: retention,
                status: "active",
              },
              {
                league: trade.league,
                retaining_team_id: receivingTeamId,
                mc_uuid: null,
                original_contract_id: null,
                retention_amount: -retention,
                status: "active",
              },
            ]);
          }
          continue;
        }

        // Contract transfer
        const contract = asset.contracts;
        if (!contract || !asset.contract_id) continue;

        const retention = Number(asset.retention_amount ?? 0);
        const newAmount = contract.amount - retention;

        const { error: contractErr } = await supabase
          .from("contracts")
          .update({ team_id: receivingTeamId, amount: newAmount })
          .eq("id", asset.contract_id);
        if (contractErr) return res.status(500).json({ error: contractErr.message });

        // Keep player_teams in sync with the contract's new team
        await supabase
          .from("player_teams")
          .upsert([{ mc_uuid: contract.mc_uuid, team_id: receivingTeamId, league: trade.league }], { onConflict: "mc_uuid,league" });

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

      // Post trade approval to Discord transactions channel
      const leagueDisplay = trade.league === "pba" ? "MBA" : trade.league === "pbgl" ? "MBGL" : trade.league === "pcaa" ? "MCAA" : trade.league.toUpperCase();
      const propAbb: string = (trade.proposing_team as any)?.abbreviation ?? "?";
      const recvAbb: string = (trade.receiving_team as any)?.abbreviation ?? "?";

      const fmtAsset = (a: any): string => {
        if (a.pick_id && a.draft_picks) {
          const orig: string = a.draft_picks.original_team?.abbreviation ?? "?";
          return `S${a.draft_picks.season} R${a.draft_picks.round} (${orig})`;
        }
        if (a.contract_id && a.contracts) {
          const name: string = a.contracts.players?.mc_username ?? "?";
          const amt: number = a.contracts.amount;
          const ret = Number(a.retention_amount ?? 0);
          return `${name} ($${amt.toLocaleString()})${ret > 0 ? ` ret. $${ret.toLocaleString()}` : ""}`;
        }
        const ret = Number(a.retention_amount ?? 0);
        return ret > 0 ? `$${ret.toLocaleString()} cash retention` : "?";
      };

      const propAssets = (trade.trade_assets ?? []).filter((a: any) => a.from_team_id === trade.proposing_team_id);
      const recvAssets = (trade.trade_assets ?? []).filter((a: any) => a.from_team_id === trade.receiving_team_id);
      const propLine = propAssets.length ? `**${propAbb} sends:** ${propAssets.map(fmtAsset).join(", ")}` : `**${propAbb} sends:** nothing`;
      const recvLine = recvAssets.length ? `**${recvAbb} sends:** ${recvAssets.map(fmtAsset).join(", ")}` : `**${recvAbb} sends:** nothing`;
      const noteStr = admin_note ? `\n> ${admin_note}` : "";

      await sendWebhook(
        getWebhookUrl(trade.league, "transaction"),
        `✅ **[${leagueDisplay}] Trade Approved**\n${propLine}\n${recvLine}${noteStr}`
      );

      return res.status(200).json(data);
    }

    // ── Admin repost ─────────────────────────────────────────────────────────
    if (action === "repost") {
      if (!isAdmin) return res.status(403).json({ error: "Admin only" });

      const leagueDisplay = trade.league === "pba" ? "MBA" : trade.league === "pbgl" ? "MBGL" : trade.league === "pcaa" ? "MCAA" : trade.league.toUpperCase();
      const propAbb: string = (trade.proposing_team as any)?.abbreviation ?? "?";
      const recvAbb: string = (trade.receiving_team as any)?.abbreviation ?? "?";

      const fmtAsset = (a: any): string => {
        if (a.pick_id && a.draft_picks) {
          const orig: string = a.draft_picks.original_team?.abbreviation ?? "?";
          return `S${a.draft_picks.season} R${a.draft_picks.round} (${orig})`;
        }
        if (a.contract_id && a.contracts) {
          const name: string = a.contracts.players?.mc_username ?? "?";
          const amt: number = a.contracts.amount;
          const ret = Number(a.retention_amount ?? 0);
          return `${name} ($${amt.toLocaleString()})${ret > 0 ? ` ret. $${ret.toLocaleString()}` : ""}`;
        }
        const ret = Number(a.retention_amount ?? 0);
        return ret > 0 ? `$${ret.toLocaleString()} cash retention` : "?";
      };

      const propAssets = (trade.trade_assets ?? []).filter((a: any) => a.from_team_id === trade.proposing_team_id);
      const recvAssets = (trade.trade_assets ?? []).filter((a: any) => a.from_team_id === trade.receiving_team_id);
      const propLine = propAssets.length ? `**${propAbb} sends:** ${propAssets.map(fmtAsset).join(", ")}` : `**${propAbb} sends:** nothing`;
      const recvLine = recvAssets.length ? `**${recvAbb} sends:** ${recvAssets.map(fmtAsset).join(", ")}` : `**${recvAbb} sends:** nothing`;
      const noteStr = trade.admin_note ? `\n> ${trade.admin_note}` : "";

      await sendWebhook(
        getWebhookUrl(trade.league, "transaction"),
        `✅ **[${leagueDisplay}] Trade Approved**\n${propLine}\n${recvLine}${noteStr}`
      );

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Invalid action. Use: accept, reject, cancel, approve, deny, repost" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
