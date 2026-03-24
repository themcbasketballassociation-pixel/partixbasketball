import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId } from "../../../lib/ownerAuth";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season, all } = req.query;
    const league = resolveLeague(leagueRaw);

    // all=true → admin only, returns every member's votes
    if (all === "true") {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      let q = supabase.from("board_votes").select("*, board_members(discord_id, name)");
      if (league) q = q.eq("league", league as string);
      if (season) q = q.eq("season", season as string);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    // Otherwise return current user's votes
    const discordId = await getSessionDiscordId(req, res);
    if (!discordId) return;

    // Find board_member record
    let mq = supabase.from("board_members").select("id").eq("discord_id", discordId);
    if (league) mq = mq.eq("league", league as string);
    if (season) mq = mq.eq("season", season as string);
    const { data: members } = await mq;
    if (!members || members.length === 0) return res.status(200).json([]);

    const memberId = members[0].id;
    let q = supabase.from("board_votes").select("*").eq("board_member_id", memberId);
    if (season) q = q.eq("season", season as string);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    // votes: [{vote_type, category, rank, mc_uuid?, team_id?}]
    const { league: leagueRaw, season, votes } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !season || !Array.isArray(votes))
      return res.status(400).json({ error: "league, season, votes[] required" });

    const discordId = await getSessionDiscordId(req, res);
    if (!discordId) return;

    // Verify board membership
    const { data: members } = await supabase
      .from("board_members")
      .select("id")
      .eq("discord_id", discordId)
      .eq("league", league)
      .eq("season", season);
    if (!members || members.length === 0)
      return res.status(403).json({ error: "Not a board member for this league/season" });

    const memberId = members[0].id;

    // Delete existing votes and re-insert (full ballot replacement)
    await supabase.from("board_votes").delete().eq("board_member_id", memberId).eq("season", season);

    if (votes.length === 0) return res.status(200).json({ success: true });

    const rows = votes.map((v: any) => ({
      board_member_id: memberId,
      league,
      season,
      vote_type: v.vote_type,
      category: v.category ?? null,
      rank: v.rank,
      mc_uuid: v.mc_uuid ?? null,
      team_id: v.team_id ?? null,
    }));

    const { error } = await supabase.from("board_votes").insert(rows);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, count: rows.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
