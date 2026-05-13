import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

// POST /api/admin/cleanup-game-stats?league=mba&season=Season+7
// Deletes game_stats rows where the player is not on either team for that game's season.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw, season } = req.query;
  const league = resolveLeague(leagueRaw as string);
  if (!league || !season) return res.status(400).json({ error: "league and season required" });

  // 1. Get all games for this league + season
  const { data: games, error: gErr } = await supabase
    .from("games")
    .select("id, home_team_id, away_team_id, season")
    .eq("league", league)
    .eq("season", season as string);
  if (gErr) return res.status(500).json({ error: gErr.message });
  if (!games || games.length === 0) return res.status(200).json({ removed: 0, details: [] });

  const gameIds = games.map(g => g.id);
  const gameMap = new Map(games.map(g => [g.id, g]));

  // 2. Get all game_stats for those games
  const { data: stats, error: sErr } = await supabase
    .from("game_stats")
    .select("id, game_id, mc_uuid")
    .in("game_id", gameIds);
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (!stats || stats.length === 0) return res.status(200).json({ removed: 0, details: [] });

  // 3. Get all player_teams for this league + season
  const { data: pt, error: ptErr } = await supabase
    .from("player_teams")
    .select("mc_uuid, team_id")
    .eq("league", league)
    .eq("season", season as string);
  if (ptErr) return res.status(500).json({ error: ptErr.message });

  // Build a set of "mc_uuid|team_id" for fast lookup
  const rosterSet = new Set((pt ?? []).map(r => `${r.mc_uuid}|${r.team_id}`));

  // 4. Find invalid stats: player not on home OR away team
  const invalidIds: string[] = [];
  const details: { id: string; game_id: string; mc_uuid: string }[] = [];
  for (const s of stats) {
    const game = gameMap.get(s.game_id);
    if (!game) continue;
    const onHome = rosterSet.has(`${s.mc_uuid}|${game.home_team_id}`);
    const onAway = rosterSet.has(`${s.mc_uuid}|${game.away_team_id}`);
    if (!onHome && !onAway) {
      invalidIds.push(s.id);
      details.push({ id: s.id, game_id: s.game_id, mc_uuid: s.mc_uuid });
    }
  }

  if (invalidIds.length === 0) return res.status(200).json({ removed: 0, details: [] });

  // 5. Delete invalid rows
  const { error: delErr } = await supabase
    .from("game_stats")
    .delete()
    .in("id", invalidIds);
  if (delErr) return res.status(500).json({ error: delErr.message });

  return res.status(200).json({ removed: invalidIds.length, details });
}
