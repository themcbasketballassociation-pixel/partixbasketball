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
  game: Record<string, RecordEntry>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { league: leagueRaw } = req.query;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  // Aggregates from game_stats (individual game rows — used by PCAA/PBGL)
  const seasonTotals: Record<string, Record<string, { points: number; rebounds: number; assists: number; steals: number }>> = {};
  const seasonGameCount: Record<string, Record<string, number>> = {};
  const careerTotals: Record<string, { points: number; rebounds: number; assists: number; steals: number }> = {};
  const playerMap: Record<string, string> = {};
  // Direct avg rows from stats table (PBA source)
  const statsTableAvgs: { uuid: string; season: string; ppg: number; rpg: number; apg: number; spg: number; gp: number }[] = [];

  // ── Source 1: game_stats table ─────────────────────────────────────────────
  const { data: games } = await supabase
    .from("games")
    .select("id, season")
    .eq("league", league)
    .in("status", ["completed", "final"]);

  const gameMap: Record<string, string> = {};
  for (const g of games ?? []) gameMap[g.id] = g.season ?? "Unknown";
  const gameIds = Object.keys(gameMap);

  if (gameIds.length) {
    const { data: gsRows } = await supabase
      .from("game_stats")
      .select("game_id, mc_uuid, points, rebounds_off, rebounds_def, assists, steals")
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

      if (!seasonTotals[uuid]) seasonTotals[uuid] = {};
      if (!seasonTotals[uuid][season]) seasonTotals[uuid][season] = { points: 0, rebounds: 0, assists: 0, steals: 0 };
      seasonTotals[uuid][season].points += pts;
      seasonTotals[uuid][season].rebounds += reb;
      seasonTotals[uuid][season].assists += ast;
      seasonTotals[uuid][season].steals += stl;

      if (!seasonGameCount[uuid]) seasonGameCount[uuid] = {};
      seasonGameCount[uuid][season] = (seasonGameCount[uuid][season] ?? 0) + 1;

      if (!careerTotals[uuid]) careerTotals[uuid] = { points: 0, rebounds: 0, assists: 0, steals: 0 };
      careerTotals[uuid].points += pts;
      careerTotals[uuid].rebounds += reb;
      careerTotals[uuid].assists += ast;
      careerTotals[uuid].steals += stl;
    }
  }

  // ── Source 2: stats table (pre-aggregated — used by PBA) ──────────────────
  const { data: statsRows } = await supabase
    .from("stats")
    .select("mc_uuid, season, gp, ppg, rpg, apg, spg")
    .eq("league", league);

  if (statsRows?.length) {
    const statsUuids = [...new Set(statsRows.map((r) => r.mc_uuid as string))];
    const { data: statsPlayers } = statsUuids.length
      ? await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", statsUuids)
      : { data: [] };
    for (const p of statsPlayers ?? []) playerMap[p.mc_uuid] = p.mc_username;

    for (const row of statsRows) {
      const uuid = row.mc_uuid as string;
      const season = row.season as string;
      const gp = (row.gp as number) ?? 0;
      if (!gp) continue;
      const pts = Math.round(((row.ppg as number) ?? 0) * gp);
      const reb = Math.round(((row.rpg as number) ?? 0) * gp);
      const ast = Math.round(((row.apg as number) ?? 0) * gp);
      const stl = Math.round(((row.spg as number) ?? 0) * gp);

      if (!seasonTotals[uuid]) seasonTotals[uuid] = {};
      if (!seasonTotals[uuid][season]) seasonTotals[uuid][season] = { points: 0, rebounds: 0, assists: 0, steals: 0 };
      seasonTotals[uuid][season].points += pts;
      seasonTotals[uuid][season].rebounds += reb;
      seasonTotals[uuid][season].assists += ast;
      seasonTotals[uuid][season].steals += stl;

      if (!careerTotals[uuid]) careerTotals[uuid] = { points: 0, rebounds: 0, assists: 0, steals: 0 };
      careerTotals[uuid].points += pts;
      careerTotals[uuid].rebounds += reb;
      careerTotals[uuid].assists += ast;
      careerTotals[uuid].steals += stl;

      statsTableAvgs.push({
        uuid, season, gp,
        ppg: (row.ppg as number) ?? 0,
        rpg: (row.rpg as number) ?? 0,
        apg: (row.apg as number) ?? 0,
        spg: (row.spg as number) ?? 0,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function bestSeason(stat: "points" | "rebounds" | "assists" | "steals"): RecordEntry {
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

  function bestSeasonAvg(stat: "ppg" | "rpg" | "apg" | "spg"): RecordEntry {
    const MIN_GAMES = 3;
    let best: RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "" };
    const totalKey = ({ ppg: "points", rpg: "rebounds", apg: "assists", spg: "steals" } as const)[stat];

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

  function bestCareer(stat: "points" | "rebounds" | "assists" | "steals"): RecordEntry {
    let best: RecordEntry = { mc_uuid: "", mc_username: "", value: 0, season: "Career" };
    for (const [uuid, totals] of Object.entries(careerTotals)) {
      if (totals[stat] > best.value) {
        best = { mc_uuid: uuid, mc_username: playerMap[uuid] ?? uuid, value: totals[stat], season: "Career" };
      }
    }
    return best;
  }

  const result: Records = {
    season: {
      points: bestSeason("points"),
      rebounds: bestSeason("rebounds"),
      assists: bestSeason("assists"),
      steals: bestSeason("steals"),
    },
    seasonAvg: {
      ppg: bestSeasonAvg("ppg"),
      rpg: bestSeasonAvg("rpg"),
      apg: bestSeasonAvg("apg"),
      spg: bestSeasonAvg("spg"),
    },
    career: {
      points: bestCareer("points"),
      rebounds: bestCareer("rebounds"),
      assists: bestCareer("assists"),
      steals: bestCareer("steals"),
    },
    game: {},
  };

  return res.status(200).json(result);
}
