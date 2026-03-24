import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId } from "../../../lib/ownerAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, day_num, season_seed } = req.query;
    const league = resolveLeague(leagueRaw);
    if (!league || !day_num || !season_seed)
      return res.status(400).json({ error: "league, day_num, season_seed required" });

    // Get all votes for this day
    const { data, error } = await supabase
      .from("sbc_responses")
      .select("p1_uuid, p2_uuid, p3_uuid, v1, v2, v3")
      .eq("league", league)
      .eq("day_num", parseInt(day_num as string))
      .eq("season_seed", parseInt(season_seed as string));

    if (error) return res.status(500).json({ error: error.message });

    // Aggregate: for each of p1,p2,p3 tally start/bench/cut
    const tally = (uuid: string, votes: typeof data, pos: "v1" | "v2" | "v3") => {
      const s = votes?.filter(r => r.p1_uuid === uuid || r.p2_uuid === uuid || r.p3_uuid === uuid) ?? [];
      const counts = { start: 0, bench: 0, cut: 0 };
      for (const row of (data ?? [])) {
        const vote = pos === "v1" ? row.v1 : pos === "v2" ? row.v2 : row.v3;
        if (vote === "start" || vote === "bench" || vote === "cut") counts[vote as keyof typeof counts]++;
      }
      return counts;
    };

    // Build per-player aggregates: match by position in votes
    const totalVotes = (data ?? []).length;
    const agg = { total: totalVotes, p1: { start: 0, bench: 0, cut: 0 }, p2: { start: 0, bench: 0, cut: 0 }, p3: { start: 0, bench: 0, cut: 0 } };
    for (const row of (data ?? [])) {
      (agg.p1 as any)[row.v1] = ((agg.p1 as any)[row.v1] ?? 0) + 1;
      (agg.p2 as any)[row.v2] = ((agg.p2 as any)[row.v2] ?? 0) + 1;
      (agg.p3 as any)[row.v3] = ((agg.p3 as any)[row.v3] ?? 0) + 1;
    }

    // Check if current user already voted
    const discordId = await getSessionDiscordId(req, res).catch(() => null);
    let myVote: { v1: string; v2: string; v3: string } | null = null;
    if (discordId) {
      const { data: existing } = await supabase
        .from("sbc_responses")
        .select("v1, v2, v3")
        .eq("discord_id", discordId)
        .eq("league", league)
        .eq("day_num", parseInt(day_num as string))
        .eq("season_seed", parseInt(season_seed as string))
        .maybeSingle();
      myVote = existing ?? null;
    }

    return res.status(200).json({ agg, myVote });
  }

  if (req.method === "POST") {
    const { league: leagueRaw, day_num, season_seed, p1_uuid, p2_uuid, p3_uuid, v1, v2, v3 } = req.body;
    const league = resolveLeague(leagueRaw);

    if (!league || !day_num || !season_seed || !p1_uuid || !p2_uuid || !p3_uuid || !v1 || !v2 || !v3)
      return res.status(400).json({ error: "Missing required fields" });

    const validVote = (v: string) => ["start", "bench", "cut"].includes(v);
    if (!validVote(v1) || !validVote(v2) || !validVote(v3))
      return res.status(400).json({ error: "Invalid vote values" });
    if (new Set([v1, v2, v3]).size !== 3)
      return res.status(400).json({ error: "Must use Start, Bench, and Cut exactly once each" });

    const discordId = await getSessionDiscordId(req, res);
    if (!discordId) return;

    const { error } = await supabase.from("sbc_responses").upsert(
      [{ discord_id: discordId, league, day_num: parseInt(day_num), season_seed: parseInt(season_seed), p1_uuid, p2_uuid, p3_uuid, v1, v2, v3 }],
      { onConflict: "discord_id,league,day_num,season_seed" }
    );
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
