import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

// POST /api/admin/cleanup-game-stats?league=mba&season=Season+7
// Uses CONTRACTS (status=active) as the authoritative roster — same as the Owner Portal.
// Deletes game_stats rows where the player has no active contract for either team in that game.
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
  if (!games || games.length === 0) return res.status(200).json({ removed: 0, synced: 0, details: [] });

  const gameIds = games.map(g => g.id);
  const gameMap = new Map(games.map(g => [g.id, g]));

  // 2. Get all game_stats for those games
  const { data: stats, error: sErr } = await supabase
    .from("game_stats")
    .select("id, game_id, mc_uuid")
    .in("game_id", gameIds);
  if (sErr) return res.status(500).json({ error: sErr.message });

  // 3. Get active contracts for this season (source of truth — same as Owner Portal)
  const { data: contracts, error: cErr } = await supabase
    .from("contracts")
    .select("mc_uuid, team_id, season")
    .eq("league", league)
    .eq("season", season as string)
    .eq("status", "active");
  if (cErr) return res.status(500).json({ error: cErr.message });

  // Also get player_teams for this season as a secondary source
  const { data: pt } = await supabase
    .from("player_teams")
    .select("mc_uuid, team_id")
    .eq("league", league)
    .eq("season", season as string);

  // Union contracts + player_teams into one roster set
  const rosterSet = new Set<string>();
  for (const c of (contracts ?? [])) rosterSet.add(`${c.mc_uuid}|${c.team_id}`);
  for (const p of (pt ?? [])) rosterSet.add(`${p.mc_uuid}|${p.team_id}`);

  // 4. Sync player_teams from contracts (insert missing entries)
  let synced = 0;
  const ptSet = new Set((pt ?? []).map(p => `${p.mc_uuid}|${p.team_id}`));
  const toInsert = (contracts ?? [])
    .filter(c => !ptSet.has(`${c.mc_uuid}|${c.team_id}`))
    .map(c => ({ mc_uuid: c.mc_uuid, team_id: c.team_id, league, season: season as string }));
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("player_teams").upsert(toInsert, { onConflict: "mc_uuid,league" });
    if (!insErr) synced = toInsert.length;
  }

  if (!stats || stats.length === 0) return res.status(200).json({ removed: 0, synced, details: [] });

  // 5. Find invalid stats: player not on home OR away team (per contracts OR player_teams)
  const invalidIds: string[] = [];
  const details: { game_id: string; mc_uuid: string }[] = [];
  for (const s of stats) {
    const game = gameMap.get(s.game_id);
    if (!game) continue;
    const onHome = rosterSet.has(`${s.mc_uuid}|${game.home_team_id}`);
    const onAway = rosterSet.has(`${s.mc_uuid}|${game.away_team_id}`);
    if (!onHome && !onAway) {
      invalidIds.push(s.id);
      details.push({ game_id: s.game_id, mc_uuid: s.mc_uuid });
    }
  }

  if (invalidIds.length === 0) return res.status(200).json({ removed: 0, synced, details: [] });

  // 6. Delete invalid rows
  const { error: delErr } = await supabase
    .from("game_stats")
    .delete()
    .in("id", invalidIds);
  if (delErr) return res.status(500).json({ error: delErr.message });

  return res.status(200).json({ removed: invalidIds.length, synced, details });
}
