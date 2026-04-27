import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { league: leagueRaw, check } = req.query;
  const league = resolveLeague(leagueRaw);

  if (req.method === "GET") {
    // ?check=me — returns { isMember: bool } for the current Discord user
    if (check === "me") {
      const session = await getServerSession(req, res, authOptions);
      const discordId = (session?.user as { id?: string })?.id;
      if (!discordId) return res.status(200).json({ isMember: false });
      const { data } = await supabase
        .from("press_members")
        .select("id")
        .eq("discord_id", discordId)
        .eq("league", league ?? "")
        .maybeSingle();
      return res.status(200).json({ isMember: !!data });
    }

    // Admin: list all press members for the league
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!league) return res.status(400).json({ error: "league required" });
    const { data, error } = await supabase
      .from("press_members")
      .select("id, discord_id, league, name, added_at")
      .eq("league", league)
      .order("added_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { discord_id, league: leagueRaw2, name } = req.body;
    const lg = resolveLeague(leagueRaw2);
    if (!discord_id || !lg) return res.status(400).json({ error: "discord_id and league required" });
    const { data, error } = await supabase
      .from("press_members")
      .upsert([{ discord_id, league: lg, name: name ?? null }], { onConflict: "discord_id,league" })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    const { error } = await supabase.from("press_members").delete().eq("id", id as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
