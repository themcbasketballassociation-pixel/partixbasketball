import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";
import { getSessionDiscordId, isAdminId } from "../../../lib/ownerAuth";
// webhook only fires on approve — not on propose

const MAX_RETENTION = 1000; // flat max per trade and per team total

const TRADE_ASSETS_SELECT = `
  id, from_team_id, contract_id, pick_id, retention_amount,
  contracts(id, mc_uuid, amount, is_two_season, players(mc_uuid, mc_username)),
  draft_picks(id, season, round, pick_number, original_team:teams!draft_picks_original_team_id_fkey(id, name, abbreviation)),
  from_team:teams!trade_assets_from_team_id_fkey(id, name, abbreviation)
`;

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
        trade_assets(${TRADE_ASSETS_SELECT})
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
  // assets: Array<{ from_team_id, contract_id?, pick_id?, retention_amount? }>
  if (req.method === "POST") {
    const discordId = await getSessionDiscordId(req, res);
    if (!discordId) return;

    const { league: leagueRaw, proposing_team_id, receiving_team_id, assets, notes } = req.body;
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
      const retention = Number(asset.retention_amount ?? 0);
      if (!asset.from_team_id || (!asset.contract_id && !asset.pick_id && retention <= 0))
        return res.status(400).json({ error: "Each asset requires from_team_id and either contract_id, pick_id, or retention_amount" });

      // Draft pick asset — validate ownership + 2-season rule, no retention allowed
      if (asset.pick_id) {
        const { data: pick } = await supabase
          .from("draft_picks")
          .select("id, current_team_id, status, season")
          .eq("id", asset.pick_id)
          .maybeSingle();
        if (!pick) return res.status(400).json({ error: `Draft pick ${asset.pick_id} not found` });
        if (pick.status !== "active") return res.status(400).json({ error: `Draft pick ${asset.pick_id} is not active` });
        if (pick.current_team_id !== asset.from_team_id)
          return res.status(400).json({ error: `Draft pick ${asset.pick_id} is not owned by the sending team` });

        // 2-season rule: find current base season from the earliest picks in this league
        const { data: basePicks } = await supabase
          .from("draft_picks")
          .select("season")
          .eq("league", league as string)
          .eq("status", "active")
          .order("season")
          .limit(1);
        if (basePicks?.length) {
          const baseNum = parseInt(basePicks[0].season.match(/\d+/)?.[0] ?? "0");
          const pickNum = parseInt((pick.season as string).match(/\d+/)?.[0] ?? "0");
          if (pickNum > baseNum + 1) {
            return res.status(400).json({
              error: `Cannot trade a pick more than 2 seasons in the future (max: Season ${baseNum + 1})`,
            });
          }
        }
        continue; // no retention validation for picks
      }

      // Retention-only asset (no contract, no pick — standalone cap cash)
      if (!asset.contract_id) {
        if (retention <= 0 || retention > MAX_RETENTION)
          return res.status(400).json({ error: `Retention amount must be between 1 and ${MAX_RETENTION.toLocaleString()}` });


        const { data: activeRetentions } = await supabase
          .from("cap_retentions").select("retention_amount").eq("retaining_team_id", asset.from_team_id).eq("status", "active");
        const existingRetTotal = (activeRetentions ?? []).reduce((s: number, r: any) => s + r.retention_amount, 0);
        if (existingRetTotal + retention > MAX_RETENTION)
          return res.status(400).json({ error: `Team's total active retention cannot exceed ${MAX_RETENTION.toLocaleString()} (currently has ${existingRetTotal.toLocaleString()})` });

        if (asset.from_team_id === proposing_team_id) proposerRetentionTotal += retention;
        else receiverRetentionTotal += retention;
        continue;
      }

      // Contract asset
      if (retention > 0) {
        if (retention > MAX_RETENTION)
          return res.status(400).json({ error: `Retention cannot exceed ${MAX_RETENTION.toLocaleString()}` });

        const { data: contract } = await supabase
          .from("contracts")
          .select("team_id")
          .eq("id", asset.contract_id)
          .maybeSingle();
        if (!contract) return res.status(400).json({ error: `Contract ${asset.contract_id} not found` });
        if (contract.team_id !== asset.from_team_id)
          return res.status(400).json({ error: "Contract does not belong to the sending team" });

        // Team total active retention cannot exceed 1,000
        const { data: activeRetentions } = await supabase
          .from("cap_retentions")
          .select("retention_amount")
          .eq("retaining_team_id", asset.from_team_id)
          .eq("status", "active");
        const existingRetTotal = (activeRetentions ?? []).reduce((s: number, r: any) => s + r.retention_amount, 0);
        if (existingRetTotal + retention > MAX_RETENTION)
          return res.status(400).json({ error: `Team's total active retention cannot exceed ${MAX_RETENTION.toLocaleString()} (currently has ${existingRetTotal.toLocaleString()})` });

        if (asset.from_team_id === proposing_team_id) proposerRetentionTotal += retention;
        else receiverRetentionTotal += retention;
      }
    }

    if (proposerRetentionTotal > MAX_RETENTION)
      return res.status(400).json({ error: `Proposing team cannot retain more than ${MAX_RETENTION.toLocaleString()} total in this trade` });
    if (receiverRetentionTotal > MAX_RETENTION)
      return res.status(400).json({ error: `Receiving team cannot retain more than ${MAX_RETENTION.toLocaleString()} total in this trade` });

    // Get proposer display name for admin tracking
    const { getServerSession } = await import("next-auth/next");
    const { authOptions } = await import("../auth/[...nextauth]");
    const tradeSession = await getServerSession(req, res, authOptions as any);
    const proposerName: string | null = ((tradeSession as any)?.user as any)?.name ?? null;

    // ── Create trade ─────────────────────────────────────────────────────────
    const { data: trade, error: tradeErr } = await supabase
      .from("trade_proposals")
      .insert([{ league, proposing_team_id, receiving_team_id, notes: notes ?? null, status: "pending", proposed_by_discord_id: discordId, proposed_by_name: proposerName }])
      .select()
      .single();
    if (tradeErr) return res.status(500).json({ error: tradeErr.message });

    const assetRows = assets.map((a: any) => {
      const row: Record<string, any> = {
        trade_id: trade.id,
        from_team_id: a.from_team_id,
        retention_amount: Number(a.retention_amount ?? 0),
      };
      if (a.contract_id) row.contract_id = a.contract_id;
      if (a.pick_id) row.pick_id = a.pick_id;
      return row;
    });
    const { error: assetErr } = await supabase.from("trade_assets").insert(assetRows);
    if (assetErr) return res.status(500).json({ error: assetErr.message });

    return res.status(200).json(trade);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
