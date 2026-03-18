import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";

const ALL_REGULAR_SEASONS = [
  "Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7",
];

function getQuerySeasons(season: string, type: string): string[] {
  const base = season === "all" ? ALL_REGULAR_SEASONS : [season];
  if (type === "playoffs") return base.map((s) => `${s} Playoffs`);
  if (type === "combined") return [...base, ...base.map((s) => `${s} Playoffs`)];
  return base; // regular (default)
}

function mergePlayerRows(rows: Record<string, unknown>[]) {
  let gp = 0, wPts = 0, wReb = 0, wAst = 0, wStl = 0, wBlk = 0;
  let totalThree = 0, wTo = 0, wPass = 0, wPoss = 0;
  // Track fg% and 3pt% separately — only include seasons where they were actually tracked (> 0)
  let wFg = 0, fgGames = 0;
  let wThreePct = 0, threeGames = 0;
  for (const r of rows) {
    const g = (r.gp as number) ?? 0;
    gp += g;
    wPts += ((r.ppg as number) ?? 0) * g;
    wReb += ((r.rpg as number) ?? 0) * g;
    wAst += ((r.apg as number) ?? 0) * g;
    wStl += ((r.spg as number) ?? 0) * g;
    wBlk += ((r.bpg as number) ?? 0) * g;
    // Only count FG% if it was actually tracked (non-zero)
    const fgP = (r.fg_pct as number) ?? 0;
    if (fgP > 0) { wFg += fgP * g; fgGames += g; }
    totalThree += (r.three_pt_made as number) ?? 0;
    // Only count 3P% if it was actually tracked (non-zero)
    const tpP = (r.three_pt_pct as number) ?? 0;
    if (tpP > 0) { wThreePct += tpP * g; threeGames += g; }
    wTo   += ((r.topg             as number) ?? 0) * g;
    wPass += ((r.pass_attempts_pg as number) ?? 0) * g;
    wPoss += ((r.possession_time_pg as number) ?? 0) * g;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    gp,
    ppg: gp > 0 ? r1(wPts / gp) : null,
    rpg: gp > 0 ? r1(wReb / gp) : null,
    apg: gp > 0 ? r1(wAst / gp) : null,
    spg: gp > 0 ? r1(wStl / gp) : null,
    bpg: gp > 0 ? r1(wBlk / gp) : null,
    fg_pct: fgGames > 0 ? r1(wFg / fgGames) : null,
    three_pt_made: totalThree,
    tppg: gp > 0 ? r1(totalThree / gp) : null,
    three_pt_pct: threeGames > 0 ? r1(wThreePct / threeGames) : null,
    topg: gp > 0 ? r1(wTo / gp) : null,
    pass_attempts_pg: gp > 0 ? r1(wPass / gp) : null,
    possession_time_pg: gp > 0 ? Math.round(wPoss / gp) : null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { league } = req.query;
  if (!league) return res.status(400).json({ error: "league required" });

  // POST — save manual season-level stats for a player
  if (req.method === "POST") {
    const { mc_uuid, season, gp, ppg, rpg, apg, spg, bpg, fg_pct, three_pt_made, three_pt_pct, topg, pass_attempts_pg, possession_time_pg } = req.body;
    if (!mc_uuid || !season) return res.status(400).json({ error: "mc_uuid, season required" });
    const { data, error } = await supabase
      .from("stats")
      .upsert([{ mc_uuid, league, season, gp: gp ?? null, ppg: ppg ?? null, rpg: rpg ?? null, apg: apg ?? null, spg: spg ?? null, bpg: bpg ?? null, fg_pct: fg_pct ?? null, three_pt_made: three_pt_made ?? null, three_pt_pct: three_pt_pct ?? null, topg: topg ?? null, pass_attempts_pg: pass_attempts_pg ?? null, possession_time_pg: possession_time_pg ?? null }], { onConflict: "mc_uuid,league,season" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove a player's stats for a season
  if (req.method === "DELETE") {
    const { mc_uuid: delUuid, season: delSeason } = req.query;
    if (!delUuid || !delSeason) return res.status(400).json({ error: "mc_uuid, season required" });
    const { error } = await supabase
      .from("stats")
      .delete()
      .eq("mc_uuid", delUuid as string)
      .eq("league", league as string)
      .eq("season", delSeason as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  const { mc_uuid, season, type } = req.query;

  // GET with mc_uuid + season — load a single player's manual stats (used by admin)
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

  // GET with season (and optional type) — leaderboard
  if (season) {
    const typeStr = (type as string) ?? "regular";
    const seasonStr = season as string;

    let statsQuery = supabase.from("stats").select("*").eq("league", league as string);
    if (seasonStr !== "all") {
      // Specific season — filter by computed season names
      const querySeasons = getQuerySeasons(seasonStr, typeStr);
      statsQuery = statsQuery.in("season", querySeasons);
    } else if (typeStr === "playoffs") {
      statsQuery = statsQuery.ilike("season", "%Playoff%");
    } else if (typeStr === "regular") {
      statsQuery = statsQuery.not("season", "ilike", "%Playoff%");
    }
    // type="combined" or season="all" with no type filter → all rows for league

    const { data, error } = await statsQuery;
    if (error) return res.status(500).json({ error: error.message });

    // Group by mc_uuid and merge across seasons
    const byPlayer: Record<string, Record<string, unknown>[]> = {};
    for (const row of data ?? []) {
      if (!byPlayer[row.mc_uuid]) byPlayer[row.mc_uuid] = [];
      byPlayer[row.mc_uuid].push(row);
    }

    const uuids = Object.keys(byPlayer);
    const { data: playerRows } = uuids.length
      ? await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", uuids)
      : { data: [] };
    const playerMap: Record<string, string> = {};
    for (const p of playerRows ?? []) playerMap[p.mc_uuid] = p.mc_username;

    const { data: teamRows } = await supabase
      .from("player_teams")
      .select("mc_uuid, teams(id, name, abbreviation)")
      .eq("league", league as string);
    const teamMap: Record<string, unknown> = {};
    for (const row of teamRows ?? []) {
      if (row.mc_uuid && row.teams) teamMap[row.mc_uuid] = row.teams;
    }

    const result = uuids.map((uuid) => {
      const merged = mergePlayerRows(byPlayer[uuid]);
      return {
        rank: 0,
        mc_uuid: uuid,
        mc_username: playerMap[uuid] ?? uuid,
        team: teamMap[uuid] ?? null,
        ...merged,
      };
    });

    result.sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
    result.forEach((s, i) => { s.rank = i + 1; });
    return res.status(200).json(result);
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(400).json({ error: "season param required" });
}
