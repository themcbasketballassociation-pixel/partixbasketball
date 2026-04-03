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
  const careerTotals: Record<string, { points: number; rebounds: number; assists: number; steals: number }> = {};
  const playerMap: Record<string, string> = {};

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
