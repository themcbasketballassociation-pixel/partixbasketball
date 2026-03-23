import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

function seasonNum(s: string): number {
  return parseInt(s.match(/\d+/)?.[0] ?? "0");
}

// POST /api/draft-picks/seed
// Generates 2 rounds of picks for every team in the league for `base_season` and `base_season+1`.
// Skips any picks that already exist (by original_team_id + season + round).
// Validates that all picks being traded are at most 1 season ahead of base_season.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { league: leagueRaw, base_season } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!league || !base_season) return res.status(400).json({ error: "league and base_season required" });

    const baseNum = seasonNum(base_season as string);
    if (!baseNum) return res.status(400).json({ error: "Invalid base_season (expected e.g. 'Season 7')" });

    const seasons = [`Season ${baseNum}`, `Season ${baseNum + 1}`];

    const { data: teams, error: teamsErr } = await supabase
      .from("teams")
      .select("id")
      .eq("league", league);
    if (teamsErr) return res.status(500).json({ error: teamsErr.message });
    if (!teams?.length) return res.status(400).json({ error: "No teams found for this league" });

    // Check which picks already exist
    const { data: existing } = await supabase
      .from("draft_picks")
      .select("original_team_id, season, round")
      .eq("league", league)
      .in("season", seasons);

    const existingSet = new Set(
      (existing ?? []).map(e => `${e.original_team_id}:${e.season}:${e.round}`)
    );

    const toCreate: object[] = [];
    for (const team of teams) {
      for (const season of seasons) {
        for (const round of [1, 2]) {
          const key = `${team.id}:${season}:${round}`;
          if (!existingSet.has(key)) {
            toCreate.push({ league, season, round, original_team_id: team.id, current_team_id: team.id, status: "active" });
          }
        }
      }
    }

    if (toCreate.length === 0)
      return res.status(200).json({ created: 0, skipped: existing?.length ?? 0, message: "All picks already exist" });

    const { error: insertErr } = await supabase.from("draft_picks").insert(toCreate);
    if (insertErr) return res.status(500).json({ error: insertErr.message });

    return res.status(200).json({
      created: toCreate.length,
      skipped: existingSet.size,
      seasons,
      teams: teams.length,
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
