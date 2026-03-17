import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) return res.status(401).json({ error: "No user ID" });

  if (req.method === "GET") {
    const { league, day } = req.query;
    if (!league || !day) return res.status(400).json({ error: "league and day required" });

    const { data, error } = await supabase
      .from("wordle_states")
      .select("guesses, game_state")
      .eq("discord_id", discordId)
      .eq("league", league as string)
      .eq("day_num", parseInt(day as string, 10))
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(200).json({ exists: false });
    return res.status(200).json({ exists: true, guesses: data.guesses, game_state: data.game_state });
  }

  if (req.method === "POST") {
    const { league, day_num, guesses, game_state } = req.body;
    if (!league || day_num == null) return res.status(400).json({ error: "league and day_num required" });

    const { error } = await supabase
      .from("wordle_states")
      .upsert(
        [{ discord_id: discordId, league, day_num, guesses: guesses ?? [], game_state: game_state ?? "playing" }],
        { onConflict: "discord_id,league,day_num" }
      );

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
