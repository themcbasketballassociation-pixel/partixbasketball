import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const ROLE_CAPS = { streamer: 1, ref: 2, commentator: 2 } as const;
const ROLE_COINS = { streamer: 1000, ref: 500, commentator: 500 } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, game_id } = req.query;
    const league = resolveLeague(leagueRaw as string | undefined);
    let query = supabase.from("game_crew").select("*").order("claimed_at", { ascending: true });
    if (league) query = query.eq("league", league);
    if (game_id) query = query.eq("game_id", game_id as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ?? []);
  }

  if (req.method === "GET_COINS") {
    // Leaderboard — called internally, not via HTTP verb
  }

  if (req.method === "POST") {
    const session = await getServerSession(req, res, authOptions as any) as any;
    if (!session?.user) return res.status(401).json({ error: "Not logged in" });
    const discordId = session.user.id as string;
    const discordName = (session.user.name as string) ?? "";

    const { game_id, role, league: leagueRaw } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!game_id || !role || !league) return res.status(400).json({ error: "game_id, role, league required" });
    if (!["streamer", "ref", "commentator"].includes(role)) return res.status(400).json({ error: "Invalid role" });

    // Check crew access
    const { data: access } = await supabase
      .from("crew_access")
      .select("discord_id")
      .eq("discord_id", discordId)
      .single();
    if (!access) return res.status(403).json({ error: "You don't have crew access" });

    // Check cap and duplicates
    const { data: existing, error: countErr } = await supabase
      .from("game_crew")
      .select("id, discord_id")
      .eq("game_id", game_id)
      .eq("role", role);
    if (countErr) return res.status(500).json({ error: countErr.message });

    const cap = ROLE_CAPS[role as keyof typeof ROLE_CAPS];
    if (existing && existing.length >= cap) {
      return res.status(409).json({ error: `Spot full — max ${cap} ${role}${cap > 1 ? "s" : ""} per game` });
    }
    if (existing?.some((e) => e.discord_id === discordId)) {
      return res.status(409).json({ error: "Already claimed this role for this game" });
    }

    const { data, error } = await supabase
      .from("game_crew")
      .insert([{ game_id, discord_id: discordId, discord_name: discordName, role, league }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}

export { ROLE_COINS };
