import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";

const eff = (s: {
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null;
}) =>
  (s.points ?? 0) +
  1.2 * ((s.rebounds_off ?? 0) + (s.rebounds_def ?? 0)) +
  1.5 * (s.assists ?? 0) +
  2   * (s.steals ?? 0) +
  2   * (s.blocks ?? 0) -
  (s.turnovers ?? 0);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { game_id } = req.query;
  if (!game_id || typeof game_id !== "string")
    return res.status(400).json({ error: "game_id required" });

  // 1. Fetch the game
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, league, season, home_team_id, away_team_id, home_score, away_score")
    .eq("id", game_id)
    .single();
  if (gameErr || !game) return res.status(404).json({ error: "Game not found" });

  // 2. Fetch stats for this game (with player info)
  const { data: stats, error: statsErr } = await supabase
    .from("game_stats")
    .select("*, players(mc_uuid, mc_username)")
    .eq("game_id", game_id);
  if (statsErr || !stats || stats.length === 0)
    return res.status(200).json(null);

  // 3. Determine the winning team id (null = tie, no mvp from winner)
  const homeScore = game.home_score ?? 0;
  const awayScore = game.away_score ?? 0;
  const winningTeamId: string | null =
    homeScore > awayScore ? game.home_team_id :
    awayScore > homeScore ? game.away_team_id : null;

  // If it's a tie just return the top performer overall
  if (!winningTeamId) {
    const best = [...stats].sort((a, b) => eff(b) - eff(a))[0];
    return res.status(200).json(best ?? null);
  }

  // 4. Fetch player_teams to identify who played for the winning team
  //    Try season-matched first, then fall back to any assignment for the league
  let ptQuery = supabase
    .from("player_teams")
    .select("mc_uuid, team_id")
    .eq("league", game.league)
    .eq("team_id", winningTeamId);
  if (game.season) ptQuery = ptQuery.eq("season", game.season);

  const { data: playerTeams } = await ptQuery;
  const winnerUuids = new Set((playerTeams ?? []).map((pt: { mc_uuid: string }) => pt.mc_uuid));

  // 5. Filter stats to winning team players
  let winnerStats = stats.filter(s => winnerUuids.has(s.mc_uuid));

  // Fallback: if season-matched player_teams returned nothing (old data, no season tag),
  // try without season filter
  if (winnerStats.length === 0 && game.season) {
    const { data: anyPt } = await supabase
      .from("player_teams")
      .select("mc_uuid, team_id")
      .eq("league", game.league)
      .eq("team_id", winningTeamId);
    const anyUuids = new Set((anyPt ?? []).map((pt: { mc_uuid: string }) => pt.mc_uuid));
    winnerStats = stats.filter(s => anyUuids.has(s.mc_uuid));
  }

  // Last resort: if we still couldn't identify winning-team players, use all stats
  const candidates = winnerStats.length > 0 ? winnerStats : stats;

  const mvp = [...candidates].sort((a, b) => eff(b) - eff(a))[0];
  return res.status(200).json(mvp ?? null);
}
