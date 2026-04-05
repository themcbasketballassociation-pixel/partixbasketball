import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

/**
 * POST /api/teams/copy-logos
 * Body: { league }
 *
 * For every team name in the league, finds the logo_url from any season that has one,
 * then copies it to all seasons of that team that are missing a logo.
 * Returns { updated } count.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  // Load all teams for the league
  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name, logo_url")
    .eq("league", league);

  if (error) return res.status(500).json({ error: error.message });
  if (!teams?.length) return res.status(200).json({ updated: 0 });

  // Group by lowercase name and find a logo for each name
  const logoByName: Record<string, string> = {};
  for (const t of teams) {
    const key = t.name.toLowerCase().trim();
    if (t.logo_url && !logoByName[key]) {
      logoByName[key] = t.logo_url;
    }
  }

  // Update teams that are missing a logo but have a known logo for their name
  const toUpdate = teams.filter(t => !t.logo_url && logoByName[t.name.toLowerCase().trim()]);
  let updated = 0;

  for (const t of toUpdate) {
    const logo = logoByName[t.name.toLowerCase().trim()];
    const { error: uErr } = await supabase
      .from("teams")
      .update({ logo_url: logo })
      .eq("id", t.id);
    if (!uErr) updated++;
  }

  return res.status(200).json({ updated, message: `Updated ${updated} team(s) with logos from other seasons` });
}
