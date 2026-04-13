import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";
import { supabase } from "./supabase";

export type OwnerSession = {
  discordId: string;
  teamId: string;
  league: string;
  season: string | null;
};

// Reverse mapping so we can try both the DB id and the URL slug
const DB_TO_SLUG: Record<string, string> = { pba: "mba", pcaa: "mcaa", pbgl: "mbgl" };

function seasonNum(s: string | null | undefined): number {
  const m = (s ?? "").match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

/** Returns owner session for the most recent season if the logged-in Discord user owns a team
 *  in this league (checks both DB identifier and URL slug). Sends 401/403 on failure. */
export async function requireOwner(
  req: NextApiRequest,
  res: NextApiResponse,
  league?: string
): Promise<OwnerSession | null> {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) { res.status(401).json({ error: "Unauthorized" }); return null; }

  // Try both the DB identifier (e.g. "pcaa") and the URL slug (e.g. "mcaa")
  const leagueValues = league
    ? [...new Set([league, DB_TO_SLUG[league] ?? league])].filter(Boolean)
    : [];

  let query = supabase
    .from("team_owners")
    .select("team_id, league, season")
    .eq("discord_id", discordId);
  if (leagueValues.length > 0) query = (query as any).in("league", leagueValues);

  const { data, error } = await (query as any);
  if (error || !data || (data as any[]).length === 0) {
    res.status(403).json({ error: "Not a team owner" });
    return null;
  }

  // Pick the record from the most recent season
  const sorted = [...(data as any[])].sort((a, b) => seasonNum(b.season) - seasonNum(a.season));
  const record = sorted[0];

  return { discordId, teamId: record.team_id, league: record.league, season: record.season ?? null };
}

/** Returns discordId if session exists (no team check). Returns null + 401 if not. */
export async function getSessionDiscordId(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  return discordId;
}

/** Check if a discord id is an admin. */
export function isAdminId(discordId: string): boolean {
  const adminEnv = process.env.ADMIN_DISCORD_IDS ?? "";
  const admins = adminEnv.split(",").map((s) => s.trim()).filter(Boolean);
  return admins.includes(discordId);
}
