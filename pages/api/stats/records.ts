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

  // Fetch all completed games for this league to get game IDs and seasons
  const { data: games, error: gErr } = await supabase
    .from("games")
    .select("id, season")
    .eq("league", league)
    .in("status", ["completed", "final"]);
  if (gErr) return res.status(500).json({ error: gErr.message });

  const gameMap: Record<string, string> = {};
  for (const g of games ?? []) gameMap[g.id] = g.season ?? "Unknown";
  const gameIds = Object.keys(gameMap);

  const empty: Records = { season: {}, career: {}, game: {} };
  if (!gameIds.length) return res.status(200).json(empty);

  // Fetch all stats for those games
  const { data: rows, error: sErr } = await supabase
    .from("game_stats")
    .select("game_id, mc_uuid, points, rebounds_off, rebounds_def, assists, steals")
    .in("game_id", gameIds);
  if (sErr) return res.status(500).json({ error: sErr.message });

  // Fetch player usernames
  const uuids = [...new Set((rows ?? []).map((r) => r.mc_uuid as string))];
  const { data: playerRows } = uuids.length
    ? await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", uuids)
    : { data: [] };
  const playerMap: Record<string, string> = {};
  for (const p of playerRows ?? []) playerMap[p.mc_uuid] = p.mc_username;

  // Aggregate
  const seasonTotals: Record<string, Record<string, { points: number; rebounds: number; assists: number; steals: number }>> = {};
  const careerTotals: Record<string, { points: number; rebounds: number; assists: number; steals: number }> = {};
  let gamePts = { value: 0, mc_uuid: "", season: "" };

  for (const row of rows ?? []) {
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

    if (pts > gamePts.value) gamePts = { value: pts, mc_uuid: uuid, season };
  }

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
    game: {
      points: {
        mc_uuid: gamePts.mc_uuid,
        mc_username: playerMap[gamePts.mc_uuid] ?? gamePts.mc_uuid,
        value: gamePts.value,
        season: gamePts.season,
      },
    },
  };

  return res.status(200).json(result);
}
