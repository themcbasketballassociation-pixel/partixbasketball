import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

type RecordEntry = {
  mc_uuid: string;
  mc_username: string;
  value: number;
  season: string;
};

type Records = {
  season: Record<string, RecordEntry>;
  seasonAvg: Record<string, RecordEntry>;
  career: Record<string, RecordEntry>;
  careerAvg: Record<string, RecordEntry>;
  game: Record<string, RecordEntry>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { league: leagueRaw } = req.query;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  // Aggregates from game_stats (individual game rows — used by PCAA/PBGL)
  const seasonTotals: Record<string, Record<string, { points: number; rebounds: number; assists: number; steals: number; blocks: number }>> = {};
  const seasonGameCount: Record<string, Record<string, number>> = {};
  const careerTotals: Record<string, { points: number; rebounds: number; assists: number; steals: number; blocks: number }> = {};
  const careerGameCount: Record<string, number> = {};
  const playerMap: Record<string, string> = {};
  // Direct avg rows from stats table (PBA source)
  const statsTableAvgs: { uuid: string; season: string; ppg: number; rpg: number; apg: number; spg: number; bpg: number; gp: number }[] = [];

  // ── Source 1: game_stats table ─────────────────────────────────────────────
  const { data: games } = await supabase
    .from("games")
    .select("id, season")
    .eq("league", league)
    .in("status", ["completed", "final"]);

  const gameMap: Record<string, string> = {};
  for (const g of games ?? []) {
    if ((g.season ?? "").toLowerCase().includes("playoff")) continue; // skip playoffs
    gameMap[g.id] = g.season ?? "Unknown";
  }
  const gameIds = Object.keys(gameMap);

  // Track individual game highs
  let gamePtsRecord:  RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
  let gameRebRecord:  RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
  let gameAstRecord:  RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
  let gameStlRecord:  RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
  let gameBlkRecord:  RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
  let gameTovRecord:  RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };

  if (gameIds.length) {
    const { data: gsRows } = await supabase
      .from("game_stats")
      .select("game_id, mc_uuid, points, rebounds_off, rebounds_def, assists, steals, blocks, turnovers")
      .in("game_id", gameIds);

    const gsUuids = [...new Set((gsRows ?? []).map((r) => r.mc_uuid as string))];
    const { data: gsPlayers } = gsUuids.length
      ? await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", gsUuids)
      : { data: [] };
    for (const p of gsPlayers ?? []) playerMap[p.mc_uuid] = p.mc_username;

    for (const row of gsRows ?? []) {
      const uuid = row.mc_uuid as string;
      const season = gameMap[row.game_id as string] ?? "Unknown";
      const pts = (row.points as number) ?? 0;
      const reb = ((row.rebounds_off as number) ?? 0) + ((row.rebounds_def as number) ?? 0);
      const ast = (row.assists as number) ?? 0;
      const stl = (row.steals as number) ?? 0;
      const blk = (row.blocks as number) ?? 0;

      if (!seasonTotals[uuid]) seasonTotals[uuid] = {};
      if (!seasonTotals[uuid][season]) seasonTotals[uuid][season] = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 };
      seasonTotals[uuid][season].points += pts;
      seasonTotals[uuid][season].rebounds += reb;
      seasonTotals[uuid][season].assists += ast;
      seasonTotals[uuid][season].steals += stl;
      seasonTotals[uuid][season].blocks += blk;

      if (!seasonGameCount[uuid]) seasonGameCount[uuid] = {};
      seasonGameCount[uuid][season] = (seasonGameCount[uuid][season] ?? 0) + 1;

      if (!careerTotals[uuid]) careerTotals[uuid] = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 };
      careerTotals[uuid].points += pts;
      careerTotals[uuid].rebounds += reb;
      careerTotals[uuid].assists += ast;
      careerTotals[uuid].steals += stl;
      careerTotals[uuid].blocks += blk;
      careerGameCount[uuid] = (careerGameCount[uuid] ?? 0) + 1;

      const tov = (row.turnovers as number) ?? 0;

      // Track single-game records
      if (pts > gamePtsRecord.value) gamePtsRecord = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: pts, season };
      if (reb > gameRebRecord.value) gameRebRecord = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: reb, season };
      if (ast > gameAstRecord.value) gameAstRecord = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: ast, season };
      if (stl > gameStlRecord.value) gameStlRecord = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: stl, season };
      if (blk > gameBlkRecord.value) gameBlkRecord = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: blk, season };
      if (tov > gameTovRecord.value) gameTovRecord = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: tov, season };
    }
    // Re-resolve usernames (playerMap is now fully populated)
    for (const rec of [gamePtsRecord, gameRebRecord, gameAstRecord, gameStlRecord, gameBlkRecord, gameTovRecord]) {
      if (rec.mc_uuid) rec.mc_username = playerMap[rec.mc_uuid] ?? rec.mc_uuid;
    }
  }

  // ── Source 2: stats table (pre-aggregated — used by PBA) ──────────────────
  const { data: statsRows } = await supabase
    .from("stats")
    .select("mc_uuid, season, gp, ppg, rpg, apg, spg, bpg")
    .eq("league", league);

  if (statsRows?.length) {
    const statsUuids = [...new Set(statsRows.filter((r) => !((r.season ?? "").toLowerCase().includes("playoff"))).map((r) => r.mc_uuid as string))];
    const { data: statsPlayers } = statsUuids.length
      ? await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", statsUuids)
      : { data: [] };
    for (const p of statsPlayers ?? []) playerMap[p.mc_uuid] = p.mc_username;

    for (const row of statsRows) {
      const uuid = row.mc_uuid as string;
      const season = row.season as string;
      if (season.toLowerCase().includes("playoff")) continue; // skip playoffs
      const gp = (row.gp as number) ?? 0;
      if (!gp) continue;
      const pts = Math.round(((row.ppg as number) ?? 0) * gp);
      const reb = Math.round(((row.rpg as number) ?? 0) * gp);
      const ast = Math.round(((row.apg as number) ?? 0) * gp);
      const stl = Math.round(((row.spg as number) ?? 0) * gp);
      const blk = Math.round(((row.bpg as number) ?? 0) * gp);

      if (!seasonTotals[uuid]) seasonTotals[uuid] = {};
      if (!seasonTotals[uuid][season]) seasonTotals[uuid][season] = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 };
      seasonTotals[uuid][season].points += pts;
      seasonTotals[uuid][season].rebounds += reb;
      seasonTotals[uuid][season].assists += ast;
      seasonTotals[uuid][season].steals += stl;
      seasonTotals[uuid][season].blocks += blk;

      if (!careerTotals[uuid]) careerTotals[uuid] = { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 };
      careerTotals[uuid].points += pts;
      careerTotals[uuid].rebounds += reb;
      careerTotals[uuid].assists += ast;
      careerTotals[uuid].steals += stl;
      careerTotals[uuid].blocks += blk;
      careerGameCount[uuid] = (careerGameCount[uuid] ?? 0) + gp;

      statsTableAvgs.push({
        uuid, season, gp,
        ppg: (row.ppg as number) ?? 0,
        rpg: (row.rpg as number) ?? 0,
        apg: (row.apg as number) ?? 0,
        spg: (row.spg as number) ?? 0,
        bpg: (row.bpg as number) ?? 0,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function bestSeason(stat: "points" | "rebounds" | "assists" | "steals" | "blocks"): RecordEntry {
    let best: RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
    for (const [uuid, seasons] of Object.entries(seasonTotals)) {
      for (const [season, totals] of Object.entries(seasons)) {
        if (totals[stat] > best.value) {
          best = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: totals[stat], season };
        }
      }
    }
    return best;
  }

  function bestSeasonAvg(stat: "ppg" | "rpg" | "apg" | "spg" | "bpg"): RecordEntry {
    const MIN_GAMES = 3;
    let best: RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
    const totalKey = ({ ppg: "points", rpg: "rebounds", apg: "assists", spg: "steals", bpg: "blocks" } as const)[stat];

    // From game_stats source
    for (const [uuid, seasons] of Object.entries(seasonTotals)) {
      for (const [season, totals] of Object.entries(seasons)) {
        const gp = seasonGameCount[uuid]?.[season] ?? 0;
        if (gp < MIN_GAMES) continue;
        const avg = totals[totalKey] / gp;
        if (avg > best.value) {
          best = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: Math.round(avg * 10) / 10, season };
        }
      }
    }

    // From stats table source (already averages)
    for (const row of statsTableAvgs) {
      if (row.gp < MIN_GAMES) continue;
      if (row[stat] > best.value) {
        best = { mc_uuid: row.uuid, mc_username: playerMap[row.uuid] ?? row.uuid, value: Math.round(row[stat] * 10) / 10, season: row.season };
      }
    }

    return best;
  }

  function bestCareer(stat: "points" | "rebounds" | "assists" | "steals" | "blocks"): RecordEntry {
    let best: RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "Career" };
    for (const [uuid, totals] of Object.entries(careerTotals)) {
      if (totals[stat] > best.value) {
        best = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: totals[stat], season: "Career" };
      }
    }
    return best;
  }

  function bestCareerAvg(stat: "points" | "rebounds" | "assists" | "steals" | "blocks"): RecordEntry {
    const MIN_GAMES = 3;
    let best: RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "Career" };
    for (const [uuid, totals] of Object.entries(careerTotals)) {
      const gp = careerGameCount[uuid] ?? 0;
      if (gp < MIN_GAMES) continue;
      const avg = totals[stat] / gp;
      if (avg > best.value) {
        const seasons = Object.keys(seasonTotals[uuid] ?? {}).length;
        best = {
          mc_uuid: uuid,
          mc_username: playerMap[uuid] ?? uuid,
          value: Math.round(avg * 10) / 10,
          season: `${gp} GP · ${seasons} season${seasons !== 1 ? "s" : ""}`,
        };
      }
    }
    return best;
  }

  const result: Records = {
    season: {
      points:  bestSeason("points"),
      assists:  bestSeason("assists"),
      rebounds: bestSeason("rebounds"),
      steals:   bestSeason("steals"),
      blocks:   bestSeason("blocks"),
    },
    seasonAvg: {
      ppg: bestSeasonAvg("ppg"),
      rpg: bestSeasonAvg("rpg"),
      apg: bestSeasonAvg("apg"),
      spg: bestSeasonAvg("spg"),
      bpg: bestSeasonAvg("bpg"),
    },
    career: {
      points:   bestCareer("points"),
      assists:  bestCareer("assists"),
      rebounds: bestCareer("rebounds"),
      steals:   bestCareer("steals"),
      blocks:   bestCareer("blocks"),
    },
    careerAvg: {
      ppg: bestCareerAvg("points"),
      rpg: bestCareerAvg("rebounds"),
      apg: bestCareerAvg("assists"),
      spg: bestCareerAvg("steals"),
      bpg: bestCareerAvg("blocks"),
    },
    game: {
      points:   gamePtsRecord,
      rebounds: gameRebRecord,
      assists:  gameAstRecord,
      steals:   gameStlRecord,
      blocks:   gameBlkRecord,
      turnovers: gameTovRecord,
    },
  };

  return res.status(200).json(result);
}
