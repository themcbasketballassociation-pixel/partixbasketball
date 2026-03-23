import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

/** Extract numeric value from "Season N" for sorting */
function seasonNum(s: string | null): number {
  return parseInt((s ?? "0").match(/\d+/)?.[0] ?? "0");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) return res.status(401).json({ error: "Unauthorized" });

  const { league: leagueRaw } = req.query;
  const league = resolveLeague(leagueRaw);

  // Get all owner records for this Discord user in this league
  let query = supabase
    .from("team_owners")
    .select("id, discord_id, league, season, teams(id, name, abbreviation, color2, division, logo_url)")
    .eq("discord_id", discordId);
  if (league) query = query.eq("league", league as string);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  if (!data || data.length === 0) return res.status(200).json([]);

  // Find the most recent season by numeric value
  const sorted = [...data].sort((a, b) => seasonNum(b.season) - seasonNum(a.season));
  const latestSeason = sorted[0].season;

  // Only return records from the most recent season
  const latestRecords = sorted.filter(r => r.season === latestSeason);
  return res.status(200).json(latestRecords);
}
