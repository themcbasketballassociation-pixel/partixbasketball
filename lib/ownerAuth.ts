import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";
import { supabase } from "./supabase";

export type OwnerSession = {
  discordId: string;
  teamId: string;
  league: string;
};

/** Returns owner session if the logged-in Discord user owns a team in this league, else sends 401/403. */
export async function requireOwner(
  req: NextApiRequest,
  res: NextApiResponse,
  league?: string
): Promise<OwnerSession | null> {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  let query = supabase.from("team_owners").select("team_id, league").eq("discord_id", discordId);
  if (league) query = (query as any).eq("league", league);
  const { data, error } = await (query as any).maybeSingle();

  if (error || !data) {
    res.status(403).json({ error: "Not a team owner" });
    return null;
  }

  return { discordId, teamId: data.team_id, league: data.league };
}

/** Returns discordId if session exists (no team check). Returns null + 401 if not. */
export async function getSessionDiscordId(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const discordId = ((session as any).user as any)?.id?.toString();
  if (!discordId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return discordId;
}

/** Check if a discord id is an admin. */
export function isAdminId(discordId: string): boolean {
  const adminEnv = process.env.ADMIN_DISCORD_IDS ?? "";
  const admins = adminEnv.split(",").map((s) => s.trim()).filter(Boolean);
  return admins.includes(discordId);
}
