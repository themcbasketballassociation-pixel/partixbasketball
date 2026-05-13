import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";
import { requireAdmin } from "../../../lib/adminAuth";
import { recomputeRecords } from "../admin/recompute-records";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { game_id, mc_uuid, league, season } = req.query;

    // Return distinct game_ids that have stats for a given league+season
    if (league && season && !game_id && !mc_uuid) {
      const { data: games } = await supabase
        .from("games")
        .select("id")
        .eq("league", resolveLeague(league as string))
        .eq("season", season as string);
      const ids = (games ?? []).map(g => g.id);
      if (ids.length === 0) return res.status(200).json([]);
      const { data, error } = await supabase
        .from("game_stats")
        .select("game_id")
        .in("game_id", ids);
      if (error) return res.status(500).json({ error: error.message });
      const unique = [...new Set((data ?? []).map(r => r.game_id))];
      return res.status(200).json(unique);
    }

    if (mc_uuid && !game_id) {
      const { data, error } = await supabase
        .from("game_stats")
        .select("*")
        .eq("mc_uuid", mc_uuid as string);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (!game_id) return res.status(400).json({ error: "game_id required" });
    const { data, error } = await supabase.from("game_stats").select("*, players(mc_uuid, mc_username)").eq("game_id", game_id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { game_id, mc_uuid, points, rebounds_off, rebounds_def, assists, steals, blocks, turnovers, minutes_played, fg_made, fg_attempted, three_pt_made, three_pt_attempted, pass_attempts, possession_time, ft_made, ft_attempted, fouls } = req.body;
    if (!game_id || !mc_uuid) return res.status(400).json({ error: "game_id, mc_uuid required" });
    const { data, error } = await supabase
      .from("game_stats")
      .upsert([{
        game_id, mc_uuid,
        points: points ?? null, rebounds_off: rebounds_off ?? null, rebounds_def: rebounds_def ?? null,
        assists: assists ?? null, steals: steals ?? null, blocks: blocks ?? null,
        turnovers: turnovers ?? null, minutes_played: minutes_played ?? null,
        fg_made: fg_made ?? null, fg_attempted: fg_attempted ?? null,
        three_pt_made: three_pt_made ?? null, three_pt_attempted: three_pt_attempted ?? null,
        pass_attempts: pass_attempts ?? null, possession_time: possession_time ?? null,
        ft_made: ft_made ?? null, ft_attempted: ft_attempted ?? null, fouls: fouls ?? null,
      }], { onConflict: "game_id,mc_uuid" })
      .select("*, players(mc_uuid, mc_username)")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Auto-update single-game records after every stat save
    const { data: game } = await supabase.from("games").select("league").eq("id", game_id).single();
    if (game?.league) {
      recomputeRecords(game.league).catch(() => {}); // fire-and-forget, don't block response
    }

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
