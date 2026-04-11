import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

type TeamRow = { id: string; name: string; abbreviation: string; logo_url: string | null };
type GameRow = {
  id: string; home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
};
type StatRow = {
  game_id: string; mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null;
  turnovers: number | null; fg_made: number | null; fg_attempted: number | null;
};
type PTRow = { mc_uuid: string; team_id: string };

type TeamAccum = {
  gp: number;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number;
  opp_pts: number; opp_reb: number; opp_ast: number; opp_stl: number;
  opp_blk: number; opp_tov: number; opp_fgm: number; opp_fga: number;
};

function blank(): TeamAccum {
  return { gp:0, pts:0, reb:0, ast:0, stl:0, blk:0, tov:0, fgm:0, fga:0,
           opp_pts:0, opp_reb:0, opp_ast:0, opp_stl:0, opp_blk:0, opp_tov:0, opp_fgm:0, opp_fga:0 };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { league: leagueRaw, season, type } = req.query;
  const league = resolveLeague(leagueRaw);
  if (!league || !season) return res.status(400).json({ error: "league and season required" });

  const seasonStr = season as string;
  const typeStr = (type as string) ?? "regular";

  // 1. All teams for this league
  const { data: teams, error: teamsErr } = await supabase
    .from("teams").select("id,name,abbreviation,logo_url").eq("league", league);
  if (teamsErr) return res.status(500).json({ error: teamsErr.message });

  // 2. All completed games for this league + season(s)
  let gamesQuery = supabase
    .from("games")
    .select("id,home_team_id,away_team_id,home_score,away_score,season")
    .eq("league", league)
    .not("home_score", "is", null);

  if (seasonStr === "all") {
    if (typeStr === "playoffs") gamesQuery = gamesQuery.ilike("season", "%Playoff%");
    else if (typeStr === "regular") gamesQuery = gamesQuery.not("season", "ilike", "%Playoff%");
    // type=combined or no filter → all seasons
  } else if (seasonStr.toLowerCase().includes("playoff")) {
    gamesQuery = gamesQuery.eq("season", seasonStr);
  } else if (typeStr === "playoffs") {
    gamesQuery = gamesQuery.eq("season", `${seasonStr} Playoffs`);
  } else {
    gamesQuery = gamesQuery.eq("season", seasonStr);
  }

  const { data: games, error: gamesErr } = await gamesQuery;
  if (gamesErr) return res.status(500).json({ error: gamesErr.message });
  if (!games || games.length === 0) return res.status(200).json([]);

  const gameIds = (games as GameRow[]).map((g) => g.id);

  // 3. All game_stats for those games
  const { data: stats, error: statsErr } = await supabase
    .from("game_stats")
    .select("game_id,mc_uuid,points,rebounds_off,rebounds_def,assists,steals,blocks,turnovers,fg_made,fg_attempted")
    .in("game_id", gameIds);
  if (statsErr) return res.status(500).json({ error: statsErr.message });

  // 4. Player→team mapping for this league
  const { data: playerTeams, error: ptErr } = await supabase
    .from("player_teams").select("mc_uuid,team_id").eq("league", league);
  if (ptErr) return res.status(500).json({ error: ptErr.message });

  const playerTeamMap: Record<string, string> = {};
  for (const pt of (playerTeams as PTRow[] ?? [])) {
    playerTeamMap[pt.mc_uuid] = pt.team_id;
  }

  // Build team accumulator keyed by team_id
  const accum: Record<string, TeamAccum> = {};
  const teamSet = new Set<string>((teams as TeamRow[]).map((t) => t.id));

  // Track which teams appeared in which games (home/away)
  const gameMap: Record<string, GameRow> = {};
  for (const g of (games as GameRow[])) gameMap[g.id] = g;

  // Count GP per team from actual game participation
  const teamGames: Record<string, Set<string>> = {};

  for (const s of (stats as StatRow[])) {
    const teamId = playerTeamMap[s.mc_uuid];
    if (!teamId || !teamSet.has(teamId)) continue;
    if (!accum[teamId]) accum[teamId] = blank();

    const game = gameMap[s.game_id];
    if (!game) continue;

    const isHome = game.home_team_id === teamId;
    const isAway = game.away_team_id === teamId;
    if (!isHome && !isAway) continue; // player's team didn't play in this game

    // Track unique games for GP
    if (!teamGames[teamId]) teamGames[teamId] = new Set();
    teamGames[teamId].add(s.game_id);

    const a = accum[teamId];
    a.pts  += s.points        ?? 0;
    a.reb  += (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0);
    a.ast  += s.assists       ?? 0;
    a.stl  += s.steals        ?? 0;
    a.blk  += s.blocks        ?? 0;
    a.tov  += s.turnovers     ?? 0;
    a.fgm  += s.fg_made       ?? 0;
    a.fga  += s.fg_attempted  ?? 0;
  }

  // Now compute opponent stats: for each game, sum each team's opponent bucket
  const statsByGame: Record<string, Record<string, StatRow[]>> = {};
  for (const s of (stats as StatRow[])) {
    if (!statsByGame[s.game_id]) statsByGame[s.game_id] = {};
    const teamId = playerTeamMap[s.mc_uuid];
    if (!teamId) continue;
    if (!statsByGame[s.game_id][teamId]) statsByGame[s.game_id][teamId] = [];
    statsByGame[s.game_id][teamId].push(s);
  }

  for (const game of (games as GameRow[])) {
    const homeStats = statsByGame[game.id]?.[game.home_team_id] ?? [];
    const awayStats = statsByGame[game.id]?.[game.away_team_id] ?? [];

    const sumStats = (rows: StatRow[]) => ({
      pts: rows.reduce((s, r) => s + (r.points ?? 0), 0),
      reb: rows.reduce((s, r) => s + (r.rebounds_off ?? 0) + (r.rebounds_def ?? 0), 0),
      ast: rows.reduce((s, r) => s + (r.assists ?? 0), 0),
      stl: rows.reduce((s, r) => s + (r.steals ?? 0), 0),
      blk: rows.reduce((s, r) => s + (r.blocks ?? 0), 0),
      tov: rows.reduce((s, r) => s + (r.turnovers ?? 0), 0),
      fgm: rows.reduce((s, r) => s + (r.fg_made ?? 0), 0),
      fga: rows.reduce((s, r) => s + (r.fg_attempted ?? 0), 0),
    });

    const homeTotals = sumStats(homeStats);
    const awayTotals = sumStats(awayStats);

    // Away's stats are home's opponent, and vice versa
    for (const [teamId, opp] of [
      [game.home_team_id, awayTotals],
      [game.away_team_id, homeTotals],
    ] as [string, ReturnType<typeof sumStats>][]) {
      if (!accum[teamId]) continue;
      const a = accum[teamId];
      a.opp_pts += opp.pts;
      a.opp_reb += opp.reb;
      a.opp_ast += opp.ast;
      a.opp_stl += opp.stl;
      a.opp_blk += opp.blk;
      a.opp_tov += opp.tov;
      a.opp_fgm += opp.fgm;
      a.opp_fga += opp.fga;
    }
  }

  // Assign GP from unique game count
  for (const [teamId, gameSet] of Object.entries(teamGames)) {
    if (accum[teamId]) accum[teamId].gp = gameSet.size;
  }

  const pct = (made: number, att: number) => att > 0 ? Math.round((made / att) * 1000) / 10 : null;
  const pg = (val: number, gp: number) => gp > 0 ? Math.round((val / gp) * 10) / 10 : null;

  const teamMap: Record<string, TeamRow> = {};
  for (const t of (teams as TeamRow[])) teamMap[t.id] = t;

  const result = Object.entries(accum)
    .filter(([, a]) => a.gp > 0)
    .map(([teamId, a]) => {
      const gp = a.gp;
      return {
        team: teamMap[teamId] ?? { id: teamId, name: teamId, abbreviation: "?", logo_url: null },
        gp,
        ppg:      pg(a.pts, gp),
        rpg:      pg(a.reb, gp),
        apg:      pg(a.ast, gp),
        spg:      pg(a.stl, gp),
        bpg:      pg(a.blk, gp),
        topg:     pg(a.tov, gp),
        fg_pct:   pct(a.fgm, a.fga),
        opp_ppg:  pg(a.opp_pts, gp),
        opp_rpg:  pg(a.opp_reb, gp),
        opp_apg:  pg(a.opp_ast, gp),
        opp_spg:  pg(a.opp_stl, gp),
        opp_bpg:  pg(a.opp_blk, gp),
        opp_topg: pg(a.opp_tov, gp),
        opp_fg_pct: pct(a.opp_fgm, a.opp_fga),
        diff:     pg(a.pts - a.opp_pts, gp),
      };
    })
    .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));

  return res.status(200).json(result);
}
