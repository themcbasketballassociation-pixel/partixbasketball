import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";
import { getSessionDiscordId, isAdminId } from "../../../lib/ownerAuth";

const MAX_CAP_SPACE_TRADE = 2000;
const MAX_RETENTION_PCT = 0.1; // 10%
const MAX_RETENTIONS_PER_TEAM = 3;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, team_id, status } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
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
      .order("proposed_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (status) query = query.eq("status", status as string);
    if (team_id)
      query = query.or(`proposing_team_id.eq.${team_id},receiving_team_id.eq.${team_id}`);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST: owner (or admin) proposes a trade
  if (req.method === "POST") {
    const discordId = await getSessionDiscordId(req, res);
    if (!discordId) return;

    const { league: leagueRaw, proposing_team_id, receiving_team_id, assets, notes } = req.body;
    // assets: Array<{ from_team_id, contract_id, retention_amount? }>
    const league = resolveLeague(leagueRaw);
    if (!league || !proposing_team_id || !receiving_team_id || !Array.isArray(assets) || assets.length === 0)
      return res.status(400).json({ error: "league, proposing_team_id, receiving_team_id, assets required" });

    // Auth: admin or owner of proposing team
    if (!isAdminId(discordId)) {
      const { data: owner } = await supabase
        .from("team_owners")
        .select("team_id")
        .eq("discord_id", discordId)
        .eq("team_id", proposing_team_id)
        .maybeSingle();
      if (!owner) return res.status(403).json({ error: "Not authorized to propose this trade" });
    }

    // ── Validate assets ──────────────────────────────────────────────────────
    let proposerRetentionTotal = 0;
    let receiverRetentionTotal = 0;

    for (const asset of assets) {
      if (!asset.contract_id || !asset.from_team_id)
        return res.status(400).json({ error: "Each asset requires from_team_id and contract_id" });

      const retention = Number(asset.retention_amount ?? 0);

      if (retention > 0) {
        // Fetch contract
        const { data: contract } = await supabase
          .from("contracts")
          .select("amount, team_id")
          .eq("id", asset.contract_id)
          .maybeSingle();
        if (!contract) return res.status(400).json({ error: `Contract ${asset.contract_id} not found` });
        if (contract.team_id !== asset.from_team_id)
          return res.status(400).json({ error: "Contract does not belong to the sending team" });

        const maxRetention = Math.min(
          Math.floor(contract.amount * MAX_RETENTION_PCT),
          MAX_CAP_SPACE_TRADE
        );
        if (retention > maxRetention)
          return res.status(400).json({
            error: `Retention on contract ${asset.contract_id} exceeds max (${maxRetention} = 10% of ${contract.amount}, capped at ${MAX_CAP_SPACE_TRADE})`,
          });

        // Check team's current active retention count
        const { data: activeRetentions } = await supabase
          .from("cap_retentions")
          .select("id")
          .eq("retaining_team_id", asset.from_team_id)
          .eq("status", "active");
        if ((activeRetentions ?? []).length >= MAX_RETENTIONS_PER_TEAM)
          return res.status(400).json({ error: `Team already has ${MAX_RETENTIONS_PER_TEAM} active cap retentions` });

        if (asset.from_team_id === proposing_team_id) proposerRetentionTotal += retention;
        else receiverRetentionTotal += retention;
      }
    }

    if (proposerRetentionTotal > MAX_CAP_SPACE_TRADE)
      return res.status(400).json({ error: `Proposing team cannot retain more than ${MAX_CAP_SPACE_TRADE} total` });
    if (receiverRetentionTotal > MAX_CAP_SPACE_TRADE)
      return res.status(400).json({ error: `Receiving team cannot retain more than ${MAX_CAP_SPACE_TRADE} total` });

    // ── Create trade ─────────────────────────────────────────────────────────
    const { data: trade, error: tradeErr } = await supabase
      .from("trade_proposals")
      .insert([{ league, proposing_team_id, receiving_team_id, notes: notes ?? null, status: "pending" }])
      .select()
      .single();
    if (tradeErr) return res.status(500).json({ error: tradeErr.message });

    const assetRows = assets.map((a: any) => ({
      trade_id: trade.id,
      from_team_id: a.from_team_id,
      contract_id: a.contract_id,
      retention_amount: Number(a.retention_amount ?? 0),
    }));
    const { error: assetErr } = await supabase.from("trade_assets").insert(assetRows);
    if (assetErr) return res.status(500).json({ error: assetErr.message });

    return res.status(200).json(trade);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
