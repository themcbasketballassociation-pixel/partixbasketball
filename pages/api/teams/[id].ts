import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { name, abbreviation, division, logo_url, color2 } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (abbreviation !== undefined) update.abbreviation = abbreviation;
    if (division !== undefined) update.division = division ?? null;
    if (logo_url !== undefined) update.logo_url = logo_url ?? null;
    if (color2 !== undefined) update.color2 = color2 ?? null;
    const { data, error } = await supabase.from("teams").update(update).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Find all games referencing this team so we can cascade
    const { data: teamGames } = await supabase
      .from("games")
      .select("id")
      .or(`home_team_id.eq.${id},away_team_id.eq.${id}`);
    const gameIds = (teamGames ?? []).map((g: { id: string }) => g.id);

    // Delete in FK-safe order
    if (gameIds.length) {
      await supabase.from("game_stats").delete().in("game_id", gameIds);
      await supabase.from("games").delete().in("id", gameIds);
    }
    await supabase.from("player_teams").delete().eq("team_id", id);
    await supabase.from("team_records").delete().eq("team_id", id);
    await supabase.from("team_owners").delete().eq("team_id", id);
    // Null out auction winning_team_id references, delete bids
    await supabase.from("contracts").delete().eq("team_id", id);
    await supabase.from("auction_bids").delete().eq("team_id", id);
    await supabase.from("auctions").update({ winning_team_id: null }).eq("winning_team_id", id);

    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
