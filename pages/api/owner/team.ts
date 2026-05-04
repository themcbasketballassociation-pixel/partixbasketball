import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

/** Extract numeric value from "Season N" for sorting */
function seasonNum(s: string | null): number {
  if (!s) return 0;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) return res.status(401).json({ error: "Unauthorized" });

  const { league: leagueRaw } = req.query;
  const leagueSlug = Array.isArray(leagueRaw) ? leagueRaw[0] : (leagueRaw ?? "");
  const leagueDb = resolveLeague(leagueRaw);

  // Query matching both the DB identifier and the raw slug to handle any storage inconsistency
  const leagueValues = [...new Set([leagueDb, leagueSlug])].filter(Boolean);

  const { data, error } = await supabase
    .from("team_owners")
    .select("id, discord_id, league, season, role, teams(id, name, abbreviation, color2, division, logo_url)")
    .eq("discord_id", discordId)
    .in("league", leagueValues);

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.length === 0) return res.status(200).json([]);

  // Return the record(s) from the most recent season (owners and GMs both get access)
  const sorted = [...data].sort((a, b) => seasonNum(b.season) - seasonNum(a.season));
  const latestSeason = sorted[0].season;
  const latestRecords = sorted.filter(r => r.season === latestSeason);
  return res.status(200).json(latestRecords);
}
