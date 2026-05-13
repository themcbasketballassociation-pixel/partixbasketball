import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export const RECORD_TYPES = [
  { type: "Single Game Record: PTS", label: "PTS", field: "points"   as const },
  { type: "Single Game Record: REB", label: "REB", field: null               },
  { type: "Single Game Record: AST", label: "AST", field: "assists"  as const },
  { type: "Single Game Record: STL", label: "STL", field: "steals"   as const },
  { type: "Single Game Record: BLK", label: "BLK", field: "blocks"   as const },
  { type: "Single Game Record: TOV", label: "TOV", field: "turnovers" as const },
] as const;

type StatKey = "points" | "assists" | "steals" | "blocks" | "turnovers" | "rebounds_off" | "rebounds_def";

type GameStatRow = {
  id: string; game_id: string; mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null;
  players: { mc_uuid: string; mc_username: string } | null;
};

type TeamRef = { name: string; abbreviation: string };
type GameRow = {
  id: string; season: string | null; scheduled_at: string;
  home_team: TeamRef | TeamRef[] | null;
  away_team: TeamRef | TeamRef[] | null;
};

// Exported so game-stats API can call it after a save
export async function recomputeRecords(league: string): Promise<{ updated: number }> {
  const { data: games } = await supabase
    .from("games")
    .select("id, season, scheduled_at, home_team:home_team_id(name,abbreviation), away_team:away_team_id(name,abbreviation)")
    .eq("league", league);
  if (!games || games.length === 0) return { updated: 0 };

  const gameIds = (games as unknown as GameRow[]).map(g => g.id);
  const gameMap = new Map((games as unknown as GameRow[]).map(g => [g.id, g]));

  const { data: stats } = await supabase
    .from("game_stats")
    .select("id,game_id,mc_uuid,points,rebounds_off,rebounds_def,assists,steals,blocks,turnovers,players(mc_uuid,mc_username)")
    .in("game_id", gameIds);
  if (!stats || stats.length === 0) return { updated: 0 };

  const rows = stats as GameStatRow[];

  const getVal = (r: GameStatRow, field: typeof RECORD_TYPES[number]["field"]): number =>
    field === null
      ? (r.rebounds_off ?? 0) + (r.rebounds_def ?? 0)
      : (r[field as StatKey] as number | null) ?? 0;

  const records: { type: string; mc_uuid: string; season: string; description: string }[] = [];

  for (const rt of RECORD_TYPES) {
    let best: GameStatRow | null = null;
    let bestVal = 0;
    for (const r of rows) {
      const v = getVal(r, rt.field);
      if (v > bestVal) { bestVal = v; best = r; }
    }
    if (!best || bestVal <= 0) continue;

    const game = gameMap.get(best.game_id);
    if (!game) continue;
    const dateStr = new Date(game.scheduled_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
    const resolveAbbr = (t: TeamRef | TeamRef[] | null) =>
      Array.isArray(t) ? (t[0]?.abbreviation ?? "?") : (t?.abbreviation ?? "?");
    const homeAbbr = resolveAbbr(game.home_team);
    const awayAbbr = resolveAbbr(game.away_team);
    const desc = `${bestVal} ${rt.label} — ${homeAbbr} vs ${awayAbbr} (${dateStr})`;
    records.push({ type: rt.type, mc_uuid: best.mc_uuid, season: game.season ?? "Season 1", description: desc });
  }

  if (records.length === 0) return { updated: 0 };

  // Replace existing records for this league
  await supabase.from("accolades").delete().eq("league", league).in("type", records.map(r => r.type));
  await supabase.from("accolades").insert(records.map(r => ({ league, ...r })));

  return { updated: records.length };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw } = req.query;
  const league = resolveLeague(leagueRaw as string);
  if (!league) return res.status(400).json({ error: "league required" });

  const result = await recomputeRecords(league);
  return res.status(200).json(result);
}
