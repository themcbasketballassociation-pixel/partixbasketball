import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * GET /api/stats/seasons?league=pba
 * Returns every raw stat row (one per player per season) without aggregating.
 * Used by minigames to check single-season thresholds (e.g. "Had a 30+ PPG season").
 * Also merges in seasons from the games table so that a new season appears as soon
 * as any game is scheduled, even before stats are entered.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const { league: leagueRaw } = req.query;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  const [statsResult, gamesResult] = await Promise.all([
    supabase
      .from("stats")
      .select("mc_uuid, season, gp, ppg, rpg, apg, spg, bpg")
      .eq("league", league as string),
    supabase
      .from("games")
      .select("season")
      .eq("league", league as string)
      .not("season", "is", null),
  ]);

  if (statsResult.error) return res.status(500).json({ error: statsResult.error.message });

  const statsData = statsResult.data ?? [];

  // Collect seasons from games that aren't already in stats rows
  const existingSeasons = new Set(statsData.map((r) => r.season));
  const gameSeasons = [...new Set((gamesResult.data ?? []).map((g) => g.season).filter(Boolean))];
  const extraSeasons = gameSeasons.filter((s) => !existingSeasons.has(s));

  // Append placeholder rows for seasons that only exist in games so far
  const extra = extraSeasons.map((s) => ({ mc_uuid: null, season: s, gp: 0, ppg: null, rpg: null, apg: null, spg: null, bpg: null }));

  return res.status(200).json([...statsData, ...extra]);
}
