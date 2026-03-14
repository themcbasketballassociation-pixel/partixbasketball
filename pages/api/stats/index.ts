import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";

function fmtMPG(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { league } = req.query;
  if (!league) return res.status(400).json({ error: "league required" });

  // POST — save manual season-level stats for a player
  if (req.method === "POST") {
    const { mc_uuid, season, gp, ppg, rpg, apg, spg, bpg, fg_pct, three_pt_made, three_pt_pct } = req.body;
    if (!mc_uuid || !season) return res.status(400).json({ error: "mc_uuid, season required" });
    const { data, error } = await supabase
      .from("stats")
      .upsert([{ mc_uuid, league, season, gp: gp ?? null, ppg: ppg ?? null, rpg: rpg ?? null, apg: apg ?? null, spg: spg ?? null, bpg: bpg ?? null, fg_pct: fg_pct ?? null, three_pt_made: three_pt_made ?? null, three_pt_pct: three_pt_pct ?? null }], { onConflict: "mc_uuid,league,season" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // GET with mc_uuid + season — load a single player's manual stats
  const { mc_uuid, season } = req.query;
  if (mc_uuid && season) {
    const { data, error } = await supabase
      .from("stats")
      .select("*")
      .eq("mc_uuid", mc_uuid as string)
      .eq("league", league as string)
      .eq("season", season as string)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ? [data] : []);
  }

  // GET with season only — load all players' manual stats for that season
  if (season) {
    const { data, error } = await supabase
      .from("stats")
      .select("*, players(mc_uuid, mc_username)")
      .eq("league", league as string)
      .eq("season", season as string);
    if (error) return res.status(500).json({ error: error.message });
    const { data: teamRows } = await supabase.from("player_teams").select("mc_uuid, teams(id, name, abbreviation)").eq("league", league as string);
    const teamMap: Record<string, unknown> = {};
    for (const row of teamRows ?? []) {
      if (row.mc_uuid && row.teams) teamMap[row.mc_uuid] = row.teams;
    }
    const result = (data ?? []).map((row, i) => ({
      rank: i + 1,
      mc_uuid: row.mc_uuid,
      mc_username: (row.players as { mc_username?: string } | null)?.mc_username ?? row.mc_uuid,
      team: teamMap[row.mc_uuid] ?? null,
      gp: row.gp, ppg: row.ppg, rpg: row.rpg, apg: row.apg, spg: row.spg, bpg: row.bpg,
      fg_pct: row.fg_pct, three_pt_made: row.three_pt_made, three_pt_pct: row.three_pt_pct,
      tppg: row.gp && row.three_pt_made ? Math.round(row.three_pt_made / row.gp * 10) / 10 : null,
    }));
    result.sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
    result.forEach((s, i) => { s.rank = i + 1; });
    return res.status(200).json(result);
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { data: rows, error } = await supabase
    .from("game_stats")
    .select(`mc_uuid, points, rebounds_off, rebounds_def, assists, steals, blocks, turnovers, minutes_played, fg_made, fg_attempted, three_pt_made, three_pt_attempted, game_id, players(mc_uuid, mc_username), games!inner(id, league)`)
    .eq("games.league", league as string);
  if (error) return res.status(500).json({ error: error.message });

  const { data: teamRows } = await supabase.from("player_teams").select("mc_uuid, teams(id, name, abbreviation)").eq("league", league as string);
  const teamMap: Record<string, unknown> = {};
  for (const row of teamRows ?? []) {
    if (row.mc_uuid && row.teams) teamMap[row.mc_uuid] = row.teams;
  }

  const playerMap: Record<string, { mc_uuid: string; mc_username: string; games: number; points: number; rebounds_off: number; rebounds_def: number; assists: number; steals: number; blocks: number; turnovers: number; minutes_played: number; fg_made: number; fg_attempted: number; three_pt_made: number; three_pt_attempted: number }> = {};
  for (const row of rows ?? []) {
    const key = row.mc_uuid;
    const username = (row.players as { mc_username?: string } | null)?.mc_username ?? key;
    if (!playerMap[key]) {
      playerMap[key] = { mc_uuid: key, mc_username: username, games: 0, points: 0, rebounds_off: 0, rebounds_def: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, minutes_played: 0, fg_made: 0, fg_attempted: 0, three_pt_made: 0, three_pt_attempted: 0 };
    }
    const p = playerMap[key];
    p.games++;
    p.points += row.points ?? 0;
    p.rebounds_off += row.rebounds_off ?? 0;
    p.rebounds_def += row.rebounds_def ?? 0;
    p.assists += row.assists ?? 0;
    p.steals += row.steals ?? 0;
    p.blocks += row.blocks ?? 0;
    p.turnovers += row.turnovers ?? 0;
    p.minutes_played += row.minutes_played ?? 0;
    p.fg_made += row.fg_made ?? 0;
    p.fg_attempted += row.fg_attempted ?? 0;
    p.three_pt_made += row.three_pt_made ?? 0;
    p.three_pt_attempted += row.three_pt_attempted ?? 0;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const stats = Object.values(playerMap).map((p, i) => ({
    rank: i + 1,
    mc_uuid: p.mc_uuid,
    mc_username: p.mc_username,
    team: teamMap[p.mc_uuid] ?? null,
    gp: p.games,
    mpg: fmtMPG(p.games > 0 ? p.minutes_played / p.games : 0),
    ppg: round1(p.games > 0 ? p.points / p.games : 0),
    orpg: round1(p.games > 0 ? p.rebounds_off / p.games : 0),
    drpg: round1(p.games > 0 ? p.rebounds_def / p.games : 0),
    rpg: round1(p.games > 0 ? (p.rebounds_off + p.rebounds_def) / p.games : 0),
    apg: round1(p.games > 0 ? p.assists / p.games : 0),
    spg: round1(p.games > 0 ? p.steals / p.games : 0),
    bpg: round1(p.games > 0 ? p.blocks / p.games : 0),
    tpg: round1(p.games > 0 ? p.turnovers / p.games : 0),
    fg_pct: p.fg_attempted > 0 ? Math.round(p.fg_made / p.fg_attempted * 1000) / 10 : 0,
    three_pt_made: p.three_pt_made,
    tppg: round1(p.games > 0 ? p.three_pt_made / p.games : 0),
    three_pt_pct: p.three_pt_attempted > 0 ? Math.round(p.three_pt_made / p.three_pt_attempted * 1000) / 10 : 0,
  }));

  stats.sort((a, b) => b.ppg - a.ppg);
  stats.forEach((s, i) => { s.rank = i + 1; });

  return res.status(200).json(stats);
}
