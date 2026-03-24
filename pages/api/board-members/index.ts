import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { getSessionDiscordId } from "../../../lib/ownerAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season, check } = req.query;
    const league = resolveLeague(leagueRaw);

    // check=me — returns whether the current Discord user is a board member
    if (check === "me") {
      const discordId = await getSessionDiscordId(req, res);
      if (!discordId) return;
      let q = supabase.from("board_members").select("*").eq("discord_id", discordId);
      if (league) q = q.eq("league", league as string);
      if (season) q = q.eq("season", season as string);
      const { data } = await q;
      const member = data && data.length > 0 ? data[0] : null;
      return res.status(200).json({ isMember: !!member, member });
    }

    // Admin: list all board members
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    let q = supabase.from("board_members").select("*").order("season", { ascending: false }).order("created_at");
    if (league) q = q.eq("league", league as string);
    if (season) q = q.eq("season", season as string);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id, league: leagueRaw, season, name } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!discord_id || !league || !season)
      return res.status(400).json({ error: "discord_id, league, season required" });
    const { data, error } = await supabase
      .from("board_members")
      .upsert([{ discord_id, league, season, name: name ?? null }], { onConflict: "discord_id,league,season" })
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("board_members").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
