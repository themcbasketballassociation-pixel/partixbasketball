import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("team_owners")
      .select("*, teams(id, name, abbreviation, color2)")
      .order("created_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) {
      // If season column doesn't exist, retry without season filter
      if (error.message.includes("season")) {
        let q2 = supabase
          .from("team_owners")
          .select("*, teams(id, name, abbreviation, color2)")
          .order("created_at", { ascending: false });
        if (league) q2 = q2.eq("league", league as string);
        const { data: d2, error: e2 } = await q2;
        if (e2) return res.status(500).json({ error: e2.message });
        return res.status(200).json(d2);
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id, team_id, league: leagueRaw, season, owner_name } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!discord_id || !team_id || !league)
      return res.status(400).json({ error: "discord_id, team_id, league required" });

    // Remove any existing assignment for this owner+team+league
    await supabase.from("team_owners").delete().match({ discord_id, team_id, league });

    const payload: Record<string, string | null> = { discord_id, team_id, league };
    if (season) payload.season = season;
    if (owner_name !== undefined) payload.owner_name = owner_name || null;

    const { data, error } = await supabase
      .from("team_owners")
      .insert([payload])
      .select("*, teams(id, name, abbreviation, color2)")
      .single();

    if (error) {
      // If new columns don't exist yet, retry with only base fields
      if (error.message.includes("season") || error.message.includes("owner_name")) {
        const basePayload = { discord_id, team_id, league };
        const { data: d2, error: e2 } = await supabase
          .from("team_owners")
          .insert([basePayload])
          .select("*, teams(id, name, abbreviation, color2)")
          .single();
        if (e2) return res.status(500).json({ error: e2.message });
        return res.status(200).json(d2);
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("team_owners").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
